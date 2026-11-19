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
cp .env.example .env                         # worker: Mongo + Guardian key
cp apps/web/.env.example apps/web/.env.local # web: auth + Mongo + Guardian key
pnpm build                                   # packages must be built before the apps run
pnpm --filter @curator/worker seed           # add the default sources (or use the Sources page)
pnpm --filter @curator/worker once           # fetch everything that's due, then exit
pnpm --filter @curator/web dev
```

## Sourcing

Sources live in the `sources` collection and are managed at `/sources` in the web app (add, edit, pause, delete, fetch now).
Two kinds are supported:

- `feed`: any RSS 2.0 or Atom URL.
- `guardian`: the Guardian Content API, filtered by section (`politics|uk-news`) and/or a search query. Needs `GUARDIAN_API_KEY`.

Default sources (`pnpm --filter @curator/worker seed`, or "Add default sources" on an empty Sources page):

| Source        | Kind     | Endpoint                                                 |
| ------------- | -------- | -------------------------------------------------------- |
| Sky News      | feed     | `https://feeds.skynews.com/feeds/rss/uk.xml`             |
| The Guardian  | guardian | sections `politics                                       | uk-news | business | society` |
| GOV.UK        | feed     | `https://www.gov.uk/search/news-and-communications.atom` |
| UK Parliament | feed     | `https://bills.parliament.uk/rss/allbills.rss`           |

parliament.uk's news and committee feeds sit behind a Cloudflare bot challenge, so the Bills feed is used instead.

Articles are stored in `articles`, unique per source + external id (RSS guid, Atom id or Guardian id), so re-fetching updates existing stories instead of duplicating them.

The worker (`pnpm --filter @curator/worker start`) checks every minute and fetches each enabled source once its interval has elapsed. Each fetch records `lastFetchedAt`, `lastStatus`, `lastError` and counts on the source; the Sources page shows them.

### Tests against MongoDB

```sh
docker run -d --rm --name curator-mongo-test -p 27399:27017 mongo:8
MONGO_TEST_URL=mongodb://localhost:27399 pnpm test
```

Without `MONGO_TEST_URL` the database integration tests are skipped.

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
