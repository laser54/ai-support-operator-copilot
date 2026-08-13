import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIST = join(process.cwd(), "dist");
const FORBIDDEN = [
  /LLM_API_KEY/,
  /OPENAI_API_KEY/,
  /DATABASE_URL/,
  /postgres(?:ql)?:\/\//i,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /sk-proj-/,
  /sk-live-/,
];

const assets = readdirSync(join(DIST, "assets")).filter((name) => name.endsWith(".js"));
if (assets.length === 0) {
  throw new Error("No production JS assets found in dist/assets");
}

const bundle = assets.map((name) => readFileSync(join(DIST, "assets", name), "utf8")).join("\n");
const hits = FORBIDDEN.filter((pattern) => pattern.test(bundle)).map((pattern) => pattern.source);
if (hits.length > 0) {
  throw new Error(`Production bundle contains credential-like strings: ${hits.join(", ")}`);
}

process.stdout.write(`Checked ${assets.length} JS asset(s); no credential-like strings.\n`);
