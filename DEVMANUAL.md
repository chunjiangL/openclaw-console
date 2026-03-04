# Claw Console — Developer Manual

## Architecture Overview

Claw Console is a standalone Next.js app that connects to an OpenClaw gateway via WebSocket. All pages are client-rendered (`"use client"`) — there is no SSR since everything depends on the WebSocket connection.

### Data Flow
```
User action → Component → Store action → GatewayClient.request() → WebSocket → Gateway
Gateway → WebSocket → GatewayClient.handleMessage() → Store event handler → Component re-render
```

### Directory Structure
```
src/
├── app/
│   ├── layout.tsx          # Root layout (metadata, global CSS)
│   ├── page.tsx            # Single page app — routes via client-side router
│   └── globals.css         # CSS variables — B&W Pixel Art DOS theme
├── lib/
│   ├── gateway/
│   │   ├── client.ts       # WebSocket client (ported from openclaw)
│   │   └── types.ts        # Protocol frames + domain types + extractText()
│   ├── stores/
│   │   ├── gateway-store.ts  # Connection state, agents, health
│   │   ├── chat-store.ts     # AgentRun tracking, streaming state
│   │   └── group-store.ts    # Group chat metadata (localStorage)
│   └── router.ts           # Client-side router (Zustand)
├── components/
│   ├── layout/
│   │   ├── app-shell.tsx    # Main layout: sidebar + header + content
│   │   ├── sidebar.tsx      # Agents list + group chats + navigation
│   │   ├── header.tsx       # Connection status, settings
│   │   └── connection-dialog.tsx  # URL + token input
│   ├── agents/
│   │   ├── agent-list.tsx   # Agent grid with CRUD
│   │   ├── agent-detail.tsx # Tabbed agent view (overview/sessions/files/skills/channels/cron)
│   │   ├── agent-overview.tsx
│   │   ├── agent-sessions.tsx
│   │   ├── agent-files.tsx
│   │   ├── agent-skills.tsx
│   │   ├── agent-channels.tsx
│   │   └── agent-cron.tsx
│   └── chat/
│       ├── chat-test.tsx       # Single-agent chat test page
│       ├── group-chat.tsx      # Multi-agent group chat with @mentions
│       └── group-chat-utils.ts # Pure functions: buildSessionKey, matchesGroup, getRecentAgentReplies
test/
└── setup.ts               # Vitest setup: Zustand store resets, localStorage polyfill
vitest.config.ts            # Vitest config with vite-tsconfig-paths + jsdom
.github/workflows/test.yml  # CI: test + build on push/PR
```

## Gateway Client

**File:** `src/lib/gateway/client.ts`

Ported from `openclaw/ui/src/ui/gateway.ts` with simplifications (token-only auth, no device crypto).

### Connection lifecycle
1. `client.start()` → creates WebSocket → state: `connecting`
2. WebSocket opens → state: `handshake`, queue 750ms timer for connect
3. Server sends `connect.challenge` with nonce → triggers `sendConnect()` early
4. Client sends `connect` RPC with protocol v3, token auth
5. Server responds → state: `connected`, `onHello` fires
6. On close: flush pending, schedule reconnect with backoff (800ms × 1.7, max 15s)

### Request/Response matching
- Each request gets a `crypto.randomUUID()` ID
- Stored in `pending: Map<string, {resolve, reject, timer}>`
- Response matched by `id` field
- Timeout configurable per-call (default 30s)

### How to add a new RPC method call
```typescript
const result = await useGatewayStore.getState().rpc<ResultType>("method.name", { params });
```

### How to debug
Enable verbose logging by adding to `handleMessage`:
```typescript
console.log("[gw]", frame.type, parsed);
```

## Stores (Zustand)

### gateway-store
- **Purpose:** Connection lifecycle, agent list cache, health polling
- **Key state:** `connectionState`, `client`, `agents`, `hello`
- **Event routing:** `handleEvent()` dispatches `"agent"` → reload agents, `"chat"` → forward to chat-store

### chat-store
- **Purpose:** Track in-flight agent runs for streaming display
- **Key state:** `runs: Map<runId, AgentRun>`, `messages: Map<sessionKey, ChatMessage[]>`
- **AgentRun states:** `queued` → `streaming` → `done` | `error` | `aborted`
- **Event handling:** `handleChatEvent()` matches `payload.runId` to registered runs

