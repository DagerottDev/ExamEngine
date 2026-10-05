# Launch verification — 2026-10-05

Tested the built single-file app in Codex's internal Chromium browser, served on an isolated `127.0.0.1:8766` origin. Fixtures and local progress were separate from the public demo. There is no backend or Docker configuration to test.

## Results

| Flow | Evidence |
| --- | --- |
| Sample pack and study mode | All nine sample questions loaded; correct-answer feedback and source references displayed. |
| JSON upload and legacy migration | v2 uploads loaded; a legacy pack migrated to a one-minute exam with default marks. |
| Invalid uploads | Invalid JSON, a file exceeding 5 MB, null questions, and invalid source-reference metadata showed validation errors without starting an exam. |
| Single/multiple answers and negative marking | Weighted fixture: wrong single answer, correct multi-answer, skipped question produced **2.5/6**, with **1 correct, 1 wrong, 1 skipped**. |
| Uniform scoring | Same pattern with four marks per correct answer and one negative mark produced **3/12**. Question labels showed the uniform scoring values. |
| Overall timer | Expiry automatically submitted the weighted and uniform exams and showed results/review. |
| Question timer | Three two-second question budgets advanced through the pack and automatically submitted **0/6**, three skipped. |
| Wrong/skipped retest | Uniform retest started in untimed study mode with the two failed/skipped questions. Automated controller regression verifies its maximum is **8** and the resulting pack is valid. |
| Persistence | Reload/resume retained the current question, answers, flags, and theme. Completed attempts appeared in local history and wrong/skipped questions in the notebook. |
| Keyboard | Enter opened the file chooser; answer letters, arrow navigation, and the flag shortcut worked. |
| Responsive layout | Desktop, 390×844 phone, and 768×1024 tablet inspected. Phone results and tablet exam had no document-level horizontal overflow. Question content remained in its scrollable panel. |
| Source-link escaping | A URL containing `" data-injected="yes` remained one literal href; no `data-injected` attribute appeared. |
| Console | No application errors in the completed browser flows. |

## Fixes included

- Escaped quotes at the shared HTML boundary, preventing uploaded source links from creating attributes.
- Rejected malformed question/source metadata and unsupported schema versions without validator crashes.
- Made Python enum/section validation return errors for list/object values rather than raising `TypeError`.
- Included unsectioned questions in a sectioned pack's navigation palette.
- Used uniform scoring for question labels and retest maximum marks.
- Replaced the upload div with a native button for keyboard activation.

Regression coverage uses Node/Python standard libraries; no runtime dependencies were added. Controller tests execute the actual app functions with minimal DOM/download adapters. They are not browser E2E tests.

## Reproduce deterministic checks

```sh
PYTHONDONTWRITEBYTECODE=1 npm run verify
npm run build:check
git diff --check
```

Passed: **14 Node checks**, **6 Python checks** (including malformed-value subcases), sample pack validation, generated-build consistency, and diff whitespace checks.

## Remaining verification limits

- The internal browser could not reliably handle the native submit confirmation or deliver download events. Manual cancel/accept behavior and both JSON export payloads pass controller tests; actual download-to-disk and native confirmation remain browser verification gaps.
- No external browser was launched without the user's explicit authorization. Safari, Firefox, physical touch devices, storage-denied environments, and intentionally corrupted localStorage were not tested.
- Offline packaging has embedded script, styles, and sample data; an actual `file://` launch was unavailable in the internal browser. Hosted operation was tested separately.
- The generator's validator was tested. New AI question generation, factual accuracy of third-party packs, and payment transactions are outside these checks.
