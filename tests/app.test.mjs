import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as core from "../src/core/exam-engine.js";
import {emptyWorkspace} from "../src/core/workspace.js";

// Exercise the actual controller functions without starting a browser or its timers.
const source = (await readFile(new URL("../src/app.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "")
  .split('\nasync function initialize()')[0];
const sample = JSON.parse(await readFile(new URL("../mcq-exam-website/sample-mcq-pack.json", import.meta.url)));
function controller(extra = {}) {
  const context = vm.createContext({ ...core, emptyWorkspace, track: () => {}, usageAnalytics: {viewScreen() {}}, ...extra });
  vm.runInContext(source, context);
  return context;
}

test("source links keep quotes and markup inside escaped values", () => {
  const context = controller();
  context.question = { sourceRefs: ['https://example.com/" data-injected="yes', '<script>test</script>', "javascript:alert('test')"] };
  const html = vm.runInContext("sourceRefsHTML(question)", context);
  assert.ok(html.includes('href="https://example.com/&quot; data-injected=&quot;yes"'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes("<span>Source: javascript:alert(&#39;test&#39;)</span>"));
});

test("uniform retests contain only wrong/skipped questions and retain valid maximum marks", () => {
  const pack = structuredClone(sample);
  pack.scoring = { mode: "uniform", correctMarks: 4, negativeMarks: 1 };
  pack.exam.totalMarks = pack.questions.length * 4;
  const context = controller({ pack });
  vm.runInContext(`
    state.pack = pack;
    state.session = createSession(pack, Date.now());
    state.score = { results: pack.questions.map((q, i) => ({ q, isCorrect: i > 1 })) };
    startPrepared = p => { state.pack = preparePack(p); };
    retestWrong();
  `, context);
  const retest = JSON.parse(vm.runInContext("JSON.stringify(state.pack)", context));
  assert.equal(retest.questions.length, 2);
  assert.equal(retest.exam.totalMarks, 8);
  assert.equal(retest.delivery.mode, "study");
  assert.equal(retest.timing.mode, "none");
  assert.deepEqual(core.validatePack(retest), []);
});

test("sectioned palettes include every question exactly once, including unsectioned questions", () => {
  const nodes = [];
  const element = () => ({ children: [], classList: { add() {} }, appendChild(child) { this.children.push(child); } });
  const palette = element();
  const document = { getElementById: () => palette, createElement: (tag) => { const node = element(); if (tag === "button") nodes.push(node); return node; } };
  const pack = structuredClone(sample);
  delete pack.questions[0].sectionId;
  const context = controller({ document, pack });
  vm.runInContext("state.pack = pack; state.session = createSession(pack, 0); renderPalette();", context);
  assert.deepEqual(nodes.map((n) => n.textContent).sort(), pack.questions.map((_, i) => String(i + 1)).sort());
});

test("manual submission respects cancellation and exports accurate result/adaptive JSON", async () => {
  const downloads = [];
  let blob;
  const context = controller({
    pack: structuredClone(sample), Blob, confirmAction: async () => false, clearInterval() {}, setTimeout() {},
    URL: { createObjectURL(value) { blob = value; return "blob:test"; } },
    document: { createElement() { return { click() { downloads.push({ name: this.download, blob }); } }; } },
  });
  await vm.runInContext(`
    state.pack = pack; state.session = createSession(pack, Date.now());
    clearResume = saveHistory = saveNotebook = renderResults = show = () => {};
    saveWorkspace = () => Promise.resolve();
    submitExam(false);
  `, context);
  assert.equal(vm.runInContext("state.session.submittedAt", context), null);
  context.confirmAction = async () => true;
  await vm.runInContext("submitExam(false)", context);
  vm.runInContext("exportResult(); exportAdaptive();", context);
  const result = JSON.parse(await downloads[0].blob.text());
  const adaptive = JSON.parse(await downloads[1].blob.text());
  assert.ok(result.session.submittedAt > 0);
  assert.equal(result.score.maxMarks, 9);
  assert.equal(result.score.skipped, 9);
  assert.equal(result.score.results.length, 9);
  assert.ok(downloads[0].name.endsWith("-result.json"));
  assert.equal(adaptive.count, 15);
  assert.ok(adaptive.focusTopics.length > 0);
  // A timer may submit while a manual confirmation remains open.
  let accept;
  context.confirmAction = () => new Promise(resolve => { accept = resolve; });
  context.submissions = 0;
  vm.runInContext("state.session.submittedAt = null; saveHistory = () => submissions++;", context);
  const pending = vm.runInContext("submitExam(false)", context);
  await vm.runInContext("submitExam(true)", context);
  accept(true); await pending;
  assert.equal(context.submissions, 1);

});

test('session success events follow durable saves; failed starts, resumes and submissions emit none', async () => {
  const events=[];
  const context=controller({pack:structuredClone(sample),document:{querySelector(){return null;}},track:(event,properties)=>events.push({event,properties}),clearInterval(){},setInterval(){return 1;},confirmAction:async()=>true});
  vm.runInContext(`
    state.pack = pack;
    renderExamShell = renderResults = renderTimers = show = clearResume = saveHistory = saveNotebook = () => {};
    saveWorkspace = () => Promise.resolve();
  `,context);
  await vm.runInContext('beginNewSession({kind:"mock"})',context);
  assert.equal(events.length,1);assert.deepEqual(events[0].properties.kind,'mock');assert.equal(events[0].properties.question_count,9);
  vm.runInContext('workspace.session.session.owner = null',context);
  await vm.runInContext('resumeSession()',context);assert.equal(events.at(-1).event,'session_resumed');
  vm.runInContext('saveWorkspace = () => Promise.reject(Error("Injected save failure"));',context);
  await vm.runInContext('submitExam(true)',context);assert.equal(events.length,2);
  await vm.runInContext('beginNewSession({kind:"retest"})',context);assert.equal(events.length,2);
  await vm.runInContext('resumeSession()',context);assert.equal(events.length,2);
});
