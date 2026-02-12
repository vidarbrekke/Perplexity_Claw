# Perplexity OpenClaw Integration

This package integrates Perplexity API as the default search engine for OpenClaw, replacing Brave Search.

## Prerequisites

- OpenClaw gateway running
- Perplexity API key from [perplexity.ai](https://perplexity.ai)
- Node.js v18+

## Installation

### 1. Get Your Perplexity API Key

1. Go to [perplexity.ai](https://perplexity.ai)
2. Sign in or create an account
3. Navigate to **Settings → API Keys**
4. Generate a new API key
5. Copy the key (format: `pplx-xxxxxxxxxxxxxxxxxxxxxxxx`)

### 2. Set Environment Variable

Add your API key to your shell profile (`.bashrc`, `.zshrc`, etc.):

```bash
export PERPLEXITY_API_KEY="pplx-your-key-here"
```

Then reload your shell:

```bash
source ~/.zshrc  # or ~/.bashrc for bash
```

### 3. Configure OpenClaw

Use the installer to patch your OpenClaw config automatically. From the project directory (where you cloned this repo):

```bash
npm run install:openclaw
```

Optional installer flags:

```bash
# Preview without writing
npm run install:openclaw -- --dry-run

# Custom model / max results
npm run install:openclaw -- --model sonar --max-results 8

# Custom config path
npm run install:openclaw -- --config ~/.openclaw/openclaw.json
```

What the installer does:

- Enables `tools.web.search`
- Sets `provider: "perplexity"`
- Sets `maxResults` and `perplexity.model`
- Ensures at least one agent can use `web_search`
- Configures provider-level search settings only (ask mode requires explicit tool wiring)
- Creates a timestamped backup before writing if config exists

Upgrade behavior:

- The installer is idempotent and safe to run on existing installations.
- It updates only the required Perplexity search fields and preserves unrelated config sections.

Manual fallback (if you prefer editing by hand):

```json
{
  "tools": {
    "web": {
      "search": {
        "enabled": true,
        "provider": "perplexity",
        "maxResults": 5,
        "perplexity": {
          "model": "sonar-pro"
        }
      }
    }
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "allow": ["web_search"]
        }
      }
    ]
  }
}
```

Note: OpenClaw reads `PERPLEXITY_API_KEY` from your environment automatically. Do not commit your API key to any config file.

### 4. Restart OpenClaw

```bash
openclaw gateway restart
```

## Testing

Once configured, test by asking your agent to search:

> Search for "latest AI developments 2025"

The integration supports two modes:

- `search` mode (`/search`) for structured web results
- `ask` mode (`/chat/completions` with `sonar-pro`) for synthesized answers with citations

Important: the installer configures OpenClaw web search provider settings. Whether your agent automatically switches between modes depends on your tool wiring. If your current tool command only calls search mode, add an explicit ask-mode tool path (`--mode ask`) for synthesized responses.

## CLI Usage (Manual Testing)

If you want to test the search script directly, run these from the project directory:

```bash
# Search mode (default): structured output from /search
./search.js "what is artificial intelligence"

# More results
./search.js "latest AI news 2025" -n 10

# Recency + language + domain filter
./search.js "ai regulation updates" --recency week --lang en --domain-allow reuters.com,ft.com

# Show URLs only
./search.js "best travel destinations" --urls

# Ask mode (sonar-pro synthesis + citations)
./search.js "summarize latest breakthroughs in battery technology" --mode ask

# Full raw API response
./search.js "open source LLM benchmarks" --full
```

## Models

Perplexity model selection applies to **ask mode** (`/chat/completions`). Search mode does not use a model parameter.

To choose a different model in ask mode:

```bash
./search.js "your question" --mode ask --model sonar
```

If OpenClaw exposes model configuration in your environment, you can set that there as well.

### Available ask models

- **sonar** — Balanced speed and quality
- **sonar-pro** — Higher quality responses (default)

### Example OpenClaw config

Use provider-level config for defaults, then allow the agent to pass filters at runtime:

```json
{
  "tools": {
    "web": {
      "search": {
        "enabled": true,
        "provider": "perplexity",
        "maxResults": 5,
        "perplexity": {
          "model": "sonar-pro"
        }
      }
    }
  }
}
```

## Troubleshooting

### "PERPLEXITY_API_KEY not found"

Make sure your environment variable is set:

```bash
echo $PERPLEXITY_API_KEY
```

If empty, add to your shell profile and reload:

```bash
source ~/.zshrc
```

### "API Error 401"

Your API key is invalid or expired. Check:

- Key format (should start with `pplx-`)
- Key is active in your Perplexity account
- No accidental spaces/newlines in the key

### "Empty response from Perplexity API"

- Check internet connection
- Verify API endpoint is accessible
- Check Perplexity service status

## Development

### Structure

- `search.js` — CLI search script
- `search.test.js` — Unit tests (Node test runner)
- `package.json` — Node.js package metadata
- `SKILL.md` — OpenClaw skill documentation
- `INSTALL.md` — This file
- `README.md` — Quick reference

### Making Changes

1. Edit `search.js` as needed
2. Run tests: `npm test`
3. Test locally: `./search.js "test query"`
4. Commit changes (from the project directory):

```bash
git add .
git commit -m "Update Perplexity integration"
```

## License

MIT

## Support

- For issues with Perplexity API, visit [perplexity.ai/help](https://perplexity.ai/help)
- For OpenClaw questions, see [docs.openclaw.ai](https://docs.openclaw.ai)
