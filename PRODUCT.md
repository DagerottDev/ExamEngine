# Product

ExamEngine is a free local-first study workspace for learners who already have reference material and question packs. It runs as a static browser app or a generated single-file viewer. The central task is to choose what to study, answer questions under clear rules, understand mistakes, and return to a useful review queue.

## Product contract

- Preserve schema 2.0 packs and the existing generator workflow. The browser does not call an AI service.
- Keep exam rules explicit: marks, negative marks, multi-select exact-set scoring, and timing come from the pack or a deliberate launch/mock setting.
- Store study work locally and make it portable through a full backup. Never imply that a browser save or cloud-folder download is automatic synchronization.
- Retain stable identities/revisions so edits, historical attempts, and mixed mocks have understandable provenance.
- Give learners control over reading/layout without hiding timers or changing scoring, answers, deadlines, and saved history.

## Complete workspace scope

| Area | User outcome |
| --- | --- |
| Appearance/layout | Choose comfortable fonts/size/width/line height, theme/accent, preset, timer/palette placement, motion, and home-card order |
| Portable backup | Export all data and attachments, optionally encrypt it, move the file manually, preview restore, preserve conflicts, and undo the latest restore |
| Pack authoring | Draft/edit/validate/publish/export packs; reorder/duplicate questions; keep meaningful identity/revision history |
| Local sources | Attach notes/images/PDFs, map file/page/excerpt to questions, and read sources from explanations/review |
| Adaptive request | Choose topics, count, difficulty, and question type; export grounded context to the existing external generator workflow |
| Custom mock | Build a repeatable, balanced session from selected saved questions with recency/difficulty/topic filters, explicit timing, and scoring |
| Daily revision | See due questions, review them, record confidence/mistake/unclear signals, and use predictable local-calendar intervals |
| Detailed progress | Reopen attempts and compare scores/questions in appropriate contexts with topic sample sizes, timing, confidence, and first/retest information |

The current implementation exposes all eight areas. Acceptance must cover their full workflows, not just the presence of controls. Status and remaining evidence are recorded in [PROJECT_STATUS](docs/PROJECT_STATUS.md) and [E2E_REPORT](docs/E2E_REPORT.md).

## Main navigation

**Home** answers “what should I study now?” with due/recent/weak/notebook cards and unfinished-session resume. **Library** is the place to import/search/edit packs, build a mock, and attach sources. **Study** presents the review queue. **Progress** shows saved attempts and learning signals. **Settings** handles appearance, backups, and local storage management.

Source-file, appearance, adaptive-request, and confirmation dialogs keep those tasks close to the current context. Destructive replacement/removal actions require an explicit confirmation. Saves and failures must be visible; temporary mode must never be presented as durable storage.

## Data portability and boundaries

A **pack JSON** shares question content/rules/provenance references. A **result JSON** shares one session's outcome. An **adaptive request** describes the next generation task. A **full backup** preserves packs/revisions, drafts, attachments, attempts, review, notebook, preferences, and saved session timing.

Backups can be placed in iCloud Drive, Google Drive, or any user-chosen folder. Password encryption requires at least 12 characters and has no recovery mechanism. Merge retains local session/preferences by default; replace restores the backed-up workspace. One recovery snapshot supports undo. Browser data remains origin/profile scoped and can be lost through eviction, private browsing, or clearing data.

Text/Markdown sources are limited to 1 MiB, images to 5 MiB, PDFs to 25 MiB, and all attachments to 40 MiB. Pack uploads allow 5 MiB and backups 100 MiB. Local sources can be read without fetching a remote source URL; external references may need the network.

This is a personal-study tool. Answers live in the client/pack, and analytics are learning signals rather than validated mastery measurements. Automatic cloud sync, accounts, institutional administration, and proctoring remain separate future decisions. Do not weaken local/offline exam behavior to introduce them.

## Acceptance

The deterministic core, trust-boundary checks, build consistency, native storage transactions, UI flows, source/PDF behavior, downloadable exports, responsive layouts, keyboard/focus/contrast, motion, and offline/browser limits each need appropriate evidence. [E2E_REPORT](docs/E2E_REPORT.md) owns that evidence; code presence alone does not close a product requirement.

Existing installed Codex skills support implementation and review; they are not required to use the viewer. No new skill installation is needed. The optional repository `mcq-pack-generator` remains available for generation in a compatible agent.
