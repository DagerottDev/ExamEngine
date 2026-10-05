import { deepClone, upgradeLegacyPack, validatePack, questionLimitMs } from './exam-engine.js';

export const WORKSPACE_KEYS = ['packs', 'drafts', 'sources', 'attempts', 'review', 'notebook', 'session', 'preferences', 'meta'];
const DAY = 86400000;
const INTERVALS = [1, 3, 7, 14, 30];
const uid = () => crypto.randomUUID();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function emptyWorkspace() {
  return { packs: [], drafts: [], sources: [], attempts: [], review: [], notebook: [], session: null, preferences: {}, meta: {} };
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function semantic(question) {
  const normalize = text => text.normalize('NFC').trim().replace(/\s+/g, ' ');
  return canonical({ question: normalize(question.question), options: question.options.map(normalize).sort(), answers: (question.answerIndices || [question.answerIndex]).map(index => normalize(question.options[index])).sort() });
}

export function packContent(pack) {
  const value = deepClone(pack);
  delete value.packId;
  value.questions.forEach(question => { for (const key of ['questionUid', 'originPackId', 'originRevision', 'packRecordId', 'libraryPackId']) delete question[key]; });
  return value;
}

export async function identifyPack(input, existingRecords = [], updateRecordId = null) {
  assertSafeJSON(input);
  const pack = upgradeLegacyPack(input);
  const problems = validatePack(pack);
  if (problems.length) throw new Error(problems.join('\n'));
  const fingerprint = await sha256(canonical(packContent(pack)));
  const exact = existingRecords.find(record => record.fingerprint === fingerprint && canonical(packContent(record.pack)) === canonical(packContent(pack)));
  if (exact) return deepClone(exact);
  const previous = updateRecordId ? existingRecords.find(record => record.id === updateRecordId) : null;
  if (updateRecordId && !previous) throw new Error('The pack revision being updated no longer exists.');
  const packId = previous?.packId || (nonempty(pack.packId) ? pack.packId : uid());
  const family = existingRecords.filter(record => record.packId === packId);
  const revision = Math.max(0, ...family.map(record => record.revision)) + 1;
  const baseline = previous || family.sort((a, b) => b.revision - a.revision)[0];
  const seen = new Set();
  for (const question of pack.questions) {
    const old = baseline?.pack.questions.find(candidate => !seen.has(candidate.questionUid) && semantic(candidate) === semantic(question));
    const supplied = nonempty(question.questionUid) && !seen.has(question.questionUid) && !existingRecords.some(record => record.pack.questions.some(candidate => candidate.questionUid === question.questionUid && semantic(candidate) !== semantic(question))) ? question.questionUid : null;
    question.questionUid = old?.questionUid || supplied || `q-${await sha256(`${packId}|${semantic(question)}|${question.id}`)}`;
    seen.add(question.questionUid);
  }
  pack.packId = packId;
  return { id: uid(), packId, revision, fingerprint, pack, archived: false, createdAt: Date.now() };
}

export function collectQuestions(workspace) {
  const seen = new Set();
  const active = workspace.packs.filter(record => !record.archived);
  const latest = active.filter(record => !active.some(other => other.packId === record.packId && other.revision > record.revision));
  return latest.sort((a, b) => b.revision - a.revision).flatMap(record => record.pack.questions.map(question => {
    const q = deepClone(question);
    q.originPackId = question.originPackId || record.packId;
    q.originRevision = question.originRevision || record.revision;
    q.packRecordId = record.id;
    q.libraryPackId = record.packId;
    if (record.pack.scoring.mode === 'uniform') { q.marks = record.pack.scoring.correctMarks; q.negativeMarks = record.pack.scoring.negativeMarks; }
    return q;
  })).filter(question => { if (seen.has(question.questionUid)) return false; seen.add(question.questionUid); return true; });
}

export function workspaceEvents(workspace) {
  return workspace.attempts.filter(attempt => !attempt.summaryOnly).flatMap(attempt => (attempt.events || []).map(event => ({ ...event, date: event.date ?? attempt.date, attemptId: event.attemptId || attempt.id })));
}

function localDay(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dueDay(time, days) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function scheduleReview(review, events, now = Date.now()) {
  const records = new Map(review.map(record => [record.questionUid, deepClone(record)]));
  for (const event of [...events].sort((a, b) => new Date(a.date ?? now).getTime() - new Date(b.date ?? now).getTime())) {
    if (!nonempty(event.questionUid)) continue;
    const date = new Date(event.date ?? now).getTime();
    if (!Number.isFinite(date)) throw new Error('Review event date is invalid.');
    const id = event.id || `${event.attemptId || ''}|${event.questionUid}|${date}`;
    const record = records.get(event.questionUid) || { questionUid: event.questionUid, step: -1, dueAt: date, eventIds: [] };
    record.eventIds ||= [];
    if (record.eventIds.includes(id)) continue;
    record.eventIds.push(id);
    const day = localDay(date);
    const unsure = ['low', 'unsure', 'guessed'].includes(event.answerConfidence) || (typeof event.answerConfidence === 'number' && event.answerConfidence < 0.5);
    if (!event.isCorrect || event.skipped || event.stillUnclear) {
      record.step = 0;
      record.dueAt = dueDay(date, 1);
      record.lastAdvancedDay = day;
    } else if (unsure) {
      record.step = Math.max(0, record.step);
      record.dueAt = dueDay(date, 1);
      record.lastAdvancedDay = day;
    } else if (record.lastAdvancedDay !== day) {
      record.step = Math.min(INTERVALS.length - 1, record.step + 1);
      record.dueAt = dueDay(date, INTERVALS[record.step]);
      record.lastAdvancedDay = day;
    }
    record.lastReviewedAt = date;
    records.set(event.questionUid, record);
  }
  return [...records.values()].sort((a, b) => a.dueAt - b.dueAt || a.questionUid.localeCompare(b.questionUid));
}

export function buildMock(workspace, options = {}, now = Date.now()) {
  const count = Number(options.count ?? 20);
  if (!Number.isInteger(count) || count < 1) throw new Error('Question count must be a positive integer.');
  const matches = (values, value) => !values?.length || values.includes(value);
  let candidates = collectQuestions(workspace).filter(question => matches(options.packIds, question.libraryPackId) && matches(options.topics, question.topic || 'Uncategorised') && matches(options.difficulties, question.difficulty || 'moderate'));
  if (options.avoidRecent !== false) {
    const recent = new Set(workspaceEvents(workspace).filter(event => new Date(event.date).getTime() >= now - 7 * DAY).map(event => event.questionUid));
    candidates = candidates.filter(question => !recent.has(question.questionUid));
  }
  if (candidates.length < count) throw new Error(`Only ${candidates.length} questions match; ${count} requested. Change the filters or allow recent questions.`);
  // Native hash ranking supplies a deterministic order without a second shuffle engine.
  const rank = text => { let hash = 2166136261; for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return hash >>> 0; };
  candidates.sort((a, b) => rank(`${options.seed ?? 'mock'}|${a.questionUid}`) - rank(`${options.seed ?? 'mock'}|${b.questionUid}`) || a.questionUid.localeCompare(b.questionUid));
  const groups = new Map();
  candidates.forEach(question => { const topic = question.topic || 'Uncategorised'; if (!groups.has(topic)) groups.set(topic, []); groups.get(topic).push(question); });
  const questions = [];
  while (questions.length < count) for (const group of groups.values()) { if (group.length && questions.length < count) questions.push(group.shift()); }
  questions.forEach((question, i) => { question.id = i + 1; delete question.sectionId; delete question.packRecordId; delete question.libraryPackId; });
  const scoring = options.uniformMarks ? { mode: 'uniform', ...options.uniformMarks } : { mode: 'question' };
  const timing = deepClone(options.timing || { mode: 'none' });
  const pack = { schemaVersion: '2.0', exam: { title: options.title || 'Custom mock', subject: options.subject || 'Mixed topics', examType: 'Mock Test', totalMarks: questions.reduce((sum, question) => sum + (scoring.mode === 'uniform' ? scoring.correctMarks : question.marks), 0) }, difficulty: 'mixed', timing, scoring, delivery: { mode: timing.mode === 'none' ? 'study' : 'exam', shuffleQuestions: false, shuffleOptions: false, seed: String(options.seed ?? 'mock') }, questions };
  const problems = validatePack(pack);
  if (problems.length) throw new Error(problems.join('\n'));
  return pack;
}

export function assertSafeJSON(value, allowUndefined = false) {
  const walk = (item, depth) => {
    if (depth > 100) throw new Error('JSON nesting is too deep.');
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('JSON contains a non-finite number.');
    if (item !== null && typeof item === 'object') {
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('JSON must contain plain objects.');
      for (const key of Object.keys(item)) { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe JSON key.'); walk(item[key], depth + 1); }
    } else if (item !== null && !(allowUndefined && item === undefined) && !['number', 'string', 'boolean'].includes(typeof item)) throw new Error('Unsupported JSON value.');
  };
  walk(value, 0);
}

export function validateWorkspace(workspace) {
  assertSafeJSON(workspace, true);
  if (!object(workspace)) throw new Error('Workspace must be an object.');
  for (const key of ['packs', 'drafts', 'sources', 'attempts', 'review', 'notebook']) if (!Array.isArray(workspace[key])) throw new Error(`Workspace ${key} must be an array.`);
  for (const key of ['preferences', 'meta']) if (!object(workspace[key])) throw new Error(`Workspace ${key} must be an object.`);
  if (workspace.session !== null && !object(workspace.session)) throw new Error('Workspace session is invalid.');
  const questionUids = new Set();
  const semantics = new Map();
  const sources = new Set();
  const recordIds = new Set();
  for (const key of ['packs', 'drafts', 'sources', 'attempts', 'notebook']) {
    const ids = new Set();
    workspace[key].forEach(record => {
      if (!object(record) || !nonempty(record.id) || ids.has(record.id)) throw new Error(`Workspace ${key} has missing or duplicate record IDs.`);
      ids.add(record.id);
    });
  }
  workspace.sources.forEach(source => {
    if (!nonempty(source.name) || typeof source.type !== 'string' || !Number.isInteger(source.size) || source.size < 0 || typeof source.data !== 'string' || !/^[a-f0-9]{64}$/.test(source.hash)) throw new Error('Source metadata is invalid.');
    const limits = { 'text/plain': 1048576, 'text/markdown': 1048576, 'image/png': 5242880, 'image/jpeg': 5242880, 'image/webp': 5242880, 'application/pdf': 26214400 };
    if (!Object.hasOwn(limits, source.type) || source.size > limits[source.type]) throw new Error('Source type or file size is unsupported.');
    sources.add(source.id);
  });
  if (workspace.sources.reduce((sum, source) => sum + source.size, 0) > 40 * 1048576) throw new Error('Source library exceeds the 40 MiB limit.');
  workspace.packs.forEach(record => {
    if (!nonempty(record.packId) || !Number.isInteger(record.revision) || record.revision < 1 || !/^[a-f0-9]{64}$/.test(record.fingerprint) || typeof record.archived !== 'boolean') throw new Error('Pack record metadata is invalid.');
    const problems = validatePack(record.pack);
    if (problems.length) throw new Error(`Invalid stored pack: ${problems.join('\n')}`);
    const seen = new Set();
    record.pack.questions.forEach(question => {
      if (!nonempty(question.questionUid) || seen.has(question.questionUid)) throw new Error('Stored questions require unique questionUid values.');
      if (semantics.has(question.questionUid) && semantics.get(question.questionUid) !== semantic(question)) throw new Error('A question UID refers to different question content.');
      semantics.set(question.questionUid, semantic(question)); seen.add(question.questionUid); questionUids.add(question.questionUid);
    });
    recordIds.add(record.id);
  });
  workspace.drafts.forEach(draft => {
    const pack = draft.pack;
    if (!object(pack) || pack.schemaVersion !== '2.0' || !object(pack.exam) || typeof pack.exam.title !== 'string' || typeof pack.exam.subject !== 'string' || !['timing', 'scoring', 'delivery'].every(key => object(pack[key])) || !Array.isArray(pack.questions) || pack.questions.length === 0) throw new Error('Draft pack structure is invalid.');
    for (const question of pack.questions) {
      if (!object(question) || typeof question.question !== 'string' || !Array.isArray(question.options) || question.options.some(option => typeof option !== 'string')) throw new Error('Draft question structure is invalid.');
      for (const key of ['tags', 'sourceRefs']) if (question[key] != null && (!Array.isArray(question[key]) || question[key].some(value => typeof value !== 'string'))) throw new Error(`Draft ${key} must be a string array.`);
      if (question.answerIndices != null && (!Array.isArray(question.answerIndices) || question.answerIndices.some(value => value !== null && typeof value !== 'number'))) throw new Error('Draft answer indices are invalid.');
      for (const key of ['answerIndex', 'marks', 'negativeMarks']) if (question[key] != null && typeof question[key] !== 'number') throw new Error(`Draft ${key} must be a number or null.`);
    }
    if (draft.editingId != null && (!nonempty(draft.editingId) || !recordIds.has(draft.editingId))) throw new Error('Unknown draft editing record reference.');
  });
  const attempts = new Set(workspace.attempts.map(attempt => attempt.id));
  const validateSnapshot = (pack, session) => {
    validateSession(pack, session);
    for (const question of pack.questions) if (!nonempty(question.questionUid) || semantics.get(question.questionUid) !== semantic(question)) throw new Error('Session question content does not match its registered identity.');
  };
  workspace.attempts.forEach(attempt => {
    if (attempt.pack != null || attempt.session != null) validateSnapshot(attempt.pack, attempt.session);
    if (attempt.events != null && !Array.isArray(attempt.events)) throw new Error('Attempt events must be an array.');
    for (const event of attempt.events || []) {
      if (!object(event) || !nonempty(event.questionUid) || typeof event.isCorrect !== 'boolean' || !Number.isFinite(new Date(event.date ?? attempt.date).getTime())) throw new Error('Attempt review event is invalid.');
      if (event.skipped != null && typeof event.skipped !== 'boolean') throw new Error('Attempt skipped state is invalid.');
    }
  });
  if (workspace.session) validateSnapshot(workspace.session.pack, workspace.session.session);
  const reviewed = new Set();
  workspace.review.forEach(record => {
    if (!object(record) || !nonempty(record.questionUid) || reviewed.has(record.questionUid) || !Number.isInteger(record.step) || record.step < 0 || record.step >= INTERVALS.length || !Number.isFinite(record.dueAt)) throw new Error('Review state is invalid.');
    reviewed.add(record.questionUid);
  });
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.sourceId != null && !sources.has(value.sourceId)) throw new Error('Unknown source reference.');
    if (value.questionUid != null && !questionUids.has(value.questionUid)) throw new Error('Unknown question reference.');
    if (value.packRecordId != null && !recordIds.has(value.packRecordId)) throw new Error('Unknown pack record reference.');
    if (value.originRecordId != null && !recordIds.has(value.originRecordId)) throw new Error('Unknown origin record reference.');
    if (value.attemptId != null && !attempts.has(value.attemptId)) throw new Error('Unknown attempt reference.');
    if (value.sourceBindings != null && (!Array.isArray(value.sourceBindings) || value.sourceBindings.some(binding => !object(binding) || !nonempty(binding.sourceId) || (binding.page != null && (!Number.isInteger(binding.page) || binding.page < 1)) || (binding.excerpt != null && typeof binding.excerpt !== 'string')))) throw new Error('Source bindings are invalid.');
    Object.values(value).forEach(walk);
  };
  walk(workspace);
  return workspace;
}

export function validateSession(pack, session) {
  const problems = validatePack(pack);
  if (problems.length || !object(session)) throw new Error('Session pack or session is invalid.');
  const questions = new Map(pack.questions.map(question => [String(question.id), question]));
  const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (session.version !== 2 || !nonempty(session.id) || !timestamp(session.startedAt) || !timestamp(session.updatedAt) || (session.submittedAt != null && !timestamp(session.submittedAt)) || (session.currentQuestionStartedAt != null && !timestamp(session.currentQuestionStartedAt)) || !Number.isInteger(session.currentQuestionId) || !questions.has(String(session.currentQuestionId))) throw new Error('Session metadata is invalid.');
  if (!object(session.answers) || !object(session.questionRemainingMs) || !Array.isArray(session.flagged) || session.flagged.some(id => !Number.isInteger(id) || !questions.has(String(id))) || new Set(session.flagged).size !== session.flagged.length) throw new Error('Session answer/timer maps are invalid.');
  for (const [id, answer] of Object.entries(session.answers)) {
    const question = questions.get(id);
    if (!question) throw new Error('Session answer references an unknown question.');
    if (answer === null || answer === undefined) continue;
    const choices = Array.isArray(answer) ? answer : [answer];
    if ((Array.isArray(question.answerIndices) !== Array.isArray(answer)) || new Set(choices).size !== choices.length || choices.some(index => !Number.isInteger(index) || index < 0 || index >= question.options.length)) throw new Error('Session answer indices are invalid.');
  }
  for (const [id, remaining] of Object.entries(session.questionRemainingMs)) {
    const question = questions.get(id), limit = question && questionLimitMs(pack, question);
    if (limit == null || !timestamp(remaining) || remaining > limit) throw new Error('Session question timer is invalid.');
  }
  for (const question of pack.questions) if (questionLimitMs(pack, question) != null && !Object.hasOwn(session.questionRemainingMs, String(question.id))) throw new Error('Session question timer is missing.');
  const expectedDeadline = ['exam', 'both'].includes(pack.timing.mode) ? session.startedAt + pack.timing.examDurationSeconds * 1000 : null;
  if (session.examDeadlineMs !== expectedDeadline) throw new Error('Session exam deadline is invalid.');
  for (const field of ['timeSpentMs', 'answerConfidence']) if (session[field] != null) {
    if (!object(session[field])) throw new Error(`Session ${field} map is invalid.`);
    for (const [id, value] of Object.entries(session[field])) {
      const valid = field === 'timeSpentMs' ? timestamp(value) : ['', 'confident', 'unsure', 'guessed'].includes(value) || (typeof value === 'number' && value >= 0 && value <= 1);
      if (!questions.has(id) || !valid) throw new Error(`Session ${field} value is invalid.`);
    }
  }
  if (session.checked != null && (!Array.isArray(session.checked) || session.checked.some(id => !Number.isInteger(id) || !questions.has(String(id))))) throw new Error('Session checked questions are invalid.');
  return session;
}

function remapReferences(value, mappings) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const map = mappings[key];
    if (map?.has(item)) value[key] = map.get(item);
    else remapReferences(item, mappings);
  }
}

