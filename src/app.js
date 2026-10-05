import {
  upgradeLegacyPack, validatePack, preparePack, createSession, goToQuestion,
  remainingTime, setAnswer, toggleFlag, scoreExam, buildAnalytics,
  buildAdaptiveRequest, pauseCurrent, deepClone,
} from "./core/exam-engine.js";

const $ = (id) => document.getElementById(id);
const STORAGE = {
  resume: "exam-engine:v2:resume",
  history: "exam-engine:v2:history",
  notebook: "exam-engine:v2:notebook",
  theme: "exam-engine:v2:theme",
};

const state = { pack: null, session: null, score: null, analytics: null, timerId: null, checked: new Set() };

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
function show(id) {
  ["landing-view", "exam-view", "result-view"].forEach((x) => $(x).hidden = x !== id);
  window.scrollTo(0, 0);
}
function formatTime(ms) {
  if (ms == null) return "—";
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function download(name, value, type = "application/json") {
  const blob = new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function slug(text) { return String(text || "exam").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function esc(text) { return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE.theme, theme);
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => b.textContent = theme === "dark" ? "☀ Light" : "☾ Dark");
}

function saveResume() {
  if (!state.pack || !state.session || state.session.submittedAt) return;
  pauseCurrent(state.session, Date.now());
  const payload = { pack: state.pack, session: state.session };
  writeJSON(STORAGE.resume, payload);
  state.session.currentQuestionStartedAt = Date.now();
}
function clearResume() { localStorage.removeItem(STORAGE.resume); }

function renderResume() {
  const saved = readJSON(STORAGE.resume, null);
  const card = $("resume-card");
  if (!saved?.pack || !saved?.session) { card.hidden = true; return; }
  card.hidden = false;
  $("resume-title").textContent = saved.pack.exam?.title || "Saved exam";
  $("resume-meta").textContent = `Started ${new Date(saved.session.startedAt).toLocaleString()} · Question ${saved.session.currentQuestionId}`;
}

function renderHistory() {
  const history = readJSON(STORAGE.history, []);
  const body = $("history-body"); body.innerHTML = "";
  $("history-empty").hidden = history.length > 0;
  history.slice(0, 10).forEach((h) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(h.title)}</td><td>${new Date(h.date).toLocaleDateString()}</td><td>${h.earned}/${h.maxMarks}</td><td>${Math.round(h.percentage)}%</td><td>${esc((h.weakTopics || []).join(", ") || "—")}</td>`;
    body.appendChild(tr);
  });
}

function renderNotebook() {
  const notebook = readJSON(STORAGE.notebook, []);
  $("notebook-count").textContent = String(notebook.length);
  const list = $("notebook-list"); list.innerHTML = "";
  notebook.slice(-20).reverse().forEach((n) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${esc(n.topic || "Uncategorised")}</strong> — ${esc(n.question)} <small>${esc(n.examTitle)}</small>`;
    list.appendChild(li);
  });
}

function showErrors(errors, prefix = "Pack validation failed") {
  const box = $("upload-error");
  box.hidden = false;
  box.textContent = `${prefix}:\n• ${errors.join("\n• ")}`;
}

function applyLaunchOverrides(pack) {
  const out = deepClone(pack);
  const mode = $("delivery-mode").value;
  if (mode !== "pack") out.delivery.mode = mode;
  if ($("shuffle-questions").checked) out.delivery.shuffleQuestions = true;
  if ($("shuffle-options").checked) out.delivery.shuffleOptions = true;
  const seed = $("shuffle-seed").value.trim();
  if (seed) out.delivery.seed = seed;
  return out;
}

function loadPack(raw, sourceLabel = "pack") {
  $("upload-error").hidden = true;
  const wasLegacy = raw?.schemaVersion !== "2.0";
  const upgraded = upgradeLegacyPack(raw);
  const problems = validatePack(upgraded);
  if (problems.length) return showErrors(problems);
  try {
    state.pack = preparePack(applyLaunchOverrides(upgraded));
  } catch (err) { return showErrors(String(err.message).split("\n")); }
  if (wasLegacy) $("migration-note").textContent = "Legacy pack upgraded to schema v2 for this session.";
  else $("migration-note").textContent = `Loaded ${sourceLabel}.`;
  beginNewSession();
}

