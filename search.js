#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_TOKENS_PER_PAGE = 2000;
const RECENCY_VALUES = new Set(["hour", "day", "week", "month", "year"]);
const MODE_VALUES = new Set(["search", "ask"]);
const SEARCH_MODE_VALUES = new Set(["web", "academic", "sec"]);
const OUTPUT_VALUES = new Set(["compact", "urls", "full", "jsonl"]);
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const FLAG_CONFIG = {
  "-n": { key: "maxResults", type: "int" },
  "--max-results": { key: "maxResults", type: "int" },
  "--max-tokens": { key: "maxTokens", type: "int" },
  "--max-tokens-per-page": { key: "maxTokensPerPage", type: "int" },
  "--timeout": { key: "timeoutMs", type: "int" },
  "--snippet-chars": { key: "snippetChars", type: "int" },
  "--mode": { key: "mode", type: "enum", values: MODE_VALUES },
  "--recency": { key: "recency", type: "enum", values: RECENCY_VALUES },
  "--search-mode": { key: "searchMode", type: "enum", values: SEARCH_MODE_VALUES },
  "--lang": { key: "lang", type: "string" },
  "--model": { key: "model", type: "string" },
  "--after-date": { key: "afterDate", type: "date" },
  "--before-date": { key: "beforeDate", type: "date" },
  "--domain-allow": { key: "domainAllow", type: "csv" },
  "--domain-deny": { key: "domainDeny", type: "csv" },
  "--temperature": { key: "temperature", type: "float" },
  "--top-p": { key: "topP", type: "float" },
  "--return-related-questions": { key: "returnRelatedQuestions", value: true },
  "--return-images": { key: "returnImages", value: true },
  "--enable-search-classifier": { key: "enableSearchClassifier", value: true },
  "--disable-search": { key: "disableSearch", value: true },
  "--compact": { key: "output", value: "compact" },
  "--urls": { key: "output", value: "urls" },
  "--urls-only": { key: "output", value: "urls" },
  "--url": { key: "output", value: "urls" },
  "--jsonl": { key: "output", value: "jsonl" },
  "--full": { key: "output", value: "full" },
  "--help": { key: "help", value: true },
  "-h": { key: "help", value: true },
};

function trimQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
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
    if (char === '"' && !inSingle) inDouble = !inDouble;
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

function parseFloatFlag(value, name) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

function normalizeDate(value, name) {
  const mmddyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;

  if (mmddyyyy.test(value)) {
    return value;
  }

  const isoMatch = value.match(iso);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}/${day}/${year}`;
  }

  throw new Error(`Invalid ${name}: ${value}. Use MM/DD/YYYY or YYYY-MM-DD`);
}

function parseRetryAfterMs(retryAfterHeader) {
  if (!retryAfterHeader) return null;

  const seconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isInteger(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateValue = Date.parse(retryAfterHeader);
  if (!Number.isNaN(dateValue)) {
    const diff = dateValue - Date.now();
    return diff > 0 ? diff : 0;
  }

  return null;
}

function shouldRetryError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  if (error.name === "TypeError") return true;

  const code = error.code || error.cause?.code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "EAI_AGAIN";
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
    maxTokensPerPage: DEFAULT_MAX_TOKENS_PER_PAGE,
    snippetChars: 500,
  };

  const queryParts = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    const config = FLAG_CONFIG[token];

    if (config) {
      if (config.value !== undefined) {
        options[config.key] = config.value;
      } else {
        const value = requireValue(args, i, token);
        i += 1;

        if (config.type === "int") {
          options[config.key] = parseIntFlag(value, token);
        } else if (config.type === "float") {
          options[config.key] = parseFloatFlag(value, token);
        } else if (config.type === "csv") {
          options[config.key] = parseCsv(value);
        } else if (config.type === "date") {
          options[config.key] = normalizeDate(value, token);
        } else if (config.type === "enum") {
          if (!config.values.has(value)) {
            throw new Error(`Invalid ${token}: ${value}`);
          }
          options[config.key] = value;
        } else {
          options[config.key] = value;
        }
      }
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown flag: ${token}`);
    }

    queryParts.push(token);
  }

  if (options.topP !== undefined && (options.topP <= 0 || options.topP > 1)) {
    throw new Error("--top-p must be > 0 and <= 1");
  }
  if (options.temperature !== undefined && options.temperature < 0) {
    throw new Error("--temperature must be >= 0");
  }

  options.query = queryParts.join(" ").trim();
  if (!OUTPUT_VALUES.has(options.output)) {
    throw new Error(`Invalid output mode: ${options.output}`);
  }
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