export async function mergeWorkspaces(current, incoming, { mode = 'merge', preferences = false } = {}) {
  validateWorkspace(current); validateWorkspace(incoming);
  if (!['merge', 'replace'].includes(mode)) throw new Error('Restore mode must be merge or replace.');
  if (mode === 'replace') return { workspace: deepClone(incoming), report: { mode, added: incoming.packs.length + incoming.sources.length + incoming.attempts.length, skipped: 0, conflicts: [] } };
  const result = deepClone(current), addition = deepClone(incoming);
  const report = { mode, added: 0, skipped: 0, conflicts: [] };
  const sourceId = new Map(), questionUid = new Map(), packRecordId = new Map(), packId = new Map(), attemptId = new Map();
  const mappings = { sourceId, questionUid, packRecordId, originRecordId: packRecordId, editingId: packRecordId, packId, originPackId: packId, libraryPackId: packId, attemptId, parentAttemptId: attemptId };
  for (const source of addition.sources) {
    const same = result.sources.find(existing => existing.hash === source.hash && existing.data === source.data && existing.type === source.type);
    if (same) { sourceId.set(source.id, same.id); report.skipped++; continue; }
    if (result.sources.some(existing => existing.id === source.id)) { const old = source.id; source.id = uid(); sourceId.set(old, source.id); report.conflicts.push(`Source ${old} kept with a new ID.`); }
    result.sources.push(source); report.added++;
  }
  remapReferences(addition, { sourceId });
  const existingQuestions = new Map(current.packs.flatMap(record => record.pack.questions.map(question => [question.questionUid, semantic(question)])));
  for (const record of addition.packs) {
    record.fingerprint = await sha256(canonical(packContent(record.pack)));
    const duplicate = current.packs.find(existing => existing.fingerprint === record.fingerprint && canonical(packContent(existing.pack)) === canonical(packContent(record.pack)));
    if (duplicate) record.pack.questions.forEach(question => {
      const match = duplicate.pack.questions.find(existing => existing.id === question.id);
      if (match && question.questionUid !== match.questionUid) questionUid.set(question.questionUid, match.questionUid);
    });
  }
  addition.packs.forEach(record => record.pack.questions.forEach(question => {
    if (existingQuestions.has(question.questionUid) && existingQuestions.get(question.questionUid) !== semantic(question) && !questionUid.has(question.questionUid)) { questionUid.set(question.questionUid, uid()); report.conflicts.push(`Question ${question.questionUid} kept with a new ID.`); }
  }));
  remapReferences(addition, { questionUid });
  for (const key of ['packs', 'attempts', 'drafts', 'notebook']) {
    if (key === 'attempts') {
      remapReferences(addition.attempts, { packRecordId, originRecordId: packRecordId, packId, originPackId: packId, libraryPackId: packId });
      const pending = new Map(addition.attempts.map(record => [record.id, record]));
      const dependencies = record => {
        const ids = new Set();
        const walk = value => {
          if (!value || typeof value !== 'object') return;
          for (const [key, item] of Object.entries(value)) {
            if ((key === 'attemptId' || key === 'parentAttemptId') && item !== record.id && pending.has(item)) ids.add(item);
            else walk(item);
          }
        };
        walk(record); return ids;
      };
      while (pending.size) {
        let ready = [...pending.values()].filter(record => !dependencies(record).size);
        // Cyclic history references cannot be matched safely before their IDs are assigned.
        const cyclic = !ready.length;
        if (cyclic) ready = [pending.values().next().value];
        for (const record of ready) {
          const old = record.id;
          remapReferences(record, { attemptId, parentAttemptId: attemptId });
          const same = !cyclic && result.attempts.find(existing => {
            const candidate = deepClone(record);
            candidate.id = existing.id;
            if (candidate.session?.id === old) candidate.session.id = existing.id;
            remapReferences(candidate, { attemptId: new Map([[old, existing.id]]), parentAttemptId: new Map([[old, existing.id]]) });
            return canonical(existing) === canonical(candidate);
          });
          if (same) {
            attemptId.set(old, same.id); report.skipped++;
          } else {
            if (result.attempts.some(existing => existing.id === old)) {
              record.id = uid();
              report.conflicts.push(`attempts ${old} kept with a new ID.`);
            }
            attemptId.set(old, record.id);
            if (record.session?.id === old) record.session.id = record.id;
            remapReferences(record, { attemptId, parentAttemptId: attemptId });
            result.attempts.push(record); report.added++;
          }
          pending.delete(old);
        }
      }
      continue;
    }
    for (const record of addition[key]) {
      if (key === 'drafts' || key === 'notebook') remapReferences(record, mappings);
      const same = result[key].find(existing => canonical(existing) === canonical(key === 'packs' ? record : { ...record, id: existing.id }) || (key === 'packs' && existing.fingerprint === record.fingerprint && canonical(packContent(existing.pack)) === canonical(packContent(record.pack))));
      if (same) { if (key === 'packs') { packRecordId.set(record.id, same.id); packId.set(record.packId, same.packId); } report.skipped++; continue; }
      if (result[key].some(existing => existing.id === record.id)) { const old = record.id; record.id = uid(); if (key === 'packs') packRecordId.set(old, record.id); report.conflicts.push(`${key} ${old} kept with a new ID.`); }
      result[key].push(record); report.added++;
    }
  }
  // Only imported records are remapped; local history and the active session retain their IDs.
  for (const key of ['packs', 'drafts', 'attempts', 'notebook']) addition[key].forEach(record => remapReferences(record, mappings));
  for (const record of result.packs) record.fingerprint = await sha256(canonical(packContent(record.pack)));
  if (preferences) result.preferences = { ...result.preferences, ...addition.preferences };
  result.review = scheduleReview([], workspaceEvents(result));
  validateWorkspace(result);
  return { workspace: result, report };
}

