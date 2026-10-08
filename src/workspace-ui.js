import { deepClone, validatePack, buildAdaptiveRequest, scoreExam, buildAnalytics } from "./core/exam-engine.js";
import { identifyPack, collectQuestions, buildMock, scheduleReview, workspaceEvents } from "./core/workspace.js";
import { encodeBackup, decodeBackup, backupPreview, validateSource } from "./core/backup.js";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import { confirmAction } from "./core/confirm.js";
import { DEFAULT_PREFERENCES, normalizePreferences } from "./core/preferences.js";
import { track } from "./core/usage-analytics.js";
const FONTS = { system: "system-ui, sans-serif", source: '"Source Sans 3", sans-serif', lexend: "Lexend, sans-serif", atkinson: '"Atkinson Hyperlegible", sans-serif', lora: "Lora, serif" };
const $ = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID();
const MiB = 1024 * 1024;
const bytes64 = (bytes) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(out);
};
const from64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const hash = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
function createWorkspaceUI(api) {
  const { state, getWorkspace: ws, setWorkspace, save, notify, startRecord, startPrepared, snapshotSession, download, esc, showHome } = api;
  let section = "home", draft = null, editIndex = 0, pendingBackup = null, pdfDocument = null, pdfRender = null, sourceUrl = null, pdfPage = 1, pdfZoom = 1, sourceGeneration = 0, pdfPageGeneration = 0;
  const select = (label, id, choices, value = "") => `<label>${esc(label)}<select id="${id}">${choices.map((c) => {
    const [v, t] = Array.isArray(c) ? c : [c, c];
    return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`;
  }).join("")}</select></label>`;
  const input = (label, id, value = "", type = "text", attrs = "") => `<label>${esc(label)}<input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const area = (label, id, value = "") => `<label>${esc(label)}<textarea id="${id}" rows="3">${esc(value)}</textarea></label>`;
  const fonts = [["system", "System"], ["source", "Source Sans 3"], ["lexend", "Lexend"], ["atkinson", "Atkinson Hyperlegible"]];
  const assertIdle = () => {
    if (state.session && !state.session.submittedAt && !$("exam-view").hidden) throw Error("Submit your current exam before changing workspace data.");
  };
  const guarded = (fn) => async (...args) => {
    const button = args[0]?.target?.closest?.("button") || args[0]?.submitter;
    if (button?.getAttribute("aria-busy") === "true") return;
    button?.setAttribute("aria-busy", "true");
    try {
      await fn(...args);
    } catch (e) {
      notify(e.message, true);
    } finally {
      button?.removeAttribute("aria-busy");
    }
  };
  const activeRecords = () => ws().packs.filter((p) => !p.archived);
  const latestRecords = () => activeRecords().filter((p) => !activeRecords().some((other) => other.packId === p.packId && other.revision > p.revision));
  const questions = () => collectQuestions({ ...ws(), packs: latestRecords() });
  const due = () => ws().review.filter((r) => r.dueAt <= Date.now() && questions().some((q) => q.questionUid === r.questionUid));
  const formNumber = (id, fallback = 0) => Number($(id)?.value ?? fallback);
  function wire() {
    const landing = document.querySelector(".landing");
    const home = document.createElement("div");
    home.id = "home-panel";
    [...landing.children].filter((n) => n.tagName === "SECTION" || n.tagName === "DETAILS").forEach((n) => home.append(n));
    landing.querySelector(".brand").after(home);
    const nav = document.createElement("nav");
    nav.className = "workspace-nav";
    nav.setAttribute("aria-label", "Workspace");
    nav.innerHTML = ["home", "library", "study", "progress", "settings"].map((v) => `<button data-nav="${v}" ${v === "home" ? 'aria-current="page"' : ""}>${v[0].toUpperCase() + v.slice(1)}</button>`).join("");
    home.before(nav);
    home.insertAdjacentHTML("afterbegin", `<section class="study-today"><div><h2>Keep your learning moving.</h2><p id="today-summary" class="muted"></p></div><button id="study-today-btn" class="primary">Study today</button></section><section id="due-card" class="card"><h2>Due for revision</h2><p id="due-summary"></p></section><section id="weak-card" class="card"><h2>Topics to revisit</h2><p id="home-weak"></p></section>`);
    const recent = $("history-body").closest("section");
    recent.id = "recent-card";
    const notebook = $("notebook-list").closest("details");
    notebook.id = "notebook-card";
    ["library", "study", "progress", "settings"].forEach((v) => {
      const node = document.createElement("section");
      node.id = `${v}-panel`;
      node.hidden = true;
      node.className = "workspace-panel";
      home.after(node);
    });
    $("library-panel").innerHTML = `<div class="section-head"><div><h2>Your question library</h2><p class="muted">Save packs once. Make every study session your own.</p></div><div class="row wrap"><button id="library-import">Import pack</button><button id="new-pack" class="primary">Create pack</button></div></div><div class="form-grid">${input("Search questions", "library-search")}${select("Topic", "library-topic", [["", "All topics"]])}${select("Difficulty", "library-difficulty", [["", "All difficulties"], "easy", "moderate", "hard"])}</div><div id="library-list"></div><div id="question-search-results"></div><details class="card"><summary>Build a custom mock</summary><form id="mock-form"><div class="form-grid"><label>Packs<select id="mock-packs" multiple size="4"></select></label><label>Topics<select id="mock-topics" multiple size="4"></select></label>${select("Difficulty", "mock-difficulty", [["", "Any difficulty"], "easy", "moderate", "hard"])}${input("Question count", "mock-count", 20, "number", 'min="1" max="1000"')}${input("Selection seed", "mock-seed", "my-mock")}${select("Timing", "mock-timing", [["none", "Untimed study"], ["exam", "Overall exam timer"], ["question", "Per question timer"]])}${input("Overall minutes", "mock-minutes", 30, "number", 'min="1"')}${input("Seconds per question", "mock-seconds", 60, "number", 'min="1"')}${select("Scoring", "mock-scoring", [["source", "Original question marks"], ["uniform", "Uniform marks"]])}${input("Uniform correct marks", "mock-marks", 1, "number", 'min="0" step="0.25"')}${input("Uniform negative marks", "mock-negative", 0, "number", 'min="0" step="0.25"')}</div><label class="check"><input id="mock-avoid" type="checkbox" checked> Avoid questions attempted in the last seven days</label><p id="mock-available" class="muted"></p><button class="primary">Start custom mock</button></form></details><details class="card"><summary>Local source library</summary><p class="muted">Text/Markdown up to 1 MiB, images up to 5 MiB, PDFs up to 25 MiB. Total attachments: 40 MiB.</p><label>Import notes, image, or PDF<input id="source-import" type="file" accept=".txt,.md,.png,.jpg,.jpeg,.webp,.pdf"></label><div id="source-list"></div></details><details class="card"><summary>Saved drafts</summary><div id="draft-list"></div></details><section id="editor-panel" hidden></section>`;
    $("study-panel").innerHTML = `<h2>Daily revision</h2><p class="muted">Review at 1, 3, 7, 14, and 30 days. Guesses and mistakes return tomorrow.</p><div class="row wrap">${input("Session question count", "revision-count", 20, "number", 'min="1" max="100"')}<button id="revision-start" class="primary">Start due questions</button></div><div id="revision-list"></div>`;
    $("progress-panel").innerHTML = `<div class="section-head"><h2>Your progress</h2><label>Pack revision<select id="progress-pack"></select></label></div><label>Session context<select id="progress-context"></select></label><div id="progress-content"></div>`;
    $("settings-panel").innerHTML = `<h2>Make this workspace yours</h2><section class="card"><div class="section-head"><div><h3>Appearance and layout</h3><p class="muted">Reading comfort, timer position, fonts, and motion.</p></div><button id="appearance-open">Customize appearance</button></div><h3>Home card order</h3><div id="card-order"></div></section><section class="card"><h3>Data and backups</h3><p>Download a portable backup, then save it to iCloud Drive, Google Drive, or your chosen folder.</p><p id="storage-summary" class="muted"></p><form id="backup-export-form"><div class="form-grid">${input("Optional password (12+ characters)", "backup-password", "", "password", 'minlength="12" autocomplete="new-password"')}${input("Confirm password", "backup-confirm", "", "password", 'autocomplete="new-password"')}</div><p class="muted">Leave both fields empty for plain JSON. A forgotten backup password cannot be recovered.</p><button class="primary">Download backup</button></form><hr><label>Import backup file<input id="backup-input" type="file" accept=".json,application/json"></label>${input("Password for encrypted import", "import-password", "", "password", 'autocomplete="off"')}<div id="backup-preview" hidden></div><div class="row wrap"><button id="restore-undo">Undo last restore</button><button id="persistent-storage">Request persistent storage</button></div></section><section class="card"><h3>Storage management</h3><p class="muted">Browser data is local to this browser and site address. Export before clearing it or switching devices.</p><div id="cleanup-list"></div><button id="remove-attempts" class="danger-btn">Remove completed attempts</button></section>`;
    document.body.insertAdjacentHTML("beforeend", `<dialog id="appearance-dialog" aria-labelledby="appearance-heading"><form id="appearance-form"><div class="section-head"><h2 id="appearance-heading">Your reading space</h2><button type="button" data-close="appearance-dialog">Close</button></div><div class="form-grid">${select("Layout preset", "pref-layout", ["focused", "compact", "spacious"], "focused")}${select("Timer position", "pref-timer", [["left", "Header left"], ["right", "Header right"], ["bottom", "Sticky bottom"]], "right")}${select("Question palette", "pref-palette", [["left", "Left"], ["right", "Right"], ["collapsed", "Collapsible"]], "left")}${select("Theme", "pref-theme", ["system", "light", "dark"], "system")}${select("Accent", "pref-accent", ["blue", "teal", "violet"], "blue")}${select("Interface font", "pref-interfaceFont", fonts, "system")}${select("Question font", "pref-questionFont", [...fonts, ["lora", "Lora"]], "system")}${select("Question text size", "pref-textSize", [[16, "16 px"], [18, "18 px"], [20, "20 px"], [22, "22 px"]], 18)}${select("Reading width", "pref-width", [[60, "60 characters"], [70, "70 characters"], [80, "80 characters"]], 70)}${select("Line height", "pref-lineHeight", [1.4, 1.6, 1.8], 1.6)}${select("Motion", "pref-motion", [["auto", "Follow device preference"], ["reduced", "Reduced"], ["off", "Off"]], "auto")}</div><div id="appearance-preview" class="appearance-preview"><h3>A little room to think.</h3><p>Which explanation best supports your answer? Choose a reading style that keeps your attention on the question.</p><button type="button">Answer option preview</button></div><div class="row wrap"><button class="primary">Apply preferences</button><button id="reset-layout" type="button">Reset layout</button><button id="reset-appearance" type="button">Reset all appearance</button></div></form></dialog><dialog id="source-dialog" aria-labelledby="source-heading"><div class="section-head"><h2 id="source-heading">Source</h2><button data-close="source-dialog">Close</button></div><div id="source-controls" class="row wrap" hidden><button id="source-prev">Previous page</button><label>Page<input id="source-page" type="number" min="1" value="1"></label><span id="source-pages"></span><button id="source-next">Next page</button><button id="source-zoom-out">Zoom out</button><button id="source-zoom-in">Zoom in</button></div><p id="source-excerpt" class="source-excerpt" hidden></p><div id="source-content"></div></dialog><dialog id="adaptive-dialog" aria-labelledby="adaptive-heading"><form id="adaptive-form"><div class="section-head"><h2 id="adaptive-heading">Adaptive request</h2><button type="button" data-close="adaptive-dialog">Close</button></div><div class="form-grid">${input("New question count", "adaptive-count", 15, "number", 'min="1" max="100"')}${select("Difficulty", "adaptive-difficulty", ["easy", "moderate", "hard", "mixed"], "hard")}${select("Question type", "adaptive-type", [["mixed", "Mixed"], ["single", "Single select"], ["multi", "Multi select"]], "mixed")}</div>${area("Focus topics (one per line)", "adaptive-topics")}<p class="muted">Exports a request for your generation workflow. No AI service is called.</p><button class="primary">Download request</button></form></dialog>`);
    document.addEventListener("click", guarded(async (e) => {
      const nav2 = e.target.closest("[data-nav]");
      if (nav2) navigate(nav2.dataset.nav);
      const close = e.target.closest("[data-close]");
      if (close) $(close.dataset.close).close();
      const launch = e.target.closest("[data-launch]");
      if (launch) await startRecord(ws().packs.find((p) => p.id === launch.dataset.launch), launch.dataset.mode);
      const edit = e.target.closest("[data-edit]");
      if (edit) await openEditor(ws().packs.find((p) => p.id === edit.dataset.edit));
      const ex = e.target.closest("[data-pack-export]");
      if (ex) {
        const p = ws().packs.find((p2) => p2.id === ex.dataset.packExport);
        download(`${p.pack.exam.title}-pack.json`, p.pack);
      }
      const archive = e.target.closest("[data-archive]");
      if (archive) {
        assertIdle();
        ws().packs.filter((p) => p.packId === archive.dataset.archive).forEach((p) => p.archived = !p.archived);
        await save(["packs"]);
        render();
      }
      const source = e.target.closest("[data-source-id]");
      if (source) await openSource(source.dataset.sourceId, Number(source.dataset.sourcePage) || 1, source.dataset.sourceExcerpt || "");
      const restore = e.target.closest("[data-restore]");
      if (restore) await restoreBackup(restore.dataset.restore);
      const card = e.target.closest("[data-card-move]");
      if (card) await moveCard(card.dataset.cardMove, Number(card.dataset.direction));
      const bookmark = e.target.closest("[data-bookmark]");
      if (bookmark) {
        const q = state.pack?.questions.find((q2) => q2.questionUid === bookmark.dataset.bookmark);
        if (q && !ws().notebook.some((n) => n.questionUid === q.questionUid)) {
          ws().notebook.push({ id: uid(), questionUid: q.questionUid, question: q.question, topic: q.topic, examTitle: state.pack.exam.title, savedAt: Date.now() });
          await save(["notebook"]);
          notify("Question bookmarked.");
        }
      }
      const saved = e.target.closest("[data-open-attempt]");
      if (saved) openAttempt(saved.dataset.openAttempt);
      const dr = e.target.closest("[data-draft]");
      if (dr) {
        await preserveDraft();
        draft = deepClone(ws().drafts.find((d) => d.id === dr.dataset.draft));
        editIndex = 0;
        renderEditor();
      }
      const delSource = e.target.closest("[data-delete-source]");
      if (delSource) {
        assertIdle();
        const id = delSource.dataset.deleteSource;
        if (JSON.stringify({ packs: ws().packs, drafts: ws().drafts, attempts: ws().attempts, session: ws().session }).includes(`"sourceId":${JSON.stringify(id)}`)) throw Error("This source is linked to questions. Remove those links before deleting it.");
        if (!await confirmAction("Delete this local source? Export a backup first if needed.")) return;
        ws().sources = ws().sources.filter((s) => s.id !== id);
        await save(["sources"]);
        render();
      }
    }));
    document.addEventListener("change", guarded(async (e) => {
      if (e.target.matches("[data-mistake],[data-unclear]")) {
        const event = ws().attempts.find((a) => a.id === state.session?.id)?.events?.find((r) => r.questionUid === (e.target.dataset.mistake || e.target.dataset.unclear));
        if (!event) return;
        if (e.target.dataset.mistake) event.mistakeReason = e.target.value;
        else event.stillUnclear = e.target.checked;
        ws().review = scheduleReview([], workspaceEvents(ws()));
        await save(["attempts", "review"]);
      }
    }));
    document.querySelectorAll("[data-theme-toggle]").forEach((b) => b.textContent = "Toggle theme");
    $("library-import").onclick = () => {
      navigate("home");
      $("drop-zone").focus();
    };
    $("new-pack").onclick = guarded(() => openEditor());
    ["library-search", "library-topic", "library-difficulty"].forEach((id) => $(id).oninput = renderLibrary);
    $("mock-form").onsubmit = guarded(async (e) => {
      e.preventDefault();
      assertIdle();
      const pack = buildMock(ws(), mockOptions());
      await startPrepared(pack, { kind: "mock" });
    });
    $("mock-form").onchange = updateMockAvailability;
    $("study-today-btn").onclick = $("revision-start").onclick = guarded(startRevision);
    $("progress-pack").onchange = () => {
      renderProgressContexts();
      renderProgress();
    };
    $("progress-context").onchange = renderProgress;
    $("source-import").onchange = guarded(async (e) => {
      if (e.target.files[0]) await importSource(e.target.files[0]);
      e.target.value = "";
    });
    $("appearance-open").onclick = openAppearance;
    $("appearance-form").oninput = () => applyPreferences(readPreferences(), true);
    $("pref-layout").onchange = () => {
      const preset = $("pref-layout").value;
      const values = preset === "compact" ? { width: 60, textSize: 16, lineHeight: 1.4 } : preset === "spacious" ? { width: 80, textSize: 20, lineHeight: 1.8 } : { width: 70, textSize: 18, lineHeight: 1.6 };
      Object.entries(values).forEach(([k, v]) => $(`pref-${k}`).value = v);
      applyPreferences(readPreferences(), true);
    };
    $("appearance-form").onsubmit = guarded(async (e) => {
      e.preventDefault();
      ws().preferences = normalizePreferences({ ...ws().preferences, ...readPreferences() });
      await save(["preferences"]);
      applyPreferences();
      $("appearance-dialog").close();
      track("appearance_applied", {preset: ws().preferences.layout});
    });
    $("appearance-dialog").addEventListener("close", () => applyPreferences());
    $("reset-layout").onclick = () => {
      for (const k of ["layout", "timer", "palette", "textSize", "width", "lineHeight"]) $(`pref-${k}`).value = DEFAULT_PREFERENCES[k];
      applyPreferences(readPreferences(), true);
    };
    $("reset-appearance").onclick = () => {
      fillPreferences(DEFAULT_PREFERENCES);
      applyPreferences(DEFAULT_PREFERENCES, true);
    };
    $("backup-export-form").onsubmit = guarded(async (e) => {
      e.preventDefault();
      const password = $("backup-password").value;
      if (password !== $("backup-confirm").value) throw Error("The backup passwords do not match.");
      snapshotSession();
      await save(["session"]);
      await saveQueueReady();
      const backup = await encodeBackup(deepClone(ws()), password);
      download(`recallforge-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, backup);
      track("backup_exported", {encrypted: Boolean(password)});
      $("backup-password").value = $("backup-confirm").value = "";
      notify("Backup downloaded. Save it to your chosen drive or folder.");
    });
    $("backup-input").onchange = guarded(async (e) => {
      pendingBackup = null;
      $("backup-preview").hidden = true;
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 100 * MiB) throw Error("Backup is larger than the 100 MiB limit.");
      const text = await file.text();
      pendingBackup = await decodeBackup(text, $("import-password").value);
      $("import-password").value = "";
      renderBackupPreview();
    });
    $("restore-undo").onclick = guarded(async () => {
      assertIdle();
      if (ws().session) throw Error("Discard the saved session before undoing a restore.");
      if (!await confirmAction("Undo the last restore and recover the previous workspace?")) return;
      setWorkspace(await api.store().undo());
      applyPreferences();
      navigate("home");
      notify("Previous workspace restored.");
    });
    $("persistent-storage").onclick = guarded(async () => {
      const retained = await navigator.storage?.persist?.();
      notify(retained ? "Persistent storage granted. Keep regular backups." : "Persistent storage was not granted. Keep regular backups.");
    });
    $("remove-attempts").onclick = guarded(async () => {
      assertIdle();
      if (!await confirmAction("Remove all completed attempts and revision history? Export a backup first.")) return;
      ws().attempts = [];
      ws().review = [];
      await save(["attempts", "review"]);
      navigate("home");
    });
    let mobile = innerWidth < 768;
    window.addEventListener("resize", () => {
      const next = innerWidth < 768;
      if (mobile === next) return;
      mobile = next;
      const palette = $("appearance-dialog").open ? readPreferences().palette : normalizePreferences(ws().preferences).palette;
      $("palette-wrap").hidden = mobile || palette === "collapsed";
      $("palette-toggle").setAttribute("aria-expanded", String(!$("palette-wrap").hidden));
    });
    $("source-dialog").addEventListener("close", () => {
      sourceGeneration++;
      pdfRender?.cancel();
      pdfDocument?.loadingTask.destroy().catch(() => {
      });
      pdfDocument = null;
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      sourceUrl = null;
      $("source-content").replaceChildren();
    });
    $("source-prev").onclick = guarded(() => renderPdfPage(pdfPage - 1));
    $("source-next").onclick = guarded(() => renderPdfPage(pdfPage + 1));
    $("source-page").onchange = guarded((e) => renderPdfPage(Number(e.target.value)));
    $("source-zoom-in").onclick = guarded(() => {
      pdfZoom = Math.min(2, pdfZoom + 0.25);
      return renderPdfPage(pdfPage);
    });
    $("source-zoom-out").onclick = guarded(() => {
      pdfZoom = Math.max(0.5, pdfZoom - 0.25);
      return renderPdfPage(pdfPage);
    });
  }
  async function saveQueueReady() {
    await save([]);
  }
  function navigate(next) {
    section = next;
    showHome();
    ["home", "library", "study", "progress", "settings"].forEach((v) => $(`${v}-panel`).hidden = v !== next);
    document.querySelectorAll("[data-nav]").forEach((b) => {
      if (b.dataset.nav === next) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    render();
  }
  function render() {
    const count = due().length;
    $("today-summary").textContent = count ? `${count} questions are ready for another look.` : "No reviews due. Start a pack to build your revision queue.";
    $("due-summary").textContent = `${count} due questions \xB7 ${ws().review.length} tracked questions`;
    $("home-weak").textContent = [...new Set(ws().attempts.slice(0, 10).flatMap((a) => a.weakTopics || []))].join(", ") || "Complete a session to find topics to revisit.";
    reorderCards();
    renderLibrary();
    renderSources();
    renderRevision();
    renderProgressOptions();
    renderProgressContexts();
    renderProgress();
    renderSettings();
    $("draft-list").innerHTML = ws().drafts.length ? ws().drafts.map((d) => `<div class="list-row"><span>${esc(d.pack?.exam?.title || "Untitled draft")}</span><button data-draft="${esc(d.id)}">Continue editing</button></div>`).join("") : '<p class="muted">Drafts are saved as you edit.</p>';
  }
  function renderLibrary() {
    const topics = [...new Set(questions().map((q) => q.topic || "Uncategorised"))].sort();
    const old = $("library-topic").value;
    $("library-topic").innerHTML = '<option value="">All topics</option>' + topics.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
    $("library-topic").value = topics.includes(old) ? old : "";
    $("library-list").innerHTML = latestRecords().length ? latestRecords().map((p) => `<article class="library-row"><div><h3>${esc(p.pack.exam.title)}</h3><p class="muted">${esc(p.pack.exam.subject)} \xB7 ${p.pack.questions.length} questions \xB7 revision ${p.revision} \xB7 ${p.pack.questions.filter((q) => q.topic).length} with topics</p></div><div class="row wrap"><button class="primary" data-launch="${esc(p.id)}" data-mode="exam">Start exam</button><button data-launch="${esc(p.id)}" data-mode="study">Study</button><button data-edit="${esc(p.id)}">Edit</button><button data-pack-export="${esc(p.id)}">Export JSON</button><button data-archive="${esc(p.packId)}">Archive</button></div></article>`).join("") : '<p class="empty-state">Your library starts with one pack. Import a JSON pack or create your own.</p>';
    const term = $("library-search").value.toLowerCase().trim(), topic = $("library-topic").value, difficulty = $("library-difficulty").value;
    const matches = questions().filter((q) => (!term || `${q.question} ${(q.tags || []).join(" ")} ${q.topic || ""}`.toLowerCase().includes(term)) && (!topic || (q.topic || "Uncategorised") === topic) && (!difficulty || q.difficulty === difficulty));
    $("question-search-results").innerHTML = term || topic || difficulty ? `<h3>${matches.length} matching questions</h3>` + matches.slice(0, 100).map((q) => `<p class="question-match">${esc(q.question)} <small>${esc(q.topic || "Uncategorised")}</small></p>`).join("") : "";
    const selected = [...$("mock-packs").selectedOptions].map((o) => o.value);
    $("mock-packs").innerHTML = latestRecords().map((p) => `<option value="${esc(p.packId)}" ${selected.length ? selected.includes(p.packId) ? "selected" : "" : "selected"}>${esc(p.pack.exam.title)}</option>`).join("");
    const selectedTopics = [...$("mock-topics").selectedOptions].map((o) => o.value);
    $("mock-topics").innerHTML = topics.map((t) => `<option value="${esc(t)}" ${selectedTopics.includes(t) ? "selected" : ""}>${esc(t)}</option>`).join("");
    updateMockAvailability();
  }
  function mockOptions() {
    const mode = $("mock-timing").value;
    return { packIds: [...$("mock-packs").selectedOptions].map((o) => o.value), topics: [...$("mock-topics").selectedOptions].map((o) => o.value), difficulties: $("mock-difficulty").value ? [$("mock-difficulty").value] : [], count: formNumber("mock-count"), seed: $("mock-seed").value, avoidRecent: $("mock-avoid").checked, timing: mode === "none" ? { mode } : mode === "exam" ? { mode, examDurationSeconds: formNumber("mock-minutes") * 60 } : { mode, defaultQuestionSeconds: formNumber("mock-seconds") }, uniformMarks: $("mock-scoring").value === "uniform" ? { correctMarks: formNumber("mock-marks"), negativeMarks: formNumber("mock-negative") } : null };
  }
  function updateMockAvailability() {
    try {
      const opt = mockOptions();
      let count = 0;
      for (const q of questions()) {
        if (opt.packIds.length && !opt.packIds.includes(q.libraryPackId)) continue;
        if (opt.topics.length && !opt.topics.includes(q.topic || "Uncategorised")) continue;
        if (opt.difficulties.length && !opt.difficulties.includes(q.difficulty)) continue;
        if (opt.avoidRecent && ws().attempts.some((a) => Number(a.date) > Date.now() - 7 * 864e5 && a.events?.some((e) => e.questionUid === q.questionUid))) continue;
        count++;
      }
      $("mock-available").textContent = `${count} questions match your selection.`;
    } catch {
    }
  }
  function renderRevision() {
    const items = due().sort((a, b) => a.dueAt - b.dueAt);
    $("revision-list").innerHTML = items.length ? items.map((r) => {
      const q = questions().find((q2) => q2.questionUid === r.questionUid);
      return `<div class="list-row"><div><strong>${esc(q.question)}</strong><p class="muted">${esc(q.topic || "Uncategorised")} \xB7 due ${new Date(r.dueAt).toLocaleDateString()} \xB7 interval stage ${r.step + 1}</p></div></div>`;
    }).join("") : '<p class="empty-state">You are caught up. Study a saved pack, then come back tomorrow.</p>';
  }
  async function startRevision() {
    assertIdle();
    const count = formNumber("revision-count", 20);
    if (!Number.isInteger(count) || count < 1 || count > 100) throw Error("Choose between 1 and 100 revision questions.");
    const chosen = due().sort((a, b) => a.dueAt - b.dueAt).slice(0, count);
    if (!chosen.length) {
      navigate("library");
      notify("No questions are due. Choose a saved pack to study.");
      return;
    }
    const list = chosen.map((r) => questions().find((q) => q.questionUid === r.questionUid));
    const first = latestRecords().find((p2) => p2.packId === list[0].libraryPackId);
    const p = deepClone(first.pack);
    p.packId = uid();
    p.questions = list.map((q, i) => {
      const out = deepClone(q);
      out.id = i + 1;
      delete out.sectionId;
      return out;
    });
    p.sections = [];
    p.scoring = { mode: "question" };
    p.exam = { ...p.exam, title: "Daily revision", totalMarks: p.questions.reduce((s, q) => s + q.marks, 0) };
    p.timing = { mode: "none" };
    p.delivery = { mode: "study", shuffleQuestions: false, shuffleOptions: false, seed: "revision" };
    await startPrepared(p, { kind: "revision" });
  }
  function renderProgressOptions() {
    const old = $("progress-pack").value;
    const groups = [...new Map(ws().attempts.filter((a) => !a.summaryOnly && a.packId).map((a) => [`${a.packId}:${a.revision}`, `${a.title} \xB7 revision ${a.revision}`])).entries()];
    $("progress-pack").innerHTML = '<option value="">All attempts (mixed context)</option>' + groups.map(([id, title]) => `<option value="${esc(id)}">${esc(title)}</option>`).join("");
    $("progress-pack").value = groups.some(([id]) => id === old) ? old : "";
  }
  function contextKey(a) {
    if (a.summaryOnly) return "summary";
    return JSON.stringify([a.packId, a.revision, a.kind, a.pack?.timing, a.pack?.scoring, a.pack?.questions.map((q) => [q.questionUid, q.marks, q.negativeMarks]).sort()]);
  }
  function renderProgressContexts() {
    const pack = $("progress-pack").value, old = $("progress-context").value;
    const attempts = ws().attempts.filter((a) => !a.summaryOnly && (!pack || `${a.packId}:${a.revision}` === pack));
    const groups = [...new Map(attempts.map((a) => [contextKey(a), `${a.title} \xB7 ${a.kind} \xB7 ${a.pack.timing.mode} timing \xB7 ${a.events.length} questions`])).entries()];
    $("progress-context").innerHTML = '<option value="">All session contexts</option>' + groups.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("");
    $("progress-context").value = groups.some(([key]) => key === old) ? old : "";
  }
  function retestComparisons(attempts) {
    const pairs = attempts.filter((a) => a.kind === "retest").flatMap((retest) => {
      const first = ws().attempts.find((a) => a.id === retest.session?.parentAttemptId);
      if (!first?.events) return [];
      const original = new Map(first.events.map((e) => [e.questionUid, e]));
      const common = retest.events.filter((e) => original.has(e.questionUid));
      if (!common.length) return [];
      const before = common.filter((e) => original.get(e.questionUid).isCorrect).length;
      const after = common.filter((e) => e.isCorrect).length;
      return [`<div class="list-row"><span>${esc(first.title)}<small> \xB7 ${common.length} matching questions</small></span><strong>${before}/${common.length} \u2192 ${after}/${common.length}</strong></div>`];
    });
    return `<h3>First attempt and retest</h3>${pairs.length ? pairs.join("") : '<p class="muted">Complete a wrong-answer retest to compare the same questions.</p>'}<p class="muted">Retests are untimed study sessions. Compare these question results as a study signal.</p>`;
  }
  function renderProgress() {
    const selected = $("progress-pack").value;
    const context = $("progress-context").value;
    const attempts = ws().attempts.filter((a) => (!selected || `${a.packId}:${a.revision}` === selected) && (!context || contextKey(a) === context));
    const detailed = attempts.filter((a) => !a.summaryOnly && a.events);
    const events = detailed.flatMap((a) => a.events);
    const answered = events.filter((e) => !e.skipped);
    const accurate = answered.length ? Math.round(answered.filter((e) => e.isCorrect).length / answered.length * 100) : 0;
    const topics = /* @__PURE__ */ new Map();
    for (const e of events) {
      const name = e.topic || "Uncategorised";
      const b = topics.get(name) || { count: 0, correct: 0 };
      b.count++;
      b.correct += Number(e.isCorrect);
      topics.set(name, b);
    }
    const trends = [...attempts].reverse().slice(-30);
    const rows = attempts.map((a) => `<tr><td>${a.summaryOnly ? esc(a.title) : `<button data-open-attempt="${esc(a.id)}">${esc(a.title)}</button>`}</td><td>${new Date(a.date).toLocaleDateString()}</td><td>${Math.round(a.percentage)}%</td><td>${esc(a.kind || "Summary only")}</td><td>${a.events?.length || "\u2014"}</td></tr>`).join("");
    $("progress-content").innerHTML = attempts.length ? `<p class="progress-summary">${attempts.length} attempts \xB7 ${answered.length} answered questions \xB7 ${accurate}% accuracy</p><p class="muted">${attempts.filter((a) => a.summaryOnly).length} legacy summaries have no detailed answers. Mixed packs are not directly comparable.</p>${context ? `<div class="trend-chart" role="img" aria-label="Scores of the most recent ${trends.length} matching attempts">${trends.map((a) => `<div><span style="height:${Math.max(2, Math.round(a.percentage))}%" title="${esc(a.title)}: ${Math.round(a.percentage)}%"></span><small>${Math.round(a.percentage)}%</small></div>`).join("")}</div>` : '<p class="muted">Choose a session context to compare score trends with the same questions, revision, mode, timing, and scoring.</p>'}<div class="progress-columns"><section><h3>Topic accuracy</h3>${[...topics].map(([t, b]) => `<div class="list-row"><span>${esc(t)} \xB7 ${b.count} questions</span><strong>${Math.round(b.correct / b.count * 100)}%</strong></div>`).join("")}</section><section><h3>Study signals</h3><p>First sessions: ${detailed.filter((a) => !["retest", "revision"].includes(a.kind)).length} \xB7 Retests: ${detailed.filter((a) => a.kind === "retest").length}</p><p>Confident mistakes: ${events.filter((e) => e.answerConfidence === "confident" && !e.isCorrect).length}</p><p>Average answer time: ${answered.length ? Math.round(answered.reduce((s, e) => s + (e.timeMs || 0), 0) / answered.length / 1e3) : 0} seconds</p>${["confident", "unsure", "guessed"].map((c) => {
      const rated = events.filter((e) => e.answerConfidence === c);
      return `<p>${c}: ${rated.length} ratings \xB7 ${rated.length ? Math.round(rated.filter((e) => e.isCorrect).length / rated.length * 100) : 0}% correct</p>`;
    }).join("")}${retestComparisons(detailed)}${["concept", "calculation", "misread", "guess"].map((r) => `<p>${r}: ${events.filter((e) => e.mistakeReason === r).length}</p>`).join("")}<p>Revision sessions: ${detailed.filter((a) => a.kind === "revision").length} \xB7 due now: ${due().length}</p></section></div><h3>Attempts</h3><div class="table-wrap"><table><thead><tr><th>Session</th><th>Date</th><th>Score</th><th>Type</th><th>Questions</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty-state">Complete your first session to see progress here.</p>';
  }
  function openAttempt(id) {
    assertIdle();
    const a = ws().attempts.find((a2) => a2.id === id);
    if (!a?.pack || !a.session) throw Error("This legacy attempt has summary data only.");
    state.pack = deepClone(a.pack);
    state.session = deepClone(a.session);
    state.score = scoreExam(state.pack, state.session);
    state.analytics = buildAnalytics(state.score);
    api.openAttempt?.();
  }
  async function preserveDraft() {
    if (draft && !$("editor-panel").hidden) { readEditor(); await saveDraft(); }
  }
  async function openEditor(record) {
    assertIdle();
    await preserveDraft();
    editIndex = 0;
    const pack = record ? deepClone(record.pack) : { schemaVersion: "2.0", exam: { title: "My question pack", subject: "", examType: "Practice", totalMarks: 1, instructions: "" }, difficulty: "mixed", timing: { mode: "none" }, scoring: { mode: "question" }, delivery: { mode: "study", shuffleQuestions: false, shuffleOptions: false, seed: "my-pack" }, questions: [newQuestion(1)] };
    draft = { id: uid(), editingId: record?.id || null, pack, updatedAt: Date.now() };
    renderEditor();
  }
  function newQuestion(id) {
    return { id, question: "", options: ["", ""], answerIndex: 0, marks: 1, negativeMarks: 0, explanation: "", topic: "" };
  }
  function renderEditor() {
    const p = draft.pack, q = p.questions[editIndex];
    const sources = [["", "No source"], ...ws().sources.map((s) => [s.id, s.name])];
    $("editor-panel").hidden = false;
    $("editor-panel").innerHTML = `<form id="editor-form" class="card"><div class="section-head"><h2>Pack editor</h2><button id="editor-close" type="button">Close editor</button></div><div class="form-grid">${input("Pack title", "edit-title", p.exam.title)}${input("Subject", "edit-subject", p.exam.subject)}${select("Exam type", "edit-type", ["Quiz", "Midterm", "Final", "Mock Test", "Practice", "Other"], p.exam.examType)}${select("Pack difficulty", "edit-difficulty", ["easy", "moderate", "hard", "mixed"], p.difficulty)}${select("Timing", "edit-timing", ["none", "exam", "question", "both"], p.timing.mode)}${input("Overall seconds", "edit-duration", p.timing.examDurationSeconds || 1800, "number", 'min="1"')}${input("Default question seconds", "edit-qtime", p.timing.defaultQuestionSeconds || 60, "number", 'min="1"')}${select("Scoring", "edit-scoring", ["question", "uniform"], p.scoring.mode)}${input("Uniform correct marks", "edit-uniform", p.scoring.correctMarks || 1, "number", 'min="0" step="0.25"')}${input("Uniform negative marks", "edit-uniform-negative", p.scoring.negativeMarks || 0, "number", 'min="0" step="0.25"')}</div>${area("Instructions", "edit-instructions", p.exam.instructions)}<div class="editor-layout"><nav aria-label="Questions in editor">${p.questions.map((q2, i) => `<button type="button" data-editor-question="${i}" ${i === editIndex ? 'aria-current="true"' : ""}>${i + 1}. ${esc(q2.question.slice(0, 50) || "Untitled question")}</button>`).join("")}<button id="edit-add" type="button">Add question</button></nav><div><h3>Question ${editIndex + 1} of ${p.questions.length}</h3>${area("Question text", "edit-question", q.question)}${area("Answer options (one per line)", "edit-options", q.options.join("\n"))}<div class="form-grid">${select("Answer type", "edit-answer-type", [["single", "Single select"], ["multi", "Multi select"]], q.answerIndices ? "multi" : "single")}${input("Correct option numbers (1-based, comma separated)", "edit-answer", q.answerIndices ? q.answerIndices.map((i) => i + 1).join(",") : q.answerIndex + 1)}${input("Correct marks", "edit-marks", q.marks, "number", 'min="0.01" step="any"')}${input("Negative marks", "edit-negative", q.negativeMarks, "number", 'min="0" step="0.25"')}${input("Topic", "edit-topic", q.topic)}${select("Question difficulty", "edit-q-difficulty", [["", "Unspecified"], "easy", "moderate", "hard"], q.difficulty || "")}${input("Tags (comma separated)", "edit-tags", (q.tags || []).join(", "))}${input("Learning objective", "edit-objective", q.learningObjective || "")}</div>${area("Explanation", "edit-explanation", q.explanation)}${area("External/text source references (one per line)", "edit-refs", (q.sourceRefs || []).join("\n"))}<h4>Local sources</h4><div id="edit-bindings">${(q.sourceBindings || []).map((b, i) => `<div class="list-row"><span>${esc(ws().sources.find((s) => s.id === b.sourceId)?.name || "Missing source")} \xB7 page ${b.page || 1} \xB7 ${esc(b.excerpt || "")}</span><button type="button" data-remove-binding="${i}">Remove link</button></div>`).join("")}</div><div class="form-grid">${select("Source file", "edit-source", sources)}${input("PDF page", "edit-source-page", 1, "number", 'min="1"')}${input("Excerpt or location", "edit-source-excerpt")}</div><button id="edit-source-add" type="button">Link source</button><div class="row wrap"><button id="edit-up" type="button" ${editIndex === 0 ? "disabled" : ""}>Move up</button><button id="edit-down" type="button" ${editIndex === p.questions.length - 1 ? "disabled" : ""}>Move down</button><button id="edit-duplicate" type="button">Duplicate</button><button id="edit-delete" type="button" ${p.questions.length === 1 ? "disabled" : ""}>Delete question</button></div></div></div><pre id="editor-errors" class="error" hidden></pre><p class="muted">Drafts save as you edit. Publishing creates a new revision.</p><div class="row wrap"><button class="primary">Validate and publish</button><button id="draft-export" type="button">Export validated JSON</button></div></form>`;
    $("editor-panel").scrollIntoView({ block: "start" });
    const editorIdentity = draft.id, questionIdentity = editIndex;
    const persist = guarded(async () => {
      if (draft?.id !== editorIdentity || editIndex !== questionIdentity || !$("editor-form") || $("editor-panel").hidden) return;
      readEditor();
      await saveDraft();
    });
    $("editor-form").onchange = persist;
    let autosave;
    $("editor-form").oninput = () => {
      clearTimeout(autosave);
      autosave = setTimeout(persist, 350);
    };
    $("editor-close").onclick = guarded(async () => {
      readEditor();
      await saveDraft();
      $("editor-panel").hidden = true;
      render();
    });
    $("editor-form").querySelectorAll("[data-editor-question]").forEach((b) => b.onclick = guarded(async () => {
      readEditor();
      await saveDraft();
      editIndex = Number(b.dataset.editorQuestion);
      renderEditor();
    }));
    const mutate = (fn) => guarded(async () => {
      readEditor();
      fn();
      p.questions.forEach((q2, i) => q2.id = i + 1);
      await saveDraft();
      renderEditor();
    });
    $("edit-add").onclick = mutate(() => {
      p.questions.push(newQuestion(p.questions.length + 1));
      editIndex = p.questions.length - 1;
    });
    $("edit-duplicate").onclick = mutate(() => {
      const copy = deepClone(p.questions[editIndex]);
      delete copy.questionUid;
      p.questions.splice(editIndex + 1, 0, copy);
      editIndex++;
    });
    $("edit-delete").onclick = mutate(() => {
      p.questions.splice(editIndex, 1);
      editIndex = Math.min(editIndex, p.questions.length - 1);
    });
    $("edit-up").onclick = mutate(() => {
      [p.questions[editIndex - 1], p.questions[editIndex]] = [p.questions[editIndex], p.questions[editIndex - 1]];
      editIndex--;
    });
    $("edit-down").onclick = mutate(() => {
      [p.questions[editIndex + 1], p.questions[editIndex]] = [p.questions[editIndex], p.questions[editIndex + 1]];
      editIndex++;
    });
    $("edit-source-add").onclick = mutate(() => {
      if (!$("edit-source").value) throw Error("Choose a local source first.");
      q.sourceBindings ||= [];
      q.sourceBindings.push({ sourceId: $("edit-source").value, page: formNumber("edit-source-page", 1), excerpt: $("edit-source-excerpt").value });
    });
    $("editor-panel").querySelectorAll("[data-remove-binding]").forEach((b) => b.onclick = mutate(() => q.sourceBindings.splice(Number(b.dataset.removeBinding), 1)));
    $("editor-form").onsubmit = guarded(async (e) => {
      e.preventDefault();
      readEditor();
      const problems = validatePack(p);
      if (problems.length) {
        $("editor-errors").hidden = false;
        $("editor-errors").textContent = problems.join("\n");
        return;
      }
      const record = await identifyPack(p, ws().packs, draft.editingId);
      if (!ws().packs.some((r) => r.id === record.id)) ws().packs.push(record);
      ws().drafts = ws().drafts.filter((d) => d.id !== draft.id);
      await save(["packs", "drafts"]);
      $("editor-panel").hidden = true;
      render();
      notify(api.store() ? "Pack published to your library." : "Pack added to temporary library. Download a backup before closing.", !api.store());
      track("pack_published", {question_count: record.pack.questions.length});
    });
    $("draft-export").onclick = guarded(() => {
      readEditor();
      const errors = validatePack(p);
      if (errors.length) throw Error(errors.join("\n"));
      download(`${p.exam.title}-pack.json`, p);
    });
  }
  function readEditor() {
    const p = draft.pack, q = p.questions[editIndex];
    p.exam = { ...p.exam, title: $("edit-title").value, subject: $("edit-subject").value, examType: $("edit-type").value, instructions: $("edit-instructions").value };
    p.difficulty = $("edit-difficulty").value;
    const mode = $("edit-timing").value;
    p.timing = { ...p.timing, mode };
    delete p.timing.examDurationSeconds;
    delete p.timing.defaultQuestionSeconds;
    if (["exam", "both"].includes(mode)) p.timing.examDurationSeconds = formNumber("edit-duration");
    if (["question", "both"].includes(mode)) p.timing.defaultQuestionSeconds = formNumber("edit-qtime");
    p.scoring = { ...p.scoring, mode: $("edit-scoring").value };
    delete p.scoring.correctMarks;
    delete p.scoring.negativeMarks;
    if (p.scoring.mode === "uniform") Object.assign(p.scoring, { correctMarks: formNumber("edit-uniform"), negativeMarks: formNumber("edit-uniform-negative") });
    Object.assign(q, { question: $("edit-question").value, options: $("edit-options").value.split("\n"), marks: formNumber("edit-marks"), negativeMarks: formNumber("edit-negative"), topic: $("edit-topic").value, explanation: $("edit-explanation").value, learningObjective: $("edit-objective").value, tags: [...new Set($("edit-tags").value.split(",").map((s) => s.trim()).filter(Boolean))], sourceRefs: [...new Set($("edit-refs").value.split("\n").map((s) => s.trim()).filter(Boolean))] });
    if ($("edit-q-difficulty").value) q.difficulty = $("edit-q-difficulty").value;
    else delete q.difficulty;
    const answers = $("edit-answer").value.split(",").map((v) => {
      const n = Number(v.trim()) - 1;
      return Number.isFinite(n) ? n : null;
    });
    if ($("edit-answer-type").value === "multi") {
      q.multiSelect = true;
      q.answerIndices = answers;
      delete q.answerIndex;
    } else {
      q.answerIndex = answers[0];
      delete q.answerIndices;
      delete q.multiSelect;
    }
    p.exam.totalMarks = p.scoring.mode === "uniform" ? p.questions.length * p.scoring.correctMarks : p.questions.reduce((s, q2) => s + q2.marks, 0);
  }
  async function saveDraft() {
    draft.updatedAt = Date.now();
    const index = ws().drafts.findIndex((d) => d.id === draft.id);
    if (index < 0) ws().drafts.push(deepClone(draft));
    else ws().drafts[index] = deepClone(draft);
    await save(["drafts"]);
  }
  async function importSource(file) {
    assertIdle();
    const ext = file.name.toLowerCase().split(".").pop();
    const types = { txt: "text/plain", md: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" };
    const type = types[ext];
    if (!type) throw Error("Choose a text, image, or PDF file.");
    const limit = type === "application/pdf" ? 25 * MiB : type.startsWith("image") ? 5 * MiB : MiB;
    if (file.size > limit) throw Error("This source exceeds the displayed file-size limit.");
    if (ws().sources.reduce((s, f) => s + f.size, 0) + file.size > 40 * MiB) throw Error("Source library would exceed 40 MiB. Remove unused attachments first.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (type === "application/pdf" && !new TextDecoder().decode(bytes.slice(0, 5)).startsWith("%PDF-")) throw Error("This file is not a PDF.");
    const digest = await hash(bytes);
    if (ws().sources.some((s) => s.hash === digest)) {
      notify("This source is already saved.");
      return;
    }
    const record = { id: uid(), name: file.name, type, size: bytes.length, data: bytes64(bytes), hash: digest };
    await validateSource(record);
    ws().sources.push(record);
    await save(["sources"]);
    renderSources();
    notify(api.store() ? "Source saved locally." : "Source added to temporary workspace. Download a backup before closing.", !api.store());
  }
  function renderSources() {
    $("source-list").innerHTML = ws().sources.length ? ws().sources.map((s) => `<div class="list-row"><span>${esc(s.name)} \xB7 ${(s.size / MiB).toFixed(2)} MiB</span><div class="row"><button data-source-id="${esc(s.id)}">Open</button><button data-delete-source="${esc(s.id)}">Delete</button></div></div>`).join("") : '<p class="muted">Add a chapter, note, or image, then link it from the question editor.</p>';
  }
  async function openSource(id, page = 1, excerpt = "") {
    const source = ws().sources.find((s) => s.id === id);
    if (!source) throw Error("This source is missing. Import a backup containing its attachments.");
    const generation = ++sourceGeneration;
    $("source-heading").textContent = source.name;
    $("source-excerpt").textContent = excerpt ? `Question reference: ${excerpt}` : "";
    $("source-excerpt").hidden = !excerpt;
    $("source-content").replaceChildren();
    $("source-controls").hidden = true;
    if (!$("source-dialog").open) $("source-dialog").showModal();
    const bytes = from64(source.data);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(new Blob([bytes], { type: source.type }));
    if (source.type.startsWith("text/")) {
      const pre = document.createElement("pre");
      pre.className = "source-text";
      pre.textContent = new TextDecoder().decode(bytes);
      $("source-content").append(pre);
    } else if (source.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = sourceUrl;
      image.alt = source.name;
      $("source-content").append(image);
    } else if (source.type === "application/pdf") {
      pdfDocument?.loadingTask.destroy().catch(() => {
      });
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const worker = new Blob([globalThis.__EXAM_PDF_WORKER__], { type: "text/javascript" });
        pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(worker);
      }
      const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, enableXfa: false }).promise;
      if (generation !== sourceGeneration) {
        doc.loadingTask.destroy().catch(() => {
        });
        return;
      }
      pdfDocument = doc;
      $("source-controls").hidden = false;
      pdfZoom = 1;
      await renderPdfPage(page);
    }
    const link = document.createElement("a");
    link.href = sourceUrl;
    link.download = source.name;
    link.textContent = "Download source file";
    $("source-content").after(link);
    $("source-dialog").addEventListener("close", () => link.remove(), { once: true });
  }
  async function renderPdfPage(page) {
    if (!pdfDocument) return;
    const generation = ++pdfPageGeneration;
    pdfPage = Math.max(1, Math.min(pdfDocument.numPages, page));
    $("source-page").value = pdfPage;
    $("source-pages").textContent = `of ${pdfDocument.numPages}`;
    $("source-prev").disabled = pdfPage === 1;
    $("source-next").disabled = pdfPage === pdfDocument.numPages;
    pdfRender?.cancel();
    const doc = pdfDocument, p = await doc.getPage(pdfPage);
    if (doc !== pdfDocument || generation !== pdfPageGeneration) return;
    const viewport = p.getViewport({ scale: pdfZoom * 1.2 });
    const wrap = document.createElement("div");
    wrap.className = "pdf-page";
    wrap.style.width = `${viewport.width}px`;
    wrap.style.height = `${viewport.height}px`;
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const textLayer = document.createElement("div");
    textLayer.className = "textLayer";
    textLayer.style.setProperty("--total-scale-factor", viewport.scale);
    textLayer.style.setProperty("--scale-round-x", "1px");
    textLayer.style.setProperty("--scale-round-y", "1px");
    wrap.append(canvas, textLayer);
    $("source-content").replaceChildren(wrap);
    pdfRender = p.render({ canvasContext: canvas.getContext("2d"), viewport });
    try {
      await pdfRender.promise;
      await new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: textLayer, viewport }).render();
    } catch (e) {
      if (e.name !== "RenderingCancelledException") throw e;
    }
  }
  function fillPreferences(p) {
    Object.keys(DEFAULT_PREFERENCES).filter((k) => k !== "cards").forEach((k) => {
      if ($(`pref-${k}`)) $(`pref-${k}`).value = p[k];
    });
  }
  function readPreferences() {
    const p = {};
    Object.keys(DEFAULT_PREFERENCES).filter((k) => k !== "cards").forEach((k) => p[k] = ["textSize", "width", "lineHeight"].includes(k) ? formNumber(`pref-${k}`) : $(`pref-${k}`).value);
    return p;
  }
  function openAppearance() {
    fillPreferences(normalizePreferences(ws().preferences));
    $("appearance-dialog").showModal();
  }
  function applyPreferences(overrides = {}, preview = false) {
    const p = normalizePreferences({ ...ws().preferences, ...overrides });
    const root = document.documentElement;
    root.dataset.theme = p.theme === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : p.theme;
    root.dataset.accent = p.accent;
    root.dataset.layout = p.layout;
    root.dataset.motion = p.motion === "auto" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : p.motion;
    root.dataset.timer = p.timer;
    root.dataset.palette = p.palette;
    root.style.setProperty("--interface-font", FONTS[p.interfaceFont] || FONTS.system);
    root.style.setProperty("--question-font", FONTS[p.questionFont] || FONTS.system);
    root.style.setProperty("--question-size", `${p.textSize}px`);
    root.style.setProperty("--reading-width", `${p.width}ch`);
    root.style.setProperty("--reading-line-height", p.lineHeight);
    const timer = $("timer-area"), header = document.querySelector(".exam-header"), toolbar = document.querySelector(".toolbar");
    if (p.timer === "bottom") toolbar.prepend(timer);
    else if (p.timer === "left") header.prepend(timer);
    else header.append(timer);
    $("palette-wrap").hidden = p.palette === "collapsed" || innerWidth < 768;
    $("palette-toggle").setAttribute("aria-expanded", String(!$("palette-wrap").hidden));
    if (preview) {
      $("appearance-preview").style.fontFamily = FONTS[p.questionFont];
      $("appearance-preview").style.fontSize = `${p.textSize}px`;
      $("appearance-preview").style.lineHeight = p.lineHeight;
    } else {
      try {
        localStorage.setItem("exam-engine:appearance", JSON.stringify(p));
      } catch {
      }
    }
  }
  function reorderCards() {
    const order = normalizePreferences(ws().preferences).cards;
    for (const id of order) {
      const el = $(`${id}-card`);
      if (el) $("home-panel").append(el);
    }
  }
  async function moveCard(id, delta) {
    const cards = normalizePreferences(ws().preferences).cards, i = cards.indexOf(id), next = i + delta;
    if (next < 0 || next >= cards.length) return;
    [cards[i], cards[next]] = [cards[next], cards[i]];
    ws().preferences.cards = cards;
    await save(["preferences"]);
    reorderCards();
    renderSettings();
  }
  function renderSettings() {
    const cards = normalizePreferences(ws().preferences).cards;
    $("card-order").innerHTML = cards.map((id, i) => `<div class="list-row" draggable="true" data-card-drag="${esc(id)}"><strong>${esc(id[0].toUpperCase() + id.slice(1))}</strong><div class="row"><button data-card-move="${esc(id)}" data-direction="-1" aria-label="Move ${esc(id)} up" ${i === 0 ? "disabled" : ""}>Move up</button><button data-card-move="${esc(id)}" data-direction="1" aria-label="Move ${esc(id)} down" ${i === cards.length - 1 ? "disabled" : ""}>Move down</button></div></div>`).join("");
    let dragged;
    $("card-order").querySelectorAll("[draggable]").forEach((n) => {
      n.ondragstart = (e) => {
        dragged = n.dataset.cardDrag;
        e.dataTransfer.setData("text/plain", dragged);
      };
      n.ondragover = (e) => e.preventDefault();
      n.ondrop = guarded(async (e) => {
        e.preventDefault();
        const source = cards.indexOf(dragged), target = cards.indexOf(n.dataset.cardDrag);
        if (source < 0 || target < 0) return;
        const order = [...cards];
        order.splice(source, 1);
        order.splice(target, 0, dragged);
        ws().preferences.cards = order;
        await save(["preferences"]);
        reorderCards();
        renderSettings();
      });
    });
    $("cleanup-list").innerHTML = ws().packs.filter((p) => p.archived).map((p) => `<div class="list-row"><span>${esc(p.pack.exam.title)} \xB7 archived</span><button data-archive="${esc(p.packId)}">Restore to library</button></div>`).join("");
    const size = ws().sources.reduce((s, f) => s + f.size, 0);
    $("storage-summary").textContent = `${api.store() ? "Saved in this browser" : "Temporary workspace: export before closing"} \xB7 ${ws().packs.length} pack revisions \xB7 ${ws().attempts.length} attempts \xB7 ${(size / MiB).toFixed(1)} MiB of sources`;
    $("restore-undo").disabled = !api.store();
    if (!globalThis.crypto?.subtle) $("backup-password").disabled = $("backup-confirm").disabled = true;
  }
  function renderBackupPreview() {
    const p = backupPreview(pendingBackup);
    $("backup-preview").hidden = false;
    $("backup-preview").innerHTML = `<h4>Backup ready to import</h4><p>Exported ${esc(new Date(p.exportedAt).toLocaleString())}</p><p>${p.packs} pack revisions \xB7 ${p.questions} questions \xB7 ${p.drafts} drafts \xB7 ${p.attempts} attempts</p><p>${p.sources} source files (${(p.sourceBytes / MiB).toFixed(1)} MiB) \xB7 ${p.review} revision records \xB7 ${p.notebook} notebook entries</p><p>${p.activeSession ? "Contains a saved session. Its original timer deadline still applies." : "No saved session."}</p><p>Appearance: ${esc(pendingBackup.data.preferences.theme || "system")} theme \xB7 ${esc(pendingBackup.data.preferences.layout || "focused")} layout</p><label class="check"><input id="restore-preferences" type="checkbox"> Restore preferences when merging</label><div class="row wrap"><button data-restore="merge" class="primary">Merge into workspace</button><button data-restore="replace" class="danger-btn">Replace workspace</button></div><p class="muted">Merge keeps your current session and preferences. Replace restores the complete backup.</p>`;
  }
  async function restoreBackup(mode) {
    assertIdle();
    if (!pendingBackup) throw Error("Choose and validate a backup first.");
    if (mode === "replace" && ws().session) throw Error("Discard or complete your saved session before replacing the workspace.");
    if (mode === "replace" && !await confirmAction("Replace all workspace data and preferences? You can undo the last restore.")) return;
    if (!api.store()) throw Error("Persistent storage is unavailable. Restore requires a browser with IndexedDB.");
    await saveQueueReady();
    const result = await api.store().restore(pendingBackup.data, { mode, preferences: $("restore-preferences").checked });
    setWorkspace(result.workspace);
    pendingBackup = null;
    $("backup-preview").hidden = true;
    $("backup-input").value = "";
    applyPreferences();
    navigate("home");
    notify(`Backup ${mode === "merge" ? "merged" : "restored"}: ${result.report.added} records added, ${result.report.skipped} duplicates skipped, ${result.report.conflicts.length} conflicts preserved.`);
    track("backup_restored", {mode});
  }
  function openAdaptive(pack, analytics) {
    $("adaptive-topics").value = analytics.weakTopics.join("\n");
    $("adaptive-dialog").showModal();
    $("adaptive-form").onsubmit = guarded((e) => {
      e.preventDefault();
      const count = formNumber("adaptive-count");
      const focusTopics = $("adaptive-topics").value.split("\n").map((t) => t.trim()).filter(Boolean);
      if (!Number.isInteger(count) || count < 1 || count > 100) throw Error("Choose between 1 and 100 questions.");
      if (!focusTopics.length) throw Error("Select at least one focus topic.");
      const req = { ...buildAdaptiveRequest(pack, analytics, count), focusTopics, targetDifficulty: $("adaptive-difficulty").value, questionType: $("adaptive-type").value, packId: pack.packId, avoidQuestionUids: pack.questions.map((q) => q.questionUid) };
      req.attemptId = state.session?.id;
      req.revision = state.session?.revision;
      req.sourceReferences = [...new Set(pack.questions.flatMap((q) => q.sourceRefs || []))];
      req.sourceDocuments = pack.questions.flatMap((q) => (q.sourceBindings || []).map((b) => ({ ...b, name: ws().sources.find((s) => s.id === b.sourceId)?.name })));
      req.instruction = `Generate ${count} new ${req.questionType} questions at ${req.targetDifficulty} difficulty focused on ${focusTopics.join(", ")}. Preserve source grounding and do not repeat stems.`;
      download(`${pack.exam.title}-adaptive-request.json`, req);
      $("adaptive-dialog").close();
    });
    return true;
  }
  return { wire, render, navigate, applyPreferences, openAppearance, openAdaptive, currentScreen: () => section };
}
export {
  createWorkspaceUI
};
