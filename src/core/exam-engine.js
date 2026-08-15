export const SCHEMA_VERSION = "2.0";

const EXAM_TYPES = new Set(["Quiz", "Midterm", "Final", "Mock Test", "Practice", "Other"]);
const DIFFICULTIES = new Set(["easy", "moderate", "hard", "mixed"]);
const Q_DIFFICULTIES = new Set(["easy", "moderate", "hard"]);
const COGNITIVE = new Set(["remember", "understand", "apply", "analyze", "evaluate"]);
const TIMING_MODES = new Set(["none", "exam", "question", "both"]);
const DELIVERY_MODES = new Set(["exam", "study"]);

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function upgradeLegacyPack(input) {
  const pack = deepClone(input);
  if (pack?.schemaVersion === SCHEMA_VERSION) return pack;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return pack;

  const questions = Array.isArray(pack.questions) ? pack.questions : [];
  questions.forEach((q) => {
    if (!isFiniteNumber(q.marks) || q.marks <= 0) q.marks = 1;
    if (!isFiniteNumber(q.negativeMarks) || q.negativeMarks < 0) q.negativeMarks = 0;
    if (Array.isArray(q.answerIndices)) q.multiSelect = true;
  });

  const calculated = questions.reduce((sum, q) => sum + (isFiniteNumber(q.marks) ? q.marks : 0), 0);
  pack.schemaVersion = SCHEMA_VERSION;
  pack.exam = pack.exam || {};
  pack.exam.totalMarks = calculated > 0 ? calculated : (pack.exam.totalMarks || questions.length || 1);
  pack.timing = {
    mode: "exam",
    examDurationSeconds: Math.max(60, Math.round((pack.exam.durationMinutes || 60) * 60)),
  };
  delete pack.exam.durationMinutes;
  pack.scoring = { mode: "question" };
  pack.delivery = {
    mode: "exam",
    shuffleQuestions: false,
    shuffleOptions: false,
    seed: String(pack.exam.title || "exam-engine"),
  };
  return pack;
}

