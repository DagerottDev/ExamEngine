# Project Status

**Project:** ExamEngine

**Current package version:** 2.1.0

**Pack schema:** 2.0

**Status date:** 2026-10-06

**Recorded v2 merge:** `e8ac6116330e57b953c2482815cfb027338caa73`

**CI:** [Workflow runs](https://github.com/DagerottDev/ExamEngine/actions/workflows/ci.yml)

## Current state

ExamEngine 2.1 is pushed to `main` and deployed at the [Pages address](https://dagerottdev.github.io/ExamEngine/). Application commit `66eeae1b5c35f7c65e9e4e22c22de74bc5d8aaa7` passed the [verification and deployment workflow](https://github.com/DagerottDev/ExamEngine/actions/runs/37476167513). The public HTML returned HTTP 200 and matched the tested local distribution byte-for-byte (4,915,983 bytes; SHA-256 `8d7e207fc8a350e5aa9236aabadf1c8af8ecf2e130095b646cd47307bb88f3e8`). It remains a free, MIT-licensed, static local-first product with optional support links.

Optional, consent-only usage analytics is deployed with the PostHog US Free project and seven-chart private owner dashboard. Questions, answers, scores, notes, sources, and backups stay local. See [USAGE_ANALYTICS](USAGE_ANALYTICS.md) for the payload contract, consent acceptance, native chart definitions, launch QA counts, and retention limits.

The complete eight-area scope remains required. Current code exposes all eight areas; completed browser acceptance and remaining platform limits are tracked in [E2E_REPORT](E2E_REPORT.md). That report is the authority for actual browsers, fixtures, downloads, and verification limits. Earlier v2 launch evidence does not automatically cover v2.1 workspace behavior.

## Completed local acceptance

All eight capability areas and the cross-cutting persistence/continuity work have recorded Chromium evidence in [E2E_REPORT](E2E_REPORT.md). The local suite passes **38 Node checks, 7 Python checks, 9 native-storage checks, and 15 workflow checks**, plus sample validation, deterministic build freshness, actual JSON downloads, offline backup/PDF/expiry checks, and diff whitespace checks.

```bash
npm ci
npx playwright install chromium --only-shell
npm run verify
npm run build
npm run build:check
npm run test:browser
git diff --check
```

Browser checks use isolated contexts and an ephemeral test origin. Generated screenshots and files are under ignored `output/browser/`. The CI workflow now runs the browser gate before Pages publication and uploads its evidence.

## Remaining platform work

1. Broaden the verified browser matrix beyond Chromium to Safari/Firefox and physical touch devices; OS screen-reader speech and native browser-chrome zoom remain untested.
2. Benchmark larger libraries and additional PDF encodings when those real workloads are available. Current fixtures and limits are described in the acceptance report.

These are platform follow-ups; the complete eight-area implementation is deployed. The refreshed README, badges, screenshot, and documentation anchors were checked in the GitHub-rendered page.

The authorized release updates were published and verified on [Reddit in r/SideProject](https://www.reddit.com/r/SideProject/comments/1wyf9co/examengine_21_update_encrypted_backups_a_pack/) and [X](https://x.com/Rajveer761SM/status/2107166574767648993). Those launch posts cover the earlier workspace release. The analytics release is recorded above; no new promotional posts were sent.

## Preserved boundaries

The generator's requirements/source-grounding/QA workflow is unchanged and remains independently reusable. Optional pack identity/source metadata extends the schema without replacing schema 2.0. The app never generates AI questions itself.

Browser data is local to an origin/profile. Manual backups can be stored in a chosen cloud folder, but direct cloud sync/accounts/teacher administration/proctoring are not implemented. Full-backup encryption protects the downloaded file, not the working IndexedDB database.

Existing Codex skills were sufficient for this implementation; no additional skill installation is required to run or maintain the product. See [README](../README.md), [Product](../PRODUCT.md), [Design](../DESIGN.md), [Architecture](ARCHITECTURE.md), and [Roadmap](ROADMAP.md).

## Recorded v2 history

The prior v2 baseline was merged through PR #1:

- `62a26f1` — schema v2 and strict validator
- `af24447` — deterministic core and timer/scoring tests
- `7e4fefd` — exam/study UI and local learning workflows
- `472fc2f` — generator QA, validator parity, CI, and documentation
- `b6f1f1f` — generated single-file distribution
- `e8ac611` — v2 merge into `main`

These historical milestones are distinct from acceptance and publication of the current workspace changes.
