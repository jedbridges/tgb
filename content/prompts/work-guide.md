# Reading-guide brief

You are completing the reading guide for a work whose catalogue stub already exists at `src/content/works/{slug}.md`.
Read first: `content/STYLE.md`, `src/content.config.ts`, the exemplar `src/content/works/homer-iliad.md`, and the stub itself.

Edit the stub in place:
1. Keep every existing frontmatter field unless it is wrong (fix silently if so).
2. Add `whyItMatters`, `keyThemes` (3-5), `highlights` (3-5), optionally `related` (up to 4 slugs that exist in src/content/works), and expand `synopsis` to 90-120 words if shorter.
3. Set `status: draft` and `updated: YYYY-MM-DD` (today).
4. Write the body after the closing `---` with the four headings in STYLE.md, 700-1100 words.

Rules: no em dashes; no banned phrases; YAML must parse (quote strings containing `: ` or starting with quotes); do not touch other files.
