"use client";

import { create } from "zustand";
import { uuid } from "../uuid";
import { buildOrchestratorPrompt } from "../orchestrator/system-prompt";
import {
  buildLeadSessionKey,
  sendBootstrapAndGoal,
  sendFollowUp,
  sendApproval as sendApprovalRpc,
} from "../orchestrator/chat-bridge";
import {
  parseTaskBreakdown,
  type ParsedTask,
} from "../orchestrator/response-parser";
import {
  startTracking,
  type NormalizedWorkerEvent,
} from "../orchestrator/event-tracker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrchestratorPhase =
  | "idle"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "reviewing"
  | "complete"
  | "error";

export type TaskStatus = "pending" | "in_progress" | "done" | "blocked";
export type PrStatusValue = "draft" | "open" | "review" | "merged" | "closed";

export type OrchestratorTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedWorker: string | null; // agentId
  branch: string | null;
  prNumber: number | null;
  dependencies: string[];
};

export type OrchestratorPR = {
  number: number;
  title: string;
  status: PrStatusValue;
  sessionKey: string;
  branch: string;
};

export type ChatMessage = {
  role: "user" | "lead";
  content: string;
  timestamp: number;
};

export type OrchestratorSession = {
  id: string;
  title: string;
  leadAgentId: string;
  workerAgentIds: string[];
  repo: string;
  baseBranch: string;
};

