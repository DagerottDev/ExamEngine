import { assertSafeJSON, canonical, packContent, sha256, validateWorkspace } from './workspace.js';

export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const ITERATIONS = 600000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

export function base64Bytes(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid base64 data.');
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (base64(bytes) !== value) throw new Error('Invalid base64 padding.');
  return bytes;
}

function checkPassword(password) {
  if (typeof password !== 'string' || Array.from(password).length < 12) throw new Error('Encrypted backups require a password of at least 12 characters.');
}

function checkCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('Encrypted backups require Web Crypto in a secure browser context.');
}

async function keyFromPassword(password, salt) {
  checkCrypto(); checkPassword(password);
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function metadata(envelope) {
  return { type: envelope.type, backupVersion: envelope.backupVersion, appVersion: envelope.appVersion, exportedAt: envelope.exportedAt, encryption: envelope.encryption };
}

async function checkWorkspace(workspace) {
  validateWorkspace(workspace);
  for (const source of workspace.sources) await validateSource(source);
  for (const record of workspace.packs) if (await sha256(canonical(packContent(record.pack))) !== record.fingerprint) throw new Error('Pack fingerprint does not match its content.');
  return workspace;
}

export async function validateSource(source) {
  const bytes = base64Bytes(source.data);
  if (bytes.byteLength !== source.size || await sha256(bytes) !== source.hash) throw new Error(`Source integrity check failed: ${source.name}`);
  const starts = signature => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start, end) => new TextDecoder().decode(bytes.subarray(start, end));
  const valid = source.type === 'application/pdf' ? ascii(0, 5) === '%PDF-'
    : source.type === 'image/png' ? starts([137, 80, 78, 71, 13, 10, 26, 10])
    : source.type === 'image/jpeg' ? starts([255, 216, 255])
    : source.type === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    : ['text/plain', 'text/markdown'].includes(source.type);
  if (!valid) throw new Error(`Source bytes do not match the declared file type: ${source.name}`);
  if (source.type.startsWith('text/')) {
    try { if (textDecoder.decode(bytes).includes('\0')) throw new Error('Binary text'); } catch { throw new Error(`Text source must contain valid UTF-8 text: ${source.name}`); }
  }
  return source;
}

function validateEnvelope(envelope) {
  assertSafeJSON(envelope);
  if (!envelope || Array.isArray(envelope) || typeof envelope !== 'object') throw new Error('Backup must be a JSON object.');
  if (envelope.type !== 'examengine-backup') throw new Error('This file is not a RecallForge backup.');
  if (envelope.backupVersion !== 1) throw new Error('Unsupported backup version. Update RecallForge to read newer backups.');
  if (typeof envelope.appVersion !== 'string' || !/^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(envelope.appVersion)) throw new Error('Unsupported backup application version.');
  if (typeof envelope.exportedAt !== 'string' || !Number.isFinite(Date.parse(envelope.exportedAt))) throw new Error('Backup export date is invalid.');
  const allowed = ['type', 'backupVersion', 'appVersion', 'exportedAt', 'data', 'encryption'];
  if (Object.keys(envelope).some(key => !allowed.includes(key))) throw new Error('Backup has unknown envelope fields.');
  if (envelope.encryption !== undefined) {
    const encryption = envelope.encryption;
    if (!encryption || encryption.algorithm !== 'AES-GCM' || encryption.kdf !== 'PBKDF2-SHA256' || encryption.iterations !== ITERATIONS || Object.keys(encryption).some(key => !['algorithm', 'kdf', 'iterations', 'salt', 'iv'].includes(key))) throw new Error('Backup encryption parameters are unsupported.');
    if (base64Bytes(encryption.salt).length !== 16 || base64Bytes(encryption.iv).length !== 12 || base64Bytes(envelope.data).length < 16) throw new Error('Backup encryption data is malformed.');
  }
  return envelope;
}

export async function encodeBackup(workspace, password = '') {
  await checkWorkspace(workspace);
  const envelope = { type: 'examengine-backup', backupVersion: 1, appVersion: '2.1.0', exportedAt: new Date().toISOString(), data: workspace };
  if (password !== '') {
    checkCrypto(); checkPassword(password);
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    envelope.encryption = { algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: base64(salt), iv: base64(iv) };
    const key = await keyFromPassword(password, salt);
    envelope.data = base64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: textEncoder.encode(canonical(metadata(envelope))), tagLength: 128 }, key, textEncoder.encode(JSON.stringify(workspace)))));
  } else envelope.data = JSON.parse(JSON.stringify(workspace));
  if (textEncoder.encode(JSON.stringify(envelope)).byteLength > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 100 MiB file limit.');
  return envelope;
}

export async function decodeBackup(input, password = '') {
  let envelope;
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    if (input.size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 100 MiB file limit.');
    input = await input.text();
  }
  if (typeof input === 'string') {
    if (textEncoder.encode(input).byteLength > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 100 MiB file limit.');
    try { envelope = JSON.parse(input); } catch { throw new Error('Backup is not valid JSON.'); }
  } else {
    assertSafeJSON(input);
    const serialized = JSON.stringify(input);
    if (textEncoder.encode(serialized).byteLength > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 100 MiB file limit.');
    envelope = JSON.parse(serialized);
  }
  validateEnvelope(envelope);
  if (envelope.encryption) {
    checkPassword(password);
    const encryption = envelope.encryption;
    const key = await keyFromPassword(password, base64Bytes(encryption.salt));
    let plaintext;
    try { plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64Bytes(encryption.iv), additionalData: textEncoder.encode(canonical(metadata(envelope))), tagLength: 128 }, key, base64Bytes(envelope.data)); } catch { throw new Error('Could not decrypt backup: wrong password or damaged file.'); }
    try { envelope.data = JSON.parse(textDecoder.decode(plaintext)); } catch { throw new Error('Decrypted backup data is invalid.'); }
    delete envelope.encryption;
  }
  await checkWorkspace(envelope.data);
  return envelope;
}

export function backupPreview(envelope) {
  const workspace = envelope.data;
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) throw new Error('Decode the backup before previewing it.');
  validateWorkspace(workspace);
  return { exportedAt: envelope.exportedAt, packs: workspace.packs.length, drafts: workspace.drafts.length, questions: workspace.packs.reduce((sum, record) => sum + record.pack.questions.length, 0), sources: workspace.sources.length, sourceBytes: workspace.sources.reduce((sum, source) => sum + source.size, 0), attempts: workspace.attempts.length, review: workspace.review.length, notebook: workspace.notebook.length, activeSession: !!workspace.session };
}
