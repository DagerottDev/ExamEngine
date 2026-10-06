# Architecture

ExamEngine 2.1 keeps the deterministic exam core and adds a local study workspace. The browser runs the app; there is no application server or account database. The deployable artifact remains one generated HTML file. Implementation and acceptance evidence are tracked separately in [PROJECT_STATUS](PROJECT_STATUS.md) and [E2E_REPORT](E2E_REPORT.md).

## Component map

| Component | Responsibility |
| --- | --- |
| `schema/mcq-pack.v2.schema.json` | Pack schema 2.0; optional pack/question identities and local source bindings |
| `.agents/skills/mcq-pack-generator/` | Existing source-grounded generation/QA workflow, examples, schema resource, and Python validator |
| `src/core/exam-engine.js` | Pack validation/legacy upgrade, seeded delivery, timers, answers, scoring, and topic analytics |
| `src/core/workspace.js` | Identity/revisions, question collection, mock selection, review scheduling, workspace/session validation, IndexedDB migration/save/restore/undo |
| `src/core/backup.js` | Plain/encrypted envelopes, input limits, source/hash/fingerprint validation, and import preview |
| `src/core/preferences.js` | Allowed appearance values/defaults and home-card order normalization |
| `src/core/confirm.js` | Keyboard-accessible in-page confirmation dialog |
| `src/app.js` | Upload/launch/resume, live session rendering, answer/flag timing, history/notebook, result/retest exports, and tab notifications |
| `src/workspace-ui.js` | Home/Library/Study/Progress/Settings, authoring, sources/PDFs, appearance, backups, and adaptive-request forms |
| `src/index.html`, `src/styles.css` | Shell, tokens, responsive layouts, reading preferences, and motion |
| `src/assets/fonts/` | Four bundled font files and their license notices |
| `scripts/build.mjs` | esbuild bundle, embedded PDF worker/fonts/sample/styles, and license notices |
| `mcq-exam-website/index.html` | Generated browser distribution; edit source files and rebuild |
| `tests/` | Node deterministic/controller tests, Python validation parity, and isolated native-browser storage/workflow harnesses |

## Data flow

```text
Reference material + sample exam questions
                ↓
Existing mcq-pack-generator in the user's agent
                ↓
Schema 2.0 JSON pack → Python/browser validation
                ↓
Saved pack revision + stable question identities
                ↓
Exam/study/mock/revision session → detailed attempt events
                ↓
Progress + notebook + due-review queue
                ↓
Full workspace backup → manual file transfer → previewed restore
```

The generation skill's source-grounding and QA workflow is unchanged. The browser can export configurable adaptive requests, but never calls an AI provider. Result JSON, adaptive-request JSON, pack JSON, and full-workspace backups are different export contracts.

## Workspace persistence

The native IndexedDB database uses a keyed `workspace` object store. The persisted values are:

```text
packs, drafts, sources, attempts, review, notebook,
session, preferences, meta
```

The active session contains `{pack, session}`. Pack records hold `id`, `packId`, `revision`, `fingerprint`, the validated pack, archive state, and creation time. Source records hold an ID, original name, MIME type, byte size, base64 data, and SHA-256 hash. Detailed attempts keep pack/session snapshots and question events; migrated history is summary-only.

`save(workspace, keys)` validates the last committed state plus cloned dirty keys, then writes only those keys. Failed writes leave its private cache unchanged; load/restore/undo return detached data. Answer changes do not rewrite source attachments. Writes serialize within a store instance and compare a stored revision in the same transaction, rejecting stale-tab saves rather than overwriting newer data. The controller uses BroadcastChannel notifications and session ownership; takeover/race acceptance belongs to the browser checks.

On first initialization, legacy `exam-engine:v2:resume/history/notebook/theme` data migrates from `localStorage`. Original keys are retained. Invalid legacy resume data produces a migration warning; history/notebook records are sanitized. An internal migration marker survives complete workspace replacement, so retained legacy keys never replay after an empty restore. A small appearance hint can remain in `localStorage`; IndexedDB owns the workspace.

Storage is scoped to browser profile and origin, not a user identity. Private browsing, eviction, clearing site data, or using another host/port/profile can remove or hide saved work. If IndexedDB is unavailable, the controller reports temporary mode. Persistent-storage requests do not replace external backups.

## Pack identity and authoring

Exact validated content reimports deduplicate. Changed content creates a new pack revision. Question identity compares the normalized stem, options, and correct option content; cosmetic metadata and option reordering with preserved answers can retain the identity. Substantive question/answer changes receive a new identity. Historical revisions remain available to attempt snapshots and references.

The editor stores incomplete drafts separately from playable packs. Publishing runs semantic validation before creating a revision. Optional `questionUid` and `sourceBindings` are validated consistently in JavaScript, Python, and the canonical schema. A local binding has `{sourceId, page?, excerpt?}`; textual/external `sourceRefs` keep their earlier meaning.

