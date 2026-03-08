import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEnvContent } from "./search.js";

const searchScriptPath = fileURLToPath(new URL("./search.js", import.meta.url));
const repoDir = path.dirname(searchScriptPath);
const commandDefsPath = path.join(repoDir, "skill-command-definitions.json");

function envFileApiKey() {
  const envPath = path.join(repoDir, ".env");
  if (!fs.existsSync(envPath)) return undefined;
  const parsed = parseEnvContent(fs.readFileSync(envPath, "utf-8"));
  return parsed.PERPLEXITY_API_KEY || parsed.PPLX_API_KEY;
}

const hasApiKey = Boolean(process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY || envFileApiKey());

function runSearchCli(args) {
  const proc = spawnSync(process.execPath, [searchScriptPath, ...args], {
    encoding: "utf8",
    env: process.env,
    timeout: 45_000,
    maxBuffer: 8 * 1024 * 1024,
    cwd: repoDir,
  });

  if (proc.error) throw proc.error;

  assert.equal(proc.status, 0, `search.js exited ${proc.status}: ${proc.stderr}`);
  assert.ok(proc.stdout, "Expected JSON output on stdout");
  return proc.stdout.trim();
}

function loadSkillCommandDefinitions() {
  const raw = fs.readFileSync(commandDefsPath, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.skill, "perplexity-search");
  return parsed;
}

test("linode smoke: search mode returns structured compact JSON", { skip: !hasApiKey }, () => {
  const output = runSearchCli(["linode smoke search", "--max-results", "1", "--compact", "--timeout", "20000"]);
  const parsed = JSON.parse(output);

  assert.ok(parsed && typeof parsed === "object");
  assert.ok(Array.isArray(parsed.results), "Expected search.results array");
  if (parsed.results.length > 0) {
    const first = parsed.results[0];
    assert.equal(typeof first.title, "string");
    assert.equal(typeof first.url, "string");
    assert.equal(typeof first.snippet, "string");
  }
});

test("linode smoke: urls mode returns URL list", { skip: !hasApiKey }, () => {
  const output = runSearchCli(["top 10 web frameworks", "--max-results", "2", "--urls", "--timeout", "20000"]);
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  assert.ok(lines.length >= 1);
  assert.ok(lines.every((line) => /^https?:\/\//i.test(line)));
});

test("linode smoke: ask mode returns answer and citations", { skip: !hasApiKey }, () => {
  const output = runSearchCli(["summarize one practical trend in AI", "--mode", "ask", "--compact", "--timeout", "20000"]);
  const parsed = JSON.parse(output);

  assert.ok(parsed && typeof parsed === "object");
  assert.equal(typeof parsed.answer, "string");
  assert.ok(Array.isArray(parsed.citations), "Expected citations array");
});

test("linode smoke: skill command definitions are complete", () => {
  const definitions = loadSkillCommandDefinitions();
  assert.equal(definitions.entrypoint, "./search.js");
  assert.ok(Array.isArray(definitions.commands), "Expected commands array");
  assert.equal(definitions.commands.length, 2);

  const byId = Object.fromEntries(definitions.commands.map((command) => [command.id, command]));
  const webSearch = byId.web_search;
  const webAsk = byId.web_search_ask;

  assert.ok(webSearch && webSearch.mode === "search");
  assert.ok(webSearch.requiredArgs.includes("query"));
  assert.equal(webSearch.entrypoint, "./search.js");
  assert.ok(webSearch.outputModes.includes("compact"));

  assert.ok(webAsk && webAsk.mode === "ask");
  assert.ok(webAsk.requiredArgs.includes("query"));
  assert.equal(webAsk.fixedFlags?.find((entry) => entry === "--mode ask"), "--mode ask");
  assert.ok(webAsk.outputModes.includes("jsonl"));
});
