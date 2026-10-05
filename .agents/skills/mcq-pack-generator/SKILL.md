---
name: mcq-pack-generator
description: Generates ExamEngine v2 MCQ packs from reference material and sample exam questions, with source grounding, calibrated difficulty, validation, and QA.
license: MIT
---

# MCQ Pack Generator — ExamEngine v2

Generate high-quality, source-grounded MCQ packs for ExamEngine. The output must conform to `resources/mcq-pack-schema.json` and pass `scripts/validate_pack.py` before completion.

## Golden rule

Always obtain the exact requested MCQ count before generating questions. Also collect source material and, when available, 2–5 representative questions from the target exam so difficulty and phrasing can be calibrated.

## Workflow

### 1. Collect requirements

Get:

- exact number of MCQs
- exam title and subject when known
- exam type
- reference screenshots/PDF/pages/notes
- representative sample exam questions
- preferred timing/scoring if the user specifies them
- output path; default to `mcq-packs/<slug>-mcq-pack.json`

If the user has no sample paper, continue with `moderate` difficulty and state that difficulty was inferred rather than calibrated.

### 2. Read and map the source

Read every supplied source carefully. Create internal source references that can be attached to questions, for example:

```text
chapter-5:p12
screenshot-03
notes-duration:section-2
```

Do not invent facts that are absent from the supplied material unless the user explicitly authorizes external knowledge.

### 3. Calibrate the target paper

Evaluate the sample questions for:

- recall vs understanding vs application vs analysis
- concept density
- calculation depth
- distractor closeness
- phrasing and length
- option count
- topic distribution

Set the pack difficulty to `easy`, `moderate`, `hard`, or `mixed`. Set each question's `difficulty` and `cognitiveLevel` independently.

### 4. Plan coverage before writing questions

Create a coverage plan across topics/learning objectives so one easy concept is not overrepresented. For mixed papers, intentionally distribute question difficulty.

### 5. Generate exactly the requested count

For each question provide:

- `id`
- `question`
- `options`
- exactly one answer representation:
  - single-select: `answerIndex`
  - multi-select: `multiSelect: true` + `answerIndices`
- `marks`
- `negativeMarks`
- `explanation`
- `topic`
- `difficulty`
- `cognitiveLevel`
- `learningObjective`
- `sourceRefs`
- `tags`
- `confidence`
- optional `sectionId`
- optional `questionTimeSeconds`

Distractors must be plausible and from the same conceptual neighborhood as the correct answer. Vary correct-answer positions. Avoid `all of the above` and `none of the above` unless the source paper uses them.

### 6. Assemble ExamEngine v2 metadata

Use:

```json
{
  "schemaVersion": "2.0",
  "exam": {
    "title": "...",
    "subject": "...",
    "examType": "Mock Test",
    "totalMarks": 20,
    "instructions": "...",
    "difficultyNote": "..."
  },
  "difficulty": "mixed",
  "timing": {
    "mode": "exam",
    "examDurationSeconds": 3600
  },
  "scoring": {
    "mode": "question"
  },
  "delivery": {
    "mode": "exam",
    "shuffleQuestions": false,
    "shuffleOptions": false,
    "seed": "stable-seed"
  },
  "source": {
    "book": "...",
    "chapter": "...",
    "paperYear": "..."
  },
  "questions": []
}
```

Timing modes are `none`, `exam`, `question`, and `both`. Scoring modes are `question` and `uniform`. In question scoring mode, `exam.totalMarks` must equal the sum of question marks.

### 7. Mandatory QA pass

Before validation, audit the whole pack for:

1. **Source grounding** — every answer is supported by its `sourceRefs`.
2. **Difficulty fidelity** — difficulty matches the calibration samples.
3. **Topic coverage** — requested/source-important topics are represented proportionately.
4. **Duplicate concepts** — remove near-duplicate stems or questions testing the same fact without purpose.
5. **Distractor quality** — distractors are plausible and not trivially eliminable.
6. **Answer-position distribution** — avoid systematic answer-position bias.
7. **Multi-select integrity** — all and only correct choices are in `answerIndices`.
8. **Explanation correctness** — explanations justify the answer rather than merely repeat it.
9. **Marks consistency** — calculated maximum equals `exam.totalMarks`.
10. **Metadata quality** — topic, cognitive level, learning objective, source refs, and confidence are populated when supported.

If a source fact is ambiguous, lower confidence and avoid presenting an unsupported interpretation as certain.

### 8. Validate

Run:

```bash
python3 .agents/skills/mcq-pack-generator/scripts/validate_pack.py <pack.json>
```

Fix every validation error before finishing. Warnings about missing explanations or source refs should also be resolved unless the user explicitly requested otherwise.

### 9. Report

Tell the user:

- saved file path
- question count
- difficulty distribution
- timing/scoring mode
- important source coverage
- validation result
- any source ambiguity that remains

## Adaptive retest requests

ExamEngine can export `adaptive-retest-request` JSON after a completed exam. When the user supplies one, generate a new pack using its `focusTopics`, requested `count`, target difficulty, and source provenance. Do not repeat the prior question stems or merely paraphrase them.

## Compatibility

Generate schema v2 only. The browser can migrate old v1 packs for use, but newly generated packs must include `schemaVersion: "2.0"`.

## Reuse and licensing

This skill, its validator, schema, and author-owned examples are MIT licensed;
keep the included `LICENSE` when copying the entire skill folder. When running
outside the repository, use `python3 <skill-folder>/scripts/validate_pack.py <pack.json>`.
Run the skill in your own compatible AI agent; the ExamEngine website does not
host AI generation. AI service charges depend on the tool/provider you use.
Use only reference material you have permission to use and share; this license
does not grant rights to third-party books, papers, or uploaded sources.
