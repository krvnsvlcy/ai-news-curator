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
cp .env.example .env                       # worker: set FEED_URLS
cp apps/web/.env.example apps/web/.env.local # web: set AUTH_PASSWORD and AUTH_SECRET
pnpm build             # builds core first, which the apps import
pnpm --filter @curator/worker start
pnpm --filter @curator/web dev
```

## Authentication

The web app is an internal tool protected by one shared password.

- `AUTH_PASSWORD`: the password everyone signs in with.
- `AUTH_SECRET`: at least 32 characters, used to sign session cookies (`openssl rand -base64 32`).

A successful login sets a signed, HTTP-only cookie that lasts 7 days. Changing either variable signs everyone out.
`proxy.ts` redirects unauthenticated requests to `/login`, but every protected page and server action must still call `requireSession()` from `lib/auth/session.ts`.
In production the cookie is marked `Secure`, so the app must be served over HTTPS (localhost is exempt).

## Scripts (root)

- `pnpm dev` – run every package's dev script in parallel
- `pnpm build` / `pnpm typecheck` / `pnpm test` – run across all packages
- `pnpm lint` / `pnpm format` – Biome

## Next steps

- Persist worker output (database) and have `apps/web` read from it instead of sample data
- Replace the keyword scorer in `packages/core/src/score.ts` with a model-based ranker/summarizer
- Schedule the worker (cron or queue)