export async function createWorkspaceStore({ name = 'exam-engine-workspace', legacyStorage } = {}) {
  if (!globalThis.indexedDB) throw new Error('Persistent storage is unavailable. Use temporary mode or enable browser storage.');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Could not open persistent storage: ${request.error?.message || 'storage denied'}`));
    request.onblocked = () => reject(new Error('Storage upgrade is blocked by another ExamEngine tab. Close it and retry.'));
  });
  database.onversionchange = () => database.close();
  const transaction = (mode, action) => new Promise((resolve, reject) => {
    let result, failure;
    const tx = database.transaction('workspace', mode);
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure || new Error(`Persistent storage ${mode === 'readwrite' ? 'save' : 'read'} failed: ${tx.error?.message || 'transaction aborted'}`));
    try { result = action(tx.objectStore('workspace'), error => { failure = error; tx.abort(); }); } catch (error) { tx.abort(); reject(error); }
  });
  let knownRevision = 0, migrationDone = false, committed = emptyWorkspace();
  const read = async () => {
    const workspace = emptyWorkspace();
    let revisionValue = 0;
    await transaction('readonly', store => { const migrated = store.get('_migrated'); migrated.onsuccess = () => {migrationDone = !!migrated.result;}; const revision = store.get('_revision'); revision.onsuccess = () => { revisionValue = revision.result || 0; }; WORKSPACE_KEYS.forEach(key => { const request = store.get(key); request.onsuccess = () => { if (request.result !== undefined) workspace[key] = request.result; }; }); });
    validateWorkspace(workspace);
    knownRevision = revisionValue;
    committed = workspace;
    return deepClone(workspace);
  };
  let queue = Promise.resolve();
  const serial = action => { const next = queue.then(action); queue = next.catch(() => {}); return next; };
  const write = async (workspace, keys, recovery, removeRecovery = false) => {
    const expected = knownRevision;
    await transaction('readwrite', (store, fail) => {
      const request = store.get('_revision');
      request.onsuccess = () => {
        if ((request.result || 0) !== expected) return fail(new Error('Workspace changed in another tab. Reload before saving to avoid overwriting newer data.'));
        if (recovery) store.put(recovery, 'recovery');
        if (removeRecovery) store.delete('recovery');
        for (const key of keys) store.put(workspace[key], key);
        if (keys.length) store.put(expected + 1, '_revision');
        if (workspace.meta.legacyMigratedAt) store.put(true, '_migrated');
      };
    });
    if (keys.length) knownRevision = expected + 1;
    committed = { ...committed, ...Object.fromEntries(keys.map(key => [key, workspace[key]])) };
  };
  const store = {
    persistent: true,
    close: () => database.close(),
    load: () => serial(read),
    save: (workspace, keys = WORKSPACE_KEYS) => serial(async () => {
      if (!object(workspace)) throw new Error('Workspace must be an object.');
      if (!Array.isArray(keys) || keys.some(key => !WORKSPACE_KEYS.includes(key))) throw new Error('Unknown workspace save key.');
      const next = { ...committed };
      for (const key of keys) next[key] = deepClone(workspace[key]);
      validateWorkspace(next);
      await write(next, keys);
    }),
    restore: (incoming, options) => serial(async () => { const current = await read(); const restored = await mergeWorkspaces(current, incoming, options); await write(restored.workspace, WORKSPACE_KEYS, current); return { ...restored, workspace: deepClone(restored.workspace) }; }),
    undo: () => serial(async () => {
      await read();
      let recovery;
      await transaction('readonly', records => { const request = records.get('recovery'); request.onsuccess = () => { recovery = request.result; }; });
      if (!recovery) throw new Error('No restore recovery snapshot is available.');
      validateWorkspace(recovery);
      await write(recovery, WORKSPACE_KEYS, null, true);
      return deepClone(recovery);
    }),
  };
  const workspace = await read();
  if (!migrationDone && workspace.meta.legacyMigratedAt) await transaction('readwrite', records => records.put(true,'_migrated'));
  if (!migrationDone && !workspace.meta.legacyMigratedAt) {
    if (legacyStorage === undefined) try { legacyStorage = globalThis.localStorage; } catch { /* Storage access is optional for migration. */ }
    const legacy = key => { try { const raw = legacyStorage?.getItem(`exam-engine:v2:${key}`); return raw ? JSON.parse(raw) : null; } catch { return null; } };
    const resume = legacy('resume');
    if (resume?.pack && resume?.session) {
      try { const record = await identifyPack(resume.pack, workspace.packs); validateSession(record.pack, resume.session); if (!workspace.packs.some(pack => pack.id === record.id)) workspace.packs.push(record); if (!workspace.session) workspace.session = { pack: record.pack, session: resume.session }; } catch (error) { workspace.meta.migrationWarning = `Legacy resume could not be migrated: ${error.message}`; }
    }
    const history = legacy('history'), notebook = legacy('notebook');
    if (Array.isArray(history)) history.filter(object).forEach(item => {
      if (workspace.attempts.some(attempt => attempt.id === item.id)) return;
      const record = { id: nonempty(item.id) ? item.id : uid(), title: typeof item.title === 'string' ? item.title : 'Legacy attempt', subject: typeof item.subject === 'string' ? item.subject : '', summaryOnly: true };
      for (const key of ['date', 'earned', 'maxMarks', 'percentage']) if (typeof item[key] === 'number' && Number.isFinite(item[key])) record[key] = item[key];
      record.weakTopics = Array.isArray(item.weakTopics) ? item.weakTopics.filter(nonempty) : [];
      workspace.attempts.push(record);
    });
    if (Array.isArray(notebook)) notebook.filter(object).forEach(item => {
      const record = { id: uid(), legacy: true };
      for (const key of ['examTitle', 'question', 'topic', 'explanation']) if (typeof item[key] === 'string') record[key] = item[key];
      for (const key of ['questionId', 'savedAt']) if (typeof item[key] === 'number' && Number.isFinite(item[key])) record[key] = item[key];
      record.sourceRefs = Array.isArray(item.sourceRefs) ? item.sourceRefs.filter(nonempty) : [];
      workspace.notebook.push(record);
    });
    try { const theme = legacyStorage?.getItem('exam-engine:v2:theme'); if (['dark', 'light'].includes(theme) && !workspace.preferences.theme) workspace.preferences.theme = theme; } catch { /* Originals remain available. */ }
    workspace.meta.legacyMigratedAt = Date.now();
    validateWorkspace(workspace);
    await write(workspace, WORKSPACE_KEYS);
  }
  return store;
}
