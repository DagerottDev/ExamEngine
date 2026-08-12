---
name: mcq-pack-generator
description: Generates MCQ (multiple-choice question) JSON packs from book chapter screenshots and sample exam questions, with difficulty calibrated to match the source paper. Use when the user wants a practice question bank, quiz pack, or mock test in JSON, built from screenshots of study material and a few sample questions from the actual exam.
---

# MCQ Pack Generator

Turns screenshots of textbook/reference material plus a few sample questions from the
real exam paper into a validated, difficulty-matched multiple-choice question pack
written as JSON (ready to upload to the MCQ exam viewer website).

## When to use this skill

- The user provides screenshots (or image/PDF paths) of a book chapter or study notes.
- The user provides a few sample questions from the actual exam paper.
- The user wants an MCQ pack / practice set / mock test exported as JSON.

## Golden rule

**Always ask the user for the number of MCQs they want BEFORE doing anything else.**
Never generate without an explicit count. If the user did not state a count, ask for it
first, along with any preferences, and wait for the answer before proceeding.

## Workflow — follow these steps in order

### Step 1 — Ask before generating (mandatory)

Before reading any input, ask the user:

1. **How many MCQs do you want in the pack?** (the exact count)
2. Optional preferences: exam title, subject, topic focus, marks per question,
   whether to include explanations, exam type (Quiz / Midterm / Final / Mock Test / Practice).
3. Where the pack file should be saved (default: `<workspace>/mcq-packs/<slug>-mcq-pack.json`).

Wait for the user's answer. Do not generate anything yet.

### Step 2 — Collect the inputs

Ask the user to provide, as file paths or images:

- **Reference screenshots**: 1 or more screenshots of the book chapter / study material
  (the content the questions must be based on).
- **Sample questions**: 2–5 sample questions from the actual exam paper
  (these calibrate the difficulty).

Read every image carefully with your vision. If a screenshot is blurry, cropped, or
unreadable, do not guess — ask the user for a clearer screenshot.

### Step 3 — Calibrate difficulty from the sample paper

Study the sample questions and assess:

- **Cognitive depth**: pure recall vs application, analysis, or calculation.
- **Concept density**: how many concepts are combined in a single question.
- **Distractor style**: are wrong options close/reasonable or obviously wrong?
- **Question length & phrasing style** (e.g., "Which of the following…", "Identify…").

From this, assign a difficulty rating to the whole pack:
`easy`, `moderate`, `hard`, or `mixed` (if the paper mixes levels).

Also note the paper's exam type, subject, and topic coverage, and copy the general
tone/style of the sample questions into the generated ones.

### Step 4 — Generate the questions

Create **exactly** the number of MCQs the user requested. For every question:

- 1 stem, **4 options** (3 distractors + 1 correct), unless the source paper clearly
  uses a different option count — then mirror the paper.
- Distractors must be **plausible** and drawn from the same topic area as the stem.
- Correct answer position must be varied across the pack (don't always pick option C).
- Avoid "all of the above" / "none of the above" unless the sample paper uses them.
- Each question gets: `id` (1-based integer), `question`, `options` (array, string),
  `answerIndex` (0-based index of the correct option).
- Optionally add: `explanation`, `topic`, `marks`.
- Every generated question must be grounded in the reference screenshots.
- Match the difficulty rating from Step 3 — do not make questions harder or easier
  than the sample paper.

### Step 5 — Assemble and validate the pack

Build the pack object exactly per `resources/mcq-pack-schema.json`:

- `exam`: title, subject, examType, durationMinutes (suggest 60 unless told otherwise),
  totalMarks, optional instructions.
- `difficulty`: the rating from Step 3.
- `source`: book title, chapter, paper year if known.
- `questions`: the array from Step 4.

Then validate before finishing:

```bash
python3 scripts/validate_pack.py <path-to-pack.json>
```

Fix any errors the validator reports (wrong answerIndex, bad option count, empty
strings, duplicates, etc.). If the pack is valid, the script prints a success summary.

### Step 6 — Save and report

- Write the final JSON file to the agreed path (default `<workspace>/mcq-packs/…`).
- Tell the user:
  - the file path,
  - the number of questions,
  - the difficulty rating and what you based it on,
  - where to upload it (the MCQ exam viewer website).

## Output schema cheat sheet

```json
{
  "exam": { "title": "...", "subject": "...", "examType": "Mock Test",
            "durationMinutes": 60, "totalMarks": 10, "instructions": "..." },
  "difficulty": "moderate",
  "source": { "book": "...", "chapter": "...", "paperYear": "2025" },
  "questions": [
    { "id": 1, "question": "...", "options": ["a", "b", "c", "d"],
      "answerIndex": 2, "explanation": "...", "topic": "...", "marks": 1 }
  ]
}
```

## Troubleshooting

- **Screenshot unreadable** → ask for a clearer/cropped screenshot instead of guessing.
- **User gives no sample questions** → still ask for them; difficulty calibration
  needs them. If truly unavailable, default to `moderate` and say so.
- **User wants a different question count mid-task** → regenerate to the new count,
  re-validate, overwrite the pack file.
- **Validator complains about `answerIndex`** → remember it is 0-based; the correct
  option is `options[answerIndex]`.

## Files in this skill

- `SKILL.md` — this file.
- `resources/mcq-pack-schema.json` — JSON Schema the pack must conform to.
- `scripts/validate_pack.py` — run `python3 scripts/validate_pack.py <pack.json>` to check a pack.
- `examples/sample-mcq-pack.json` — a complete, valid example pack.