### group-store
- **Purpose:** Group chat metadata and messages (persisted to localStorage)
- **Key state:** `groups: GroupChat[]`, `messages: Map<groupId, GroupMessage[]>`

### How to add a new store
1. Create `src/lib/stores/my-store.ts`
2. `export const useMyStore = create<MyStoreType>((set, get) => ({...}))`
3. If it needs gateway events, add routing in `gateway-store.ts` `handleEvent()`

## Pages

| Path | Component | RPCs | Store |
|------|-----------|------|-------|
| `/` | AgentList | `agents.list`, `agents.create`, `agents.delete` | gateway-store |
| `/agents/:id` | AgentDetail → AgentOverview | `agents.update` | gateway-store |
| `/agents/:id/sessions` | AgentSessions | `sessions.list`, `sessions.reset`, `sessions.compact`, `sessions.delete` | gateway-store |
| `/agents/:id/files` | AgentFiles | `agents.files.list`, `agents.files.get`, `agents.files.set` | gateway-store |
| `/agents/:id/skills` | AgentSkills | `skills.status`, `skills.update` | gateway-store |
| `/agents/:id/channels` | AgentChannels | `channels.status` | gateway-store |
| `/agents/:id/cron` | AgentCron | `cron.list`, `cron.add`, `cron.update`, `cron.remove`, `cron.run` | gateway-store |
| `/chat/test` | ChatTest | `chat.send`, `chat.history`, `chat.abort` | chat-store |
| `/chat/group/:id` | GroupChat | `chat.send`, `chat.inject`, `chat.abort` | chat-store, group-store |

## Chat System

### Single-agent flow
1. User sends message → `chat.send({sessionKey, message, idempotencyKey})`
2. Server ACK: `{runId, status: "started"}` where `runId = idempotencyKey`
3. Register `AgentRun` in chat-store via `startRun()`
4. Gateway broadcasts `chat` events with matching `runId`
5. `handleChatEvent` routes by `runId` → updates `AgentRun.streamedText`
6. State progression: `delta*` → `final` | `error` | `aborted`

### Multi-agent flow (group chat)
1. Parse `@mentions` to determine `targetAgents`
2. **Parallel mode:** `Promise.allSettled` all `chat.send` calls, each with unique `idempotencyKey`
3. **Sequential mode:** Await each agent's `final` event before sending to next
4. Each agent gets its own `sessionKey`: `agent:{agentId}:claw-console:group:{groupId}`
5. Events demuxed by `runId` — each agent's run tracked independently

### Context sharing
- Parallel: Inject last 3 completed agent replies from PRIOR rounds only
- Sequential: Inject prior rounds + current round's already-completed agents
- Injection via `chat.inject({sessionKey, message, label: "context-share"})`
- Max 2000 chars per injection, truncated with "..."

### Common issues
- **Events not matching:** Check that `runId` from `chat.send` response matches the `startRun` call
- **Runs stuck in "streaming":** The `final` event may not have arrived — check WebSocket connection
- **Duplicate messages:** Ensure `idempotencyKey` is unique per send

## Session Key Convention

Format: `agent:{agentId}:claw-console:{type}:{id}`

| Context | Key Pattern |
|---------|-------------|
| Chat test | `agent:{agentId}:claw-console:test:{uuid8}` |
| Group chat | `agent:{agentId}:claw-console:group:{groupId}` |

## Common Operations

### How to add a new RPC method
1. Add return type to `src/lib/gateway/types.ts`
2. Call via `useGatewayStore.getState().rpc<Type>("method.name", params)`

### How to add a new event listener
In `src/lib/stores/gateway-store.ts` → `handleEvent()`:
```typescript
case "my.event": {
  // Handle event
  break;
}
```

### How to add a new agent detail page
1. Add tab to `TABS` array in `agent-detail.tsx`
2. Create `src/components/agents/agent-{tab}.tsx`
3. Import and render in `AgentDetail`

### How to modify context sharing rules
In `src/components/chat/group-chat-utils.ts` (pure functions, tested):
- `MAX_INJECT_LENGTH` — truncation limit (2000 chars)
- `MAX_PRIOR_INJECTIONS` — how many prior messages to inject (3)
- `getRecentAgentReplies()` — what gets injected
- `buildSessionKey()` — session key generation
- `matchesGroup()` — session key matching (uses `endsWith` to prevent partial ID matches)

In `src/components/chat/group-chat.tsx` (component):
- `injectContext()` — how injection happens
- `persistAgentRun()` — dedup-guarded persistence of completed runs to group-store

