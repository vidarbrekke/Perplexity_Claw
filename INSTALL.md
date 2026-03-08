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

# Make Perplexity the only web search (disables Brave for all agents)
npm run install:openclaw -- --perplexity-only

# Custom model / max results
npm run install:openclaw -- --model sonar --max-results 8

# Custom config path
npm run install:openclaw -- --config ~/.openclaw/openclaw.json

# Store API key in config (use if gateway does not see PERPLEXITY_API_KEY in its environment)
npm run install:openclaw -- --set-api-key-from-env

# Align OpenRouter runtime after install (model defaults + session cache + auth profile key)
npm run install:openclaw -- --sync-runtime
```

Recommended post-install sequence (single pass):

```bash
# Use either OPENROUTER_API_KEY or OPENROUTER_KEY
export OPENROUTER_API_KEY="sk-or-..."
export PERPLEXITY_API_KEY="pplx-..."
npm run install:openclaw -- --set-api-key-from-env --sync-runtime
openclaw gateway restart
```

Use `--perplexity-only` when you want all web search to go through Perplexity: it adds `brave_search` to every agent's `tools.deny` and disables `tools.brave` if present. Run it only if you explicitly approve that change.

The installer also writes the MCP-style command contract file automatically to:
`~/.openclaw/skills/perplexity-search/skill-command-definitions.json`.
Override this destination with `--command-definitions-path`.

What the installer does:

- Enables `tools.web.search` and sets `provider: "perplexity"`
- Sets `maxResults` and `perplexity.model`
- Adds `web_search` to the agent's `tools.alsoAllow` (extends defaults, never restricts)
- Creates a timestamped backup before writing if config exists
- **Migrates** any existing `tools.allow` whitelist to `tools.alsoAllow` so default tools (exec, read, write, browser, etc.) are not blocked

> **Important: `allow` vs `alsoAllow`**
>
> In OpenClaw, `agents.list[].tools.allow` is a **whitelist** — when set, the agent can *only* use the tools listed there. All other tools (exec, read, write, browser, etc.) are blocked.
>
> `tools.alsoAllow` **adds** to the default tool set without replacing it. The installer uses `alsoAllow` so your agent keeps all its default capabilities plus `web_search`.

With `--perplexity-only` (user-approved):

- Adds `brave_search` to every agent's `tools.deny` so it won't be used
- Sets `tools.brave.enabled` to `false` if that section exists

Upgrade behavior:

- The installer is idempotent and safe to run on existing installations.
- It updates only the required Perplexity search fields and preserves unrelated config sections.
- If a previous version set `tools.allow`, the installer migrates it to `alsoAllow` automatically.

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
          "alsoAllow": ["web_search"]
        }
      }
    ]
  }
}
```

Note: OpenClaw uses `PERPLEXITY_API_KEY` from the **gateway process** environment, or `tools.web.search.perplexity.apiKey` in config. Do not commit your API key to version control.

### 4. Restart OpenClaw (if not already done in the sequence above)

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

### 5. Linode/server deploy automation

This repository includes `deploy.sh`, which updates the repo on the target host, runs the installer, restarts the gateway, and now refreshes OpenClaw skill metadata automatically.

From your local machine (or server):

```bash
# Target the default Linode path
./deploy.sh /root/openclaw-stock-home/.openclaw/workspace/repositories/perplexity-claw
```

Useful deploy env flags (optional):

```bash
INSTALL_OPENCLAW=1            # run npm run install:openclaw
RESTART_GATEWAY=1             # restart gateway after install
REFRESH_SKILL_METADATA=1      # run `openclaw skills check` to refresh tool metadata cache
```

Disable metadata refresh only if you intentionally want to skip it:

```bash
REFRESH_SKILL_METADATA=0 ./deploy.sh /root/openclaw-stock-home/.openclaw/workspace/repositories/perplexity-claw
```

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

### "No tools available" or tools missing after configuration

If the gateway shows no (or fewer) tools after configuring Perplexity:

1. **Check for `tools.allow` whitelist (most common cause)**
   If your agent config has `tools.allow`, it acts as a **whitelist** that blocks all unlisted tools. Run the installer again to migrate it to `alsoAllow`:
   ```bash
   npm run install:openclaw
   ```
   Or manually edit `~/.openclaw/openclaw.json` and change `"allow"` to `"alsoAllow"` under `agents.list[].tools`.

2. **Full gateway restart**
   The gateway reads `~/.openclaw/openclaw.json` at startup. Restart so it reloads config:
   ```bash
   openclaw gateway stop
   openclaw gateway start
   ```
   If you use LaunchAgent: `launchctl kick -k gui/$(id -u)/com.openclaw.gateway` (or your plist name).

3. **Doctor**
   Run `openclaw doctor` to check config and services; use `openclaw doctor --fix` to apply suggested fixes.

### "web_search (perplexity) needs an API key" (gateway still fails after restart)

The gateway only sees environment variables from the process that **started** it. If it was started by LaunchAgent, a system service, or another terminal that didn’t have `PERPLEXITY_API_KEY` set, restarting from your current shell may still not give the gateway that variable.

**Fix: store the key in config** so the gateway reads it from the config file instead of env:

1. **Option A — Installer (recommended)**  
   From a shell where the key is set, run:
   ```bash
   export PERPLEXITY_API_KEY="pplx-your-key-here"   # or already in .zshrc and sourced
   npm run install:openclaw -- --set-api-key-from-env
   openclaw gateway restart
   ```
   This writes `tools.web.search.perplexity.apiKey` into `~/.openclaw/openclaw.json` from your current environment. The key is stored in plain text in that file; keep the file out of version control.

2. **Option B — Manual**  
   Edit `~/.openclaw/openclaw.json` and add `"apiKey": "pplx-your-key-here"` under `tools.web.search.perplexity`, then restart the gateway.

After either option, restart the gateway so it reloads the config.

### "openclaw agent uses wrong model or stale OpenRouter profile"

If `openclaw agent` unexpectedly routes through fallback models or throws `HTTP 401` for stale OpenRouter profile data, refresh the runtime runtime artifacts with:

```bash
export OPENROUTER_API_KEY="sk-or-..."
npm run openclaw:runtime-sync -- --sync-model --sync-sessions
```

This updates your in-profile cache and model defaults without changing repository code:
- `~/.openclaw/agents/*/agent/auth-profiles.json`
- `~/.openclaw/openclaw.json` (optional model defaults when `--sync-model` is set)
- `~/.openclaw/agents/main/sessions/sessions.json` (if `--sync-sessions` is set)

### "PERPLEXITY_API_KEY not found" (when running the CLI or installer)

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
