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
- **Preview:** the editor renders the same HTML (`@curator/newsletter`) that delivery will send, live, at desktop or mobile width.
- **New letter walkthrough:** **New letter** opens a dialog that drafts a whole edition. Pick the date (today by default) and optionally a tone; it refreshes each source (for today or yesterday; each shows its result as it comes back), gathers that London day's stories, and Claude picks the 3 to 5 most important distinct ones and writes a headline and summary for each, then the edition headline and briefing. The draft streams in (`POST /api/letters/draft`, newline-delimited JSON), so you watch the day's headlines being read and then the letter being written; cancelling stops the model call. The letter is then created as a draft and opened in the editor, every story linked to its source article, ready to edit. **Start blank instead** creates an empty letter.
- **AI assistance** (`@curator/ai`, Claude Opus 5.5 via the [Vercel AI SDK](https://ai-sdk.dev) and **AI Gateway**): the walkthrough above, plus suggesting letter headlines, writing or revising the briefing, and rewriting story headlines in the editor, in an editorial tone you choose. Prompts are grounded in the supplied stories only, and the editor reviews everything. Needs `AI_GATEWAY_API_KEY` in `apps/web/.env.local` (on Vercel, OIDC works without a key). If Opus fails, the gateway falls back to Claude Sonnet 5.5.

## Subscribers and sending (demo)

Subscribers are managed by the editors only: there's no public signup page and no unsubscribe link. They're stored in MongoDB (`subscribers` collection), one row per address, deduped by lowercased email. There are no user accounts (one shared password), so lists are **per browser**: each browser gets an opaque random id in a long-lived `curator_owner` cookie (issued by the proxy, kept across sign-out), and each subscriber row lists the browsers that reference it (`ownerIds`).

- Everyone sees the **total** number of subscribers (in the side nav and on `/subscribers`), but only the details of addresses on their own list.
- `/subscribers` (signed in): add one or paste a list, search, remove, clear (your list only). Adding an address that already exists doesn't duplicate it: it's linked to your list. Removing an address is how you unsubscribe it: it drops your reference only, and the row is deleted once no list references it.
- A list left in this browser's `localStorage` by an older version is moved to the database the first time the page opens (addresses that had unsubscribed are left out). On startup, rows from older versions are migrated, and any that a reader had unsubscribed are deleted.
- In the letter editor, **Send** opens a dialog:
  - **Send a test**: any status, up to 5 addresses, subject prefixed with "[Test]".
  - **Send to subscribers**: the letter must be _ready_ (or already published). It goes to every address on **your** list, looked up on the server (up to 200), so nobody can email addresses only other people added. A ready letter is published when at least one email is delivered; a published letter is always re-sent from its archived HTML.
  - Each email gets its own tracked story links and includes a plain-text part. There are no subscription links; the footer says the editors added the reader to the list. Re-sending a letter published before this change drops the old footer links. The letter keeps a send history with counts only.
- Delivery needs `SMTP_URL` and `SMTP_FROM` in `apps/web/.env.local`. Any SMTP provider works. For local testing, use [Mailpit](https://mailpit.axllent.org/):

  ```sh
  docker run -d --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
  # SMTP_URL=smtp://localhost:1025, inbox at http://localhost:8025
  ```

## Dashboard trends

The Overview page charts **subscribers**, **open rate** and **click rate** over 7, 30 or 90 days. Every related action increments counters on one document per day (UTC) in `daily_stats`, so the dashboard reads those documents directly with no aggregation:

- **Subscribers:** creating or deleting an address updates a running total (`counters`) and snapshots it on the day. Linking an existing address doesn't change it.
- **Delivered:** emails delivered by subscriber sends.
- **Opens:** each email carries a 1×1 image loading `/o/<token>.gif`. **Clicks:** the existing `/r/<token>` route. Both count every hit plus a *unique* count, once per reader per letter (`letter_readers`).
- Rates are unique opens (or clicks) ÷ delivered over a **trailing 7 days**, since opens and clicks land days after a send. Opens are approximate: some mail apps block images, others (Apple Mail Privacy Protection) load them without the reader opening the email.
- Test sends never count. The running total is seeded from the existing subscribers on first start.

## Tracking and analytics

Each sent letter has its own analytics page, `/letters/:letterId/analytics` (linked from the letter editor), showing for subscriber sends (test sends are tracked but excluded):

- **Emails submitted** (and delivered/failed), from the letter's send history.
- **Unique recipients who clicked**, with the click rate (unique clickers ÷ delivered).
- **Total clicks per article**, every story in letter order.

How it works, without storing addresses in analytics:

- Every reader gets an **anonymous id**: an HMAC of their address keyed by `TRACKING_SECRET` (default: `AUTH_SECRET`). It's stable across letters, so readers can be counted, but can't be reversed without the secret.
- At send time each story link becomes `/r/<token>`, a signed token with the letter, story, reader id and test flag. `/r/…` records the click (in `email_events`) and redirects to the story URL **stored in the letter**, so it can't be used as an open redirect, and tampered tokens are rejected.
- Mail providers that pre-scan links can add clicks; there's no bot filtering yet.

## Authentication

The web app is an internal tool protected by one shared password.

- `AUTH_PASSWORD`: the password everyone signs in with.
- `AUTH_SECRET`: at least 32 characters, used to sign session cookies (`openssl rand -base64 32`).
- `AUTH_PASSWORD_HINT` (optional): shown under the password field on the login page. Anyone who can reach the login page can read it, so don't make it guessable.

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