## Debugging Guide

- **Gateway not connecting:** Check URL format (should be `http://...`), check token, look for `connect.challenge` in console
- **Chat not streaming:** Verify `runId` correlation in chat-store, check gateway-store `handleEvent` routes `"chat"` events
- **Agent action failing:** Check RPC error in browser console, look at `GatewayError.code`
- **Reconnect issues:** Check backoff timer in client.ts, verify pending requests are flushed
- **State out of sync:** Force-refresh by calling store actions directly: `useGatewayStore.getState().loadAgents()`
- **Content blocks not rendering:** Gateway may return `{type:"text", text:"..."}` objects instead of strings — use `extractText()` from `types.ts`

## Testing

### Setup
- **Framework:** Vitest 4 + jsdom
- **Config:** `vitest.config.ts` — uses `vite-tsconfig-paths` for `@/*` alias resolution, inlines Zustand for jsdom compat
- **Setup file:** `test/setup.ts` — resets all 3 Zustand stores after each test, clears localStorage, includes localStorage polyfill for jsdom
- **CI:** `.github/workflows/test.yml` — runs on push to main/feat/** and PRs to main

### Running tests
```bash
npm test          # vitest run (single pass)
npm run test:watch  # vitest (watch mode)
```

### Test suites (53 tests)
| File | Tests | What it covers |
|------|-------|----------------|
| `src/lib/gateway/__tests__/types.test.ts` | 10 | `extractText()` normalization: strings, content blocks, arrays, edge cases |
| `src/lib/stores/__tests__/chat-store.test.ts` | 10 | Run lifecycle (queued→streaming→done/error/aborted), event routing, getActiveRuns |
| `src/lib/stores/__tests__/group-store.test.ts` | 14 | Group CRUD, message persistence, localStorage round-trip, deleteGroup cascades |
| `src/lib/stores/__tests__/gateway-store.test.ts` | 5 | Agent loading, identity flattening, name fallback chain, error handling |
| `src/components/chat/__tests__/group-chat-logic.test.ts` | 14 | Session key format, matchesGroup safety, getRecentAgentReplies filtering/truncation |

### Testing patterns
- **Zustand stores:** Use `store.getState().action()` + `store.getState().field` — no React rendering needed
- **Store reset:** Handled globally in `test/setup.ts` via `afterEach` — no per-test cleanup needed
- **localStorage:** Polyfilled in setup.ts for jsdom compatibility (jsdom may not provide full Storage API)
- **Scope boundary:** Do NOT test async Server Components or App Router server-side pages — Vitest + jsdom can't handle those

### How to add a new test
1. Create `src/path/__tests__/my-thing.test.ts`
2. Import from `vitest` and the module under test
3. Store resets are automatic — just write assertions

## UI Design System — B&W Pixel Art DOS

### Design tokens
| Element | Value |
|---------|-------|
| Background | `#000000` (pure black) |
| Foreground | `#ffffff` (pure white) |
| Muted text | `#888888` or `text-white/40`–`text-white/60` |
| Borders | `border-white/15` (default), `border-white/20` (interactive), `border-white/50` (hover/active) |
| Active indicator | `●` (white text) |
| Inactive indicator | `○` (gray text) |
| Primary button | `bg-white text-black` |
| Outline button | `border-white/20 text-white/50` |
| Toggle ON | `[ON]` — `bg-white text-black` |
| Toggle OFF | `[OFF]` — `border border-white/20 text-white/50` |
| Section headers | `▓` dither block prefix |
| Dialog corners | `╔ ╗ ╚ ╝` Unicode box-drawing |
| App title | `░░ CLAW CONSOLE ░░` |
| Bracketed actions | `[CONFIG]` `[SEND]` `[ABORT]` `[DISCONNECT]` |
| Chat prompts | `YOU>` / `AI>` / `AGENTNAME>` in `text-white/40` |
| Cursor | `bg-white` block with blink animation |
| Active tab | `[TABNAME]` with `bg-white text-black` |

### Rules
- **No color anywhere** — pure black, white, gray only
- **No shadows** — no `boxShadow`, no `textShadow`
- **No glows** — removed `glow-pulse` animation, kept `blink` only
- **No border-radius** — enforced globally via `border-radius: 0 !important`
- **Monospace only** — `font-family: ui-monospace, ...` set in body
- **Scanlines** — subtle `rgba(255,255,255,0.012)` repeating gradient overlay
