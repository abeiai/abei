# English picture books → Simplified Chinese editions

This one-time production job translates the title and each published display-text page of the 1,558 currently unpaired StoryWeaver and Book Dash English books. It creates a separate `zh-CN` edition; source books and media remain unchanged. Narration text follows the translated display text, but every audio URL stays `null` and no speech task is created. The approved translation of `storyweaver-669133` is pinned in the runner.

Only `scripts/picture-books/` changes. No schema migration or seed update is required. The public acceptance pages are `/library/storyweaver-669133` and `/library/storyweaver-cn-669133` on `https://abeiai.com`.

1. Run `node --test scripts/picture-books/translate-english-editions.test.mjs` and `node --check scripts/picture-books/translate-english-editions-runner.mjs`.
2. Copy the two `.mjs` files to `/app/` in the `abei-prod-api-core-1` container. Run `node /app/translate-english-editions-runner.mjs --mode=inspect`, then `--mode=prepare`. Stages are private files under the independent `abei-prod_creator_assets` volume. The prepared texts can be resumed after interruption. Use `--model=qwen3.8-flash` only for entries rejected by the default `qwen-plus` model.
3. Run `--mode=validate` and review samples. Back up `picture_books`, `picture_book_submissions`, and `picture_book_editions` from the production PostgreSQL container with `pg_dump -Fc`, saving the result as `/app/private-creator-assets/picture-book-translation-en-zh-2026/prepublish-picture-books.dump` inside the API container's mounted private volume. Verify its size and SHA-256. The publisher refuses to write without `--backup-sha=<verified SHA-256>`.
4. Run `--mode=publish --backup-sha=<verified SHA-256>`, then `--mode=verify`. Publication is per-book transactional and idempotent. The fixed baseline must contain exactly 1,558 source books. Verify counts, the public language switch, selected page text and image URLs, and the lack of audio.

Book Dash illustrations sometimes contain English text within the original image. The new Chinese edition displays Chinese captions over the reused art; this job does not edit those illustrations.
