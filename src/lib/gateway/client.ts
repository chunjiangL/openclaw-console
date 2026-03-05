/**
 * Gateway WebSocket Client — ported from openclaw/ui/src/ui/gateway.ts
 *
 * Protocol v3 with challenge-response handshake and Ed25519 device identity.
 */

import type {
  GatewayEventFrame,
  GatewayResponseFrame,
  GatewayHelloOk,
} from "./types";
import { uuid } from "../uuid";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "handshake"
  | "connected";

export type GatewayClientOptions = {
  url: string;
  token?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (err: Error) => void;
  requestTimeoutMs?: number;
};

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private authFailed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 800;
  private _state: ConnectionState = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: GatewayClientOptions) {}

  get state(): ConnectionState {
    return this._state;
  }

  get connected(): boolean {
    return this._state === "connected";
  }

  start(): void {
    this.closed = false;
    this.authFailed = false;
    this.doConnect();
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
    this.setState("disconnected");
  }

  request<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs?: number
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = uuid();
    const frame = { type: "req", id, method, params };

    const timeout = timeoutMs ?? this.opts.requestTimeoutMs ?? 30_000;
    const p = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timeout: ${method}`));
      }, timeout);
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
    });

    this.ws.send(JSON.stringify(frame));
    return p;
  }

  // --- private ---

  private setState(s: ConnectionState): void {
    if (this._state !== s) {
      this._state = s;
      this.opts.onStateChange?.(s);
    }
  }

  private doConnect(): void {
    if (this.closed) return;
    this.setState("connecting");
    this.ws = new WebSocket(this.opts.url);

    this.ws.addEventListener("open", () => {
      this.setState("handshake");
      this.queueConnect();
    });
    this.ws.addEventListener("message", (ev) =>
      this.handleMessage(String(ev.data ?? ""))
    );
    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      this.ws = null;
      this.flushPending(
        new Error(`gateway closed (${ev.code}): ${reason}`)
      );
      this.setState("disconnected");
      this.opts.onClose?.({ code: ev.code, reason });
      // Don't auto-reconnect on auth failures — user must retry manually
      if (!this.authFailed) {
        this.scheduleReconnect();
      }
    });
    this.ws.addEventListener("error", () => {
      // close handler will fire
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  private flushPending(err: Error): void {
    for (const [, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private queueConnect(): void {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
    }
    // Wait 750ms for server to send connect.challenge
    this.connectTimer = setTimeout(() => {
      void this.sendConnect();
    }, 750);
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent) return;
    this.connectSent = true;
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "openclaw-control-ui",
        displayName: "Claw Console",
        version: "0.1.0",
        platform: typeof navigator !== "undefined" ? navigator.platform ?? "web" : "node",
        mode: "ui",
      },
      role: "operator",
      scopes: ["operator.read", "operator.admin", "operator.approvals", "operator.pairing"],
      auth: this.opts.token ? { token: this.opts.token } : undefined,
      caps: ["tool-events"],
    };

    this.request<GatewayHelloOk>("connect", params)
      .then((hello) => {
        this.backoffMs = 800;
        this.setState("connected");
        this.opts.onHello?.(hello);
      })
      .catch((err) => {
        console.error("[gateway] connect failed:", err?.message ?? err);
        this.authFailed = true;
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
        this.ws?.close(4008, "connect failed");
      });
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };

    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: string } | undefined;
        if (payload?.nonce) {
          this.connectNonce = payload.nonce;
          void this.sendConnect();
        }
        return;
      }
      // Sequence gap detection
      const seq = typeof evt.seq === "number" ? evt.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }
      try {
        this.opts.onEvent?.(evt);
      } catch (err) {
        console.error("[gateway] event handler error:", err);
      }
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) return;
      this.pending.delete(res.id);
      if (pending.timer) clearTimeout(pending.timer);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        const err = new GatewayError(
          res.error?.message ?? "request failed",
          res.error?.code ?? "UNKNOWN",
          res.error?.details
        );
        pending.reject(err);
      }
      return;
    }
  }
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