function getSearchApiFilters(options) {
  return {
    search_domain_filter: resolveDomainFilter(options),
    search_language_filter: options.lang ? [options.lang] : undefined,
    search_recency_filter: options.recency,
    search_after_date_filter: options.afterDate,
    search_before_date_filter: options.beforeDate,
  };
}

function getChatFilters(options) {
  return {
    ...getSearchApiFilters(options),
    search_mode: options.searchMode,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    top_p: options.topP,
    return_related_questions: options.returnRelatedQuestions,
    return_images: options.returnImages,
    enable_search_classifier: options.enableSearchClassifier,
    disable_search: options.disableSearch,
  };
}

export function buildSearchPayload(options) {
  return maybeFilterObject({
    query: options.query,
    max_results: options.maxResults,
    max_tokens_per_page: options.maxTokensPerPage,
    max_tokens: options.maxTokens,
    ...getSearchApiFilters(options),
  });
}

export function buildAskPayload(options) {
  return maybeFilterObject({
    model: options.model || "sonar-pro",
    messages: [
      { role: "system", content: "Be precise, provide citations, and avoid speculation." },
      { role: "user", content: options.query },
    ],
    ...getChatFilters(options),
  });
}

function truncateSnippet(snippet, maxChars) {
  if (!snippet) return "";
  if (snippet.length <= maxChars) return snippet;
  return `${snippet.slice(0, maxChars)}...`;
}

function compactResult(result, snippetChars) {
  return {
    title: result.title || "",
    url: result.url || "",
    snippet: truncateSnippet(result.snippet || "", snippetChars),
  };
}

function dedupeStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
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
  if (options.output === "jsonl") {
    return results
      .map((result) => JSON.stringify(compactResult(result, options.snippetChars)))
      .join("\n");
  }

  return {
    results: results.map((result) => compactResult(result, options.snippetChars)),
  };
}

export function shapeAskOutput(response, options) {
  const answer = response?.choices?.[0]?.message?.content || "";
  const citations = Array.isArray(response?.citations) ? response.citations : [];
  const searchResults = Array.isArray(response?.search_results) ? response.search_results : [];

  if (options.output === "full") return response;
  if (options.output === "urls") {
    const urls = dedupeStrings([...searchResults.map((result) => result.url), ...citations]);
    return urls.join("\n");
  }
  if (options.output === "jsonl") {
    return searchResults
      .map((result) => JSON.stringify(compactResult(result, options.snippetChars)))
      .join("\n");
  }

  return {
    answer,
    citations,
    search_results: searchResults.map((result) => compactResult(result, options.snippetChars)),
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

      if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        await sleep(retryAfterMs ?? delayMs);
        attempt += 1;
        if (retryAfterMs === null) {
          delayMs *= 2;
        }
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

      if (!shouldRetryError(error) || attempt >= retries) {
        break;
      }

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
  --mode search|ask                   search (default) or ask (chat completions)
  --model <model>                     model for ask mode (default: sonar-pro)

Search options:
  -n, --max-results <n>               max results (default: 5)
  --max-tokens <n>                    total tokens budget
  --max-tokens-per-page <n>           search mode page extraction budget (default: 2000)
  --recency <value>                   hour|day|week|month|year
  --lang <code>                       language code, e.g. en
  --domain-allow <list>               comma-separated domains to include
  --domain-deny <list>                comma-separated domains to exclude
  --after-date <date>                 MM/DD/YYYY or YYYY-MM-DD
  --before-date <date>                MM/DD/YYYY or YYYY-MM-DD
  --search-mode <mode>                ask mode only: web|academic|sec
  --timeout <ms>                      request timeout in ms (default: 30000)

Ask mode options:
  --temperature <n>
  --top-p <n>
  --return-related-questions
  --return-images
  --enable-search-classifier
  --disable-search

Output options:
  --compact                           compact JSON output (default)
  --urls                              URLs only
  --jsonl                             newline-delimited compact records
  --full                              full API response JSON
  --snippet-chars <n>                 max snippet size in compact/jsonl mode (default: 500)
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
