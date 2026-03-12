# Claw Console

A standalone web dashboard for [OpenClaw](https://github.com/openclaw/openclaw). Connects to the OpenClaw gateway over WebSocket to provide agent management, multi-agent group chat, and real-time monitoring.

```
╔══════════════════════════════════════╗
║         CLAW CONSOLE                 ║
╚══════════════════════════════════════╝
```

## Features

- **Agent Dashboard** — view agent status, configuration, sessions, tools, skills, cron jobs, and channels
- **Multi-Agent Group Chat** — chat with multiple agents in parallel or sequential mode with context sharing
- **Real-Time Events** — live streaming of agent responses via WebSocket
- **Ed25519 Device Auth** — cryptographic device identity for secure gateway connections
- **Access Control** — middleware-based IP filtering (localhost / Tailscale / unrestricted)
- **Themes** — multiple DOS-inspired color themes

## Prerequisites

- **Node.js 22+**
- **OpenClaw gateway** running (default: `http://localhost:18789`)

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (localhost only)
npm run dev

# Open http://localhost:3000
```

On first visit, the connection dialog will ask for:
- **Gateway URL** — auto-detected on localhost (`http://localhost:18789`)
- **Auth Token** — the gateway auth token from your `~/.openclaw/openclaw.json` (`gateway.auth.token`)

## CLI

The included CLI provides access modes for different network setups:

```bash
# Install globally (optional)
npm link

# Localhost only (default, most secure)
claw-console

# Tailscale network — accessible from devices on your tailnet
claw-console lan

# All connections — no IP filtering
claw-console all

# Custom port
claw-console lan -p 8080

# Dev mode with hot reload
claw-console --dev

# Build for production
claw-console --build
```

### Access Modes

| Mode | Binds to | Allowed IPs |
|------|----------|-------------|
| `local` | `127.0.0.1` | Localhost only |
| `lan` | `0.0.0.0` | Localhost + Tailscale IPs (`100.64.0.0/10`) |
| `all` | `0.0.0.0` | No restrictions |

## Tailscale Setup

To access Claw Console from your phone or other devices on your Tailscale network:

### 1. Start the console in LAN mode

```bash
claw-console lan
# or
npm run dev:lan
```

### 2. Expose via Tailscale Serve (recommended)

Use `tailscale serve` to proxy HTTPS traffic to your local console:

```bash
tailscale serve --bg --https=3443 http://127.0.0.1:3000
```

Now access the console at `https://<your-hostname>.ts.net:3443` from any device on your tailnet.

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

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server on `127.0.0.1:3000` (Turbopack) |
| `npm run dev:lan` | Dev server on `0.0.0.0:3000` |
| `npm run build` | Production build |
| `npm start` | Production server on `127.0.0.1` |
| `npm run start:lan` | Production server on `0.0.0.0` |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

## Tech Stack

- **Next.js 16** with Turbopack
- **React 19** + TypeScript (strict)
- **Tailwind CSS 4**
- **Zustand** for state management
- **Vitest** + Testing Library for tests
- **Ed25519** (`@noble/ed25519`) for device identity

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
