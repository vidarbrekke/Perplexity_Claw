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

Update your OpenClaw config (`~/.openclaw/openclaw.json`) to enable Perplexity as the search provider:

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

Note: OpenClaw will read `PERPLEXITY_API_KEY` from your environment automatically. Do not commit your API key to the config file.

### 4. Restart OpenClaw

```bash
openclaw gateway restart
```

## Testing

Once configured, test by asking your agent to search:

> Search for "latest AI developments 2025"

The agent will now use Perplexity's sonar-pro model instead of Brave Search.

## CLI Usage (Manual Testing)

If you want to test the search script directly:

```bash
cd /Users/vidarbrekke/Dev/perplexity_claw

# Basic search (5 results, JSON output)
./search.js "what is artificial intelligence"

# More results
./search.js "latest AI news 2025" -n 10

# Show URLs only
./search.js "best travel destinations" --url
```

## Models

Perplexity offers different models. To use a specific model, update your OpenClaw config:

```json
{
  "tools": {
    "web": {
      "search": {
        "perplexity": {
          "model": "sonar"
        }
      }
    }
  }
}
```

Available models:

- **sonar** — Balanced speed and quality
- **sonar-pro** — Higher quality responses (default)

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
- `package.json` — Node.js package metadata
- `SKILL.md` — OpenClaw skill documentation
- `INSTALL.md` — This file
- `README.md` — Quick reference

### Making Changes

1. Edit `search.js` as needed
2. Test locally: `./search.js "test query"`
3. Commit changes:

```bash
cd /Users/vidarbrekke/Dev/perplexity_claw
git add .
git commit -m "Update Perplexity integration"
```

## License

MIT

## Support

- For issues with Perplexity API, visit [perplexity.ai/help](https://perplexity.ai/help)
- For OpenClaw questions, see [docs.openclaw.ai](https://docs.openclaw.ai)
