import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createSession, validatePack } from '../src/core/exam-engine.js';
import { emptyWorkspace, identifyPack, collectQuestions, scheduleReview, buildMock, mergeWorkspaces, validateWorkspace, createWorkspaceStore, sha256, validateSession } from '../src/core/workspace.js';

globalThis.crypto ||= webcrypto;
const DAY = 86400000;
function pack() {
  return { schemaVersion: '2.0', exam: { title: 'Pack', subject: 'Math', examType: 'Practice', totalMarks: 4 }, difficulty: 'mixed', timing: { mode: 'none' }, scoring: { mode: 'question' }, delivery: { mode: 'exam', shuffleQuestions: false, shuffleOptions: false }, questions: [1, 2, 3, 4].map(id => ({ id, question: `Question ${id}?`, options: ['Yes', 'No'], answerIndex: 0, marks: 1, negativeMarks: 0.25, topic: id % 2 ? 'A' : 'B', difficulty: 'moderate' })) };
}
async function workspace() { const value = emptyWorkspace(); value.packs.push(await identifyPack(pack(), [])); return value; }

test('pack exact reimport deduplicates and revisions preserve only unchanged question semantics', async () => {
  const record = await identifyPack(pack());
  assert.deepEqual(await identifyPack(pack(), [record]), record);
  const edit = structuredClone(record.pack);
  edit.exam.title = 'Cosmetic title'; edit.questions[0].explanation = 'New explanation'; edit.questions[1].question += ' Changed';
  const revised = await identifyPack(edit, [record], record.id);
  assert.equal(revised.packId, record.packId);
  assert.equal(revised.revision, 2);
  assert.notEqual(revised.id, record.id);
  assert.equal(revised.pack.questions[0].questionUid, record.pack.questions[0].questionUid);
  assert.notEqual(revised.pack.questions[1].questionUid, record.pack.questions[1].questionUid);
  const options = structuredClone(record.pack); options.questions[0].options.reverse(); options.questions[0].answerIndex = 1;
  const reordered = await identifyPack(options, [record], record.id);
  assert.equal(reordered.pack.questions[0].questionUid, record.pack.questions[0].questionUid);
  options.questions[0].answerIndex = 0;
  assert.notEqual((await identifyPack(options, [record], record.id)).pack.questions[0].questionUid, record.pack.questions[0].questionUid);
});

test('review caps advancement per local day, preserves replay idempotence, and resets mistakes', () => {
  const date = new Date(2026, 9, 5, 12).getTime();
  const event = (day, id, extra = {}) => ({ questionUid: 'q', isCorrect: true, date: date + day * DAY, attemptId: id, ...extra });
  const events = [event(0, '1'), event(0, '2'), event(1, '3'), event(2, '4'), event(3, '5'), event(4, '6')];
  let reviews = scheduleReview([], events, date);
  const midnight = new Date(2026, 9, 5).getTime();
  assert.equal(reviews[0].step, 4); assert.equal(reviews[0].dueAt, midnight + 34 * DAY);
  assert.deepEqual(scheduleReview(reviews, events, date), reviews);
  reviews = scheduleReview(reviews, [event(5, '7', { isCorrect: false }), event(5, '8')], date);
  assert.equal(reviews[0].step, 0); assert.equal(reviews[0].dueAt, midnight + 6 * DAY);
  assert.equal(scheduleReview([], [event(0, '9', { stillUnclear: true })])[0].step, 0);
});

test('mock is deterministic, balanced, filters recent attempts and preserves origin/scoring', async () => {
  const value = await workspace();
  const source = value.packs[0];
  source.pack.scoring = { mode: 'uniform', correctMarks: 2, negativeMarks: 0.5 }; source.pack.exam.totalMarks = 8;
  const options = { count: 4, seed: 'stable', avoidRecent: false, timing: { mode: 'exam', examDurationSeconds: 120 } };
  const mock = buildMock(value, options, 100);
  assert.deepEqual(buildMock(value, options, 100), mock);
  assert.deepEqual(mock.questions.map(q => q.id), [1, 2, 3, 4]);
  assert.equal(mock.questions.filter(q => q.topic === 'A').length, 2);
  assert.equal(mock.exam.totalMarks, 8);
  assert.ok(mock.questions.every(q => q.originPackId === source.packId && q.originRevision === 1 && q.marks === 2 && q.negativeMarks === 0.5));
  const importedMock = await identifyPack(mock, value.packs);
  assert.deepEqual(importedMock.pack.questions.map(q => q.questionUid), mock.questions.map(q => q.questionUid));
  value.attempts.push({ id: 'a', date: 100, events: [{ questionUid: mock.questions[0].questionUid, date: 100 }] });
  assert.throws(() => buildMock(value, { count: 4 }, 100), /Only 3/);
  assert.equal(buildMock(value, { count: 2, uniformMarks: { correctMarks: 3, negativeMarks: 1 } }, 100).exam.totalMarks, 6);
  assert.throws(() => buildMock(value, { count: 1, topics: ['Missing'] }), /Only 0/);
  source.archived = true; assert.deepEqual(collectQuestions(value), []);
});

