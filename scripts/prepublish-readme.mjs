import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = dirname(__dirname);

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: node prepublish-readme.mjs <tag>");
  process.exit(1);
}

const repo = "urayoru113/opencode-insight";
const rawBase = `https://raw.githubusercontent.com/${repo}/${tag}/`;

const readmePath = join(root, "README.md");
let readme = await readFile(readmePath, "utf8");

readme = readme.replace(/]\(img\//g, `](${rawBase}img/`);

await writeFile(readmePath, readme);
console.log(`Rewrote README image paths for tag ${tag}`);
