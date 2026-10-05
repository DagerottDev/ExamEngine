import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [template, styles, sampleRaw, license, bundle] = await Promise.all([
  read('src/index.html'), read('src/styles.css'), read('mcq-exam-website/sample-mcq-pack.json'), read('LICENSE'),
  build({ entryPoints: [path.join(root, 'src/app.js')], bundle: true, write: false, format: 'iife', target: 'es2022', legalComments: 'inline', loader: { '.ttf': 'dataurl' } }),
]);
let css = styles;
for (const [name, file] of [['Source Sans 3','SourceSans3'],['Lexend','Lexend'],['Atkinson Hyperlegible','AtkinsonHyperlegible'],['Lora','Lora']]) {
  const bytes = await readFile(path.join(root, `src/assets/fonts/${file}.ttf`));
  css = `@font-face{font-family:'${name}';src:url(data:font/ttf;base64,${bytes.toString('base64')}) format('truetype');font-weight:100 900;font-display:swap}\n${css}`;
}
const pdfLicense = await read('node_modules/pdfjs-dist/LICENSE');
const notices = await Promise.all(['sourcesans3','lexend','atkinsonhyperlegible','lora'].map(f => read(`src/assets/fonts/${f}-LICENSE.txt`)));
const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const worker = await read('node_modules/pdfjs-dist/build/pdf.worker.mjs');
const output = template.replace('<!doctype html>', () => `<!doctype html>\n<!--\n${license.trim()}\nPDF.js license:\n${pdfLicense}\nFont notices:\n${notices.join('\n').replaceAll('--','—')}\n-->`)
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('__SAMPLE_PACK__', () => safeScript(JSON.stringify(JSON.parse(sampleRaw))))
  .replace('<script type="module" src="./app.js"></script>', () => `<script>\n${safeScript(`globalThis.__EXAM_PDF_WORKER__=${JSON.stringify(worker)};\n${bundle.outputFiles[0].text}`)}\n</script>`);
const target = path.join(root, 'mcq-exam-website/index.html');
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8').catch(() => '')) !== output) { console.error('Offline distribution is stale. Run npm run build.'); process.exit(1); }
  console.log('Single-file distribution is up to date.');
} else { await writeFile(target, output); console.log(`Built offline viewer (${Buffer.byteLength(output)} bytes)`); }
