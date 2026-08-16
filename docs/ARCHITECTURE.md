# Architecture

## Overview

ExamEngine v2 uses an offline-first architecture with a deterministic JavaScript core, a browser UI/persistence layer, a schema/validator contract, an Antigravity MCQ-generation skill, and a reproducible build that produces a self-contained HTML distribution.

```text
Reference material + sample exam questions
                │
                ▼
.agents/skills/mcq-pack-generator
                │
       ExamEngine v2 JSON pack
                │
       ┌────────┴────────┐
       ▼                 ▼
 Python validator    Browser/core validator
       │                 │
       └────────┬────────┘
                ▼
          src/core/
 validation • migration • delivery
 timers • scoring • shuffle • analytics
                │
                ▼
             src/app.js
 UI • autosave • history • notebook • exports
                │
                ▼
         scripts/build.mjs
                │
                ▼
 mcq-exam-website/index.html
   self-contained offline distribution
```

## Component map

### `schema/mcq-pack.v2.schema.json`

Canonical JSON Schema for ExamEngine v2 packs. It defines the structural contract for exam metadata, timing, scoring, delivery settings, sections, questions and learning metadata.

Semantic rules that are difficult or impossible to express cleanly in JSON Schema are also enforced by the validators, including total-marks consistency and mutually exclusive answer representations.

### `.agents/skills/mcq-pack-generator/`

The generation subsystem contains:

- `SKILL.md` — generation and QA workflow
- `resources/mcq-pack-schema.json` — generator-facing schema copy
- `scripts/validate_pack.py` — dependency-free Python validator
- `examples/sample-mcq-pack.json` — valid reference pack

The generator is responsible for source grounding, difficulty calibration, coverage planning, plausible distractors, learning metadata and validation before delivery.

### `src/core/exam-engine.js`

The deterministic domain layer. It should remain free of browser UI concerns.

Responsibilities include:

- pack validation
- legacy pack migration
- seeded question and option shuffling
- answer mapping
- exam timing calculations
- per-question remaining-time accounting
- weighted/negative scoring
- result calculation
- topic analytics
- weak-area detection
- targeted retest selection

Time-sensitive logic uses wall-clock timestamps/deadlines rather than trusting a decrementing UI counter. This prevents navigation from restoring question time and makes browser throttling less damaging to correctness.

### `src/app.js`

Browser orchestration and presentation workflow. It connects DOM interactions to the deterministic core and handles browser-local state.

Responsibilities include:

- pack upload and sample loading
- exam/study navigation
- rendering questions, sections, palette and results
- answer/flag interactions
- autosave and resume
- attempt history
- wrong-answer notebook
- result export
- adaptive retest request export
- theme and user-facing settings

### `src/index.html` and `src/styles.css`

Development shell and presentation layer. These are source files rather than the final distribution.

### `scripts/build.mjs`

Builds the offline distribution by combining the development HTML, CSS, deterministic core, browser app and sample pack into one self-contained file.

Output:

```text
mcq-exam-website/index.html
```

The generated file is intended to run without runtime package dependencies or a web server.

### `tests/`

Current automated verification consists of:

- `core.test.mjs` — deterministic JavaScript core tests
- `validator_test.py` — Python validator/contract parity tests

The suite emphasizes high-risk correctness paths such as timer persistence, weighted scoring, multi-select behavior, seeded delivery, migration and validation.

### `.github/workflows/ci.yml`

CI executes the verification pipeline on repository changes. The current pipeline runs core tests, Python validator tests, sample-pack validation and the single-file build. A successful build can publish the regenerated offline distribution back to the branch.

## Pack lifecycle

### Generation

1. User provides source material and representative target-exam questions.
2. Generator calibrates difficulty and maps source references.
3. Generator plans topic/learning-objective coverage.
4. Questions are generated with answer, scoring and provenance metadata.
5. Generator performs QA.
6. Python validator validates the final pack.

### Loading

1. Browser parses JSON.
2. Legacy packs are migrated to v2 when possible.
3. Core semantic validation runs.
4. Delivery settings are resolved.
5. Seeded shuffling is applied deterministically.
6. Exam session state is initialized or restored.

### Session timing

Overall exam timing is represented by an absolute deadline.

Per-question timing stores remaining duration and accounts for elapsed wall-clock time when leaving/re-entering questions. Navigation never grants fresh time to a previously visited question.

### Scoring

In `question` scoring mode, each question owns `marks` and `negativeMarks`. Maximum marks are the sum of question marks.

In `uniform` scoring mode, the common scoring rule is applied across the pack.

Multi-select questions use exact-set, all-or-nothing correctness.

### Adaptive learning

Completed attempts produce topic analytics and weak-topic detection. Users can:

- retest wrong/skipped questions from the current pack;
- inspect the wrong-answer notebook;
- export an adaptive retest request containing weak topics and source provenance;
- feed that request back to the generator to create new targeted questions.

## Persistence model

ExamEngine currently uses browser `localStorage` for local-only persistence. Stored data includes active session state, completed attempts, theme preference and wrong-answer notebook data.

Implications:

- works offline;
- no backend dependency;
- data is scoped to the browser profile/device;
- clearing browser storage removes local history;
- no built-in cross-device synchronization.

A future cloud layer should be additive and should not make the deterministic core dependent on network availability.

## Design principles

1. **Pack is the source of truth** for exam rules unless an override is explicitly represented.
2. **Core logic is deterministic** and independently testable.
3. **Timer correctness uses elapsed time**, not navigation events or UI ticks.
4. **Generated content carries provenance** through `sourceRefs`.
5. **Offline operation remains a first-class mode** even if a hosted layer is added later.
6. **The generated single-file viewer is a build artifact**; development happens in modular `src/` files.
7. **Planned features must not be documented as implemented** until code and verification exist.

## Current limitations

The architecture does not currently include:

- backend/API service
- authentication or authorization
- cloud database
- cross-device synchronization
- centralized exam assignment/administration
- remote proctoring
- real-time collaboration
- comprehensive browser E2E automation

These are roadmap items rather than incomplete pieces of the v2 offline milestone.
