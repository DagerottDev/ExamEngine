# Project Status

**Project:** ExamEngine  
**Current release line:** v2  
**Status date:** 2026-08-16  
**Default branch:** `main`  
**v2 merge commit:** `e8ac6116330e57b953c2482815cfb027338caa73`  
**Latest verified main CI:** ExamEngine CI run #2 (`31907554148`) — **passed**

## Executive status

ExamEngine v2 is implemented, merged to `main`, and verified by CI. The v2 milestone is functionally complete for the current offline-first scope: source-grounded MCQ generation, schema validation, deterministic exam delivery, correct timer/scoring behavior, local persistence, result analytics, weak-area workflows, and a reproducible single-file browser build are all present.

This does **not** mean the product has reached a hosted multi-user or proctored-production state. The current product is deliberately local/offline-first and stores user state in the browser.

## Current capability matrix

| Area | Status | Notes |
|---|---|---|
| ExamEngine v2 schema | ✅ Complete | Versioned pack contract with strict semantic validation |
| Legacy v1 migration | ✅ Complete | Browser migrates older packs to the current model |
| Single-select MCQs | ✅ Complete | Strict `answerIndex` representation |
| Multi-select MCQs | ✅ Complete | Strict `multiSelect` + `answerIndices`, all-or-nothing scoring |
| Weighted marks | ✅ Complete | Per-question marks supported |
| Negative marking | ✅ Complete | Per-question and uniform scoring modes supported |
| Total marks consistency | ✅ Complete | Validator checks computed maximum against exam total |
| Overall exam timer | ✅ Complete | Absolute wall-clock deadline |
| Per-question timer | ✅ Complete | Remaining time persists across navigation; revisits cannot reset it |
| Combined timer mode | ✅ Complete | Overall + per-question timing can run together |
| No-timer mode | ✅ Complete | Supported by schema/delivery model |
| Seeded question shuffle | ✅ Complete | Deterministic for a given seed |
| Seeded option shuffle | ✅ Complete | Correct-answer mapping remains intact |
| Sections | ✅ Complete | Questions can reference section IDs |
| Exam mode | ✅ Complete | Standard assessment flow |
| Study mode | ✅ Complete | Learning-oriented flow |
| Autosave / resume | ✅ Complete | Browser-local session persistence |
| Attempt history | ✅ Complete | Stored locally |
| Wrong-answer notebook | ✅ Complete | Stored locally |
| Topic analytics | ✅ Complete | Per-topic performance summaries |
| Weak-topic detection | ✅ Complete | Used for adaptive follow-up |
| Wrong/skipped retest | ✅ Complete | Builds targeted retest subsets |
| Adaptive retest request | ✅ Complete | Exports a request for generating a new targeted pack |
| Source references | ✅ Complete | Pack metadata supports question-level provenance |
| Result export | ✅ Complete | JSON result export |
| Offline distribution | ✅ Complete | Self-contained `mcq-exam-website/index.html` |
| Antigravity generator v2 | ✅ Complete | Generates v2 packs and runs mandatory QA |
| Python pack validator | ✅ Complete | CLI validator |
| Browser/core validator | ✅ Complete | Semantic validation in deterministic core |
| Validator parity tests | ✅ Complete | Python coverage verifies important contract rules |
| Core unit tests | ✅ Complete | Timing, scoring, shuffling, analytics and migration coverage |
| GitHub Actions CI | ✅ Complete | Tests, sample validation and offline build |
| Hosted backend | ⬜ Not implemented | Current architecture is offline-first |
| Authentication / accounts | ⬜ Not implemented | No user server/account layer |
| Cross-device sync | ⬜ Not implemented | Browser data is local to a device/profile |
| Live multi-user administration | ⬜ Not implemented | No teacher/admin backend |
| Remote proctoring | ⬜ Not implemented | Outside current v2 scope |
| Full browser E2E suite | ⬜ Not implemented | Core logic is tested; browser workflow coverage should be added next |

## v2 milestone history

The v2 implementation was delivered as separate major commits and then merged through PR #1:

- `62a26f1` — schema v2 and strict validator
- `af24447` — deterministic exam core plus timer/scoring tests
- `7e4fefd` — adaptive exam/study UI, persistence and learning features
- `472fc2f` — generator QA, validator parity tests, CI and documentation
- `b6f1f1f` — generated single-file offline distribution
- `e8ac611` — merge of the verified v2 implementation into `main`

## Verification status

The post-merge `main` workflow completed successfully. The CI pipeline verifies:

1. Node/core unit tests
2. Python validator parity tests
3. sample v2 pack validation
4. generation of the offline single-file distribution
5. publication of the generated distribution when applicable

Local verification:

```bash
npm run verify
python3 -m unittest tests/validator_test.py
python3 .agents/skills/mcq-pack-generator/scripts/validate_pack.py mcq-exam-website/sample-mcq-pack.json
npm run build
```

## Current product boundaries

ExamEngine v2 should currently be described as an **offline-first single-user exam and adaptive-study engine**, not as a hosted LMS or proctoring platform.

Current persistence uses browser `localStorage`. There is no server-side database, login system, cloud sync, centralized attempt administration, live exam assignment service, or proctoring subsystem.

The adaptive loop is partially automated: ExamEngine identifies weak areas and can export a structured adaptive retest request, while the generator skill consumes that request to create a new targeted pack. The browser does not independently call an AI service.

## Definition of done for v2

The v2 milestone is considered **complete** because:

- known timer-reset and scoring-source-of-truth issues were corrected;
- the pack contract is versioned and strictly validated;
- deterministic core logic is separated from UI code;
- core correctness is covered by automated tests;
- the offline distribution is reproducibly generated;
- the study/analytics loop is operational locally;
- CI is green on the merged `main` branch.

Future work is tracked in [ROADMAP.md](ROADMAP.md). Architecture details are in [ARCHITECTURE.md](ARCHITECTURE.md).
