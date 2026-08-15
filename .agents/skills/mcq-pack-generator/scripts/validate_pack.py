#!/usr/bin/env python3
"""Validate ExamEngine MCQ Pack v2 files (stdlib only)."""

import json
import math
import sys
from pathlib import Path

EXAM_TYPES = {"Quiz", "Midterm", "Final", "Mock Test", "Practice", "Other"}
DIFFICULTIES = {"easy", "moderate", "hard", "mixed"}
Q_DIFFICULTIES = {"easy", "moderate", "hard"}
COGNITIVE = {"remember", "understand", "apply", "analyze", "evaluate"}
TIMING_MODES = {"none", "exam", "question", "both"}
SCORING_MODES = {"question", "uniform"}
DELIVERY_MODES = {"exam", "study"}


def is_int(value):
    return type(value) is int


def is_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def validate_data(data):
    errors, warnings = [], []

    if not isinstance(data, dict):
        return ["Top level must be a JSON object."], warnings

    if data.get("schemaVersion") != "2.0":
        errors.append("schemaVersion must be exactly '2.0'.")

    exam = data.get("exam")
    if not isinstance(exam, dict):
        errors.append("exam must be an object.")
        exam = {}
    for field in ("title", "subject", "examType", "totalMarks"):
        if field not in exam:
            errors.append(f"exam.{field} is required.")
    for field in ("title", "subject"):
        if field in exam and not nonempty(exam[field]):
            errors.append(f"exam.{field} must be a non-empty string.")
    if exam.get("examType") not in EXAM_TYPES:
        errors.append(f"exam.examType must be one of {sorted(EXAM_TYPES)}.")
    if not is_number(exam.get("totalMarks")) or exam.get("totalMarks", 0) <= 0:
        errors.append("exam.totalMarks must be a finite number > 0.")

    if data.get("difficulty") not in DIFFICULTIES:
        errors.append(f"difficulty must be one of {sorted(DIFFICULTIES)}.")

    timing = data.get("timing")
    if not isinstance(timing, dict):
        errors.append("timing must be an object.")
        timing = {}
    timing_mode = timing.get("mode")
    if timing_mode not in TIMING_MODES:
        errors.append(f"timing.mode must be one of {sorted(TIMING_MODES)}.")
    if timing_mode in {"exam", "both"}:
        v = timing.get("examDurationSeconds")
        if not is_int(v) or v < 1:
            errors.append("timing.examDurationSeconds must be an integer >= 1.")
    if timing_mode in {"question", "both"}:
        v = timing.get("defaultQuestionSeconds")
        if not is_int(v) or v < 1:
            errors.append("timing.defaultQuestionSeconds must be an integer >= 1.")

    scoring = data.get("scoring")
    if not isinstance(scoring, dict):
        errors.append("scoring must be an object.")
        scoring = {}
    scoring_mode = scoring.get("mode")
    if scoring_mode not in SCORING_MODES:
        errors.append(f"scoring.mode must be one of {sorted(SCORING_MODES)}.")
    if scoring_mode == "uniform":
        for field in ("correctMarks", "negativeMarks"):
            v = scoring.get(field)
            if not is_number(v) or v < 0:
                errors.append(f"scoring.{field} must be a finite number >= 0.")

    delivery = data.get("delivery")
    if not isinstance(delivery, dict):
        errors.append("delivery must be an object.")
        delivery = {}
    if delivery.get("mode") not in DELIVERY_MODES:
        errors.append(f"delivery.mode must be one of {sorted(DELIVERY_MODES)}.")
    for field in ("shuffleQuestions", "shuffleOptions"):
        if type(delivery.get(field)) is not bool:
            errors.append(f"delivery.{field} must be boolean.")

    sections = data.get("sections", [])
    section_ids = set()
    if sections is not None and not isinstance(sections, list):
        errors.append("sections must be an array when provided.")
        sections = []
    for i, section in enumerate(sections or []):
        where = f"sections[{i}]"
        if not isinstance(section, dict):
            errors.append(f"{where} must be an object.")
            continue
        sid = section.get("id")
        if not nonempty(sid):
            errors.append(f"{where}.id must be a non-empty string.")
        elif sid in section_ids:
            errors.append(f"{where}.id is duplicated: {sid!r}.")
        else:
            section_ids.add(sid)
        if not nonempty(section.get("title")):
            errors.append(f"{where}.title must be a non-empty string.")
        if "durationSeconds" in section:
            v = section["durationSeconds"]
            if not is_int(v) or v < 1:
                errors.append(f"{where}.durationSeconds must be an integer >= 1.")

    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        errors.append("questions must be a non-empty array.")
        questions = []

    seen_ids = set()
    for i, q in enumerate(questions):
        where = f"questions[{i}]"
        if not isinstance(q, dict):
            errors.append(f"{where} must be an object.")
            continue

        qid = q.get("id")
        if not is_int(qid) or qid < 1:
            errors.append(f"{where}.id must be an integer >= 1 (booleans are invalid).")
        elif qid in seen_ids:
            errors.append(f"{where}.id is duplicated: {qid}.")
        else:
            seen_ids.add(qid)

        if not nonempty(q.get("question")):
            errors.append(f"{where}.question must be a non-empty string.")

        opts = q.get("options")
        if not isinstance(opts, list) or len(opts) < 2:
            errors.append(f"{where}.options must contain at least 2 strings.")
            opts = []
        else:
            normalized = []
            for j, option in enumerate(opts):
                if not nonempty(option):
                    errors.append(f"{where}.options[{j}] must be a non-empty string.")
                elif isinstance(option, str):
                    normalized.append(option.strip().casefold())
            if len(normalized) != len(set(normalized)):
                errors.append(f"{where}.options contains duplicate values (case-insensitive).")

        has_single = "answerIndex" in q
        has_multi = "answerIndices" in q
        if has_single == has_multi:
            errors.append(f"{where} must contain exactly one of answerIndex or answerIndices.")
        elif has_single:
            ai = q.get("answerIndex")
            if not is_int(ai):
                errors.append(f"{where}.answerIndex must be an integer.")
            elif opts and not 0 <= ai < len(opts):
                errors.append(f"{where}.answerIndex {ai} is outside 0..{len(opts)-1}.")
            if q.get("multiSelect") is True:
                errors.append(f"{where}.multiSelect cannot be true with answerIndex.")
        else:
            indices = q.get("answerIndices")
            if q.get("multiSelect") is not True:
                errors.append(f"{where}.multiSelect must be true when answerIndices is used.")
            if not isinstance(indices, list) or len(indices) < 2:
                errors.append(f"{where}.answerIndices must contain at least 2 indices.")
            else:
                if any(not is_int(v) for v in indices):
                    errors.append(f"{where}.answerIndices must contain integers only.")
                valid = [v for v in indices if is_int(v)]
                if len(valid) != len(set(valid)):
                    errors.append(f"{where}.answerIndices contains duplicates.")
                for v in valid:
                    if opts and not 0 <= v < len(opts):
                        errors.append(f"{where}.answerIndices contains out-of-range index {v}.")

        marks = q.get("marks")
        if not is_number(marks) or marks <= 0:
            errors.append(f"{where}.marks must be a finite number > 0.")
        neg = q.get("negativeMarks")
        if not is_number(neg) or neg < 0:
            errors.append(f"{where}.negativeMarks must be a finite number >= 0.")

        if "questionTimeSeconds" in q:
            v = q["questionTimeSeconds"]
            if not is_int(v) or v < 1:
                errors.append(f"{where}.questionTimeSeconds must be an integer >= 1.")

        if "sectionId" in q and q["sectionId"] not in section_ids:
            errors.append(f"{where}.sectionId references unknown section {q['sectionId']!r}.")

        if "difficulty" in q and q["difficulty"] not in Q_DIFFICULTIES:
            errors.append(f"{where}.difficulty must be one of {sorted(Q_DIFFICULTIES)}.")
        if "cognitiveLevel" in q and q["cognitiveLevel"] not in COGNITIVE:
            errors.append(f"{where}.cognitiveLevel must be one of {sorted(COGNITIVE)}.")
        if "confidence" in q:
            v = q["confidence"]
            if not is_number(v) or not 0 <= v <= 1:
                errors.append(f"{where}.confidence must be a finite number between 0 and 1.")
        for field in ("sourceRefs", "tags"):
            if field in q:
                value = q[field]
                if not isinstance(value, list) or any(not nonempty(x) for x in value):
                    errors.append(f"{where}.{field} must be an array of non-empty strings.")
                elif len(value) != len(set(value)):
                    errors.append(f"{where}.{field} contains duplicates.")

        if not q.get("explanation"):
            warnings.append(f"{where} has no explanation.")
        if not q.get("sourceRefs"):
            warnings.append(f"{where} has no sourceRefs; source-linked review will be limited.")

    if questions and is_number(exam.get("totalMarks")):
        if scoring_mode == "uniform" and is_number(scoring.get("correctMarks")):
            calculated = len(questions) * scoring["correctMarks"]
        else:
            calculated = sum(q.get("marks", 0) for q in questions if isinstance(q, dict) and is_number(q.get("marks")))
        if not math.isclose(float(exam["totalMarks"]), float(calculated), rel_tol=1e-9, abs_tol=1e-9):
            errors.append(f"exam.totalMarks ({exam['totalMarks']}) does not equal calculated maximum ({calculated}).")

    return errors, warnings


def validate(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"FAIL: invalid JSON: {exc}")
        return False
    except OSError as exc:
        print(f"FAIL: cannot read {path}: {exc}")
        return False

    errors, warnings = validate_data(data)
    if errors:
        print(f"INVALID: {path} — {len(errors)} error(s)")
        for item in errors:
            print(f"  - {item}")
        if warnings:
            print(f"WARNINGS: {len(warnings)}")
            for item in warnings:
                print(f"  - {item}")
        return False

    print(f"VALID: {path}")
    print(f"  schema     : {data.get('schemaVersion')}")
    print(f"  exam       : {data['exam']['title']} ({data['exam']['subject']})")
    print(f"  questions  : {len(data['questions'])}")
    print(f"  totalMarks : {data['exam']['totalMarks']}")
    print(f"  timing     : {data['timing']['mode']}")
    print(f"  scoring    : {data['scoring']['mode']}")
    if warnings:
        print(f"WARNINGS: {len(warnings)}")
        for item in warnings:
            print(f"  - {item}")
    return True


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python3 {Path(sys.argv[0]).name} <pack.json>")
        raise SystemExit(2)
    raise SystemExit(0 if validate(sys.argv[1]) else 1)