type OrchestratorStore = {
  // Config
  session: OrchestratorSession;

  // State machine
  phase: OrchestratorPhase;
  leadSessionKey: string | null;
  leadRunId: string | null;

  // Chat
  chatMessages: ChatMessage[];
  latestLeadDraftText: string;
  isStreaming: boolean;

  // Planning
  parsedTasks: OrchestratorTask[];
  parseError: string | null;
  approvedTasks: OrchestratorTask[];

  // Execution (heuristic v1)
  workerSessionKeys: Map<string, string>; // taskId → sessionKey (discovered from events)
  prs: OrchestratorPR[];
  expandedTaskIds: Set<string>;

  // Actions — config
  updateSessionField: <K extends keyof OrchestratorSession>(
    field: K,
    value: OrchestratorSession[K],
  ) => void;
  setLeadAgent: (agentId: string) => void;
  setWorkerAgents: (agentIds: string[]) => void;

  // Actions — lifecycle
  startSession: (goal: string) => Promise<void>;
  approveBreakdown: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  resetSession: () => void;

  // Actions — task editing
  editTask: (taskId: string, patch: Partial<OrchestratorTask>) => void;
  toggleTaskExpand: (taskId: string) => void;

  // Actions — event ingestion (called by event tracker)
  ingestLeadDelta: (delta: string) => void;
  ingestLeadFinal: (text: string) => void;
  ingestLeadError: (error: string) => void;
  ingestWorkerEvent: (evt: NormalizedWorkerEvent) => void;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let unsubTracker: (() => void) | null = null;

export const useOrchestratorStore = create<OrchestratorStore>((set, get) => ({
  // Config defaults
  session: {
    id: "",
    title: "",
    leadAgentId: "",
    workerAgentIds: [],
    repo: "",
    baseBranch: "main",
  },

  // State machine
  phase: "idle",
  leadSessionKey: null,
  leadRunId: null,

  // Chat
  chatMessages: [],
  latestLeadDraftText: "",
  isStreaming: false,

  // Planning
  parsedTasks: [],
  parseError: null,
  approvedTasks: [],

  // Execution
  workerSessionKeys: new Map(),
  prs: [],
  expandedTaskIds: new Set(),

  // ---------------------------------------------------------------------------
  // Config actions
  // ---------------------------------------------------------------------------

  updateSessionField(field, value) {
    set((s) => ({ session: { ...s.session, [field]: value } }));
  },

  setLeadAgent(agentId) {
    set((s) => ({ session: { ...s.session, leadAgentId: agentId } }));
  },

  setWorkerAgents(agentIds) {
    set((s) => ({ session: { ...s.session, workerAgentIds: agentIds } }));
  },

  // ---------------------------------------------------------------------------
  // Lifecycle actions
  // ---------------------------------------------------------------------------

  async startSession(goal: string) {
    const { session } = get();
    if (!session.leadAgentId) return;

    const sessionId = uuid();
    const leadSessionKey = buildLeadSessionKey(session.leadAgentId, sessionId);

    // Build system prompt
    const workers = session.workerAgentIds.map((id) => ({
      agentId: id,
      name: id,
    }));
    const prompt = buildOrchestratorPrompt({
      repo: session.repo || "(no repo — dry run)",
      baseBranch: session.baseBranch || "main",
      workers,
    });

    set({
      session: { ...session, id: sessionId, title: goal.slice(0, 80) },
      phase: "planning",
      leadSessionKey,
      chatMessages: [{ role: "user", content: goal, timestamp: Date.now() }],
      latestLeadDraftText: "",
      isStreaming: true,
      parsedTasks: [],
      parseError: null,
      approvedTasks: [],
      workerSessionKeys: new Map(),
      prs: [],
    });

    // Start event tracking
    if (unsubTracker) unsubTracker();
    unsubTracker = startTracking(leadSessionKey, (evt) => {
      const store = get();
      if (
        evt.type === "lead_delta" ||
        evt.type === "lead_final" ||
        evt.type === "lead_error"
      ) {
        if (evt.type === "lead_delta") store.ingestLeadDelta(evt.delta);
        else if (evt.type === "lead_final") store.ingestLeadFinal(evt.text);
        else store.ingestLeadError(evt.error);
      } else {
        store.ingestWorkerEvent(evt);
      }
    });

    // Send to gateway
    try {
      const { useGatewayStore } = await import("./gateway-store");
      const { rpc } = useGatewayStore.getState();
      const runId = await sendBootstrapAndGoal(
        rpc,
        leadSessionKey,
        prompt,
        goal,
      );
      set({ leadRunId: runId });
    } catch (err) {
      set({
        phase: "error",
        isStreaming: false,
        parseError: `Failed to start session: ${err}`,
      });
    }
  },

  async approveBreakdown() {
    const { parsedTasks, leadSessionKey } = get();
    if (!leadSessionKey || parsedTasks.length === 0) return;

    // Move parsed tasks to approved, set phase to executing
    const approved = parsedTasks.map((t) => ({
      ...t,
      status: "pending" as TaskStatus,
    }));

    set({
      approvedTasks: approved,
      phase: "executing",
      isStreaming: true,
      latestLeadDraftText: "",
      chatMessages: [
        ...get().chatMessages,
        {
          role: "user",
          content: "Approved. Execute the plan now.",
          timestamp: Date.now(),
        },
      ],
    });

    try {
      const { useGatewayStore } = await import("./gateway-store");
      const { rpc } = useGatewayStore.getState();
      await sendApprovalRpc(rpc, leadSessionKey);
    } catch (err) {
      set({
        phase: "error",
        isStreaming: false,
        parseError: `Failed to send approval: ${err}`,
      });
    }
  },

  async sendMessage(text: string) {
    const { leadSessionKey, chatMessages } = get();
    if (!leadSessionKey || !text.trim()) return;

    set({
      chatMessages: [
        ...chatMessages,
        { role: "user", content: text, timestamp: Date.now() },
      ],
      isStreaming: true,
      latestLeadDraftText: "",
    });

    try {
      const { useGatewayStore } = await import("./gateway-store");
      const { rpc } = useGatewayStore.getState();
      await sendFollowUp(rpc, leadSessionKey, text);
    } catch (err) {
      set({
        isStreaming: false,
        parseError: `Failed to send message: ${err}`,
      });
    }
  },

  resetSession() {
    if (unsubTracker) {
      unsubTracker();
      unsubTracker = null;
    }
    set({
      phase: "idle",
      leadSessionKey: null,
      leadRunId: null,
      chatMessages: [],
      latestLeadDraftText: "",
      isStreaming: false,
      parsedTasks: [],
      parseError: null,
      approvedTasks: [],
      workerSessionKeys: new Map(),
      prs: [],
      expandedTaskIds: new Set(),
    });
  },

  // ---------------------------------------------------------------------------
  // Task editing
  // ---------------------------------------------------------------------------

  editTask(taskId, patch) {
    set((s) => ({
      parsedTasks: s.parsedTasks.map((t) =>
        t.id === taskId ? { ...t, ...patch } : t,
      ),
    }));
  },

  toggleTaskExpand(taskId) {
    set((s) => {
      const next = new Set(s.expandedTaskIds);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return { expandedTaskIds: next };
    });
  },

  // ---------------------------------------------------------------------------
  // Event ingestion
  // ---------------------------------------------------------------------------

  ingestLeadDelta(_delta: string) {
    // No-op: skip streaming display, wait for final response
  },

  ingestLeadFinal(text: string) {
    const { phase, chatMessages } = get();

    // Append to chat (skip empty responses)
    const newMessages: ChatMessage[] = text.trim()
      ? [
          ...chatMessages,
          { role: "lead", content: text, timestamp: Date.now() },
        ]
      : chatMessages;

    // Try to parse task breakdown
    const result = parseTaskBreakdown(text);

    if (result.ok && phase === "planning") {
      // Convert parsed tasks to store tasks
      const tasks: OrchestratorTask[] = result.tasks.map((pt: ParsedTask) => ({
        id: pt.id,
        title: pt.title,
        description: pt.description,
        status: "pending" as TaskStatus,
        assignedWorker: pt.assignedWorker,
        branch: pt.branch,
        prNumber: null,
        dependencies: pt.dependencies,
      }));

      set({
        chatMessages: newMessages,
        latestLeadDraftText: "",
        isStreaming: false,
        parsedTasks: tasks,
        parseError: null,
        phase: "awaiting_approval",
      });
    } else {
      set({
        chatMessages: newMessages,
        latestLeadDraftText: "",
        isStreaming: false,
        // Only report parse errors during planning phase
        parseError: phase === "planning" && !result.ok ? result.reason : null,
      });
    }
  },

  ingestLeadError(error: string) {
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { role: "lead", content: `[ERROR] ${error}`, timestamp: Date.now() },
      ],
      latestLeadDraftText: "",
      isStreaming: false,
      phase: "error",
      parseError: error,
    }));
  },

  ingestWorkerEvent(evt: NormalizedWorkerEvent) {
    if (evt.type === "worker_complete") {
      // Mark matching task as done (heuristic: match by sessionKey)
      set((s) => {
        const approved = s.approvedTasks.map((t) => {
          // Heuristic: can't perfectly match sessionKey to task yet
          // For now, just track completion count
          return t;
        });
        return { approvedTasks: approved };
      });
    } else if (evt.type === "pr_detected") {
      set((s) => ({
        prs: [
          ...s.prs,
          {
            number: evt.prNumber,
            title: evt.title,
            status: "open" as PrStatusValue,
            sessionKey: evt.sessionKey,
            branch: "",
          },
        ],
      }));
    }
  },
}));
