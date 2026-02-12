# Perplexity OpenClaw Integration

Replace Brave Search with Perplexity-powered search in OpenClaw.

## Quick Start

1. **Get API Key:** [perplexity.ai](https://perplexity.ai) → Settings → API Keys
2. **Set Environment:** `export PERPLEXITY_API_KEY="pplx-xxx"`
3. **Configure OpenClaw:** `npm run install:openclaw` (or see [INSTALL.md](INSTALL.md))
4. **Restart:** `openclaw gateway restart`

## What's Included

- `search.js` — CLI search tool using Perplexity API
- `package.json` — Node.js package metadata
- `SKILL.md` — OpenClaw skill documentation
- `INSTALL.md` — Full setup instructions
- `.gitignore` — Git ignore patterns

## Testing

```bash
# Search mode (default, /search endpoint)
./search.js "latest AI news" -n 10 --recency week --compact

# Ask mode (sonar-pro synthesis, /chat/completions endpoint)
./search.js "summarize the latest AI chip export policy changes" --mode ask

# URL-only output
./search.js "best travel destinations" --urls
```

## Configuration

OpenClaw automatically reads `PERPLEXITY_API_KEY` from your environment. For detailed setup, see [INSTALL.md](INSTALL.md).

## How It Works

The integration supports two dynamic modes:

- **Search mode (`--mode search`, default):** calls `https://api.perplexity.ai/search` and returns structured results.
- **Ask mode (`--mode ask`):** calls `https://api.perplexity.ai/chat/completions` with `sonar-pro` and returns synthesized answers with citations.

OpenClaw agents can choose filters and output format based on task needs:

- **You:** "Search for the latest developments in AI"
- **Agent:** [calls web_search in `search` mode with recency/domain filters]
- **Agent:** "Based on my search, here's what I found..."

## API Details

- **Search Endpoint:** `https://api.perplexity.ai/search`
- **Ask Endpoint:** `https://api.perplexity.ai/chat/completions`
- **Ask Model:** `sonar-pro` (configurable via `--model`)
- **Results:** Up to 20 per query in search mode (`--max-results`)
- **Filters:** recency, language, domain allow/deny, date range, search mode
- **Auth:** Bearer token via `PERPLEXITY_API_KEY` env var

## License

MIT
