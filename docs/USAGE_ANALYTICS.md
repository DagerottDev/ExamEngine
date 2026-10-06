# ExamEngine usage analytics

Date: 2026-10-06. Project: ExamEngine, PostHog US, project 648958. No payment card was added.

The production-only integration uses explicit fetch events and separately stored consent. The payload contract, visitor controls, and limits are in [README](../README.md#optional-usage-analytics). `src/core/usage-analytics.js` enforces the production URL and event/property allowlists. Workspace exports serialize IndexedDB workspace data, so the separate localStorage analytics keys never enter backups, recovery snapshots, or appearance preferences.

## Validation

- Node analytics checks cover consent gating, exact production URLs, offline drops, payload allowlists, credentials/referrer omission, page-load deduplication, ID rotation, shared consent, fetch/storage failures, and failed session-save boundaries.
- Chromium serves the built distribution at its exact production URL in an isolated context and intercepts all PostHog requests with a fixture token. It verifies actual controls and start/resume/completion, canceled submit/restore, invalid import/publish, valid publish, appearance apply, export, merge/replace/undo, reload, cross-tab withdrawal, and blocked-request/storage-denial workflows.
- Existing native-storage, workflow, and offline backup/PDF/expiry suites also pass. Localhost and file copies continue making zero external requests.
- Screenshots and reproducible results are written to ignored `output/browser/analytics-settings.png` and `output/browser/analytics.txt`.

## Rollout

The [ExamEngine Usage dashboard](https://us.posthog.com/project/648958/dashboard/2176992) is private to the owner’s PostHog organization. Production deployment and chart population are in progress. Final release commit, CI run, and capture evidence will be recorded here after verification. Counts are consenting browser estimates. Use distinct browser IDs for activity, total events for starts/completions and feature adoption, and native browser-level funnel/retention queries.

Local release checks pass: **37 Node tests, 7 Python validator tests, sample validation, deterministic build freshness, 9 native-storage checks, 15 workspace workflow checks, production-origin analytics acceptance, and offline backup/PDF/expiry checks**. The generated distribution is 4,915,849 bytes. No new dependency was added.
