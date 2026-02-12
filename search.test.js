import test from "node:test";
import assert from "node:assert/strict";

import {
  parseArgs,
  parseEnvContent,
  buildSearchPayload,
  buildAskPayload,
  shapeSearchOutput,
  shapeAskOutput,
  parseErrorBody,
} from "./search.js";

test("parseArgs parses query and common flags", () => {
  const args = parseArgs([
    "latest ai news",
    "-n",
    "10",
    "--recency",
    "week",
    "--lang",
    "en",
    "--domain-allow",
    "reuters.com,apnews.com",
    "--compact",
  ]);

  assert.equal(args.query, "latest ai news");
  assert.equal(args.maxResults, 10);
  assert.equal(args.recency, "week");
  assert.equal(args.lang, "en");
  assert.deepEqual(args.domainAllow, ["reuters.com", "apnews.com"]);
  assert.equal(args.output, "compact");
});

test("parseArgs supports urls output mode", () => {
  const args = parseArgs(["best destinations", "--urls"]);
  assert.equal(args.output, "urls");
});

test("parseArgs validates recency values", () => {
  assert.throws(() => parseArgs(["query", "--recency", "decade"]), /Invalid --recency/);
});

test("parseArgs validates mode values", () => {
  assert.throws(() => parseArgs(["query", "--mode", "invalid"]), /Invalid --mode/);
});

test("parseEnvContent supports export syntax, quotes, comments, CRLF", () => {
  const env = parseEnvContent(
    [
      "export PERPLEXITY_API_KEY=\"pplx-abc123\"  # comment",
      "PPLX_API_KEY='pplx-fallback'",
      "EMPTY=",
      "# comment only",
      "",
    ].join("\r\n"),
  );

  assert.equal(env.PERPLEXITY_API_KEY, "pplx-abc123");
  assert.equal(env.PPLX_API_KEY, "pplx-fallback");
  assert.equal(env.EMPTY, "");
});

test("buildSearchPayload maps filters correctly", () => {
  const payload = buildSearchPayload({
    query: "ai developments",
    maxResults: 7,
    recency: "day",
    lang: "en",
    domainAllow: ["nih.gov", "who.int"],
    afterDate: "01/01/2025",
    beforeDate: "12/31/2025",
    searchMode: "web",
  });

  assert.equal(payload.query, "ai developments");
  assert.equal(payload.max_results, 7);
  assert.equal(payload.search_recency_filter, "day");
  assert.deepEqual(payload.search_language_filter, ["en"]);
  assert.deepEqual(payload.search_domain_filter, ["nih.gov", "who.int"]);
  assert.equal(payload.search_after_date_filter, "01/01/2025");
  assert.equal(payload.search_before_date_filter, "12/31/2025");
});

test("buildAskPayload builds chat completion payload", () => {
  const payload = buildAskPayload({
    query: "summarize AI trends",
    model: "sonar-pro",
    recency: "month",
    lang: "en",
  });

  assert.equal(payload.model, "sonar-pro");
  assert.equal(payload.messages[1].content, "summarize AI trends");
  assert.equal(payload.search_recency_filter, "month");
  assert.deepEqual(payload.search_language_filter, ["en"]);
});

test("shapeSearchOutput returns compact result object", () => {
  const apiResponse = {
    results: [
      { title: "One", url: "https://a.com", snippet: "A", date: "x" },
      { title: "Two", url: "https://b.com", snippet: "B" },
    ],
  };
  const shaped = shapeSearchOutput(apiResponse, { output: "compact", snippetChars: 1 });
  assert.deepEqual(shaped.results, [
    { title: "One", url: "https://a.com", snippet: "A" },
    { title: "Two", url: "https://b.com", snippet: "B" },
  ]);
});

test("shapeAskOutput returns answer and citations in compact mode", () => {
  const response = {
    choices: [{ message: { content: "Here is the answer." } }],
    citations: ["https://a.com"],
  };
  const shaped = shapeAskOutput(response, { output: "compact" });
  assert.equal(shaped.answer, "Here is the answer.");
  assert.deepEqual(shaped.citations, ["https://a.com"]);
});

test("parseErrorBody handles non-json text", () => {
  const parsed = parseErrorBody("Internal Server Error");
  assert.deepEqual(parsed, { raw: "Internal Server Error" });
});