function beginNewSession() {
  clearInterval(state.timerId);
  state.session = createSession(state.pack, Date.now());
  state.checked = new Set();
  renderExamShell();
  persistSession();
  state.timerId = setInterval(onTick, 250);
  show("exam-view");
}

function resumeSession() {
  const saved = readJSON(STORAGE.resume, null);
  if (!saved?.pack || !saved?.session) return;
  state.pack = saved.pack;
  state.session = saved.session;
  state.session.currentQuestionStartedAt = Date.now();
  state.checked = new Set();
  renderExamShell();
  state.timerId = setInterval(onTick, 250);
  show("exam-view");
}

function persistSession() {
  if (!state.session?.submittedAt) writeJSON(STORAGE.resume, { pack: state.pack, session: state.session });
}

function currentQuestion() {
  return state.pack.questions.find((q) => q.id === state.session.currentQuestionId) || state.pack.questions[0];
}
function currentIndex() { return state.pack.questions.findIndex((q) => q.id === state.session.currentQuestionId); }

function renderExamShell() {
  $("exam-title").textContent = state.pack.exam.title;
  $("exam-meta").textContent = `${state.pack.exam.subject} · ${state.pack.exam.examType} · ${state.pack.difficulty} · ${state.pack.delivery.mode} mode`;
  $("exam-instructions").textContent = state.pack.exam.instructions || "";
  $("exam-instructions").hidden = !state.pack.exam.instructions;
  renderQuestion(); renderPalette(); renderTimers();
}

function renderQuestion() {
  const q = currentQuestion(); const idx = currentIndex();
  $("question-number").textContent = `Question ${idx + 1} of ${state.pack.questions.length}`;
  $("question-topic").textContent = [q.sectionId && sectionTitle(q.sectionId), q.topic, q.difficulty, q.cognitiveLevel].filter(Boolean).join(" · ");
  $("question-text").textContent = q.question;
  const marks = state.pack.scoring.mode === "uniform" ? state.pack.scoring.correctMarks : q.marks;
  const negativeMarks = state.pack.scoring.mode === "uniform" ? state.pack.scoring.negativeMarks : q.negativeMarks;
  $("question-marks").textContent = `${marks} mark${marks === 1 ? "" : "s"}${negativeMarks ? ` · −${negativeMarks} wrong` : ""}`;
  const list = $("options-list"); list.innerHTML = "";
  const chosen = state.session.answers[String(q.id)];
  q.options.forEach((opt, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "option";
    const selected = Array.isArray(chosen) ? chosen.includes(i) : chosen === i;
    if (selected) b.classList.add("selected");
    b.setAttribute("aria-pressed", selected ? "true" : "false");
    b.innerHTML = `<span class="badge">${String.fromCharCode(65 + i)}</span><span>${esc(opt)}</span>`;
    b.onclick = () => choose(i);
    list.appendChild(b);
  });
  $("multi-note").hidden = !Array.isArray(q.answerIndices);
  $("flag-btn").textContent = state.session.flagged.includes(q.id) ? "✓ Marked" : "⚑ Mark for review";
  $("prev-btn").disabled = idx === 0;
  $("next-btn").disabled = idx === state.pack.questions.length - 1;
  $("check-btn").hidden = state.pack.delivery.mode !== "study";
  renderStudyFeedback();
}

function sectionTitle(id) { return state.pack.sections?.find((s) => s.id === id)?.title || id; }

function choose(index) {
  const q = currentQuestion();
  const times = remainingTime(state.session, Date.now());
  if (times.questionMs === 0 || times.examMs === 0) return;
  let value;
  if (Array.isArray(q.answerIndices)) {
    const existing = Array.isArray(state.session.answers[String(q.id)]) ? [...state.session.answers[String(q.id)]] : [];
    value = existing.includes(index) ? existing.filter((x) => x !== index) : [...existing, index];
  } else value = index;
  setAnswer(state.session, q.id, value, Date.now());
  state.checked.delete(q.id);
  persistSession(); renderQuestion(); renderPalette();
}

