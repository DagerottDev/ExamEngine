import {
  upgradeLegacyPack, validatePack, preparePack, createSession, goToQuestion,
  remainingTime, setAnswer, toggleFlag, scoreExam, buildAnalytics,
  buildAdaptiveRequest, pauseCurrent, deepClone,
} from "./core/exam-engine.js";
import { createWorkspaceStore, emptyWorkspace, identifyPack, scheduleReview } from "./core/workspace.js";
import { confirmAction } from "./core/confirm.js";
import { createWorkspaceUI } from "./workspace-ui.js";

const $ = (id) => document.getElementById(id);

const state = { pack: null, session: null, score: null, analytics: null, timerId: null, checked: new Set() };
let workspace = emptyWorkspace();
let store, workspaceUI, saveQueue = Promise.resolve(), channel;
const tabId = globalThis.crypto?.randomUUID?.() || String(Math.random());
function notify(message, error = false) {
  const node = $("save-status"); if (!node) return;
  node.textContent = message; node.classList.toggle("error", error);
  if (!error) setTimeout(() => { if (node.textContent === message) node.textContent = ""; }, 5000);
}
function saveWorkspace(keys) {
  if (!store) { notify("Temporary session: download a backup to keep your work.", true); return Promise.resolve(); }
  const snapshot = {...workspace};
  for (const key of keys || Object.keys(workspace)) snapshot[key] = deepClone(workspace[key]);
  saveQueue = saveQueue.catch(() => {}).then(() => store.save(snapshot, keys)).then(() => { channel?.postMessage({tabId,keys}); }).catch(e => { notify(`Could not save: ${e.message}. Export a backup before leaving.`,true); throw e; });
  return saveQueue;
}
function trackTime(now = Date.now()) {
  if (!state.session || state.session.currentQuestionStartedAt == null) return;
  const id = String(state.session.currentQuestionId);
  state.session.timeSpentMs ||= {};
  state.session.timeSpentMs[id] = (state.session.timeSpentMs[id] || 0) + Math.max(0, now - state.session.currentQuestionStartedAt);
}
function snapshotSession() {
  if (!state.session || state.session.submittedAt) return;
  trackTime(); pauseCurrent(state.session, Date.now());
  state.session.checked = [...state.checked];
  workspace.session = deepClone({pack:state.pack,session:state.session});
  state.session.currentQuestionStartedAt = Date.now();
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
  workspace.preferences.theme = theme;
  workspaceUI?.applyPreferences();
  if (!workspaceUI) document.documentElement.dataset.theme = theme;
  saveWorkspace(["preferences"]).catch(() => {});
}
function saveResume() { snapshotSession(); saveWorkspace(["session"]).catch(() => {}); }
function clearResume() { workspace.session = null; }

function renderResume() {
  const saved = workspace.session;
  const card = $("resume-card");
  if (!saved?.pack || !saved?.session) { card.hidden = true; return; }
  card.hidden = false;
  $("resume-title").textContent = saved.pack.exam?.title || "Saved exam";
  $("resume-meta").textContent = `Started ${new Date(saved.session.startedAt).toLocaleString()} · Question ${saved.session.currentQuestionId}`;
}

