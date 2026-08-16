# ExamEngine v2

ExamEngine is an **offline-first MCQ exam and adaptive-study system**. It combines an Antigravity question-pack generator with a deterministic browser exam engine that can run as a single self-contained HTML file.

## Current status

**ExamEngine v2 is implemented, merged to `main`, and CI-verified.**

As of **2026-08-16**:

- v2 merge commit: `e8ac6116330e57b953c2482815cfb027338caa73`
- post-merge `main` CI run #2: **passed**
- offline viewer build: available at `mcq-exam-website/index.html`
- current product scope: offline-first, single-user exam + adaptive study

The v2 milestone is complete for its current scope. Hosted accounts, cloud sync, centralized administration, remote proctoring, and full browser E2E coverage are future roadmap items rather than existing features.

### Project documentation

- [Current project status](docs/PROJECT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Implemented in v2

- Schema-versioned packs (`schemaVersion: "2.0"`)
- Pack-controlled timing: exam timer, per-question timer, both, or none
- Per-question weighted marks and negative marking, with optional uniform scoring
- Strict single-answer vs multi-select validation
- Deterministic seeded question/option shuffling
- Sections and question metadata (topic, difficulty, cognitive level, learning objective)
- Source references and confidence metadata for generated questions
- Exam mode and study mode
- Autosave and resume
- Persistent attempt history
- Wrong-answer notebook
- Topic-level performance analytics and weak-topic detection
- Retest of wrong/skipped questions
- Exportable result JSON and adaptive 15-question retest request
- Legacy v1 pack migration in the browser
- Node core tests, Python validator parity tests, and GitHub Actions CI
- Reproducible single-file offline build

## Repository layout

```text
.agents/skills/mcq-pack-generator/
  SKILL.md
  resources/mcq-pack-schema.json
  scripts/validate_pack.py
  examples/sample-mcq-pack.json

.github/workflows/
  ci.yml

docs/
  PROJECT_STATUS.md
  ARCHITECTURE.md
  ROADMAP.md

schema/
  mcq-pack.v2.schema.json

src/
  core/exam-engine.js       # deterministic validation, timers, scoring, analytics
  app.js                    # browser workflow and persistence
  index.html                # development shell
  styles.css

scripts/
  build.mjs                 # creates the self-contained offline viewer

tests/
  core.test.mjs
  validator_test.py

mcq-exam-website/
  index.html                # generated single-file distribution
  sample-mcq-pack.json
```

## Run verification

Requires Node 20+ and Python 3.

```bash
npm run verify
python3 -m unittest tests/validator_test.py
```

Validate a pack directly:

```bash
python3 .agents/skills/mcq-pack-generator/scripts/validate_pack.py path/to/pack.json
```

## Build the offline viewer

```bash
npm run build
```

This combines the modular source files and sample pack into:

```text
mcq-exam-website/index.html
```

The generated file has no runtime dependencies and can be opened offline.

GitHub Actions runs the verification suite, validates the sample pack, rebuilds the distribution, and can publish the generated viewer after successful branch pushes.

## Pack v2 overview

```json
{
  "schemaVersion": "2.0",
  "exam": {
    "title": "Fixed Income Mock",
    "subject": "Fixed Income",
    "examType": "Mock Test",
    "totalMarks": 20
  },
  "difficulty": "mixed",
  "timing": {
    "mode": "both",
    "examDurationSeconds": 1800,
    "defaultQuestionSeconds": 90
  },
  "scoring": { "mode": "question" },
  "delivery": {
    "mode": "exam",
    "shuffleQuestions": true,
    "shuffleOptions": true,
    "seed": "mock-01"
  },
  "questions": [
    {
      "id": 1,
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answerIndex": 2,
      "marks": 2,
      "negativeMarks": 0.5,
      "topic": "Duration",
      "difficulty": "hard",
      "cognitiveLevel": "apply",
      "learningObjective": "Apply modified duration to a price-change estimate.",
      "sourceRefs": ["chapter-5:p23"],
      "tags": ["duration"],
      "confidence": 0.95
    }
  ]
}
```

Single-answer questions use `answerIndex`. Multi-select questions must use `multiSelect: true` and `answerIndices`, and must not include `answerIndex`.

`exam.totalMarks` must equal the calculated maximum score. In `question` scoring mode this is the sum of each question's `marks`; in `uniform` mode it is `questions.length × scoring.correctMarks`.

## Timer correctness

The original viewer reset a question timer whenever the candidate navigated away and returned. v2 stores remaining time per question and subtracts elapsed wall-clock time. The overall exam timer uses an absolute deadline. Revisiting a question therefore cannot restore time.

## Adaptive learning flow

```text
Reference material
      ↓
MCQ generator
      ↓
Validated v2 pack
      ↓
Exam / Study session
      ↓
Scoring + topic analytics
      ↓
Weak-topic detection
      ↓
Wrong-answer retest or adaptive-request export
      ↓
Generate a new targeted pack
```

The exported adaptive request contains weak topics, prior wrong question IDs to avoid repeating, target difficulty, requested count, subject, and source provenance.

## Local data and privacy boundary

Exam sessions, attempt history, theme preference, and the wrong-answer notebook are stored in browser `localStorage`. ExamEngine itself does not send those records to a server.

Because the current product has no account/sync backend, browser-local data does not automatically follow the user to another device or browser profile.

## Generator skill

Open this repository in Antigravity and invoke `mcq-pack-generator`. The skill asks for the desired question count, source material, and sample exam questions before generation. It performs a QA pass for source grounding, difficulty match, topic coverage, distractor quality, duplicate concepts, answer-position balance, metadata quality, marks consistency, and schema validity before saving the pack.

## Next development priority

The highest-priority next milestone is **browser reliability hardening**: Playwright E2E coverage, reload/resume timing tests, accessibility checks, storage-recovery behavior, and large-pack performance tests.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the prioritized roadmap.