function renderStudyFeedback() {
  const box = $("study-feedback"); const q = currentQuestion();
  if (state.pack.delivery.mode !== "study" || !state.checked.has(q.id)) { box.hidden = true; return; }
  const temp = { ...state.session, answers: { ...state.session.answers } };
  const result = scoreExam({ ...state.pack, questions: [q], exam: { ...state.pack.exam, totalMarks: q.marks } }, temp).results[0];
  box.hidden = false;
  box.className = `feedback ${result.isCorrect ? "correct" : "wrong"}`;
  box.innerHTML = `<strong>${result.isCorrect ? "Correct" : "Not correct"}</strong><p>${esc(q.explanation || "No explanation supplied.")}</p>${sourceRefsHTML(q)}`;
}

function sourceRefsHTML(q) {
  if (!q.sourceRefs?.length) return "";
  return `<div class="source-refs">${q.sourceRefs.map((ref) => /^https?:\/\//.test(ref) ? `<a href="${esc(ref)}" target="_blank" rel="noopener">View source</a>` : `<span>Source: ${esc(ref)}</span>`).join("")}</div>`;
}

function renderPalette() {
  const root = $("palette"); root.innerHTML = "";
  const groups = state.pack.sections?.length ? state.pack.sections.map((s) => ({ id: s.id, title: s.title, qs: state.pack.questions.filter((q) => q.sectionId === s.id) })) : [{ id: "all", title: "Questions", qs: state.pack.questions }];
  const unsectioned = state.pack.sections?.length ? state.pack.questions.filter((q) => !q.sectionId) : [];
  if (unsectioned.length) groups.push({ id: "other", title: "Other", qs: unsectioned });
  groups.forEach((g) => {
    const h = document.createElement("h4"); h.textContent = g.title; root.appendChild(h);
    const grid = document.createElement("div"); grid.className = "palette-grid";
    g.qs.forEach((q) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = String(state.pack.questions.indexOf(q) + 1);
      if (q.id === state.session.currentQuestionId) b.classList.add("current");
      const ans = state.session.answers[String(q.id)]; if (ans !== undefined && (!Array.isArray(ans) || ans.length)) b.classList.add("answered");
      if (state.session.flagged.includes(q.id)) b.classList.add("flagged");
      if (state.session.questionRemainingMs[q.id] === 0) b.classList.add("expired");
      b.onclick = () => navigateTo(q.id);
      grid.appendChild(b);
    });
    root.appendChild(grid);
  });
}

function navigateTo(qid) {
  if (!state.pack.questions.some((q) => q.id === qid)) return;
  goToQuestion(state.session, qid, Date.now()); persistSession(); renderQuestion(); renderPalette(); renderTimers();
}
function navigateDelta(delta) {
  const i = currentIndex(); const next = state.pack.questions[i + delta]; if (next) navigateTo(next.id);
}

function renderTimers() {
  if (!state.session) return;
  const t = remainingTime(state.session, Date.now());
  $("exam-timer").textContent = formatTime(t.examMs);
  $("question-timer").textContent = formatTime(t.questionMs);
  $("exam-timer-wrap").hidden = t.examMs == null;
  $("question-timer-wrap").hidden = t.questionMs == null;
  $("exam-timer").classList.toggle("danger", t.examMs != null && t.examMs <= 60_000);
  $("question-timer").classList.toggle("danger", t.questionMs != null && t.questionMs <= 10_000);
}

function onTick() {
  if (!state.session || state.session.submittedAt) return;
  const now = Date.now(); const t = remainingTime(state.session, now); renderTimers();
  if (t.examMs === 0) return submitExam(true, "Exam time expired");
  if (t.questionMs === 0) {
    pauseCurrent(state.session, now);
    state.session.questionRemainingMs[state.session.currentQuestionId] = 0;
    const idx = currentIndex(); const next = state.pack.questions[idx + 1];
    if (next) navigateTo(next.id); else submitExam(true, "Question time expired");
  }
}

