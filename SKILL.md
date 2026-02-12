# Perplexity Search Skill

Integrated Perplexity support for OpenClaw with two modes:

- `search` mode: uses `POST /search` for fast structured web results
- `ask` mode: uses `POST /chat/completions` with `sonar-pro` for synthesized answers with citations

## Setup

Requires env: `PERPLEXITY_API_KEY` (or `PPLX_API_KEY`)

```bash
export PERPLEXITY_API_KEY="pplx-your-api-key"
```

## Usage

```bash
# Search mode (default): structured results
./search.js "latest AI policy updates" -n 8 --recency week --compact

# Ask mode: synthesized answer + citations via sonar-pro
./search.js "summarize latest AI regulation in EU and US" --mode ask

# URLs only output
./search.js "best travel destinations" --urls
```

## Flags

- `--mode search|ask`
- `-n, --max-results <n>`
- `--recency hour|day|week|month|year`
- `--lang <code>`
- `--domain-allow domain1,domain2` (API filter)
- `--domain-deny domain1,domain2` (client-side: results filtered after response)
- `--after-date MM/DD/YYYY`
- `--before-date MM/DD/YYYY`
- `--search-mode web|academic|sec`
- `--compact` (default output)
- `--urls` / `--urls-only` / `--url`
- `--full`
- `--snippet-chars <n>`
- `--timeout <ms>`
- `--model <name>` (ask mode, default `sonar-pro`)

## Output Contract

### Search mode (`--mode search`)

- `--compact`:
  - `{ "results": [{ "title": "...", "url": "...", "snippet": "..." }] }`
- `--urls`:
  - newline-delimited URLs
- `--full`:
  - full raw Perplexity Search API response

### Ask mode (`--mode ask`)

- `--compact`:
  - `{ "answer": "...", "citations": ["..."], "search_results": [...] }`
- `--urls`:
  - newline-delimited citation URLs
- `--full`:
  - full raw Perplexity Chat Completions response

## When to Use

- Use `search` mode when the agent needs structured source data.
- Use `ask` mode when the agent needs a grounded written answer with citations.