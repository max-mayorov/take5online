# take5online

A private website for playing 6 nimmt! (aka Take 5) live with friends, hosted on Cloudflare at https://take5.mayorov.dev.

- [Design](docs/DESIGN.md): what we're building and how
- [Domain language](docs/CONTEXT.md): the terms used throughout code and docs
- [Architecture decisions](docs/adr/): why the big choices were made

Not affiliated with Amigo Spiele. All artwork is original.

## Layout

| Path                | What                                                         |
| ------------------- | ------------------------------------------------------------ |
| `packages/engine`   | Pure rules engine, Bot and per-player views                  |
| `packages/protocol` | Client↔server message schemas (Zod) and the protocol version |
| `apps/worker`       | Cloudflare Worker + one Room Durable Object per Room         |
| `apps/web`          | React + Vite single-page app                                 |
| `e2e`               | Playwright tests that play real Games in browsers            |

## Developing

Needs Node 22 and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm build          # build the web app into apps/web/dist
pnpm dev:worker     # Worker + Durable Objects + built app on http://localhost:8787
pnpm dev:web        # optional: Vite with hot reload on :5173, proxying /api and /ws to :8787
```

Checks (CI runs all of these, but skips `pnpm e2e` on pull requests because it is slow, so run it
locally before committing):

```sh
pnpm format:check && pnpm typecheck && pnpm test && pnpm e2e
```

`pnpm e2e` starts its own server. On a machine with a preinstalled Chromium, set
`CHROMIUM_PATH=/path/to/chrome` instead of running `playwright install`.

## Deploying

Every push to `main` that passes CI deploys with `wrangler deploy`.

Every pull request from this repository that passes CI gets a
[Worker Preview](https://developers.cloudflare.com/workers/previews/) named `pr-<number>`, with
its own Durable Object storage, at a public workers.dev URL that CI comments on the PR. Closing the PR
deletes it. Preview settings live in the `previews` block of `apps/worker/wrangler.jsonc`, and
analytics are only on at take5.mayorov.dev. The URL comes from `preview_urls: true`, a Worker-level
setting that only takes effect on a production deploy; until then CI warns instead of commenting.

Both need two repository secrets:

- `CLOUDFLARE_API_TOKEN`: an account API token from the **Edit Cloudflare Workers** template, with
  its zone resources including `mayorov.dev` (the custom domain needs **Zone → Workers Routes → Edit**).
- `CLOUDFLARE_ACCOUNT_ID`: the account id from the Cloudflare dashboard.