function submitExam(auto = false, reason = "") {
  if (!auto) {
    const unanswered = state.pack.questions.filter((q) => state.session.answers[String(q.id)] === undefined).length;
    if (!confirm(unanswered ? `Submit with ${unanswered} unanswered question(s)?` : "Submit this exam?")) return;
  }
  clearInterval(state.timerId);
  pauseCurrent(state.session, Date.now());
  state.session.submittedAt = Date.now();
  state.score = scoreExam(state.pack, state.session);
  state.analytics = buildAnalytics(state.score);
  clearResume(); saveHistory(); saveNotebook(); renderResults(reason); show("result-view");
}

function saveHistory() {
  const history = readJSON(STORAGE.history, []);
  history.unshift({ id: state.session.id, title: state.pack.exam.title, subject: state.pack.exam.subject, date: state.session.submittedAt, earned: state.score.earned, maxMarks: state.score.maxMarks, percentage: state.score.percentage, weakTopics: state.analytics.weakTopics });
  writeJSON(STORAGE.history, history.slice(0, 100));
}
function saveNotebook() {
  const notebook = readJSON(STORAGE.notebook, []); const seen = new Set(notebook.map((n) => `${n.examTitle}|${n.questionId}`));
  state.score.results.filter((r) => !r.isCorrect).forEach((r) => {
    const key = `${state.pack.exam.title}|${r.q.id}`;
    if (!seen.has(key)) notebook.push({ examTitle: state.pack.exam.title, questionId: r.q.id, question: r.q.question, topic: r.q.topic, explanation: r.q.explanation, sourceRefs: r.q.sourceRefs || [], savedAt: Date.now() });
  });
  writeJSON(STORAGE.notebook, notebook.slice(-500));
}

function renderResults(reason = "") {
  $("result-title").textContent = `${state.pack.exam.title} — Result`;
  $("result-reason").textContent = reason;
  $("result-score").textContent = `${round(state.score.earned)} / ${round(state.score.maxMarks)}`;
  $("result-percent").textContent = `${Math.round(state.score.percentage)}%`;
  $("result-stats").textContent = `${state.score.correct} correct · ${state.score.wrong} wrong · ${state.score.skipped} skipped`;
  const weak = $("weak-topics"); weak.innerHTML = "";
  state.analytics.topics.forEach((t) => {
    const li = document.createElement("li"); li.innerHTML = `<span>${esc(t.topic)}</span><strong>${Math.round(t.scorePct)}%</strong>`; weak.appendChild(li);
  });
  $("adaptive-summary").textContent = state.analytics.weakTopics.length ? `Focus next on: ${state.analytics.weakTopics.join(", ")}` : "No topic scored below 70%.";
  renderReview();
}
function round(n) { return Math.round(n * 100) / 100; }

function renderReview() {
  const root = $("review-list"); root.innerHTML = "";
  state.score.results.forEach((r, i) => {
    const d = document.createElement("article"); d.className = `review ${r.skipped ? "skipped" : r.isCorrect ? "correct" : "wrong"}`;
    const chosenText = r.skipped ? "Skipped" : Array.isArray(r.chosen) ? r.chosen.map((x) => r.q.options[x]).join(", ") : r.q.options[r.chosen];
    const correctText = Array.isArray(r.q.answerIndices) ? r.q.answerIndices.map((x) => r.q.options[x]).join(", ") : r.q.options[r.q.answerIndex];
    d.innerHTML = `<header><strong>Q${i + 1}. ${esc(r.q.question)}</strong><span>${r.marks > 0 ? "+" : ""}${round(r.marks)}</span></header><p>Your answer: ${esc(chosenText)}</p>${r.isCorrect ? "" : `<p>Correct answer: ${esc(correctText)}</p>`}<p class="explanation">${esc(r.q.explanation || "No explanation supplied.")}</p>${sourceRefsHTML(r.q)}`;
    root.appendChild(d);
  });
}

