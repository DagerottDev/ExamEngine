import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createSession } from '../src/core/exam-engine.js';
import { emptyWorkspace, identifyPack, sha256 } from '../src/core/workspace.js';
import { encodeBackup, decodeBackup, backupPreview, base64Bytes } from '../src/core/backup.js';
globalThis.crypto ||= webcrypto;

async function workspace() {
  const value = emptyWorkspace();
  value.packs.push(await identifyPack({ schemaVersion: '2.0', exam: { title: 'Test', subject: 'Math', examType: 'Practice', totalMarks: 1 }, difficulty: 'easy', timing: { mode: 'exam', examDurationSeconds: 60 }, scoring: { mode: 'question' }, delivery: { mode: 'exam', shuffleQuestions: false, shuffleOptions: false }, questions: [{ id: 1, question: '1 + 1?', options: ['2', '3'], answerIndex: 0, marks: 1, negativeMarks: 0, sourceBindings: [{ sourceId: 'source' }] }] }));
  value.sources.push({ id: 'source', name: 'lesson.txt', type: 'text/plain', size: 6, data: btoa('lesson'), hash: await sha256('lesson') });
  value.session = { pack: value.packs[0].pack, session: { ...createSession(value.packs[0].pack, 1750000063456), currentQuestionStartedAt: 1750000100123 } };
  return value;
}

test('plain backup roundtrip retains sources and exact active-session deadlines', async () => {
  const value = await workspace();
  const encoded = await encodeBackup(value);
  const decoded = await decodeBackup(JSON.stringify(encoded));
  assert.deepEqual(decoded.data, value);
  assert.equal(decoded.type, 'examengine-backup');
  assert.equal(backupPreview(decoded).sources, 1);
  assert.equal(backupPreview(decoded).activeSession, true);
  encoded.data.preferences.theme = 'light';
  assert.equal(value.preferences.theme, undefined);
});

test('encrypted backups roundtrip, use fresh salts and reject wrong password/ciphertext/metadata tampering', async () => {
  const value = await workspace(), password = 'correct horse battery staple';
  const encrypted = await encodeBackup(value, password), another = await encodeBackup(value, password);
  assert.notEqual(encrypted.encryption.salt, another.encryption.salt);
  assert.notEqual(encrypted.encryption.iv, another.encryption.iv);
  assert.equal(encrypted.encryption.iterations, 600000);
  assert.equal(JSON.stringify(encrypted).includes(password), false);
  assert.deepEqual((await decodeBackup(encrypted, password)).data, value);
  await assert.rejects(decodeBackup(encrypted, 'wrong password long enough'), /wrong password or damaged/);
  const tampered = structuredClone(encrypted); tampered.data = (tampered.data[0] === 'A' ? 'B' : 'A') + tampered.data.slice(1);
  await assert.rejects(decodeBackup(tampered, password), /wrong password or damaged/);
  const metadata = structuredClone(encrypted); metadata.exportedAt = '2020-01-01T00:00:00.000Z';
  await assert.rejects(decodeBackup(metadata, password), /wrong password or damaged/);
  await assert.rejects(encodeBackup(value, 'short'), /at least 12/);
});

test('backup trust boundary rejects unsupported versions, prototype keys, broken sources and references', async () => {
  const value = await workspace(), envelope = await encodeBackup(value);
  await assert.rejects(decodeBackup({ ...envelope, backupVersion: 2 }), /Unsupported backup version/);
  await assert.rejects(decodeBackup('{"__proto__":{}}'), /Unsafe/);
  await assert.rejects(decodeBackup('not JSON'), /not valid JSON/);
  const corrupted = structuredClone(envelope); corrupted.data.sources[0].data = btoa('lessox');
  await assert.rejects(decodeBackup(corrupted), /integrity check failed/);
  const dangling = structuredClone(envelope); dangling.data.sources = [];
  await assert.rejects(decodeBackup(dangling), /Unknown source reference/);
  const malformed = structuredClone(envelope); malformed.data.sources[0].data = '%%%%';
  await assert.rejects(decodeBackup(malformed), /Invalid base64/);
  assert.throws(() => base64Bytes('YR=='), /padding/);
  const futureApp = structuredClone(envelope); futureApp.appVersion = '3.0.0';
  await assert.rejects(decodeBackup(futureApp), /Unsupported backup application/);
});

test('compatible application versions load while fingerprints, malformed sessions and fake MIME sources fail', async () => {
  const value = await workspace(), envelope = await encodeBackup(value);
  assert.deepEqual((await decodeBackup({ ...envelope, appVersion: '2.2.1' })).data, value);
  const forged = structuredClone(envelope); forged.data.packs[0].fingerprint = '0'.repeat(64);
  await assert.rejects(decodeBackup(forged), /fingerprint/);
  const deadline = structuredClone(envelope); deadline.data.session.session.examDeadlineMs++;
  await assert.rejects(decodeBackup(deadline), /deadline/);
  const source = structuredClone(envelope); source.data.sources[0].type = 'image/png';
  await assert.rejects(decodeBackup(source), /declared file type/);
  const unsupported = structuredClone(envelope); unsupported.data.sources[0].type = 'image/svg+xml';
  await assert.rejects(decodeBackup(unsupported), /Source type/);
});