Mock selection uses latest active revisions, stable seeded ordering, topic balancing, pack/topic/difficulty filters, and an optional seven-day recent-exposure exclusion. Original question identities and origin pack/revision are preserved. Uniform source scores become per-question values when mixing source packs; an explicit uniform override is also available. Insufficient matching questions produces an error. Untimed mocks use study delivery.

## Sessions, timing, and review

An overall timer uses the original absolute exam deadline. Per-question timers store remaining budgets, account for elapsed wall-clock time, and do not reset on navigation. Restoring a backup keeps those exact timestamps; it does not restart a timed exam.

Trust-boundary validation checks pack structure, known question/record/source/attempt references, snapshot question identities, timer budgets/deadlines, answer indices, flags, confidence, checked questions, and time maps. Multi-select scoring is exact-set/all-or-nothing. Pack or explicit launch rules determine marks and negative marks.

Completed attempts produce events keyed by stable question identity. Confident correct reviews advance through 1, 3, 7, 14, and 30 days, at most once per local calendar day. Correct guessed/unsure answers retain their stage and return tomorrow. Wrong/skipped/still-unclear answers reset to the first interval. Due dates use local-calendar midnight rather than fixed 24-hour arithmetic. Event replay is idempotent; editing a past confidence/unclear signal rebuilds the queue from attempts.

Progress combines detailed events with explicit pack/revision/session-context filtering, topic counts, scores, confidence/mistake notes, and answer times. Summary-only legacy records cannot supply detailed analytics. Score trends require the same questions, pack revision, mode, timing, and scoring. First/retest comparisons use matching question identities and identify untimed retests as a study signal.

## Source files and offline packaging

Supported source types are UTF-8 text/Markdown, PNG/JPEG/WebP, and PDF. Limits are 1 MiB text, 5 MiB image, 25 MiB PDF, and 40 MiB total attachments. Metadata, hashes, byte sizes, text decoding, and MIME signatures are checked. Source deletion is guarded against links in retained revisions, drafts, attempts, and the saved session.

Local sources use Blob URLs. Text is rendered as text, images as images, and PDFs through bundled PDF.js with page controls, zoom, and a selectable text layer. Render cancellation and URL/document cleanup handle page changes and closing. A signature check is not a full document-content audit; PDF compatibility and offline/runtime behavior must be tested in the browser.

The build bundles JavaScript through esbuild and embeds PDF.js's worker, four fonts, styles, and sample data. It also embeds the app's MIT notice, PDF.js's Apache-2.0 notice, and font OFL notices. The raw source HTML has bare package imports and is not the standalone browser entry point. Use the generated viewer for local browser testing. External source/project/support links require the network when opened; optional consent-based usage events go to PostHog US only on the configured production URL. Study content stays local. Analytics consent and the random browser identifier use separate localStorage keys outside workspace backup/restore/undo. See [the privacy contract](../README.md#optional-usage-analytics).

## Backup and restore

The envelope has type `examengine-backup`, backup version 1, an application version, export time, and workspace data. Inputs are limited to 100 MiB. Pack/schema version and compatible application version checks reject unsupported data. Validation rejects unsafe prototype keys, invalid JSON/base64, malformed records/references, altered stored-pack fingerprints, and invalid source data.

Plain backups contain readable workspace data. Optional encrypted backups use AES-256-GCM, PBKDF2-SHA256 with 600,000 iterations, a fresh 16-byte salt and 12-byte IV, a 128-bit tag, and authenticated envelope metadata. Passwords require at least 12 characters and are neither stored nor recoverable. These protect exported files; they do not encrypt the working IndexedDB database.

Merge deduplicates matching records, preserves/remaps conflicting source/question/record identities throughout imported snapshots, retains the current session/preferences by default, refreshes pack fingerprints after remapping, and derives review state from combined attempts. Preference import is an explicit merge option. Replace restores the complete incoming workspace. Restore writes data and the pre-restore recovery snapshot atomically; undo restores that single snapshot. Failed transactions must leave the previous workspace intact.

The user downloads a backup and places it in iCloud Drive, Google Drive, or another folder. There is no cloud-provider login, automatic sync, conflict daemon, or account-backed recovery.

## Verification and release boundaries

`npm run verify` runs Node tests, Python parity, and sample validation. `npm run build` generates the artifact; `build:check` checks freshness. `npm run test:browser` runs isolated Chromium storage/workflow harnesses, actual downloads, responsive/contrast/font checks, and offline-file acceptance. The CI workflow installs from the lockfile and runs those gates before deploying Pages from `main`. Core/controller checks do not prove native downloads, UI accessibility, offline launch, cross-browser storage, PDF rendering, or multi-tab races. Current evidence and remaining acceptance gates belong in [E2E_REPORT](E2E_REPORT.md).

Backend authentication, direct synchronization, teacher administration, and proctoring remain optional roadmap work. They must preserve the local deterministic exam/session contracts.
