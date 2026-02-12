# Perplexity OpenClaw Integration

Replace Brave Search with Perplexity's `sonar-pro` model in OpenClaw.

## Quick Start

1. **Get API Key:** [perplexity.ai](https://perplexity.ai) → Settings → API Keys
2. **Set Environment:** `export PERPLEXITY_API_KEY="pplx-xxx"`
3. **Configure OpenClaw:** See [INSTALL.md](INSTALL.md)
4. **Restart:** `openclaw gateway restart`

## What's Included

- `search.js` — CLI search tool using Perplexity API
- `package.json` — Node.js package metadata
- `SKILL.md` — OpenClaw skill documentation
- `INSTALL.md` — Full setup instructions
- `.gitignore` — Git ignore patterns

## Testing

```bash
./search.js "latest AI news"
./search.js "best travel destinations" -n 10 --url
```

## Configuration

OpenClaw automatically reads `PERPLEXITY_API_KEY` from your environment. For detailed setup, see [INSTALL.md](INSTALL.md).

## How It Works

Once configured, OpenClaw's `web_search` tool uses Perplexity's API instead of Brave Search. Agents can search naturally:

- **You:** "Search for the latest developments in AI"
- **Agent:** [calls web_search via Perplexity sonar-pro]
- **Agent:** "Based on my search, here's what I found..."

## API Details

- **Endpoint:** https://api.perplexity.ai/search
- **Model:** sonar-pro (configurable)
- **Results:** Up to 20 per query
- **Auth:** Bearer token via `PERPLEXITY_API_KEY` env var

## License

MIT
