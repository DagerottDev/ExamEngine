# Roadmap

The roadmap preserves the verified historical v2 exam baseline and the complete eight-area local study-workspace goal. “Present in source” and “accepted in the browser” are separate states. Current evidence belongs in [E2E_REPORT](E2E_REPORT.md); current release gates are in [PROJECT_STATUS](PROJECT_STATUS.md).

## Historical baseline — v2

The merged v2 milestone delivered schema 2.0 validation, deterministic timers/scoring/shuffling, legacy packs, single/multi answers, exam/study modes, sections and learning metadata, local resume/history/notebook, topic analytics, wrong/skipped retests, adaptive-request and result exports, modular source, the generated single-file viewer, generator QA, tests, and CI. It remains the regression baseline.

## Current milestone — complete local study workspace

All eight areas have exposed source/UI. None can be silently reduced to a placeholder to finish the milestone; close acceptance with real workflow evidence.

| Area | Required acceptance |
| --- | --- |
| Appearance/layout | Presets and individual controls, previews/resets, timer/palette placements, embedded fonts, theme/accent, card drag/keyboard ordering, motion, responsive/zoom behavior |
| Portable backups | Full data/attachment export, password encryption and errors, human-readable preview, merge/replace/conflicts, preferences/session semantics, atomic rollback and undo |
| Pack authoring | Incomplete draft safety/autosave, question/answer metadata, reorder/duplicate/delete, timing/scoring, validation/export, identities/revisions and historical references |
| Local sources | Real text/images/PDFs, multiple question file/page/excerpt links, page/zoom/text layer, missing-source recovery, limits/safe bytes, source deletion guards and offline cleanup |
| Adaptive requests | Editable topics/count/difficulty/question type, provenance and avoid identities, real download and generator-compatible payload |
| Custom mocks | Latest saved questions, deterministic balance, pack/topic/difficulty/recency filters, pool-size errors, explicit timing, source/uniform marks, origin identity/revision |
| Daily revision | Actionable due queue, confidence/mistake/unclear notes, correct interval progression and daily cap, local-calendar/DST behavior, changed/archived questions |
| Detailed progress | Reopened detailed attempts, relevant pack/revision context, comparable first/retest information, score/time/topic/confidence/mistake trends and honest sample sizes |

Native IndexedDB one-time migration/original preservation, dirty-key writes, transaction failure/stale-tab rejection, owner takeover/resume expiry, persistent/temporary storage copy, accessible dialogs, actual downloads, and offline packaging are cross-cutting acceptance gates. Finish them before calling the workspace released. Manual backups to cloud folders remain the implemented portability approach; direct provider synchronization is a later phase.

## P1 — Browser reliability and UX hardening

- [x] Complete and record the current workspace acceptance matrix without narrowing its scope.
- [x] Maintain reproducible native storage/workflow harnesses and gate Pages publication on their Chromium results.
- [x] Test upload → save → exam/study → submit → progress → retest/revision flows, including reload and expiry. Background/physical-device coverage can be broadened.
- [x] Exercise storage denied, injected quota failures, corruption/tamper rejection, import rollback, real downloads, and multi-tab takeover. Browser eviction is a documented external-data-loss boundary.
- [x] Document verified Chromium and actual `file://`/offline backup/PDF/font behavior.
- [x] Verify keyboard/dialog focus, contrast, reduced motion, responsive layouts, CSS zoom and the equivalent reduced viewport.
- [ ] Broaden to native browser zoom, OS screen-reader speech, Safari/Firefox, and physical touch devices.
- [ ] Add larger pack/source fixtures and startup/navigation/rendering performance budgets after measured bottlenecks.

Exit: critical full workflows have recorded evidence, no known timer/scoring/data-loss regressions, and the supported accessibility/browser baseline is explicit.

## P2 — Deeper adaptive learning

Source now includes daily review intervals, exposure filtering, confidence/mistake/unclear notes, and configurable adaptive requests. Finish their current acceptance above, then consider:

- [ ] Learning-objective tracking beyond topic summaries.
- [ ] Better mastery/confidence trends with clearly comparable contexts and sample counts.
- [ ] Configurable adaptive difficulty progression.
- [ ] Richer targeted retest blueprints from history and repetition/exposure controls.
- [ ] First-attempt/retest comparisons over time and explanation-quality feedback.

Exit: history produces actionable recommendations with understandable evidence; neither small samples nor mixed packs are presented as proven mastery.

## P3 — Further content management

Source now includes visual drafts/editor, question operations, validation/export, local sources, and pack/question identity/revision tracking. Preserve those workflows and later consider:

- [ ] Pack merge/split utilities.
- [ ] Bulk topic/tag/section editing.
- [ ] Near-duplicate detection UI and pack-level QA reports.
- [ ] CSV/other simple-format import/export.
- [ ] Explicit pack migration CLI and additional schema-aware advanced metadata controls.

The source-grounded generator's requirements, calibration, QA, and validation remain intact and independently reusable.

## P4 — Optional account-backed synchronization

- [ ] Define a backend-neutral sync contract before choosing a provider.
- [ ] Authentication and encrypted remote attempt/history storage.
- [ ] Cross-device sessions/history with deterministic offline conflict handling.
- [ ] User export/delete and observable sync failures.

Network failures must not invalidate an active local session. Manual downloadable backups are already a distinct workflow; these planned tasks must not be advertised as existing cloud sync.

## P5 — Instructor/admin workflows

- [ ] Assignments, rosters, attempt status, controlled pack/version publishing.
- [ ] Availability windows/attempt limits, centralized results, aggregate analytics.
- [ ] Role-based permissions and audit records.

This needs a backend and a concrete institutional requirement. Keep it separate from local personal-study acceptance.

## P6 — Assessment integrity/security

- [ ] Threat model for client-visible answers and managed assessment use.
- [ ] Signed/encrypted assessment bundles where appropriate.
- [ ] Secure hosted result submission and tamper-evident attempt metadata.
- [ ] Hosted Content Security Policy and dependency/security review.
- [ ] An explicit privacy/product decision before any proctoring work.

Backup encryption protects exported files; it is not assessment anti-cheating, local database encryption, or proctoring.

## P7 — Release engineering

- [ ] Versioned release tags and release notes/changelog.
- [ ] Downloadable generated HTML release assets.
- [ ] Reproducible artifact hash/freshness verification.
- [ ] Supported-browser matrix and release smoke checklist.
- [ ] Record the complete workspace's acceptance before publishing/deploying it.

## Order and constraints

Finish the current eight-area milestone and P1 reliability first. Then deepen learning/content management and release evidence according to actual user needs. Account/admin extensions remain optional future scope. Preserve the free static Pages deployment, MIT/generator reuse notices, optional donation links, and offline operation throughout.
