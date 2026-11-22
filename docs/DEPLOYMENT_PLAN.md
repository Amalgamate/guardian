# Guardian Exams deployment plan

## Current state

- Per the latest WorkBuddy server report, `guardianexams.trendscore.co.ke` and `www.guardianexams.trendscore.co.ke` resolve to `185.127.16.124`.
- WorkBuddy prepared an isolated Docker/PostgreSQL stack under `/home/deploy/apps/guardian-exams/`, a dedicated database, an Nginx virtual host, and a Let's Encrypt certificate for both hostnames. It reports HTTPS is active and HTTP redirects to HTTPS.
- The frontend is currently a placeholder, the API is not running, and the migrations have not run.
- A local API Dockerfile is now in place; it listens on port `8788` inside the container as a non-root user and includes a health check. The production image build is included in GitHub CI. A local Docker daemon was unavailable for building the image in this workspace.
- GitHub Actions CI is configured locally in `.github/workflows/ci.yml` to check API syntax, run `npm ci` and `npm run build`, and build the API image for pull requests, pushes to `main`, and manual runs. It is not active until the changes are committed and pushed.
- WorkBuddy subsequently copied only `RESEND_API_KEY` and the active sender address from iQuote into Guardian's protected server environment, set `RESEND_FROM_NAME=Guardian Exams` and `OTP_DELIVERY=resend`, and confirmed the values are non-empty without printing them. The API has not started yet. MobileSasa still needs separate credentials if SMS is to be enabled.

## Next deployment steps

Use the isolated Guardian stack. Do not reuse TrendScore's database, app port, environment file or upload paths.

1. Have WorkBuddy verify the prepared Compose build context points to the repo root and the API container connects to PostgreSQL using its Compose service name and internal port `5432`, not `localhost` or the host-published `5433`.
2. Build and publish `dist/` to `/var/www/guardian-exams/public/`, the frontend path reported by WorkBuddy.
3. Confirm the server environment has `OTP_DELIVERY=resend`, the transferred Resend credentials and sender, a stable `AUTH_OTP_PEPPER`, and `WEB_ORIGIN=https://guardianexams.trendscore.co.ke`. Add MobileSasa values if SMS is to be enabled. Keep Daraja in sandbox until callback tests pass.
4. Review and commit the current project changes, then push to GitHub so CI can run. The working tree currently contains many uncommitted changes; review the staged diff and ensure no `.env` files or secrets are included.
5. Deploy that exact green commit to the prepared host. Start the API to apply migrations, publish the frontend, and verify health through HTTPS.
6. Validate login, email OTP, SMS OTP if configured, password reset, migration state and Daraja sandbox checkout/callback. Confirm logs, backups and rollback before opening access to users.

Only ports 80/443 should be public. Keep the database and API ports private. Preserve unrelated TrendScore routes and containers.

## GitHub automation

The CI workflow checks locked dependency installation, API syntax and the production build; it does not deploy. After the first manual deployment is stable, add a separate manual deployment workflow with a protected GitHub `production` environment and secrets `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_SSH_KEY`. Require an environment reviewer, deploy versioned releases with rollback, and run health checks after restart. Keep live deployment separate from routine pushes to `main`.
