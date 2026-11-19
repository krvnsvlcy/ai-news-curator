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

## Letters

A letter is one edition of the daily email: headline, publication date, a 60–100 word daily briefing, and an ordered list of stories. Manage them at `/letters`; each opens in the editor at `/letters/:id`.

- **Stories** are picked from the stored articles (or added manually as external links). Each story keeps a reference to its article _and_ a snapshot of the original headline, URL and publisher, plus its own rewritten headline and description. Editing a story in one letter never touches the article or any other letter.
- **Lifecycle:** draft → ready → published. "Ready" requires a headline, a briefing, at least one story and a headline on every story. Editing a ready letter so it no longer qualifies moves it back to draft. Published letters are locked and store the exact HTML rendered at publication (`publishedHtml`), so past editions are reproducible. Duplicate a letter to start a new edition from it. Only drafts can be deleted.
- **Concurrent edits:** every save carries the letter's `revision`; a stale save is rejected instead of overwriting someone else's changes.
- **Preview:** the editor renders the same HTML (`@curator/newsletter`) that delivery will send, live, at desktop or mobile width. Subscription links use `{{manage_url}}` / `{{unsubscribe_url}}` merge tags for the delivery step to fill in.
- **AI assistance** (`@curator/ai`, Claude Opus 5.5): suggest letter headlines, write or revise the briefing, and rewrite individual story headlines, in an editorial tone you choose. Prompts are grounded in the selected stories only, and results are offered as suggestions; nothing is applied without the editor choosing it. Needs `ANTHROPIC_API_KEY` in `apps/web/.env.local`. Requests opt into server-side fallbacks (`fallbacks: "default"`), so a safety decline is retried on a fallback model within the same call.

## Subscribers and sending (demo)

Subscribers are deliberately **not** stored on the server. For this demo they live in the browser's `localStorage`, so anyone testing can send real email without reaching people they didn't add themselves.

- `/subscribers` (signed in): add one or paste a list, unsubscribe/resubscribe, remove, search, clear. Shows a notice explaining the list is local to this browser.
- `/subscribe` and `/unsubscribe?email=…` are public, reader-facing pages styled like the email. They read and write the same browser's list, so an unsubscribe link from a delivered email works when opened in the browser that sent it.
- In the letter editor, **Send** opens a dialog:
  - **Send a test**: any status, up to 5 addresses, subject prefixed with "[Test]".
  - **Send to subscribers**: the letter must be _ready_ (or already published). The browser passes its active subscribers to the server for that one send; addresses are never stored. A ready letter is published when at least one email is delivered; a published letter is always re-sent from its archived HTML.
  - Each email is personalized with its own unsubscribe link (also sent as a `List-Unsubscribe` header) and includes a plain-text part. The letter keeps a send history with counts only.
- Delivery needs `SMTP_URL` and `SMTP_FROM` in `apps/web/.env.local`. Any SMTP provider works. For local testing, use [Mailpit](https://mailpit.axllent.org/):

  ```sh
  docker run -d --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
  # SMTP_URL=smtp://localhost:1025, inbox at http://localhost:8025
  ```

## Tracking and analytics

`/analytics` shows, for letters sent to subscribers (test sends are tracked but excluded):

- **Emails submitted** (and delivered/failed), from each letter's send history.
- **Unique recipients who clicked**, overall and per letter, with the click rate (unique clickers ÷ delivered).
- **Total clicks per article**: `/analytics/:letterId` lists every story in letter order.
- **Most-clicked stories** across all letters.
- **Unsubscribes**, counted once per reader per letter.

How it works, without storing addresses:

- Every reader gets an **anonymous id**: an HMAC of their address keyed by `TRACKING_SECRET` (default: `AUTH_SECRET`). It's stable across letters, so readers can be counted, but can't be reversed without the secret.
- At send time each story link becomes `/r/<token>`, a signed token with the letter, story, reader id and test flag. `/r/…` records the click (in `email_events`) and redirects to the story URL **stored in the letter**, so it can't be used as an open redirect, and tampered tokens are rejected.
- The unsubscribe link carries a signed token too. When the reader confirms on `/unsubscribe`, the page reports it to the server along with the token, and the event is recorded against the letter.
- Mail providers that pre-scan links can add clicks; there's no bot filtering yet.

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