function renderHistory() {
  const history = workspace.attempts;
  const body = $("history-body"); body.innerHTML = "";
  $("history-empty").hidden = history.length > 0;
  history.slice(0, 10).forEach((h) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${esc(h.title)}</td><td>${new Date(h.date).toLocaleDateString()}</td><td>${esc(h.earned)}/${esc(h.maxMarks)}</td><td>${Math.round(h.percentage)}%</td><td>${esc((h.weakTopics || []).join(", ") || "—")}</td>`;
    body.appendChild(tr);
  });
}

function renderNotebook() {
  const notebook = workspace.notebook;
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

async function loadPack(raw, sourceLabel = "pack", quickStart = false) {
  $("upload-error").hidden = true;
  const wasLegacy = raw?.schemaVersion !== "2.0";
  const upgraded = upgradeLegacyPack(raw);
  const problems = validatePack(upgraded);
  if (problems.length) return showErrors(problems);
  const sources = new Set(workspace.sources.map(source => source.id));
  if (upgraded.questions.some(question => question.sourceBindings?.some(binding => !sources.has(binding.sourceId)))) return showErrors(["Missing local source files. Import the full workspace backup containing them, or remove the local source links from this pack."]);
  try {
    const record = await identifyPack(upgraded, workspace.packs);
    if (!workspace.packs.some(p => p.id === record.id)) workspace.packs.push(record);
    await saveWorkspace(["packs"]);
    $("migration-note").textContent = `${wasLegacy ? "Upgraded legacy pack. " : ""}${store?"Saved":"Temporarily added"} ${sourceLabel} to your library.`;
    workspaceUI?.render();
    if (quickStart) await startRecord(record);
    else workspaceUI?.navigate("library");
  } catch (err) { showErrors([err.message], "Could not import pack"); }
}
async function startRecord(record, mode) {
  if (workspace.session && !await confirmAction("Discard the saved session and start a new one?")) return;
  const pack = applyLaunchOverrides(record.pack);
  if (mode) pack.delivery.mode = mode;
  return startPrepared(pack, {originRecordId:record.id,revision:record.revision,kind:pack.delivery.mode,replaceConfirmed:true});
}
async function startPrepared(pack, metadata = {}) {
  if (state.session && !state.session.submittedAt && !$("exam-view").hidden) return notify("Submit the current session before starting another.",true);
  if (workspace.session && !metadata.replaceConfirmed && !await confirmAction("Discard the saved session and start a new one?")) return;
  if (!metadata.originRecordId) {
    const record = await identifyPack(pack, workspace.packs);
    if (!workspace.packs.some(p=>p.id===record.id)) workspace.packs.push(record);
    await saveWorkspace(["packs"]);
    pack = record.pack; metadata = {...metadata,originRecordId:record.id,revision:record.revision};
  }
  state.pack = preparePack(pack);
  return beginNewSession(metadata);
}

async function beginNewSession(metadata = {}) {
  clearInterval(state.timerId);
  state.session = {...createSession(state.pack, Date.now()),...metadata,answerConfidence:{},timeSpentMs:{},owner:tabId};
  state.checked = new Set();
  state.score = null; state.analytics = null;
  snapshotSession();
  try { await saveWorkspace(["session"]); } catch { state.session=null; return; }
  renderExamShell();
  workspaceUI?.applyPreferences();
  state.timerId = setInterval(onTick, 250);
  show("exam-view");
}

async function resumeSession() {
  const saved = workspace.session;
  if (!saved?.pack || !saved?.session) return;
  if (saved.session.owner && saved.session.owner !== tabId && !await confirmAction("Take over this session from another tab? The timer continues.")) return;
  state.pack = deepClone(saved.pack); state.session = deepClone(saved.session);
  state.session.currentQuestionStartedAt = Date.now();
  state.session.owner = tabId;
  state.checked = new Set(saved.session.checked || []);
  clearInterval(state.timerId);
  snapshotSession();
  try { await saveWorkspace(["session"]); } catch { state.session=null; return; }
  renderExamShell();
  workspaceUI?.applyPreferences();
  state.timerId = setInterval(onTick, 250);
  show("exam-view");
  onTick();
}

function persistSession() { snapshotSession(); saveWorkspace(["session"]).catch(() => {}); }

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
  if ($("answer-confidence")) $("answer-confidence").value = state.session.answerConfidence?.[q.id] || "";
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
  state.session.answerConfidence ||= {}; delete state.session.answerConfidence[q.id];
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
  const bindings = (q.sourceBindings || []).map(b => `<button data-source-id="${esc(b.sourceId)}" data-source-page="${Number(b.page) || 1}" data-source-excerpt="${esc(b.excerpt || "")}">Open source${b.page ? ` · page ${Number(b.page)}` : ""}</button>`).join("");
  if (!q.sourceRefs?.length) return bindings ? `<div class="source-refs">${bindings}</div>` : "";
  return `<div class="source-refs">${bindings}${q.sourceRefs.map((ref) => /^https?:\/\//.test(ref) ? `<a href="${esc(ref)}" target="_blank" rel="noopener">View source</a>` : `<span>Source: ${esc(ref)}</span>`).join("")}</div>`;
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
  trackTime();
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
  state.session.timerWarnings ||= [];
  const warning = t.examMs != null && t.examMs <= 60_000 ? "One minute remaining in the exam." : t.questionMs != null && t.questionMs <= 10_000 ? `Ten seconds remaining for question ${state.session.currentQuestionId}.` : "";
  if (warning && !state.session.timerWarnings.includes(warning)) { state.session.timerWarnings.push(warning); $("timer-announcement").textContent = warning; }
}

function onTick() {
  if (!state.session || state.session.submittedAt) return;
  const now = Date.now(); const t = remainingTime(state.session, now); renderTimers();
  if (t.examMs === 0) return submitExam(true, "Exam time expired");
  if (t.questionMs === 0) {
    trackTime(now); pauseCurrent(state.session, now);
    state.session.questionRemainingMs[state.session.currentQuestionId] = 0;
    const idx = currentIndex(); const next = state.pack.questions[idx + 1];
    if (next) navigateTo(next.id); else submitExam(true, "Question time expired");
  }
}

async function submitExam(auto = false, reason = "") {
  if (!state.session || state.session.submittedAt) return;
  const sessionId = state.session.id;
  if (auto) document.querySelector?.('dialog[aria-label="Confirm action"][open]')?.close();
  if (!auto) {
    const unanswered = state.pack.questions.filter((q) => state.session.answers[String(q.id)] === undefined).length;
    if (!await confirmAction(unanswered ? `Submit with ${unanswered} unanswered question(s)?` : "Submit this exam?")) return;
  }
  if (state.session?.id !== sessionId || state.session.submittedAt) return;
  clearInterval(state.timerId);
  trackTime(); pauseCurrent(state.session, Date.now());
  state.session.submittedAt = Date.now();
  state.score = scoreExam(state.pack, state.session);
  state.analytics = buildAnalytics(state.score);
  clearResume(); saveHistory(); saveNotebook();
  saveWorkspace(["session","attempts","review","notebook"]).catch(() => {});
  renderResults(reason); show("result-view");
}

function saveHistory() {
  const date = state.session.submittedAt;
  const events = state.score.results.map(r => ({originPackId:r.q.originPackId || state.pack.packId,originRevision:r.q.originRevision || state.session.revision || 1,questionUid:r.q.questionUid || `${state.pack.packId}:${r.q.id}`,questionId:r.q.id,topic:r.q.topic || "Uncategorised",isCorrect:r.isCorrect,skipped:r.skipped,chosen:r.chosen,marks:r.marks,maxMarks:r.maxMarks,answerConfidence:state.session.answerConfidence?.[r.q.id] || "",date,attemptId:state.session.id,timeMs:state.session.timeSpentMs?.[r.q.id] || 0}));
  const record = workspace.packs.find(p => p.id === state.session.originRecordId);
  workspace.attempts.unshift({id:state.session.id,packId:state.pack.packId,revision:state.session.revision || record?.revision || 1,title:state.pack.exam.title,subject:state.pack.exam.subject,date,earned:state.score.earned,maxMarks:state.score.maxMarks,percentage:state.score.percentage,weakTopics:state.analytics.weakTopics,pack:deepClone(state.pack),session:deepClone(state.session),score:deepClone(state.score),analytics:deepClone(state.analytics),kind:state.session.kind || state.pack.delivery.mode,events});
  workspace.review = scheduleReview(workspace.review, events, date);
}
function saveNotebook() {
  const seen = new Set(workspace.notebook.map(n => n.questionUid));
  state.score.results.filter(r => !r.isCorrect).forEach(r => {
    if (!seen.has(r.q.questionUid)) { workspace.notebook.push({id:crypto.randomUUID(),questionUid:r.q.questionUid,examTitle:state.pack.exam.title,questionId:r.q.id,question:r.q.question,topic:r.q.topic,explanation:r.q.explanation,sourceRefs:r.q.sourceRefs || [],savedAt:Date.now()}); seen.add(r.q.questionUid); }
  });
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
    const controls = document.createElement("div"); controls.className = "review-controls";
    controls.innerHTML = `<label>Mistake reason<select data-mistake="${esc(r.q.questionUid)}"><option value="">Not recorded</option><option value="concept">Concept gap</option><option value="calculation">Calculation</option><option value="misread">Misread question</option><option value="guess">Guess</option></select></label><label class="check"><input type="checkbox" data-unclear="${esc(r.q.questionUid)}"> Still unclear</label><button data-bookmark="${esc(r.q.questionUid)}">Bookmark</button><span class="muted">Confidence: ${esc(state.session.answerConfidence?.[r.q.id] || "Not rated")}</span>`;
    const event=workspace.attempts.find(a=>a.id===state.session?.id)?.events?.find(e=>e.questionUid===r.q.questionUid);
    controls.querySelector("select").value=event?.mistakeReason || "";
    controls.querySelector("input").checked=!!event?.stillUnclear;
    d.appendChild(controls); root.appendChild(d);
  });
}

function retestWrong() {
  const wrongIds = new Set(state.score.results.filter((r) => !r.isCorrect).map((r) => r.q.id));
  if (!wrongIds.size) return notify("There are no wrong or skipped questions to retest.");
  const p = deepClone(state.pack); p.questions = p.questions.filter((q) => wrongIds.has(q.id));
  p.exam = { ...p.exam, title: `${p.exam.title} — Wrong Answer Retest`, totalMarks: p.scoring.mode === "uniform" ? p.questions.length * p.scoring.correctMarks : p.questions.reduce((s, q) => s + q.marks, 0) };
  p.delivery = { ...p.delivery, mode: "study", shuffleQuestions: true };
  p.timing = { mode: "none" };
  return startPrepared(p,{kind:"retest",parentAttemptId:state.session.id,originRecordId:state.session.originRecordId,revision:state.session.revision});
}

function exportResult() {
  download(`${slug(state.pack.exam.title)}-result.json`, { schemaVersion: "2.0", exam: state.pack.exam, session: state.session, score: { ...state.score, results: state.score.results.map((r) => ({ questionId: r.q.id, chosen: r.chosen, skipped: r.skipped, isCorrect: r.isCorrect, marks: r.marks })) }, analytics: state.analytics });
}
function exportAdaptive() { workspaceUI?.openAdaptive(state.pack,state.analytics) || download(`${slug(state.pack.exam.title)}-adaptive-request.json`, buildAdaptiveRequest(state.pack, state.analytics, 15)); }

async function loadSample() {
  const embedded = $("embedded-sample")?.textContent?.trim();
  if (embedded && embedded !== "__SAMPLE_PACK__") {
    try { return loadPack(JSON.parse(embedded), "embedded sample", true); } catch { /* fallback */ }
  }
  try {
    const res = await fetch("../mcq-exam-website/sample-mcq-pack.json"); loadPack(await res.json(), "sample pack", true);
  } catch { showErrors(["Sample could not be loaded. Upload a JSON pack instead."]); }
}

function handleFile(file) {
  if (file.size > 5 * 1024 * 1024) return showErrors(["File is larger than the 5 MB safety limit."]);
  const reader = new FileReader();
  reader.onload = () => { try { loadPack(JSON.parse(reader.result), file.name); } catch (e) { showErrors([`Invalid JSON: ${e.message}`]); } };
  reader.readAsText(file);
}

function runAction(fn) {
  return async event => {
    const button=event.currentTarget;
    if(button.getAttribute("aria-busy")==="true")return;
    button.setAttribute("aria-busy","true");
    try { await fn(); } catch(e) { notify(e.message,true); }
    finally { button.removeAttribute("aria-busy"); }
  };
}
function wire() {
  $("file-input").onchange = (e) => e.target.files[0] && handleFile(e.target.files[0]);
  $("drop-zone").onclick = () => $("file-input").click();
  $("drop-zone").ondragover = (e) => e.preventDefault();
  $("drop-zone").ondrop = (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  $("load-sample-btn").onclick = runAction(loadSample);
  $("resume-btn").onclick = runAction(resumeSession);
  $("discard-resume-btn").onclick = async () => { if (!await confirmAction("Discard the saved session?")) return; clearResume(); saveWorkspace(["session"]).catch(() => {}); renderResume(); };
  $("prev-btn").onclick = () => navigateDelta(-1); $("next-btn").onclick = () => navigateDelta(1);
  $("flag-btn").onclick = () => { toggleFlag(state.session, currentQuestion().id); persistSession(); renderQuestion(); renderPalette(); };
  $("check-btn").onclick = () => { state.checked.add(currentQuestion().id); persistSession(); renderStudyFeedback(); };
  $("submit-btn").onclick = runAction(() => submitExam(false));
  $("new-exam-btn").onclick = () => { clearInterval(state.timerId); renderResume(); renderHistory(); renderNotebook(); workspaceUI?.render(); show("landing-view"); };
  $("retest-btn").onclick = runAction(retestWrong); $("export-result-btn").onclick = exportResult; $("export-adaptive-btn").onclick = exportAdaptive;
  document.addEventListener("click", (e) => { if (e.target.closest("[data-theme-toggle]")) setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); });
  document.addEventListener("keydown", (e) => {
    if ($("exam-view").hidden || e.target.closest("input,select,textarea,[contenteditable=true]") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowLeft") navigateDelta(-1); else if (e.key === "ArrowRight") navigateDelta(1); else if (e.key.toLowerCase() === "f") $("flag-btn").click();
    else if (/^[a-hA-H]$/.test(e.key)) { const i = e.key.toUpperCase().charCodeAt(0) - 65; if (i < currentQuestion().options.length) choose(i); }
  });
  $("answer-confidence").onchange = e => { state.session.answerConfidence ||= {}; state.session.answerConfidence[currentQuestion().id] = e.target.value; persistSession(); };
  $("exam-appearance-btn").onclick = () => workspaceUI.openAppearance();
  $("palette-toggle").onclick = () => { const node = $("palette-wrap"); node.hidden = !node.hidden; $("palette-toggle").setAttribute("aria-expanded", String(!node.hidden)); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveResume(); });
  window.addEventListener("pagehide", saveResume);
  for (const query of ["(prefers-color-scheme: dark)","(prefers-reduced-motion: reduce)"]) matchMedia(query).addEventListener("change",()=>workspaceUI?.applyPreferences());
}

async function initialize() {
  try { store = await createWorkspaceStore(); workspace = await store.load(); }
  catch (e) { store?.close(); store=null; notify(`Persistent storage unavailable: ${e.message}. Use backup export before closing.`,true); }
  workspaceUI = createWorkspaceUI({state,getWorkspace:()=>workspace,setWorkspace:w=>workspace=w,save:saveWorkspace,notify,startRecord,startPrepared,snapshotSession,download,esc,store:()=>store,openAttempt:()=>{renderResults();show("result-view");},showHome:()=>{renderResume();renderHistory();renderNotebook();show("landing-view");}});
  wire(); workspaceUI.wire(); workspaceUI.applyPreferences(); workspaceUI.render();
  renderResume(); renderHistory(); renderNotebook(); show("landing-view");
  if (workspace.meta.migrationWarning) notify(workspace.meta.migrationWarning + ". Original browser data was retained.", true);
  if (globalThis.BroadcastChannel) {
    channel = new BroadcastChannel("exam-engine-workspace");
    channel.onmessage = async e => {
      if (e.data.tabId === tabId || !store) return;
      await saveQueue.catch(()=>{});
      const next = await store.load();
      if (state.session && !state.session.submittedAt && next.session?.session.owner !== tabId) { clearInterval(state.timerId); state.session = null; notify("This session moved to another tab. Resume to take over."); workspaceUI.navigate("home"); }
      workspace = next; workspaceUI.render(); renderResume(); renderHistory(); renderNotebook();
    };
  }
}
initialize().catch(e=>notify(`Could not start workspace: ${e.message}`,true));
