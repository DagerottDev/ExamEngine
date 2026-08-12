# MCQ Pack Generator — Antigravity skill + Exam Viewer website

Two pieces:

1. **An Antigravity skill** (`mcq-pack-generator`) that takes screenshots of a book
   chapter plus a few sample exam questions and generates a difficulty-matched MCQ
   pack as JSON. It **always asks you for the number of MCQs first**.
2. **A single-file exam website** (`mcq-exam-website/index.html`) where you upload the
   generated JSON pack and take the exam in a real paper-style window (exam header,
   countdown timer, question palette, A–D options, flagging, submit, score + review).

---

## 1. The Antigravity skill

### Where it lives (already in this repo)

```
.agents/skills/mcq-pack-generator/
├── SKILL.md                        # the skill instructions
├── resources/mcq-pack-schema.json  # JSON Schema for the pack
├── scripts/validate_pack.py        # self-contained validator (no pip needed)
└── examples/sample-mcq-pack.json   # a complete example pack
```

Because it's in this workspace's `.agents/skills/`, Antigravity picks it up
automatically when you open this folder. To make it available in **every** project,
copy the `mcq-pack-generator` folder to your global skills dir:

- macOS / Linux: `~/.gemini/config/skills/mcq-pack-generator/`
- Windows: `%USERPROFILE%\.gemini\config\skills\mcq-pack-generator\`

(Antigravity also still supports the older `.agent/skills/` path.)

### How to use it in Antigravity

Just describe the task, e.g.:

> Use mcq-pack-generator. I'll send screenshots of chapter 5 and 3 sample questions
> from last year's paper.

The skill will then, in order:

1. **Ask you how many MCQs you want** (before doing anything else).
2. Ask you for the **screenshots** of the book chapter reference + sample questions.
3. Read the screenshots and **calibrate difficulty** from the sample questions
   (easy / moderate / hard / mixed).
4. Generate exactly the number of MCQs requested, grounded in the reference, and
   write the pack to `mcq-packs/<paper-slug>-mcq-pack.json` (default) or a path you
   choose.
5. Validate the pack with `python3 scripts/validate_pack.py <pack.json>`.

### Validating a pack yourself

```bash
python3 .agents/skills/mcq-pack-generator/scripts/validate_pack.py mcq-packs/my-pack.json
```

### Pack format

```json
{
  "exam": { "title": "...", "subject": "...", "examType": "Mock Test",
            "durationMinutes": 60, "totalMarks": 20, "instructions": "..." },
  "difficulty": "moderate",
  "source": { "book": "...", "chapter": "...", "paperYear": "2025" },
  "questions": [
    { "id": 1, "question": "...", "options": ["a", "b", "c", "d"],
      "answerIndex": 2, "explanation": "...", "topic": "...", "marks": 1 }
  ]
}
```

---

## 2. The exam viewer website

`mcq-exam-website/index.html` is **one self-contained file** (CSS + JS inline, no
dependencies) — it works offline by double-clicking it, or over any static server.

### What it does

- **Upload**: drag & drop or browse for a `.json` pack. Invalid packs get a clear
  list of errors. A **Load sample pack** button demos it instantly.
- **Exam window**: exam title / subject / type badge / difficulty header,
  countdown timer (auto-submits at 0), question palette showing answered/flagged/
  current state, serif "paper" typography with a classic red margin line, A–D
  options, prev/next, and flag-for-review.
- **Submit**: warns about unanswered questions, then shows score (%, correct /
  wrong / skipped), a grade, and a full answer review with explanations.
- **Keyboard**: ← / → to navigate, `A`–`D` to answer, `F` to flag.

Try it: open `mcq-exam-website/index.html` and click **Load sample pack**.
`mcq-exam-website/sample-mcq-pack.json` is the same pack as a downloadable file
for testing the upload path.

---

## Quickstart checklist

1. Open this folder in Antigravity — the `mcq-pack-generator` skill is live.
2. Ask it to generate a pack (it will ask how many MCQs you want first).
3. Open `mcq-exam-website/index.html` in a browser and upload the generated pack.
