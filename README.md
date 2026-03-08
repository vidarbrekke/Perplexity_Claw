# Perplexity OpenClaw Integration

Replace Brave Search with Perplexity-powered search in OpenClaw.

## Quick Start

1. **Get API Key:** [perplexity.ai](https://perplexity.ai) → Settings → API Keys
2. **Set Environment:** `export PERPLEXITY_API_KEY="pplx-xxx"`
3. **Configure OpenClaw:** `npm run install:openclaw` (or see [INSTALL.md](INSTALL.md))
4. (Optional) **Align OpenRouter runtime state immediately:** set `OPENROUTER_API_KEY` (or `OPENROUTER_KEY`) for OpenRouter auth/model sync and run `npm run install:openclaw -- --sync-runtime`
5. **Restart:** `openclaw gateway restart` (if not already done in the recommended post-install sequence above)

### Runtime alignment (OpenRouter model + auth)

If you switch workspaces or machines and want to keep OpenClaw agent runtime aligned, run:

```bash
export OPENROUTER_API_KEY="sk-or-..."
# or:
# export OPENROUTER_KEY="sk-or-..."
npm run openclaw:runtime-sync -- --sync-model --sync-sessions
```

That command updates:
- `~/.openclaw/agents/*/agent/auth-profiles.json` (`openrouter:default` profile key + usage state reset)
- `~/.openclaw/openclaw.json` (`agents.defaults.model.primary` to `router`, fallback list to `[]`, and alias mapping)
- `~/.openclaw/agents/main/sessions/sessions.json` (`agent:main:main` model fields)

## What's Included

- `search.js` — CLI search tool using Perplexity API
- `package.json` — Node.js package metadata
- `install.js` — OpenClaw config installer (`npm run install:openclaw`)
- `SKILL.md` — OpenClaw skill documentation
- `INSTALL.md` — Full setup instructions

The repo includes a `.gitignore` so `.env` (API key) is not committed. Include it in any distribution archive.

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