export function validatePack(input) {
  const data = input;
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["Top level must be a JSON object."];
  if (data.schemaVersion !== SCHEMA_VERSION) problems.push("schemaVersion must be exactly '2.0'.");

  const exam = data.exam;
  if (!exam || typeof exam !== "object" || Array.isArray(exam)) problems.push("exam must be an object.");
  else {
    if (!nonEmpty(exam.title)) problems.push("exam.title must be a non-empty string.");
    if (!nonEmpty(exam.subject)) problems.push("exam.subject must be a non-empty string.");
    if (!EXAM_TYPES.has(exam.examType)) problems.push("exam.examType is invalid.");
    if (!isFiniteNumber(exam.totalMarks) || exam.totalMarks <= 0) problems.push("exam.totalMarks must be > 0.");
  }
  if (!DIFFICULTIES.has(data.difficulty)) problems.push("difficulty is invalid.");

  const timing = data.timing;
  if (!timing || typeof timing !== "object" || !TIMING_MODES.has(timing.mode)) problems.push("timing.mode is invalid.");
  else {
    if (["exam", "both"].includes(timing.mode) && (!Number.isInteger(timing.examDurationSeconds) || timing.examDurationSeconds < 1)) problems.push("timing.examDurationSeconds must be an integer >= 1.");
    if (["question", "both"].includes(timing.mode) && (!Number.isInteger(timing.defaultQuestionSeconds) || timing.defaultQuestionSeconds < 1)) problems.push("timing.defaultQuestionSeconds must be an integer >= 1.");
  }

  const scoring = data.scoring;
  if (!scoring || typeof scoring !== "object" || !["question", "uniform"].includes(scoring.mode)) problems.push("scoring.mode is invalid.");
  else if (scoring.mode === "uniform") {
    if (!isFiniteNumber(scoring.correctMarks) || scoring.correctMarks < 0) problems.push("scoring.correctMarks must be >= 0.");
    if (!isFiniteNumber(scoring.negativeMarks) || scoring.negativeMarks < 0) problems.push("scoring.negativeMarks must be >= 0.");
  }

  const delivery = data.delivery;
  if (!delivery || typeof delivery !== "object" || !DELIVERY_MODES.has(delivery.mode)) problems.push("delivery.mode is invalid.");
  else {
    if (typeof delivery.shuffleQuestions !== "boolean") problems.push("delivery.shuffleQuestions must be boolean.");
    if (typeof delivery.shuffleOptions !== "boolean") problems.push("delivery.shuffleOptions must be boolean.");
  }

  const sections = Array.isArray(data.sections) ? data.sections : [];
  const sectionIds = new Set();
  if (data.sections != null && !Array.isArray(data.sections)) problems.push("sections must be an array.");
  sections.forEach((section, i) => {
    if (!section || typeof section !== "object") return problems.push(`sections[${i}] must be an object.`);
    if (!nonEmpty(section.id)) problems.push(`sections[${i}].id must be non-empty.`);
    else if (sectionIds.has(section.id)) problems.push(`sections[${i}].id is duplicated.`);
    else sectionIds.add(section.id);
    if (!nonEmpty(section.title)) problems.push(`sections[${i}].title must be non-empty.`);
  });

  const questions = data.questions;
  if (!Array.isArray(questions) || questions.length === 0) return problems.concat("questions must be a non-empty array.");
  const ids = new Set();
  questions.forEach((q, i) => {
    const w = `questions[${i}]`;
    if (!q || typeof q !== "object" || Array.isArray(q)) return problems.push(`${w} must be an object.`);
    if (!Number.isInteger(q.id) || q.id < 1) problems.push(`${w}.id must be an integer >= 1.`);
    else if (ids.has(q.id)) problems.push(`${w}.id is duplicated.`);
    else ids.add(q.id);
    if (!nonEmpty(q.question)) problems.push(`${w}.question must be non-empty.`);
    if (!Array.isArray(q.options) || q.options.length < 2) problems.push(`${w}.options must have at least 2 values.`);
    else {
      const normalized = q.options.map((o) => typeof o === "string" ? o.trim().toLocaleLowerCase() : "");
      if (normalized.some((o) => !o)) problems.push(`${w}.options must be non-empty strings.`);
      if (new Set(normalized).size !== normalized.length) problems.push(`${w}.options contains duplicates.`);
    }
    const single = Object.prototype.hasOwnProperty.call(q, "answerIndex");
    const multi = Object.prototype.hasOwnProperty.call(q, "answerIndices");
    if (single === multi) problems.push(`${w} must contain exactly one of answerIndex or answerIndices.`);
    if (single) {
      if (!Number.isInteger(q.answerIndex) || !Array.isArray(q.options) || q.answerIndex < 0 || q.answerIndex >= q.options.length) problems.push(`${w}.answerIndex is invalid.`);
      if (q.multiSelect === true) problems.push(`${w}.multiSelect cannot be true with answerIndex.`);
    }
    if (multi) {
      if (q.multiSelect !== true) problems.push(`${w}.multiSelect must be true with answerIndices.`);
      if (!Array.isArray(q.answerIndices) || q.answerIndices.length < 2 || new Set(q.answerIndices).size !== q.answerIndices.length || q.answerIndices.some((x) => !Number.isInteger(x) || x < 0 || !Array.isArray(q.options) || x >= q.options.length)) problems.push(`${w}.answerIndices is invalid.`);
    }
    if (!isFiniteNumber(q.marks) || q.marks <= 0) problems.push(`${w}.marks must be > 0.`);
    if (!isFiniteNumber(q.negativeMarks) || q.negativeMarks < 0) problems.push(`${w}.negativeMarks must be >= 0.`);
    if (q.questionTimeSeconds != null && (!Number.isInteger(q.questionTimeSeconds) || q.questionTimeSeconds < 1)) problems.push(`${w}.questionTimeSeconds is invalid.`);
    if (q.sectionId != null && !sectionIds.has(q.sectionId)) problems.push(`${w}.sectionId references an unknown section.`);
    if (q.difficulty != null && !Q_DIFFICULTIES.has(q.difficulty)) problems.push(`${w}.difficulty is invalid.`);
    if (q.cognitiveLevel != null && !COGNITIVE.has(q.cognitiveLevel)) problems.push(`${w}.cognitiveLevel is invalid.`);
    if (q.confidence != null && (!isFiniteNumber(q.confidence) || q.confidence < 0 || q.confidence > 1)) problems.push(`${w}.confidence is invalid.`);
  });

  if (exam && isFiniteNumber(exam.totalMarks)) {
    const expected = scoring?.mode === "uniform" && isFiniteNumber(scoring.correctMarks)
      ? questions.length * scoring.correctMarks
      : questions.reduce((sum, q) => sum + (isFiniteNumber(q.marks) ? q.marks : 0), 0);
    if (Math.abs(expected - exam.totalMarks) > 1e-9) problems.push(`exam.totalMarks (${exam.totalMarks}) does not equal calculated maximum (${expected}).`);
  }
  return problems;
}

