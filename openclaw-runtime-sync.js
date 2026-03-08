#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_OPENROUTER_ALIAS = "router";
const DEFAULT_OPENROUTER_MODEL = "openrouter/mistralai/ministral-14b-2512";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    openclawConfig: path.join(os.homedir(), ".openclaw", "openclaw.json"),
    agentsRoot: path.join(os.homedir(), ".openclaw", "agents"),
    openrouterAlias: DEFAULT_OPENROUTER_ALIAS,
    openrouterModel: DEFAULT_OPENROUTER_MODEL,
    syncModel: false,
    syncSessions: false,
    help: false,
    key: process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (token === "--openrouter-key") {
      if (!next) throw new Error("Missing value for --openrouter-key");
      options.key = next;
      i += 1;
      continue;
    }

    if (token === "--openclaw-config") {
      if (!next) throw new Error("Missing value for --openclaw-config");
      options.openclawConfig = next;
      i += 1;
      continue;
    }

    if (token === "--agents-root") {
      if (!next) throw new Error("Missing value for --agents-root");
      options.agentsRoot = next;
      i += 1;
      continue;
    }

    if (token === "--alias") {
      if (!next) throw new Error("Missing value for --alias");
      options.openrouterAlias = next;
      i += 1;
      continue;
    }

    if (token === "--openrouter-model") {
      if (!next) throw new Error("Missing value for --openrouter-model");
      options.openrouterModel = next;
      i += 1;
      continue;
    }

    if (token === "--sync-model") {
      options.syncModel = true;
      continue;
    }

    if (token === "--sync-sessions") {
      options.syncSessions = true;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw.trim() ? JSON.parse(raw) : {};
}

function writeJSON(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function applyOpenRouterAuthProfileSync(profilePath, openrouterKey) {
  const absolutePath = path.resolve(profilePath);
  if (!fs.existsSync(absolutePath)) return { path: absolutePath, status: "missing" };

  const data = readJSON(absolutePath);
  const profiles = ensureObject(data.profiles);
  const previous = JSON.stringify(data);
  const entry = ensureObject(profiles["openrouter:default"]);
  entry.type = entry.type || "api_key";
  entry.provider = "openrouter";
  entry.key = openrouterKey;
  profiles["openrouter:default"] = entry;
  data.profiles = profiles;

  data.lastGood = ensureObject(data.lastGood);
  data.lastGood.openrouter = "openrouter:default";

  data.usageStats = ensureObject(data.usageStats);
  const usage = ensureObject(data.usageStats["openrouter:default"]);
  usage.errorCount = 0;
  delete usage.lastFailureAt;
  delete usage.cooldownUntil;
  data.usageStats["openrouter:default"] = usage;

  if (JSON.stringify(data) === previous) {
    return { path: absolutePath, status: "already-correct" };
  }

  return { path: absolutePath, status: "updated", value: data };
}

function syncAuthProfiles(agentsRoot, openrouterKey, dryRun) {
  const absoluteRoot = path.resolve(agentsRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return { updated: [], skipped: [absoluteRoot], skippedReason: "agents root not found" };
  }

  const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
  const result = { updated: [], skipped: [] };

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".DS_Store" || entry.name.startsWith(".")) continue;
    const authPath = path.join(absoluteRoot, entry.name, "agent", "auth-profiles.json");
    const outcome = applyOpenRouterAuthProfileSync(authPath, openrouterKey);
    if (outcome.status === "missing") {
      result.skipped.push(outcome.path);
      continue;
    }

    if (outcome.status === "updated") {
      if (!dryRun) writeJSON(outcome.path, outcome.value);
      result.updated.push(outcome.path);
      continue;
    }

    result.skipped.push(outcome.path);
  }

  return result;
}

function syncModelDefaults(openclawConfigPath, alias, model, dryRun) {
  if (!fs.existsSync(openclawConfigPath)) {
    return { status: "missing", changed: false };
  }

  const absolutePath = path.resolve(openclawConfigPath);
  const config = readJSON(absolutePath);
  const previous = JSON.stringify(config);

  config.agents = ensureObject(config.agents);
  config.agents.defaults = ensureObject(config.agents.defaults);
  const defaults = config.agents.defaults;
  defaults.model = ensureObject(defaults.model);
  if (defaults.model.primary !== alias) defaults.model.primary = alias;

  defaults.model.fallbacks = ensureArray(defaults.model.fallbacks);
  if (defaults.model.fallbacks.length !== 0) defaults.model.fallbacks = [];

  defaults.models = ensureObject(defaults.models);
  defaults.models[model] = ensureObject(defaults.models[model]);
  defaults.models[model].alias = alias;

  if (JSON.stringify(config) !== previous) {
    if (!dryRun) writeJSON(absolutePath, config);
    return { status: "updated", changed: true, path: absolutePath };
  }

  return { status: "already-correct", changed: false, path: absolutePath };
}

