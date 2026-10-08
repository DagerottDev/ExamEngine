# Workspace verification — 2026-10-05

The complete eight-area RecallForge 2.1 implementation is present in the working tree and verified locally. This report covers the generated single-file viewer, native IndexedDB, actual download files, and a separate `file://` launch. It does not establish a GitHub push, release, or Pages deployment.

## Reproduce

```sh
npm ci
npx playwright install chromium --only-shell
npm run verify
npm run build
npm run build:check
npm run test:browser
git diff --check
```

On Linux, install the browser with `npx playwright install --with-deps chromium --only-shell`. The runner starts a server on an ephemeral loopback port and uses fresh browser contexts. It does not open a personal browser profile. Screenshots, reports, downloaded JSON, and disposable fixtures go into ignored `output/browser/`.

The CI workflow runs the same browser gate before uploading/deploying the Pages artifact and retains the evidence as an artifact. The updated remote workflow has not yet been executed.

## Current acceptance

| Area | Completed evidence |
| --- | --- |
| Exam baseline | Deterministic overall deadlines, non-resetting question budgets, seeded shuffling, weighted/uniform/negative marks, and exact-set multi-select tests; real study/submit/retest and timed mock workflows |
| Library/custom mock | Saved reusable packs, question filters, deterministic balanced selection and recency exclusion checks; UI selection, count, timing, and uniform scoring |
| Authoring/revisions | Incomplete draft save/reopen, validation/publishing, source linking, immutable revision increment, cosmetic/semantic identity tests, and retained historical snapshots |
| Learner signals | Confidence and checked feedback survive reload; mistake edits, bookmarks/notebook, guessed/unsure/unclear scheduling, and safe dialog keyboard isolation |
| Daily revision | Local-calendar/DST interval tests, replay idempotence/daily cap, queue-to-session launch, requested count and untimed study behavior |
| Progress | Detailed attempts, reopening support, topic sample counts, answer time/confidence/mistake summaries, same-question first/retest comparison, and score trends restricted to matching session contexts |
| Adaptive request | Actual JSON download with selected count/difficulty/topics/type, origin and source context, and avoided question identities; no provider request |
| Sources | UTF-8 text and image display, two-page PDF rendering/selectable text layer/page/zoom, question excerpt display, cleanup, missing-source rejection with a recovery message, and source hash/signature/size validation |
| Appearance/layout | Timer left/right/bottom and palette options, presets, independent fonts/reading settings, themes/accents/motion, dashboard move controls, live preview, saved preferences, and bundled-font loading |
| Accessibility/responsiveness | Safe confirmation focus; form/dialog shortcuts do not change questions; mobile palette collapse and visible timer; no horizontal overflow at 390/768/1440 px; 200% CSS reading zoom and a 720×450 equivalent viewport; text/status/accent contrast at least 4.5:1 across light/dark and three accents |
| Plain/encrypted backups | Actual adaptive/encrypted/plain JSON files downloaded to disk; source bytes and complete attempts included; wrong password rejected, readable preview, idempotent merge, replace confirmation, and undo |
| Native storage | One-time legacy migration/original preservation; dirty-key saves; repeated merge; replace/undo; injected quota abort leaves previous state intact; stale writes rejected; empty replacement does not resurrect retained legacy data |
| Failed partial saves | A failed attachment save cannot make a later packs-only save persist dangling references. Unrelated preferences can still save; retrying dependent keys together works; session writes reread only the revision, not attachments |
| Continuity | Reload retains answer/confidence/checked state; a second tab takes ownership and the first stops presenting a writable session; timer expiry during an open confirmation cannot create duplicate submissions |
| Storage denied | Visible temporary-mode copy, a usable temporary study session, and a complete plain backup; no claim that temporary data is durably saved |
| Offline distribution | Actual `file://` startup, encrypted backup import into a fresh context, bundled PDF page viewing, and expired-session restore automatically submitting with its original deadline; zero HTTP(S) requests in the tested flows |

The native storage harness passes **9 checks** and the workflow harness passes **15 checks**. The Node and Python checks, sample validation, build freshness, and whitespace checks pass; the final executed totals are recorded in [PROJECT_STATUS](PROJECT_STATUS.md). The runner fails on unexpected application exceptions or external network requests. Expected injected storage exceptions are explicitly scoped to their rollback tests.

## Issues caught and fixed

- Corrected editor mark-input constraints that rejected the default one mark; refreshed the saved-draft list when closing the editor.
- Updated PDF cleanup to the installed PDF.js loading-task API and guarded page/render races.
- Returned merge/replace/undo to Home so a restored session exposes Resume immediately.
- Preserved draft edits before switching editors; guarded pending button actions and duplicate timer/manual submissions.
- Validated partial saves against committed state, retaining atomic stale-tab rejection and avoiding attachment reads on answers.
- Kept the legacy migration marker outside replaced public workspace data, preventing old localStorage from reappearing after an empty restore.
- Added missing-source import validation and supported Markdown MIME backup sources.
- Preserved draft editing and retest links across backup ID conflicts; repeated imports deduplicate renamed sources, questions, packs, attempts, drafts, and notebook entries.
- Retained unknown timing/scoring metadata when publishing through the editor.

## Verification limits

- Automated browser acceptance used Playwright Chromium 153 on macOS. Interactive inspection used Codex's internal browser; an earlier native confirmation stalled its input transport, so the in-page confirmation and durable isolated runner supplied the final evidence. No personal/system browser profile was used.
- Safari, Firefox, physical touch devices, OS screen-reader speech, and browser-chrome zoom shortcuts were not exercised. CSS zoom and reduced-viewport checks cover layout; they are not a claim of physical-device or native browser-zoom validation.
- PDF evidence uses a two-page text fixture and an image fixture; it is not a guarantee for every PDF encoding or very large library. Limits and integrity failures also have deterministic coverage.
- Actual iCloud/Google Drive transfers, external AI generation, and payment transactions were not performed. Backups are ordinary downloaded files for the user to place in their chosen folder.
- No commit, push, release tag, remote CI run, or deployment was performed for this implementation. Earlier v2 launch evidence remains in Git history and is not substituted for the workspace checks above.