test('merge deduplicates, remaps conflicting source/question/attempt references, preserves local session and preferences', async () => {
  const current = await workspace(), incoming = structuredClone(current);
  const localQuestion = current.packs[0].pack.questions[0];
  const source = { id: 's', name: 'old.txt', type: 'text/plain', size: 1, data: 'YQ==', hash: await sha256('a') };
  current.sources.push(source); current.session = { pack: current.packs[0].pack, session: createSession(current.packs[0].pack, 123) }; current.preferences.theme = 'dark';
  incoming.sources.push({ ...source, name: 'new.txt', data: 'Yg==', hash: await sha256('b') }); incoming.preferences.theme = 'light';
  incoming.packs[0].pack.questions[0].question = 'Different question';
  incoming.packs[0].pack.questions[0].sourceBindings = [{ sourceId: 's' }];
  incoming.packs[0].fingerprint = await sha256('different');
  current.attempts.push({ id: 'a', date: 1, events: [{ questionUid: localQuestion.questionUid, date: 1, attemptId: 'a', isCorrect: false }] });
  incoming.attempts.push({ id: 'a', date: 2, events: [{ questionUid: localQuestion.questionUid, date: 2, attemptId: 'a', isCorrect: true }] });
  current.drafts.push({ id: 'd', editingId: current.packs[0].id, pack: structuredClone(current.packs[0].pack) });
  incoming.drafts.push({ id: 'd', editingId: incoming.packs[0].id, pack: structuredClone(incoming.packs[0].pack) });
  current.notebook.push({ id: 'n', questionUid: localQuestion.questionUid, sourceId: 's', attemptId: 'a', note: 'Local note' });
  incoming.notebook.push({ id: 'n', questionUid: localQuestion.questionUid, sourceId: 's', attemptId: 'a', note: 'Imported note' });
  const { workspace: merged, report } = await mergeWorkspaces(current, incoming);
  assert.equal(merged.packs.length, 2); assert.equal(merged.sources.length, 2); assert.equal(merged.attempts.length, 2);
  assert.deepEqual(merged.session, current.session); assert.equal(merged.preferences.theme, 'dark');
  assert.notEqual(merged.packs[1].pack.questions[0].questionUid, localQuestion.questionUid);
  assert.equal(merged.attempts[1].events[0].questionUid, merged.packs[1].pack.questions[0].questionUid);
  assert.equal(merged.attempts[1].events[0].attemptId, merged.attempts[1].id);
  assert.equal(merged.packs[1].pack.questions[0].sourceBindings[0].sourceId, merged.sources[1].id);
  assert.equal(merged.drafts.length, 2); assert.equal(merged.notebook.length, 2);
  assert.equal(merged.drafts[1].editingId, merged.packs[1].id);
  assert.equal(merged.notebook[1].questionUid, merged.packs[1].pack.questions[0].questionUid);
  assert.equal(merged.notebook[1].attemptId, merged.attempts[1].id);
  assert.equal(merged.notebook[1].sourceId, merged.sources[1].id);
  assert.ok(report.conflicts.length >= 6);
  const repeated = await mergeWorkspaces(merged, incoming);
  assert.equal(repeated.report.added, 0);
  assert.deepEqual(repeated.workspace, merged);
  assert.equal((await mergeWorkspaces(current, current)).workspace.packs.length, 1);
  assert.equal((await mergeWorkspaces(current, incoming, { preferences: true })).workspace.preferences.theme, 'light');
  assert.deepEqual((await mergeWorkspaces(current, incoming, { mode: 'replace' })).workspace, incoming);
});

test('workspace rejects unsafe keys, dangling references, and unavailable storage clearly', async () => {
  const unsafe=pack();unsafe.constructor='unsafe extension';await assert.rejects(identifyPack(unsafe),/Unsafe JSON key/);
  const value = await workspace();
  value.notebook.push({ id: 'n', questionUid: 'missing' });
  assert.throws(() => validateWorkspace(value), /Unknown question/);
  assert.throws(() => validateWorkspace(JSON.parse('{"__proto__":{}}')), /Unsafe/);
  await assert.rejects(createWorkspaceStore(), /Persistent storage is unavailable/);
});