function seedToInt(seed) {
  const text = String(seed ?? "exam-engine");
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFromSeed(seed) {
  let a = seedToInt(seed);
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray(input, rng) {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function preparePack(input) {
  const pack = upgradeLegacyPack(input);
  const problems = validatePack(pack);
  if (problems.length) throw new Error(problems.join("\n"));
  const out = deepClone(pack);
  const rng = rngFromSeed(out.delivery.seed ?? out.exam.title);

  if (out.delivery.shuffleOptions) {
    out.questions = out.questions.map((q) => {
      const indices = q.options.map((_, i) => i);
      const shuffled = shuffleArray(indices, rng);
      const inverse = new Map(shuffled.map((oldIndex, newIndex) => [oldIndex, newIndex]));
      q.options = shuffled.map((i) => q.options[i]);
      if (Array.isArray(q.answerIndices)) q.answerIndices = q.answerIndices.map((i) => inverse.get(i)).sort((a, b) => a - b);
      else q.answerIndex = inverse.get(q.answerIndex);
      return q;
    });
  }
  if (out.delivery.shuffleQuestions) out.questions = shuffleArray(out.questions, rng);
  return out;
}

export function questionLimitMs(pack, question) {
  if (!["question", "both"].includes(pack.timing.mode)) return null;
  return (question.questionTimeSeconds || pack.timing.defaultQuestionSeconds) * 1000;
}

export function createSession(pack, now = Date.now()) {
  const questionRemainingMs = {};
  pack.questions.forEach((q) => {
    const limit = questionLimitMs(pack, q);
    if (limit != null) questionRemainingMs[q.id] = limit;
  });
  return {
    version: 2,
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    examTitle: pack.exam.title,
    startedAt: now,
    updatedAt: now,
    submittedAt: null,
    currentQuestionId: pack.questions[0].id,
    currentQuestionStartedAt: now,
    answers: {},
    flagged: [],
    questionRemainingMs,
    examDeadlineMs: ["exam", "both"].includes(pack.timing.mode) ? now + pack.timing.examDurationSeconds * 1000 : null,
  };
}

export function pauseCurrent(session, now = Date.now()) {
  if (session.currentQuestionStartedAt == null) return session;
  const qid = session.currentQuestionId;
  if (Object.prototype.hasOwnProperty.call(session.questionRemainingMs, qid)) {
    const elapsed = Math.max(0, now - session.currentQuestionStartedAt);
    session.questionRemainingMs[qid] = Math.max(0, session.questionRemainingMs[qid] - elapsed);
  }
  session.currentQuestionStartedAt = null;
  session.updatedAt = now;
  return session;
}

export function goToQuestion(session, questionId, now = Date.now()) {
  pauseCurrent(session, now);
  session.currentQuestionId = questionId;
  session.currentQuestionStartedAt = now;
  session.updatedAt = now;
  return session;
}

export function remainingTime(session, now = Date.now()) {
  const qid = session.currentQuestionId;
  let questionMs = Object.prototype.hasOwnProperty.call(session.questionRemainingMs, qid) ? session.questionRemainingMs[qid] : null;
  if (questionMs != null && session.currentQuestionStartedAt != null) questionMs = Math.max(0, questionMs - Math.max(0, now - session.currentQuestionStartedAt));
  const examMs = session.examDeadlineMs == null ? null : Math.max(0, session.examDeadlineMs - now);
  return { questionMs, examMs };
}

export function setAnswer(session, questionId, answer, now = Date.now()) {
  session.answers[String(questionId)] = Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : answer;
  session.updatedAt = now;
  return session;
}

export function toggleFlag(session, questionId, now = Date.now()) {
  const set = new Set(session.flagged);
  if (set.has(questionId)) set.delete(questionId); else set.add(questionId);
  session.flagged = [...set];
  session.updatedAt = now;
  return session;
}

function sameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const aa = [...a].sort((x, y) => x - y);
  const bb = [...b].sort((x, y) => x - y);
  return aa.every((v, i) => v === bb[i]);
}

export function scoreQuestion(pack, q, chosen) {
  const skipped = chosen === undefined || chosen === null || (Array.isArray(chosen) && chosen.length === 0);
  const isCorrect = !skipped && (Array.isArray(q.answerIndices) ? sameSet(chosen, q.answerIndices) : chosen === q.answerIndex);
  const positive = pack.scoring.mode === "uniform" ? pack.scoring.correctMarks : q.marks;
  const negative = pack.scoring.mode === "uniform" ? pack.scoring.negativeMarks : q.negativeMarks;
  const marks = skipped ? 0 : isCorrect ? positive : -negative;
  return { q, chosen, skipped, isCorrect, marks, maxMarks: positive };
}

export function scoreExam(pack, session) {
  const results = pack.questions.map((q) => scoreQuestion(pack, q, session.answers[String(q.id)]));
  const earned = results.reduce((sum, r) => sum + r.marks, 0);
  const maxMarks = results.reduce((sum, r) => sum + r.maxMarks, 0);
  const correct = results.filter((r) => r.isCorrect).length;
  const skipped = results.filter((r) => r.skipped).length;
  const wrong = results.length - correct - skipped;
  const percentage = maxMarks > 0 ? Math.max(0, (earned / maxMarks) * 100) : 0;
  return { earned, maxMarks, percentage, correct, wrong, skipped, results };
}

export function buildAnalytics(score) {
  const buckets = {};
  for (const r of score.results) {
    const topic = r.q.topic || "Uncategorised";
    const bucket = buckets[topic] || (buckets[topic] = { topic, attempted: 0, correct: 0, earned: 0, max: 0, questionIds: [] });
    bucket.questionIds.push(r.q.id);
    bucket.max += r.maxMarks;
    bucket.earned += r.marks;
    if (!r.skipped) bucket.attempted += 1;
    if (r.isCorrect) bucket.correct += 1;
  }
  const topics = Object.values(buckets).map((b) => ({ ...b, accuracy: b.attempted ? (b.correct / b.attempted) * 100 : 0, scorePct: b.max ? Math.max(0, b.earned / b.max * 100) : 0 })).sort((a, b) => a.scorePct - b.scorePct);
  const weakTopics = topics.filter((t) => t.scorePct < 70).map((t) => t.topic);
  const wrongQuestionIds = score.results.filter((r) => !r.isCorrect).map((r) => r.q.id);
  return { topics, weakTopics, wrongQuestionIds };
}

export function buildAdaptiveRequest(pack, analytics, count = 15) {
  return {
    type: "adaptive-retest-request",
    count,
    targetDifficulty: "hard",
    subject: pack.exam.subject,
    source: pack.source || {},
    focusTopics: analytics.weakTopics,
    avoidQuestionIds: analytics.wrongQuestionIds,
    instruction: `Generate ${count} new questions focused on the weakest topics. Do not repeat existing stems; preserve source grounding and sourceRefs.`,
  };
}
