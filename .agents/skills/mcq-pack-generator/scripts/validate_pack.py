#!/usr/bin/env python3
"""Validate an MCQ pack JSON file against the mcq-pack schema rules.

Self-contained (stdlib only, no pip installs needed). Usage:

    python3 validate_pack.py <path-to-pack.json>

Exits 0 and prints a summary when the pack is valid; exits 1 with
a list of problems when it is not.
"""

import json
import sys
from pathlib import Path

EXAM_TYPES = {"Quiz", "Midterm", "Final", "Mock Test", "Practice", "Other"}
DIFFICULTIES = {"easy", "moderate", "hard", "mixed"}


def errs(problems, msg):
    problems.append(msg)


def validate(path):
    problems = []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as e:
        print(f"FAIL: {path} is not valid JSON: {e}")
        return False
    except OSError as e:
        print(f"FAIL: cannot read {path}: {e}")
        return False

    if not isinstance(data, dict):
        print("FAIL: top level must be a JSON object.")
        return False

    # --- exam ---
    exam = data.get("exam")
    if not isinstance(exam, dict):
        errs(problems, "Missing required object: 'exam'")
    else:
        for field in ("title", "subject", "examType", "durationMinutes", "totalMarks"):
            if field not in exam:
                errs(problems, f"'exam' is missing required field: '{field}'")
        if isinstance(exam.get("title"), str) and not exam["title"].strip():
            errs(problems, "'exam.title' must not be empty")
        if isinstance(exam.get("subject"), str) and not exam["subject"].strip():
            errs(problems, "'exam.subject' must not be empty")
        if exam.get("examType") not in EXAM_TYPES:
            errs(problems, f"'exam.examType' must be one of {sorted(EXAM_TYPES)}; got {exam.get('examType')!r}")
        if not isinstance(exam.get("durationMinutes"), int) or exam["durationMinutes"] < 1:
            errs(problems, f"'exam.durationMinutes' must be an integer >= 1; got {exam.get('durationMinutes')!r}")
        if not isinstance(exam.get("totalMarks"), int) or exam["totalMarks"] < 1:
            errs(problems, f"'exam.totalMarks' must be an integer >= 1; got {exam.get('totalMarks')!r}")

    # --- difficulty ---
    difficulty = data.get("difficulty")
    if difficulty not in DIFFICULTIES:
        errs(problems, f"'difficulty' must be one of {sorted(DIFFICULTIES)}; got {difficulty!r}")

    # --- questions ---
    questions = data.get("questions")
    if not isinstance(questions, list) or len(questions) == 0:
        errs(problems, "'questions' must be a non-empty array")
    else:
        seen_ids = set()
        for i, q in enumerate(questions):
            where = f"questions[{i}]"
            if not isinstance(q, dict):
                errs(problems, f"{where} must be an object")
                continue
            for field in ("id", "question", "options", "answerIndex"):
                if field not in q:
                    errs(problems, f"{where} is missing required field: '{field}'")

            qid = q.get("id")
            if not isinstance(qid, int):
                errs(problems, f"{where}.id must be an integer; got {qid!r}")
            elif qid in seen_ids:
                errs(problems, f"{where}.id is duplicated: {qid}")
            else:
                seen_ids.add(qid)

            if not isinstance(q.get("question"), str) or not q["question"].strip():
                errs(problems, f"{where}.question must be a non-empty string")

            opts = q.get("options")
            if not isinstance(opts, list) or len(opts) < 2:
                errs(problems, f"{where}.options must be an array with at least 2 options")
            else:
                for j, o in enumerate(opts):
                    if not isinstance(o, str) or not o.strip():
                        errs(problems, f"{where}.options[{j}] must be a non-empty string")
                if len(opts) != len(set(o.strip().lower() for o in opts if isinstance(o, str))):
                    errs(problems, f"{where}.options contains duplicates")

            ai = q.get("answerIndex")
            if not isinstance(ai, int):
                errs(problems, f"{where}.answerIndex must be an integer; got {ai!r}")
            elif isinstance(opts, list) and not (0 <= ai < len(opts)):
                errs(problems, f"{where}.answerIndex {ai} is out of range for {len(opts)} options (0-based)")

            marks = q.get("marks")
            if marks is not None and (not isinstance(marks, int) or marks < 0):
                errs(problems, f"{where}.marks must be a non-negative integer; got {marks!r}")

    if problems:
        print(f"INVALID: {path} — {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return False

    n = len(questions) if isinstance(questions, list) else 0
    print(f"VALID: {path}")
    print(f"  exam       : {exam.get('title', '?')} ({exam.get('subject', '?')})")
    print(f"  type       : {exam.get('examType', '?')}  |  duration {exam.get('durationMinutes', '?')} min  |  {exam.get('totalMarks', '?')} marks")
    print(f"  difficulty : {difficulty}")
    print(f"  questions  : {n}")
    return True


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python3 {Path(sys.argv[0]).name} <pack.json>")
        sys.exit(2)
    sys.exit(0 if validate(sys.argv[1]) else 1)
