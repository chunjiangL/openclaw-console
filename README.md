# Claw Console

A standalone web dashboard for [OpenClaw](https://github.com/openclaw/openclaw). Connects to the OpenClaw gateway over WebSocket


## Features

- **Agent Dashboard** — view agent status, configuration, sessions, tools, skills, cron jobs, and channels
- **Multi-Agent Group Chat** — chat with multiple agents in parallel or sequential mode with context sharing

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (localhost only)
npm run dev

# Open http://localhost:3000
```


## CLI

The included CLI provides access modes for different network setups:

```bash
# Install globally (optional)
npm link

# Localhost only (default)
claw-console

# Tailscale
claw-console lan

# All connections
claw-console all

# Custom port
claw-console lan -p 8080

claw-console --dev

claw-console --build
```

### Access Modes

| Mode | Binds to | Allowed IPs |
|------|----------|-------------|
| `local` | `127.0.0.1` | Localhost only |
| `lan` | `0.0.0.0` | Localhost + Tailscale IPs (`100.64.0.0/10`) |
| `all` | `0.0.0.0` | No restrictions |

## Tailscale Setup

To access Claw Console from devices on your Tailscale network:

### 1. Start the console in LAN mode

```bash
claw-console lan
# or
npm run dev:lan
```

### 2. Expose via Tailscale Serve

Use `tailscale serve` to proxy HTTPS traffic to your local console:

```bash
tailscale serve --bg --https=3443 http://127.0.0.1:3000
```

### 3. Configure the gateway

The OpenClaw gateway also needs to allow connections from the console's origin. Add the console's URL to the gateway's allowed origins in `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://<your-hostname>.ts.net:3443"
      ]
    }
  }
}
```

If the gateway also runs on the same machine, expose it via Tailscale Serve too:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:18789
```

### 4. Auto-discovery

When accessing the console from a Tailscale IP, the server-side API route (`/api/gateway-info`) automatically discovers the gateway URL by running `tailscale status --json`. No manual URL entry needed.


## Architecture

```
src/
├── app/                    # Next.js pages + API routes
├── components/
│   ├── agents/             # Agent detail views (overview, sessions, tools, skills, cron, channels)
│   ├── chat/               # Group chat + chat test
│   ├── layout/             # App shell, sidebar, header, connection dialog
│   └── ui/                 # Shared UI components (avatars, spinner)
├── lib/
│   ├── gateway/            # WebSocket client, types, device identity
│   ├── stores/             # Zustand stores (gateway, chat, group)
│   ├── event-bus.ts        # Typed pub/sub for cross-store events
│   └── router.ts           # Client-side hash router
└── middleware.ts            # Access control (IP filtering)
```

## License

ISC
