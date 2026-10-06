# ExamEngine usage analytics

Date: 2026-10-06. Project: ExamEngine, PostHog US, project 648958. No payment card was added.

The production-only integration uses explicit fetch events and separately stored consent. The payload contract, visitor controls, and limits are in [README](../README.md#optional-usage-analytics). `src/core/usage-analytics.js` enforces the production URL and event/property allowlists. Workspace exports serialize IndexedDB workspace data, so the separate localStorage analytics keys never enter backups, recovery snapshots, or appearance preferences.

## Validation

- Node analytics checks cover consent gating, exact production URLs, offline drops, payload allowlists, credentials/referrer omission, page-load deduplication, ID rotation, shared consent, fetch/storage failures, and failed session-save boundaries.
- Chromium serves the built distribution at its exact production URL in an isolated context and intercepts all PostHog requests with a fixture token. It verifies actual controls and start/resume/completion, canceled submit/restore, invalid import/publish, valid publish, appearance apply, export, merge/replace/undo, reload, cross-tab withdrawal, and blocked-request/storage-denial workflows.
- Existing native-storage, workflow, and offline backup/PDF/expiry suites also pass. Localhost and file copies continue making zero external requests.
- Screenshots and reproducible results are written to ignored `output/browser/analytics-settings.png` and `output/browser/analytics.txt`.

## Rollout

The [ExamEngine Usage dashboard](https://us.posthog.com/project/648958/dashboard/2176992) is private to the owner’s PostHog organization. All seven native charts are saved and run successfully: daily/weekly active browsers, active learners, started/completed sessions by kind, ordered browser funnel, days 0–7 learning retention, feature usage, and traffic categories. The learning action combines starts and resumes without double-counting a browser within a day. Counts are consenting browser estimates. Use distinct browser IDs for activity, total events for starts/completions and feature adoption, and native browser-level funnel/retention queries.

Local release checks pass: **38 Node tests, 7 Python validator tests, sample validation, deterministic build freshness, 9 native-storage checks, 15 workspace workflow checks, production-origin analytics acceptance, and offline backup/PDF/expiry checks**. The generated distribution is 4,915,983 bytes. No new dependency was added.

Application revision `66eeae1b5c35f7c65e9e4e22c22de74bc5d8aaa7` passed [CI verification and Pages deployment](https://github.com/DagerottDev/ExamEngine/actions/runs/37476167513), deployed at 2026-10-06 14:07:25 UTC. The public HTML matches the tested distribution byte-for-byte: SHA-256 `8d7e207fc8a350e5aa9236aabadf1c8af8ecf2e130095b646cd47307bb88f3e8`.

A fresh isolated Chromium visit against the real production site verified **zero capture requests before consent, after denial/reload, and after withdrawal/reload**. Allowing consent, importing the sample, starting and completing it emitted one start and one completion. All ten capture requests returned HTTP 200 with `{"status":"Ok"}`; no request failures occurred. The post-deployment native funnel confirms **one starting browser and one completing browser** for that final smoke test. Local evidence is in ignored `output/browser/production-analytics.json`, `production-analytics.png`, and `posthog-dashboard.jpg`.

Launch verification used three consenting QA browser identifiers: two before the timing correction and one after. They remain in initial production counts. One immediate pre-fix completion arrived two milliseconds before its start; adding an explicit, increasing action timestamp fixed request-order races without a queue or retry. Its old funnel mismatch remains historical QA data. Current payload timestamps are verified, including same-millisecond actions and a backward clock adjustment.

Onboarding is complete on the **Free** plan, with no payment card. Final project settings were checked after onboarding: IP anonymization enabled; autocapture, session recordings, console capture, and performance capture disabled. No SDK is loaded by the application. The installed connector was unavailable in this session, so project and dashboard setup used PostHog's browser-provided tools.

Seven-day retention is configured and queryable, but future intervals require actual elapsed history. Feature events without production use show zero. Earlier usage cannot be reconstructed. Safari/Firefox, physical devices, and operating-system screen-reader output remain outside the existing Chromium acceptance evidence.
