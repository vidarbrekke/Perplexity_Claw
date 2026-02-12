# Perplexity Search Skill

Perplexity integration for OpenClaw with two CLI modes:

- `search` mode: `POST /search` for structured web results
- `ask` mode: `POST /chat/completions` (`sonar-pro`) for synthesized answers with citations

Setup and installer details live in `INSTALL.md`.

## Usage

```bash
# Search mode (default)
./search.js "latest AI policy updates" -n 8 --recency week --compact

# Ask mode
./search.js "summarize latest AI regulation in EU and US" --mode ask

# URLs only
./search.js "best travel destinations" --urls
```

## Key Flags

- `--mode search|ask`
- `-n, --max-results <n>`
- `--max-tokens <n>`
- `--recency hour|day|week|month|year`
- `--lang <code>`
- `--domain-allow domain1,domain2` (API filter)
- `--domain-deny domain1,domain2` (client-side post-filter)
- `--after-date <MM/DD/YYYY|YYYY-MM-DD>`
- `--before-date <MM/DD/YYYY|YYYY-MM-DD>`
- `--search-mode web|academic|sec` (ask mode)
- `--temperature <n>`, `--top-p <n>` (ask mode)
- `--return-related-questions`, `--return-images` (ask mode)
- `--enable-search-classifier`, `--disable-search` (ask mode)
- `--compact` (default), `--urls`, `--jsonl`, `--full`

## Output Contract

### Search mode (`--mode search`)

- `--compact`: `{ "results": [{ "title": "...", "url": "...", "snippet": "..." }] }`
- `--urls`: newline-delimited URLs
- `--jsonl`: one compact result JSON per line
- `--full`: raw Search API response

### Ask mode (`--mode ask`)

- `--compact`: `{ "answer": "...", "citations": [...], "search_results": [...] }`
- `--urls`: newline-delimited deduped URLs (`search_results` first, then citations)
- `--jsonl`: first line `{ "answer": "...", "citations": [...] }`, remaining lines are compact `search_results`
- `--full`: raw Chat Completions response

## Mode Selection Note

OpenClaw does not automatically get dual-mode behavior just because both modes exist in `search.js`.
Your tool wiring determines behavior:

- If your command only invokes default mode, you get search mode.
- To use ask mode, wire a path that passes `--mode ask`.
