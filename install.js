#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = {
    configPath: path.join(os.homedir(), ".openclaw", "openclaw.json"),
    commandDefinitionsPath: path.join(os.homedir(), ".openclaw", "skills", "perplexity-search", "skill-command-definitions.json"),
    model: "sonar-pro",
    maxResults: 5,
    dryRun: false,
    agentId: null,
    perplexityOnly: false,
    setApiKeyFromEnv: false,
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
    if (token === "--perplexity-only") {
      options.perplexityOnly = true;
      continue;
    }
    if (token === "--set-api-key-from-env") {
      options.setApiKeyFromEnv = true;
      continue;
    }
    if (token === "--command-definitions-path") {
      if (!next) throw new Error("Missing value for --command-definitions-path");
      options.commandDefinitionsPath = next;
      i += 1;
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
  if (options.setApiKeyFromEnv) {
    const apiKey = process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY;
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error(
        "PERPLEXITY_API_KEY (or PPLX_API_KEY) is not set in the current environment. " +
          "Export it in this shell, then run the installer again with --set-api-key-from-env."
      );
    }
    updated.tools.web.search.perplexity.apiKey = apiKey.trim();
  }

  updated.agents = ensureObject(updated.agents);
  updated.agents.list = ensureArray(updated.agents.list);

  if (updated.agents.list.length === 0) {
    updated.agents.list.push({ id: "main", tools: { alsoAllow: ["web_search"] } });
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

    // Migrate any old allow-only list to alsoAllow so we don't block default tools.
    // tools.allow is a whitelist (blocks everything not listed); alsoAllow adds to defaults.
    if (Array.isArray(targetAgent.tools.allow)) {
      const existing = new Set(ensureArray(targetAgent.tools.alsoAllow));
      for (const tool of targetAgent.tools.allow) {
        existing.add(tool);
      }
      targetAgent.tools.alsoAllow = [...existing];
      delete targetAgent.tools.allow;
    }

    targetAgent.tools.alsoAllow = ensureArray(targetAgent.tools.alsoAllow);
    if (!targetAgent.tools.alsoAllow.includes("web_search")) {
      targetAgent.tools.alsoAllow.push("web_search");
    }
  }

  if (options.perplexityOnly) {
    for (const agent of updated.agents.list) {
      if (!agent || typeof agent !== "object") continue;
      agent.tools = ensureObject(agent.tools);
      // Remove brave_search from alsoAllow (if present) and add to deny
      agent.tools.alsoAllow = ensureArray(agent.tools.alsoAllow).filter((t) => t !== "brave_search");
      agent.tools.deny = ensureArray(agent.tools.deny);
      if (!agent.tools.deny.includes("brave_search")) {
        agent.tools.deny.push("brave_search");
      }
    }
  }

  if (options.perplexityOnly) {
    if (updated.tools.brave && typeof updated.tools.brave === "object") {
      updated.tools.brave.enabled = false;
    }
  }

  return updated;
}

function writeSkillCommandDefinitions(commandDefinitionsPath) {
  const sourcePath = path.join(__dirname, "skill-command-definitions.json");
  if (!fs.existsSync(sourcePath)) return null;

  const targetPath = path.resolve(commandDefinitionsPath);
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    const help = `Perplexity OpenClaw installer\n\nUsage:\n  node install.js [options]\n\nOptions:\n  --config <path>       OpenClaw config path (default: ~/.openclaw/openclaw.json)\n  --command-definitions-path <path>  Path for skill command definitions (default: ~/.openclaw/skills/perplexity-search/skill-command-definitions.json)\n  --model <name>        Perplexity model for ask mode (default: sonar-pro)\n  --max-results <n>     Search max results (default: 5)\n  --agent-id <id>       Agent to add web_search to (default: \"main\", else first agent)\n  --perplexity-only     Make Perplexity the only web search: remove brave_search from agents,\n                        disable tools.brave (use with explicit approval)\n  --set-api-key-from-env  Copy PERPLEXITY_API_KEY from current shell into config so the\n                        gateway can use it (use if gateway does not see your env)\n  --dry-run             Print resulting config without writing\n  -h, --help            Show this help`;
    console.log(help);
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
    console.log(
      `Dry-run: would write skill command definitions to ${path.resolve(options.commandDefinitionsPath)}`,
    );
    return;
  }

  fs.mkdirSync(configDir, { recursive: true });

  if (exists) {
    const backupPath = `${options.configPath}.bak.${Date.now()}`;
    fs.copyFileSync(options.configPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }

  fs.writeFileSync(options.configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  const commandDefinitionsPath = writeSkillCommandDefinitions(options.commandDefinitionsPath);
  if (commandDefinitionsPath) {
    console.log(`Wrote skill command definitions: ${commandDefinitionsPath}`);
  } else {
    console.log("Warning: skill-command-definitions.json not found in repo; skipping command contract write");
  }
  console.log(`Updated OpenClaw config: ${options.configPath}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
