#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 5;
const RECENCY_VALUES = new Set(["hour", "day", "week", "month", "year"]);
const MODE_VALUES = new Set(["search", "ask"]);
const SEARCH_MODE_VALUES = new Set(["web", "academic", "sec"]);
const OUTPUT_VALUES = new Set(["compact", "urls", "full"]);

function trimQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "'" && last === "'") || (first === "\"" && last === "\"")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function stripInlineComment(value) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === "\"" && !inSingle) inDouble = !inDouble;
    if (char === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(value[i - 1])) {
        return value.slice(0, i).trimEnd();
      }
    }
  }
  return value;
}

export function parseEnvContent(content) {
  const vars = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eqIndex = normalized.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    const rawValue = normalized.slice(eqIndex + 1).trim();
    const noComment = stripInlineComment(rawValue);
    vars[key] = trimQuotes(noComment);
  }
  return vars;
}

export function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const envContent = fs.readFileSync(envPath, "utf-8");
  const parsed = parseEnvContent(envContent);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseCsv(value) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseIntFlag(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

function requireValue(args, index, flagName) {
  if (index + 1 >= args.length) {
    throw new Error(`Missing value for ${flagName}`);
  }
  return args[index + 1];
}

export function parseArgs(args) {
  const options = {
    mode: "search",
    maxResults: DEFAULT_MAX_RESULTS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    output: "compact",
    model: "sonar-pro",
    maxTokensPerPage: 2000,
    snippetChars: 500,
  };

  const queryParts = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];

    if (token === "-n" || token === "--max-results") {
      options.maxResults = parseIntFlag(requireValue(args, i, token), token);
      i += 1;
      continue;
    }
    if (token === "--mode") {
      const value = requireValue(args, i, token);
      if (!MODE_VALUES.has(value)) throw new Error(`Invalid --mode: ${value}`);
      options.mode = value;
      i += 1;
      continue;
    }
    if (token === "--recency") {
      const value = requireValue(args, i, token);
      if (!RECENCY_VALUES.has(value)) throw new Error(`Invalid --recency: ${value}`);
      options.recency = value;
      i += 1;
      continue;
    }
    if (token === "--lang") {
      options.lang = requireValue(args, i, token);
      i += 1;
      continue;
    }
    if (token === "--domain-allow") {
      options.domainAllow = parseCsv(requireValue(args, i, token));
      i += 1;
      continue;
    }
    if (token === "--domain-deny") {
      options.domainDeny = parseCsv(requireValue(args, i, token));
      i += 1;
      continue;
    }
    if (token === "--after-date") {
      options.afterDate = requireValue(args, i, token);
      i += 1;
      continue;
    }
    if (token === "--before-date") {
      options.beforeDate = requireValue(args, i, token);
      i += 1;
      continue;
    }
    if (token === "--search-mode") {
      const value = requireValue(args, i, token);
      if (!SEARCH_MODE_VALUES.has(value)) throw new Error(`Invalid --search-mode: ${value}`);
      options.searchMode = value;
      i += 1;
      continue;
    }
    if (token === "--timeout") {
      options.timeoutMs = parseIntFlag(requireValue(args, i, token), token);
      i += 1;
      continue;
    }
    if (token === "--model") {
      options.model = requireValue(args, i, token);
      i += 1;
      continue;
    }
    if (token === "--snippet-chars") {
      options.snippetChars = parseIntFlag(requireValue(args, i, token), token);
      i += 1;
      continue;
    }
    if (token === "--compact") {
      options.output = "compact";
      continue;
    }
    if (token === "--urls" || token === "--urls-only" || token === "--url") {
      options.output = "urls";
      continue;
    }
    if (token === "--full") {
      options.output = "full";
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token.startsWith("-")) {
      throw new Error(`Unknown flag: ${token}`);
    }

    queryParts.push(token);
  }

  options.query = queryParts.join(" ").trim();
  if (!OUTPUT_VALUES.has(options.output)) throw new Error(`Invalid output mode: ${options.output}`);
  return options;
}

function maybeFilterObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function resolveDomainFilter(options) {
  if (options.domainAllow && options.domainDeny) {
    throw new Error("Use either --domain-allow or --domain-deny, not both");
  }
  if (options.domainAllow) return options.domainAllow;
  if (options.domainDeny) {
    return options.domainDeny.map((domain) => `-${domain}`);
  }
  return undefined;
}

export function buildSearchPayload(options) {
  return maybeFilterObject({
    query: options.query,
    max_results: options.maxResults,
    max_tokens_per_page: options.maxTokensPerPage,
    search_domain_filter: resolveDomainFilter(options),
    search_language_filter: options.lang ? [options.lang] : undefined,
    search_recency_filter: options.recency,
    search_after_date_filter: options.afterDate,
    search_before_date_filter: options.beforeDate,
    search_mode: options.searchMode,
  });
}

