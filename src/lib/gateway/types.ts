// Gateway protocol frame types — ported from openclaw/ui/src/ui/gateway.ts

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown; retryable?: boolean; retryAfterMs?: number };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: Record<string, unknown>;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number; maxPayload?: number };
};

export type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

// Domain types — subset ported from openclaw/ui/src/ui/types.ts

export type GatewayAgentRow = {
  agentId: string;
  name: string;
  emoji?: string;
  avatar?: string;
  workspace?: string;
  isDefault?: boolean;
};

/** Raw shape returned by the gateway `agents.list` RPC. */
export type RawGatewayAgentRow = {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
};

export type RawAgentsListResult = {
  defaultId: string;
  agents: RawGatewayAgentRow[];
};

export type GatewaySessionRow = {
  key: string;
  sessionId: string;
  label?: string;
  model?: string;
  modelProvider?: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  updatedAt?: string;
  updatedAtMs?: number;
  thinkingLevel?: string;
};

export type SessionsListResult = {
  sessions: GatewaySessionRow[];
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type SkillStatusEntry = {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  eligible: boolean;
  missing?: string[];
  workspace?: string;
  source?: string;
  bundled?: boolean;
};

export type SkillStatusReport = {
  skills: SkillStatusEntry[];
};

export type SkillScanFinding = {
  ruleId: string;
  severity: "info" | "warn" | "critical";
  file: string;
  line: number;
  message: string;
  evidence: string;
  source?: "regex" | "llm";
};

export type LlmScanResult = {
  riskLevel: "safe" | "low" | "medium" | "high" | "critical";
  reasoning: string;
  findings: SkillScanFinding[];
};

export type SkillScanSummary = {
  scannedFiles: number;
  critical: number;
  warn: number;
  info: number;
  findings: SkillScanFinding[];
  llmAnalysis?: LlmScanResult;
};

export type ChannelAccountSnapshot = {
  accountId: string;
  label?: string;
  connected: boolean;
  error?: string;
};

export type ChannelsStatusSnapshot = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channels: Record<string, { accounts: ChannelAccountSnapshot[] }>;
};

export type CronJob = {
  id: string;
  label?: string;
  agentId?: string;
  schedule: CronSchedule;
  payload?: CronPayload;
  enabled: boolean;
  state?: CronJobState;
};

export type CronSchedule = {
  cron?: string;
  interval?: string;
  at?: string;
};

export type CronPayload = {
  sessionKey?: string;
  message?: string;
};

export type CronJobState = {
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  parentId?: string;
};

/** Extract plain text from content that may be a string, content block, or array of blocks. */
export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    return (content as { text: string }).text;
  }
  return String(content ?? "");
}

export type ChatHistoryResult = {
  sessionKey: string;
  sessionId: string;
  messages: ChatMessage[];
  thinkingLevel?: string;
  verboseLevel?: string;
};

export type HealthSnapshot = {
  status: string;
  uptime?: number;
  version?: string;
};

export type StatusSummary = {
  agents?: number;
  sessions?: number;
  channels?: number;
  skills?: number;
};
