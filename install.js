#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";

function parseArgs(argv) {
  const options = {
    configPath: path.join(os.homedir(), ".openclaw", "openclaw.json"),
    model: "sonar-pro",
    maxResults: 5,
    dryRun: false,
    agentId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--config") {
      if (!next) throw new Error("Missing value for --config");
      options.configPath = next;
      i += 1;
      continue;
    }
    if (token === "--model") {
      if (!next) throw new Error("Missing value for --model");
      options.model = next;
      i += 1;
      continue;
    }
    if (token === "--max-results") {
      if (!next) throw new Error("Missing value for --max-results");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("--max-results must be a positive integer");
      options.maxResults = parsed;
      i += 1;
      continue;
    }
    if (token === "--agent-id") {
      if (!next) throw new Error("Missing value for --agent-id");
      options.agentId = next;
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function configureOpenClaw(config, options) {
  const updated = ensureObject(config);
  updated.tools = ensureObject(updated.tools);
  updated.tools.web = ensureObject(updated.tools.web);
  updated.tools.web.search = ensureObject(updated.tools.web.search);

  updated.tools.web.search.enabled = true;
  updated.tools.web.search.provider = "perplexity";
  updated.tools.web.search.maxResults = options.maxResults;
  updated.tools.web.search.perplexity = ensureObject(updated.tools.web.search.perplexity);
  updated.tools.web.search.perplexity.model = options.model;

  updated.agents = ensureObject(updated.agents);
  updated.agents.list = ensureArray(updated.agents.list);

  if (updated.agents.list.length === 0) {
    updated.agents.list.push({ id: "main", tools: { allow: ["web_search"] } });
    return updated;
  }

  let targets = [];
  if (options.agentId) {
    const match = updated.agents.list.find((agent) => agent && agent.id === options.agentId);
    if (match) targets = [match];
  } else {
    const main = updated.agents.list.find((agent) => agent && agent.id === "main");
    targets = main ? [main] : [updated.agents.list[0]];
  }

  for (const targetAgent of targets) {
    if (!targetAgent || typeof targetAgent !== "object") continue;
    targetAgent.tools = ensureObject(targetAgent.tools);
    targetAgent.tools.allow = ensureArray(targetAgent.tools.allow);
    if (!targetAgent.tools.allow.includes("web_search")) {
      targetAgent.tools.allow.push("web_search");
    }
  }

  return updated;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(`Perplexity OpenClaw installer\n\nUsage:\n  node install.js [options]\n\nOptions:\n  --config <path>       OpenClaw config path (default: ~/.openclaw/openclaw.json)\n  --model <name>        Perplexity model for ask mode (default: sonar-pro)\n  --max-results <n>     Search max results (default: 5)\n  --agent-id <id>       Agent to add web_search to (default: "main", else first agent)\n  --dry-run             Print resulting config without writing\n  -h, --help            Show this help`);
    return;
  }

  const configDir = path.dirname(options.configPath);
  const exists = fs.existsSync(options.configPath);

  let original = {};
  if (exists) {
    const raw = fs.readFileSync(options.configPath, "utf-8");
    try {
      original = raw.trim() ? JSON.parse(raw) : {};
    } catch (err) {
      throw new Error(`Config is not valid JSON at ${options.configPath}: ${err.message}`);
    }
  }

  const updated = configureOpenClaw(original, options);

  if (options.dryRun) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  fs.mkdirSync(configDir, { recursive: true });

  if (exists) {
    const backupPath = `${options.configPath}.bak.${Date.now()}`;
    fs.copyFileSync(options.configPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }

  fs.writeFileSync(options.configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  console.log(`Updated OpenClaw config: ${options.configPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