function toSessionModel(model) {
  return model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;
}

function syncMainSession(agentsRoot, model, dryRun) {
  const sessionsPath = path.join(path.resolve(agentsRoot), "main", "sessions", "sessions.json");
  if (!fs.existsSync(sessionsPath)) {
    return { status: "missing", path: sessionsPath };
  }

  const sessions = readJSON(sessionsPath);
  if (!sessions || typeof sessions !== "object") {
    return { status: "invalid", path: sessionsPath };
  }

  const session = sessions["agent:main:main"];
  if (!session || typeof session !== "object") {
    return { status: "missing-session", path: sessionsPath };
  }

  const previous = JSON.stringify(sessions);
  session.modelProvider = "openrouter";
  const normalizedModel = toSessionModel(model);
  session.model = normalizedModel;
  if (session.providerOverride !== undefined) delete session.providerOverride;
  if (session.modelOverride !== undefined) delete session.modelOverride;
  session.updatedAt = Date.now();
  if (session.deliveryContext && typeof session.deliveryContext === "object") {
    session.deliveryContext.model = normalizedModel;
    session.deliveryContext.provider = "openrouter";
  }

  if (JSON.stringify(sessions) !== previous) {
    if (!dryRun) writeJSON(sessionsPath, sessions);
    return { status: "updated", path: sessionsPath };
  }

  return { status: "already-correct", path: sessionsPath };
}

function printHelp() {
  const help = `OpenClaw runtime sync utility\n\nUsage:\n  node openclaw-runtime-sync.js [options]\n\nOptions:\n  --openrouter-key <key>      Set openrouter:default profile key\n  --alias <alias>             OpenRouter model alias for router defaults (default: router)\n  --openrouter-model <model>   Model id for OpenRouter routing (default: openrouter/mistralai/ministral-14b-2512)\n  --sync-model                Write model defaults into openclaw.json\n  --sync-sessions             Update main session cache model fields in ~/.openclaw/agents/main/sessions/sessions.json and clear stale provider/model overrides\n  --openclaw-config <path>    OpenClaw config path (default: ~/.openclaw/openclaw.json)\n  --agents-root <path>        OpenClaw agents root (default: ~/.openclaw/agents)\n  --dry-run                   Show what would change, but do not write\n  --help, -h                  Show this help\n\nThis command is useful after auth or model drift to quickly realign runtime settings.\n`;
  console.log(help);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.key) {
    throw new Error("OPENROUTER_API_KEY is required. Set OPENROUTER_API_KEY or pass --openrouter-key.");
  }

  const key = String(options.key).trim();
  if (!key) throw new Error("OpenRouter key is empty.");

  const keyResult = syncAuthProfiles(options.agentsRoot, key, options.dryRun);
  console.log(`Auth profile updates (${options.dryRun ? "dry-run" : "applied"}):`);
  for (const path of keyResult.updated) console.log(`  updated ${path}`);
  for (const path of keyResult.skipped) console.log(`  skipped ${path}`);

  if (options.syncModel) {
    const modelResult = syncModelDefaults(
      options.openclawConfig,
      options.openrouterAlias,
      options.openrouterModel,
      options.dryRun,
    );
    console.log(`Model defaults (${options.dryRun ? "dry-run" : "applied"}):`);
    console.log(`  ${modelResult.status}: ${modelResult.path}`);
  }

  if (options.syncSessions) {
    const sessionResult = syncMainSession(options.agentsRoot, options.openrouterModel, options.dryRun);
    console.log(`Session cache (${options.dryRun ? "dry-run" : "applied"}):`);
    console.log(`  ${sessionResult.status}: ${sessionResult.path}`);
  }

  const hasAnyProfile = keyResult.updated.length > 0 || keyResult.skipped.length > 0;
  if (!hasAnyProfile) {
    throw new Error(`No auth profiles found under agents root: ${path.resolve(options.agentsRoot)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
