# Project Status

**Project:** ExamEngine

**Current package version:** 2.1.0

**Pack schema:** 2.0

**Status date:** 2026-10-05

**Recorded v2 merge:** `e8ac6116330e57b953c2482815cfb027338caa73`

**CI:** [Workflow runs](https://github.com/DagerottDev/ExamEngine/actions/workflows/ci.yml)

## Current state

The repository has a working-tree study-workspace implementation on top of the previously merged v2 exam baseline. It remains a free, MIT-licensed, static local-first product with the existing [Pages address](https://dagerottdev.github.io/ExamEngine/) and optional support links. The new workspace must not be described as released, deployed, or fully browser-accepted solely because its source and deterministic tests exist.

The complete eight-area scope remains required. Current code exposes all eight areas; completed browser acceptance and remaining platform limits are tracked in [E2E_REPORT](E2E_REPORT.md). That report is the authority for actual browsers, fixtures, downloads, and verification limits. Earlier v2 launch evidence does not automatically cover v2.1 workspace behavior.

## Completed local acceptance

All eight capability areas and the cross-cutting persistence/continuity work have recorded Chromium evidence in [E2E_REPORT](E2E_REPORT.md). The local suite passes **32 Node checks, 7 Python checks, 9 native-storage checks, and 15 workflow checks**, plus sample validation, deterministic build freshness, actual JSON downloads, offline backup/PDF/expiry checks, and diff whitespace checks.

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

## Remaining publication and platform work

1. Commit/push the reviewed working-tree change, run remote CI, and verify the published Pages revision when publication is requested.
2. Broaden the verified browser matrix beyond Chromium to Safari/Firefox and physical touch devices; OS screen-reader speech and native browser-chrome zoom remain untested.
3. Benchmark larger libraries and additional PDF encodings when those real workloads are available. Current fixtures and limits are described in the acceptance report.

These are publication/platform follow-ups; the complete local eight-area implementation is not narrowed to them. No remote release or deployment is claimed.

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
