# Deploy with GitHub Actions + wrangler, not Cloudflare Workers Builds

Deployments run from a GitHub Actions workflow: tests (engine, Worker/Durable Object, Playwright E2E) must pass, then `wrangler deploy` runs on `main` using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repository secrets. We chose this over Cloudflare's dashboard-connected Workers Builds because the test gate and the deploy steps live together in the repo, where they can be seen and versioned. The cost is managing an API token.

Each same-repository pull request that passes the same checks also gets a Cloudflare Worker Preview (`wrangler preview --name pr-<number>`), deleted when the PR closes. We chose Worker Previews over per-PR Workers because each Preview gets its own Durable Object namespace under the one Worker, with nothing extra to name or clean up beyond the Preview itself.