test('merge maps history to existing question identities when independently imported identical packs deduplicate', async () => {
  const current = await workspace(), incoming = await workspace();
  const q = incoming.packs[0].pack.questions[0];
  incoming.attempts.push({ id: 'imported-attempt', packId: incoming.packs[0].packId, date: 100, events: [{ questionUid: q.questionUid, isCorrect: true, date: 100, attemptId: 'imported-attempt' }] });
  const merged = (await mergeWorkspaces(current, incoming)).workspace;
  assert.equal(merged.packs.length, 1);
  assert.equal(merged.attempts[0].events[0].questionUid, current.packs[0].pack.questions[0].questionUid);
  assert.equal(merged.attempts[0].packId, current.packs[0].packId);
  assert.equal(merged.review[0].questionUid, current.packs[0].pack.questions[0].questionUid);
});

test('correct guesses retain the review stage and calendar due dates survive DST', () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const date = new Date(2026, 2, 7, 23).getTime();
    const initial = [{ questionUid: 'q', step: 3, dueAt: date, eventIds: [] }];
    const result = scheduleReview(initial, [{ questionUid: 'q', isCorrect: true, answerConfidence: 'guessed', date, attemptId: 'guess' }]);
    assert.equal(result[0].step, 3);
    assert.equal(result[0].dueAt, new Date(2026, 2, 8).getTime());
    const correct = scheduleReview([], [{ questionUid: 'q', isCorrect: true, date, attemptId: 'correct' }]);
    assert.equal(correct[0].dueAt, new Date(2026, 2, 8).getTime());
  } finally { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; }
});

test('real app session maps validate while corrupt deadlines, budgets and choices fail', () => {
  const p = pack(); p.timing = { mode: 'both', examDurationSeconds: 60, defaultQuestionSeconds: 20 };
  const session = { ...createSession(p, 100), answerConfidence: { 1: 'guessed' }, timeSpentMs: { 1: 3000 }, checked: [1] };
  session.answers[1] = 0;
  assert.equal(validateSession(p, session), session);
  for (const change of [s => { s.examDeadlineMs += 1000; }, s => { s.questionRemainingMs[1] = 21000; }, s => { s.answers[1] = 2; }, s => { s.answers[1] = [0]; }, s => { s.flagged = [5]; }, s => { s.currentQuestionId = '1'; }]) {
    const invalid = structuredClone(session); change(invalid); assert.throws(() => validateSession(p, invalid), /Session/);
  }
});

test('optional pack identity/source fields are validated and untimed mocks use study delivery', async () => {
  const p = pack(); p.packId = 'family'; p.questions[0].questionUid = 'q'; p.questions[0].sourceBindings = [{ sourceId: 's', page: 1, excerpt: 'line' }];
  assert.deepEqual(validatePack(p), []);
  for (const change of [value => { value.packId = ''; }, value => { value.questions[1].questionUid = 'q'; }, value => { value.questions[0].sourceBindings[0].page = true; }, value => { value.questions[0].sourceBindings[0].excerpt = null; }]) {
    const invalid = structuredClone(p); change(invalid); assert.ok(validatePack(invalid).length);
  }
  assert.equal(buildMock(await workspace(), { count: 1 }).delivery.mode, 'study');
});

test('unfinished editor drafts are valid while malformed structures and editing references fail', async () => {
  const value = await workspace(), draft = { id: 'draft', editingId: value.packs[0].id, pack: pack() };
  draft.pack.exam.title = ''; draft.pack.exam.subject = '';
  draft.pack.questions[0] = { id: 1, question: '', options: ['', ''], answerIndex: null, marks: 0, negativeMarks: null };
  value.drafts.push(draft);
  assert.equal(validateWorkspace(value), value);
  for (const mutate of [d => { d.pack = null; }, d => { d.pack.schemaVersion = '3.0'; }, d => { d.pack.exam = {}; }, d => { d.pack.timing = []; }, d => { d.pack.questions = []; }, d => { d.pack.questions[0].question = null; }, d => { d.pack.questions[0].options = [1, '']; }, d => { d.pack.questions[0].answerIndices = '0,1'; }, d => { d.pack.questions[0].tags = 'tag'; }, d => { d.editingId = 'missing'; }]) {
    const malformed = structuredClone(value); mutate(malformed.drafts[0]); assert.throws(() => validateWorkspace(malformed), /Draft|draft/);
  }
  const orphanRetest = createSession(value.packs[0].pack, 100); orphanRetest.parentAttemptId = 'removed-by-history-cleanup';
  value.session = { pack: value.packs[0].pack, session: orphanRetest };
  assert.equal(validateWorkspace(value), value);
});