function retestWrong() {
  const wrongIds = new Set(state.score.results.filter((r) => !r.isCorrect).map((r) => r.q.id));
  if (!wrongIds.size) return alert("There are no wrong or skipped questions to retest.");
  const p = deepClone(state.pack); p.questions = p.questions.filter((q) => wrongIds.has(q.id));
  p.exam = { ...p.exam, title: `${p.exam.title} — Wrong Answer Retest`, totalMarks: p.scoring.mode === "uniform" ? p.questions.length * p.scoring.correctMarks : p.questions.reduce((s, q) => s + q.marks, 0) };
  p.delivery = { ...p.delivery, mode: "study", shuffleQuestions: true };
  p.timing = { mode: "none" };
  state.pack = preparePack(p); beginNewSession();
}

function exportResult() {
  download(`${slug(state.pack.exam.title)}-result.json`, { schemaVersion: "2.0", exam: state.pack.exam, session: state.session, score: { ...state.score, results: state.score.results.map((r) => ({ questionId: r.q.id, chosen: r.chosen, skipped: r.skipped, isCorrect: r.isCorrect, marks: r.marks })) }, analytics: state.analytics });
}
function exportAdaptive() { download(`${slug(state.pack.exam.title)}-adaptive-request.json`, buildAdaptiveRequest(state.pack, state.analytics, 15)); }

async function loadSample() {
  const embedded = $("embedded-sample")?.textContent?.trim();
  if (embedded && embedded !== "__SAMPLE_PACK__") {
    try { return loadPack(JSON.parse(embedded), "embedded sample"); } catch { /* fallback */ }
  }
  try {
    const res = await fetch("../mcq-exam-website/sample-mcq-pack.json"); loadPack(await res.json(), "sample pack");
  } catch { showErrors(["Sample could not be loaded. Upload a JSON pack instead."]); }
}

function handleFile(file) {
  if (file.size > 5 * 1024 * 1024) return showErrors(["File is larger than the 5 MB safety limit."]);
  const reader = new FileReader();
  reader.onload = () => { try { loadPack(JSON.parse(reader.result), file.name); } catch (e) { showErrors([`Invalid JSON: ${e.message}`]); } };
  reader.readAsText(file);
}

function wire() {
  $("file-input").onchange = (e) => e.target.files[0] && handleFile(e.target.files[0]);
  $("drop-zone").onclick = () => $("file-input").click();
  $("drop-zone").ondragover = (e) => e.preventDefault();
  $("drop-zone").ondrop = (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  $("load-sample-btn").onclick = loadSample;
  $("resume-btn").onclick = resumeSession;
  $("discard-resume-btn").onclick = () => { clearResume(); renderResume(); };
  $("prev-btn").onclick = () => navigateDelta(-1); $("next-btn").onclick = () => navigateDelta(1);
  $("flag-btn").onclick = () => { toggleFlag(state.session, currentQuestion().id); persistSession(); renderQuestion(); renderPalette(); };
  $("check-btn").onclick = () => { state.checked.add(currentQuestion().id); renderStudyFeedback(); };
  $("submit-btn").onclick = () => submitExam(false);
  $("new-exam-btn").onclick = () => { clearInterval(state.timerId); renderResume(); renderHistory(); renderNotebook(); show("landing-view"); };
  $("retest-btn").onclick = retestWrong; $("export-result-btn").onclick = exportResult; $("export-adaptive-btn").onclick = exportAdaptive;
  document.addEventListener("click", (e) => { if (e.target.closest("[data-theme-toggle]")) setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); });
  document.addEventListener("keydown", (e) => {
    if ($("exam-view").hidden) return;
    if (e.key === "ArrowLeft") navigateDelta(-1); else if (e.key === "ArrowRight") navigateDelta(1); else if (e.key.toLowerCase() === "f") $("flag-btn").click();
    else if (/^[a-hA-H]$/.test(e.key)) { const i = e.key.toUpperCase().charCodeAt(0) - 65; if (i < currentQuestion().options.length) choose(i); }
  });
  window.addEventListener("beforeunload", saveResume);
}

setTheme(localStorage.getItem(STORAGE.theme) === "dark" ? "dark" : "light");
wire(); renderResume(); renderHistory(); renderNotebook(); show("landing-view");
