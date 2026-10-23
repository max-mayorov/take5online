# Deploy with GitHub Actions + wrangler, not Cloudflare Workers Builds

Deployments run from a GitHub Actions workflow: tests (engine, Worker/Durable Object, Playwright E2E) must pass, then `wrangler deploy` runs on `main` using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repository secrets. We chose this over Cloudflare's dashboard-connected Workers Builds because the test gate and the deploy steps live together in the repo, where they can be seen and versioned. The cost is managing an API token.