test('merge preserves draft editing and nested retest parent references across record ID collisions', async () => {
  const current = await workspace(), incoming = structuredClone(current);
  incoming.packs[0].pack.exam.title = 'Imported revision'; incoming.packs[0].fingerprint = await sha256('imported-content');
  incoming.drafts.push({ id: 'imported-draft', editingId: incoming.packs[0].id, pack: structuredClone(incoming.packs[0].pack) });
  current.attempts.push({ id: 'parent', date: 100, summaryOnly: true, title: 'Local original' });
  const incomingParent = { id: 'parent', date: 200, summaryOnly: true, title: 'Imported original' };
  const retestSession = createSession(incoming.packs[0].pack, 300); retestSession.parentAttemptId = 'parent';
  incoming.attempts.push({ id: 'retest', date: 300, pack: structuredClone(incoming.packs[0].pack), session: retestSession }, incomingParent);
  const merged = (await mergeWorkspaces(current, incoming)).workspace;
  const importedPack = merged.packs.find(record => record.pack.exam.title === 'Imported revision');
  const importedParent = merged.attempts.find(attempt => attempt.title === 'Imported original');
  assert.notEqual(importedPack.id, current.packs[0].id); assert.notEqual(importedParent.id, 'parent');
  assert.equal(merged.drafts[0].editingId, importedPack.id);
  assert.equal(merged.attempts.find(attempt => attempt.id === 'retest').session.parentAttemptId, importedParent.id);
  assert.equal(merged.attempts.find(attempt => attempt.title === 'Local original').id, 'parent');
});

test('conflicting parents preserve identical retest chains and their own snapshot session identities', async () => {
  const current = await workspace(), p = current.packs[0].pack;
  const retest = (id, parent) => {
    const session = createSession(p, 1000); session.id = id; session.parentAttemptId = parent; session.submittedAt = 2000;
    return { id, date: 2000, pack: structuredClone(p), session, events: [{ questionUid: p.questions[0].questionUid, isCorrect: true, date: 2000, attemptId: id }] };
  };
  current.attempts = [retest('again', 'retest'), retest('retest', 'parent'), { id: 'parent', date: 1, summaryOnly: true, title: 'Local parent' }];
  current.session = { pack: p, session: createSession(p, 3000) }; current.session.session.id = 'retest';
  const incoming = structuredClone(current); incoming.attempts[2].title = 'Imported parent';
  const merged = (await mergeWorkspaces(current, incoming)).workspace;
  assert.equal(merged.attempts.length, 6);
  const importedParent = merged.attempts.find(attempt => attempt.title === 'Imported parent');
  const importedRetest = merged.attempts.find(attempt => attempt.session?.parentAttemptId === importedParent.id);
  const importedAgain = merged.attempts.find(attempt => attempt.session?.parentAttemptId === importedRetest.id);
  for (const attempt of [importedRetest, importedAgain]) {
    assert.equal(attempt.session.id, attempt.id);
    assert.equal(attempt.events[0].attemptId, attempt.id);
  }
  assert.equal(merged.attempts.find(attempt => attempt.id === 'retest').session.parentAttemptId, 'parent');
  assert.deepEqual(merged.session, current.session);
  assert.equal((await mergeWorkspaces(current, current)).workspace.attempts.length, 3);
  const repeated = await mergeWorkspaces(merged, incoming);
  assert.deepEqual(repeated.workspace.attempts, merged.attempts);
  assert.equal(repeated.report.added, 0);
});

test('attempt mappings do not rewrite a snapshot session ID belonging to another record', async () => {
  const current = await workspace(); current.attempts.push({ id: 'parent', date: 1, summaryOnly: true, title: 'Local parent' });
  const incoming = structuredClone(current); incoming.attempts[0].title = 'Imported parent';
  const session = createSession(incoming.packs[0].pack, 1000); session.id = 'parent';
  incoming.attempts.unshift({ id: 'unrelated-record', date: 1000, pack: incoming.packs[0].pack, session });
  const merged = (await mergeWorkspaces(current, incoming)).workspace;
  assert.notEqual(merged.attempts.find(attempt => attempt.title === 'Imported parent').id, 'parent');
  assert.equal(merged.attempts.find(attempt => attempt.id === 'unrelated-record').session.id, 'parent');
});