export function buildAskPayload(options) {
  return maybeFilterObject({
    model: options.model || "sonar-pro",
    messages: [
      { role: "system", content: "Be precise, provide citations, and avoid speculation." },
      { role: "user", content: options.query },
    ],
    search_domain_filter: resolveDomainFilter(options),
    search_language_filter: options.lang ? [options.lang] : undefined,
    search_recency_filter: options.recency,
    search_after_date_filter: options.afterDate,
    search_before_date_filter: options.beforeDate,
    search_mode: options.searchMode,
  });
}

function truncateSnippet(snippet, maxChars) {
  if (!snippet) return "";
  if (snippet.length <= maxChars) return snippet;
  return `${snippet.slice(0, maxChars)}...`;
}

export function shapeSearchOutput(response, options) {
  const results = Array.isArray(response.results) ? response.results : [];

  if (options.output === "full") return response;
  if (options.output === "urls") {
    return results
      .map((result) => result.url)
      .filter(Boolean)
      .join("\n");
  }

  return {
    results: results.map((result) => ({
      title: result.title || "",
      url: result.url || "",
      snippet: truncateSnippet(result.snippet || "", options.snippetChars),
    })),
  };
}

export function shapeAskOutput(response, options) {
  const answer = response?.choices?.[0]?.message?.content || "";
  const citations = Array.isArray(response?.citations) ? response.citations : [];
  const searchResults = Array.isArray(response?.search_results) ? response.search_results : [];

  if (options.output === "full") return response;
  if (options.output === "urls") {
    return citations.join("\n");
  }

  return {
    answer,
    citations,
    search_results: searchResults.map((result) => ({
      title: result.title || "",
      url: result.url || "",
      snippet: truncateSnippet(result.snippet || "", options.snippetChars),
    })),
  };
}

export function parseErrorBody(rawBody) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody.slice(0, 800) };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestWithRetry({ endpoint, payload, apiKey, timeoutMs, retries = 3 }) {
  const url = `https://api.perplexity.ai${endpoint}`;
  let attempt = 0;
  let delayMs = 1000;
  let lastError;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const rawBody = await response.text();
      clearTimeout(timeout);

      if (response.ok) {
        if (!rawBody) throw new Error("Empty response from Perplexity API");
        return JSON.parse(rawBody);
      }

      const parsedError = parseErrorBody(rawBody);
      const message = parsedError?.error?.message || parsedError?.message || parsedError?.raw || "Unknown API error";

      if (response.status === 429 && attempt < retries) {
        await sleep(delayMs);
        attempt += 1;
        delayMs *= 2;
        continue;
      }

      throw new Error(`API Error (${response.status}): ${message}`);
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      } else {
        lastError = error;
      }
      if (attempt >= retries) break;
      await sleep(delayMs);
      attempt += 1;
      delayMs *= 2;
    }
  }

  throw lastError || new Error("Request failed");
}

function printHelp() {
  const helpText = `Perplexity OpenClaw Search

Usage:
  ./search.js <query> [options]

Modes:
  --mode search|ask          search (default) uses /search, ask uses /chat/completions
  --model <model>            model for ask mode (default: sonar-pro)

Search options:
  -n, --max-results <n>      max results (default: 5)
  --recency <value>          hour|day|week|month|year
  --lang <code>              language code, e.g. en
  --domain-allow <list>      comma-separated domains to include
  --domain-deny <list>       comma-separated domains to exclude
  --after-date <MM/DD/YYYY>  include results after date
  --before-date <MM/DD/YYYY> include results before date
  --search-mode <mode>       web|academic|sec
  --timeout <ms>             request timeout in ms (default: 30000)

Output options:
  --compact                  compact JSON output (default)
  --urls                     urls only
  --full                     full API response JSON
  --snippet-chars <n>        max snippet size in compact mode (default: 500)
`;
  console.log(helpText);
}

export async function runCli(argv = process.argv.slice(2)) {
  loadDotEnv();
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }
  if (!options.query) {
    throw new Error("Missing query. Usage: ./search.js <query> [options]");
  }

  const apiKey = process.env.PERPLEXITY_API_KEY || process.env.PPLX_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY or PPLX_API_KEY not found in environment or .env file");
  }

  const endpoint = options.mode === "ask" ? "/chat/completions" : "/search";
  const payload = options.mode === "ask" ? buildAskPayload(options) : buildSearchPayload(options);
  const response = await requestWithRetry({
    endpoint,
    payload,
    apiKey,
    timeoutMs: options.timeoutMs,
  });

  const shaped = options.mode === "ask" ? shapeAskOutput(response, options) : shapeSearchOutput(response, options);

  if (typeof shaped === "string") {
    console.log(shaped);
    return;
  }
  console.log(JSON.stringify(shaped, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}
