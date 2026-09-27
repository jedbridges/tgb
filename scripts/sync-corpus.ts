/**
 * Sync corpus/ (written by scripts/export-corpus.ts) to the R2 bucket Cloudflare AI Search
 * reads from. Run on every deploy after `npm run corpus`, docs/search-plan.md, 3a.
 *
 *   npx tsx scripts/sync-corpus.ts
 *
 * Every file in corpus/ is uploaded, and every object in the bucket that is not in the
 * current export is deleted, so a renamed or dropped section (the texts collection is
 * regenerated wholesale, not edited in place) does not leave a stale document AI Search
 * can still cite. manifest.json is bookkeeping for humans, not a document, so it stays out
 * of the bucket.
 *
 * Needs R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and CLOUDFLARE_ACCOUNT_ID in the
 * environment, and an R2 API token with Object Read & Write on the bucket.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const CORPUS = 'corpus';
const BUCKET = 'tgb-corpus';
const CONCURRENCY = 16;

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) { console.error(`${name} is not set; nothing was synced`); process.exit(1); }
  return v;
};
const accountId = need('CLOUDFLARE_ACCOUNT_ID');
const accessKeyId = need('R2_ACCESS_KEY_ID');
const secretAccessKey = need('R2_SECRET_ACCESS_KEY');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return relative(CORPUS, p).split(sep).join('/') === 'manifest.json' ? [] : [p];
  });
}

async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: limit }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await run(item);
  }));
}

async function main() {
  const files = walk(CORPUS);
  if (!files.length) { console.error(`${CORPUS}/ is empty; run "npm run corpus" first`); process.exit(1); }
  const keys = new Set(files.map((f) => relative(CORPUS, f).split(sep).join('/')));

  const existing: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }));
    for (const o of page.Contents ?? []) if (o.Key) existing.push(o.Key);
    token = page.NextContinuationToken;
  } while (token);

  const stale = existing.filter((k) => !keys.has(k));
  for (let i = 0; i < stale.length; i += 1000) {
    const batch = stale.slice(i, i + 1000);
    await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: batch.map((Key) => ({ Key })) } }));
  }

  let uploaded = 0;
  await pool(files, CONCURRENCY, async (file) => {
    const key = relative(CORPUS, file).split(sep).join('/');
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: readFileSync(file), ContentType: 'text/markdown; charset=utf-8',
    }));
    uploaded++;
  });

  console.log(`synced ${BUCKET}: ${uploaded} uploaded, ${stale.length} removed, ${keys.size} total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
