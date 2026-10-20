# SheetFix

Independent React / Vinext web app, deployed using Cloudflare Workers, D1 and R2 through Sites.

## Development
Node >=22.13. Run npm ci, then npm run dev.
Run node --experimental-strip-types --test engine.test.ts for processing tests.
Run node node_modules/typescript/bin/tsc --noEmit for type checks.
Run npm run db:generate after schema changes. Apply generated drizzle SQL to the local D1 database before testing storage.

## Deployment
Keep .openai/hosting.json project_id and the DB / BUCKET bindings. Use Sites build-site and site-workflow helpers, then save_site_version and deploy_site_version. Never commit credentials.

## Data and identity
Files are processed locally in browser memory. Original binaries are not uploaded. Explicit save stores extracted text or cell data and settings in private R2, with owner/title/time metadata in D1. Sites validates and injects ChatGPT identity headers; all API record access is owner-scoped. Do not deploy behind a proxy that permits visitor-forged identity headers. Maximum 40 saved projects per user, 8MB per save. Data remains until deleted; deletion removes both the object and database record. No automatic retention expiry, collaboration, or original-file backup.

## Git repositories
GitHub: https://github.com/oiui030/sheetfix (private source mirror).
Live: https://sheetfix-editor.starrydune3.chatgpt.site
Sites managed Git is the production deployment source. GitHub Actions automatic deployment is not configured. Sync source changes to both repositories and publish via Sites.

## Limitations
Multi CSV/XLSX upload, mapping, merging, deduplication, date/currency normalization, preview and explicit approval before XLSX export. No formula evaluation, exchange-rate conversion, OCR or automatic decimal-locale detection. Invalid conversions preserve source values and appear in review issues. Settings changes invalidate approval. Max 10MB/file, total 50k rows, 15 sheets and 100 columns.

## Usability update
- Stable editor layout and mobile file/result/settings tabs.
- The next action stays visible at the bottom of the workspace.
- File removal, replacement and reset can be undone without clearing original files.
- Sign-in preserves the in-progress workspace in session storage for a 30-minute restoration window.
- Help and saved history are collapsed instead of occupying the core work area.
SheetFix keeps duplicates by default, uses one format selector per column, shows original sheets independently, highlights changed/invalid cells and links review issues to their output rows. Small/single-column CSV and Excel date systems are supported. Mixed-currency columns keep source values for review.

## Reference UI update
Neutral charcoal workspace with a narrow icon rail, segmented navigation, separate file/result/property panels, dark cards, inset corner actions on selectable metrics, pill progress stages, and a dotted empty canvas. Diffly uses lavender; SheetFix uses mint. Panel shortcuts are keyboard accessible and switch to a single-panel layout on smaller screens. No third-party logos or brand assets are copied.
