import test from "node:test";
import assert from "node:assert/strict";
import {
  upgradeLegacyPack, validatePack, preparePack, createSession, goToQuestion,
  remainingTime, setAnswer, scoreExam, buildAnalytics, buildAdaptiveRequest,
} from "../src/core/exam-engine.js";

function pack() {
  return {
    schemaVersion: "2.0",
    exam: { title: "Test", subject: "Finance", examType: "Mock Test", totalMarks: 3 },
    difficulty: "mixed",
    timing: { mode: "both", examDurationSeconds: 120, defaultQuestionSeconds: 30 },
    scoring: { mode: "question" },
    delivery: { mode: "exam", shuffleQuestions: false, shuffleOptions: false, seed: "fixed" },
    questions: [
      { id: 1, question: "Q1", options: ["A", "B"], answerIndex: 0, marks: 1, negativeMarks: 0.25, topic: "Duration" },
      { id: 2, question: "Q2", options: ["A", "B", "C"], multiSelect: true, answerIndices: [0, 2], marks: 2, negativeMarks: 0.5, topic: "Convexity" },
    ],
  };
}

test("legacy packs are upgraded to v2 without losing weighted marks", () => {
  const legacy = { exam: { title: "Old", subject: "X", examType: "Practice", durationMinutes: 10, totalMarks: 99 }, difficulty: "easy", questions: [{ id: 1, question: "Q", options: ["A", "B"], answerIndex: 1, marks: 2 }] };
  const upgraded = upgradeLegacyPack(legacy);
  assert.equal(upgraded.schemaVersion, "2.0");
  assert.equal(upgraded.exam.totalMarks, 2);
  assert.equal(upgraded.timing.examDurationSeconds, 600);
  assert.equal(upgraded.questions[0].negativeMarks, 0);
});

test("validator rejects ambiguous answer definitions", () => {
  const p = pack();
  p.questions[0].answerIndices = [0, 1];
  const errors = validatePack(p);
  assert.ok(errors.some((x) => x.includes("exactly one")));
});

test("validator rejects boolean IDs and inconsistent total marks", () => {
  const p = pack();
  p.questions[0].id = true;
  p.exam.totalMarks = 100;
  const errors = validatePack(p);
  assert.ok(errors.some((x) => x.includes("integer >= 1")));
  assert.ok(errors.some((x) => x.includes("does not equal calculated maximum")));
});

test("per-question time cannot be reset by leaving and revisiting", () => {
  const p = pack();
  const s = createSession(p, 1_000);
  assert.equal(remainingTime(s, 11_000).questionMs, 20_000);
  goToQuestion(s, 2, 11_000);
  assert.equal(s.questionRemainingMs[1], 20_000);
  goToQuestion(s, 1, 16_000);
  assert.equal(remainingTime(s, 16_000).questionMs, 20_000);
  assert.equal(remainingTime(s, 21_000).questionMs, 15_000);
});

test("exam timer uses an absolute deadline", () => {
  const p = pack();
  const s = createSession(p, 5_000);
  assert.equal(remainingTime(s, 65_000).examMs, 60_000);
  assert.equal(remainingTime(s, 130_000).examMs, 0);
});

test("weighted scoring and negative marks use pack values", () => {
  const p = pack();
  const s = createSession(p, 0);
  setAnswer(s, 1, 1, 1);
  setAnswer(s, 2, [0, 2], 1);
  const score = scoreExam(p, s);
  assert.equal(score.earned, 1.75);
  assert.equal(score.maxMarks, 3);
  assert.equal(score.correct, 1);
  assert.equal(score.wrong, 1);
});

test("multi-select is all-or-nothing", () => {
  const p = pack();
  const s = createSession(p, 0);
  setAnswer(s, 2, [0], 1);
  assert.equal(scoreExam(p, s).results[1].isCorrect, false);
  setAnswer(s, 2, [2, 0], 2);
  assert.equal(scoreExam(p, s).results[1].isCorrect, true);
});

test("seeded shuffle is deterministic and preserves correct answers", () => {
  const p = pack();
  p.delivery.shuffleQuestions = true;
  p.delivery.shuffleOptions = true;
  const a = preparePack(p);
  const b = preparePack(p);
  assert.deepEqual(a, b);
  const q1 = a.questions.find((q) => q.id === 1);
  assert.equal(q1.options[q1.answerIndex], "A");
  const q2 = a.questions.find((q) => q.id === 2);
  assert.deepEqual(q2.answerIndices.map((i) => q2.options[i]).sort(), ["A", "C"]);
});

test("analytics identifies weak topics and creates adaptive retest request", () => {
  const p = pack();
  const s = createSession(p, 0);
  setAnswer(s, 1, 1, 1);
  setAnswer(s, 2, [0, 2], 1);
  const analytics = buildAnalytics(scoreExam(p, s));
  assert.deepEqual(analytics.weakTopics, ["Duration"]);
  const req = buildAdaptiveRequest(p, analytics, 15);
  assert.equal(req.count, 15);
  assert.deepEqual(req.focusTopics, ["Duration"]);
});
