import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [template, styles, coreSource, appSource, sampleRaw] = await Promise.all([
  readFile(path.join(root, "src/index.html"), "utf8"),
  readFile(path.join(root, "src/styles.css"), "utf8"),
  readFile(path.join(root, "src/core/exam-engine.js"), "utf8"),
  readFile(path.join(root, "src/app.js"), "utf8"),
  readFile(path.join(root, "mcq-exam-website/sample-mcq-pack.json"), "utf8"),
]);

const core = coreSource.replace(/\bexport\s+/g, "");
const app = appSource.replace(/import\s*\{[\s\S]*?\}\s*from\s*["']\.\/core\/exam-engine\.js["'];?\s*/, "");
const sample = JSON.stringify(JSON.parse(sampleRaw)).replace(/<\/script/gi, "<\\/script");

let output = template
  .replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${styles}\n</style>`)
  .replace("__SAMPLE_PACK__", sample)
  .replace('<script type="module" src="./app.js"></script>', `<script type="module">\n${core}\n${app}\n</script>`);

const target = path.join(root, "mcq-exam-website/index.html");
if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== output) {
    console.error("mcq-exam-website/index.html is out of date. Run npm run build.");
    process.exit(1);
  }
  console.log("Single-file distribution is up to date.");
} else {
  await writeFile(target, output, "utf8");
  console.log(`Built ${path.relative(root, target)} (${Buffer.byteLength(output)} bytes)`);
}
