# AI News Curator

pnpm monorepo that ingests news feeds, scores articles for AI relevance, and serves a curated feed.

## Layout

| Path                | Package             | Purpose                                                |
| ------------------- | ------------------- | ------------------------------------------------------ |
| `apps/web`          | `@curator/web`      | Next.js app that renders the curated feed              |
| `apps/worker`       | `@curator/worker`   | Fetches RSS/Atom feeds and runs curation               |
| `packages/core`     | `@curator/core`     | Shared types (`Article`, `CuratedArticle`) and scoring |
| `packages/tsconfig` | `@curator/tsconfig` | Shared TypeScript configs                              |

## Getting started

```sh
pnpm install
cp .env.example .env   # set FEED_URLS
pnpm build             # builds core first, which the apps import
pnpm --filter @curator/worker start
pnpm --filter @curator/web dev
```

## Scripts (root)

- `pnpm dev` – run every package's dev script in parallel
- `pnpm build` / `pnpm typecheck` / `pnpm test` – run across all packages
- `pnpm lint` / `pnpm format` – Biome

## Next steps

- Persist worker output (database) and have `apps/web` read from it instead of sample data
- Replace the keyword scorer in `packages/core/src/score.ts` with a model-based ranker/summarizer
- Schedule the worker (cron or queue)
