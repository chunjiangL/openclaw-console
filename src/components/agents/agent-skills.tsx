"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useEffect, useState, useMemo, useRef } from "react";
import type { SkillStatusEntry, SkillScanSummary, SkillScanFinding } from "@/lib/gateway/types";

// ---------------------------------------------------------------------------
// Status filters
// ---------------------------------------------------------------------------
type StatusFilter = "all" | "on" | "off" | "ineligible" | "bundled" | "custom";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "on", label: "ON" },
  { key: "off", label: "OFF" },
  { key: "ineligible", label: "INELIGIBLE" },
  { key: "bundled", label: "BUNDLED" },
  { key: "custom", label: "CUSTOM" },
];

function matchesStatus(skill: SkillStatusEntry, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":       return true;
    case "on":        return skill.enabled;
    case "off":       return !skill.enabled && skill.eligible;
    case "ineligible": return !skill.eligible;
    case "bundled":   return skill.bundled === true;
    case "custom":    return skill.bundled !== true;
  }
}

// ---------------------------------------------------------------------------
// Function categories — derived from skill name + description keywords
// ---------------------------------------------------------------------------
type FunctionTag = "messaging" | "media" | "notes" | "dev" | "home" | "utility";

const FUNCTION_TAGS: { key: FunctionTag; label: string; keywords: string[] }[] = [
  {
    key: "messaging",
    label: "MESSAGING",
    keywords: [
      "message", "chat", "sms", "imessage", "whatsapp", "slack", "discord",
      "email", "imap", "smtp", "gmail", "bluebubbles", "imsg", "wacli",
      "voice-call", "himalaya",
    ],
  },
  {
    key: "media",
    label: "MEDIA",
    keywords: [
      "audio", "video", "image", "music", "tts", "speech", "whisper",
      "transcri", "spectrogram", "camera", "pdf", "gif", "spotify",
      "songsee", "camsnap", "ffmpeg", "text-to-speech", "elevenlabs",
      "sag", "sherpa", "nano-banana", "openai-image", "nano-pdf", "gifgrep",
    ],
  },
  {
    key: "notes",
    label: "NOTES & TASKS",
    keywords: [
      "note", "obsidian", "notion", "bear", "reminder", "task", "trello",
      "things", "todo", "board", "vault", "apple-notes", "apple-reminders",
      "bear-notes", "things-mac", "memo",
    ],
  },
  {
    key: "dev",
    label: "DEV TOOLS",
    keywords: [
      "github", "coding", "git", "code", "pr", "session-log", "tmux",
      "mcp", "mcporter", "codex", "claude", "agent", "skill-creator",
      "clawhub", "merge-pr", "review-pr", "prepare-pr", "mintlify",
    ],
  },
  {
    key: "home",
    label: "SMART HOME",
    keywords: [
      "hue", "sonos", "eight", "speaker", "light", "openhue", "blucli",
      "bluos", "eightctl", "sonoscli", "peekaboo",
    ],
  },
  {
    key: "utility",
    label: "UTILITY",
    keywords: [
      "weather", "search", "summarize", "health", "security", "1password",
      "oracle", "gemini", "food", "order", "goplaces", "places",
      "blogwatch", "rss", "model-usage", "cost",
    ],
  },
];

function getSkillTags(skill: SkillStatusEntry): FunctionTag[] {
  const haystack = `${skill.key} ${skill.name} ${skill.description ?? ""}`.toLowerCase();
  const tags: FunctionTag[] = [];
  for (const tag of FUNCTION_TAGS) {
    if (tag.keywords.some((kw) => haystack.includes(kw))) {
      tags.push(tag.key);
    }
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Import state
// ---------------------------------------------------------------------------
type ImportStep = "idle" | "input" | "scanning" | "review" | "confirming" | "done" | "error";

type ImportState = {
  step: ImportStep;
  mode: "file" | "url";
  fileName: string;
  fileContent: string; // base64
  url: string;
  llmScan: boolean;
  scanSummary: SkillScanSummary | null;
  tempId: string | null;
  skillName: string;
  error: string | null;
};

function createImportState(): ImportState {
  return {
    step: "idle",
    mode: "file",
    fileName: "",
    fileContent: "",
    url: "",
    llmScan: false,
    scanSummary: null,
    tempId: null,
    skillName: "",
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Import Panel Component
// ---------------------------------------------------------------------------
function ImportPanel({
  state,
  onStateChange,
  rpc,
  onImported,
}: {
  state: ImportState;
  onStateChange: (s: ImportState) => void;
  rpc: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (state.step === "idle") return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      onStateChange({ ...state, fileName: file.name, fileContent: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    onStateChange({ ...state, step: "scanning", error: null });
    try {
      type ScanResult = { tempId: string; skillName: string; scanSummary: SkillScanSummary };
      const params: Record<string, unknown> = {
        mode: state.mode,
        llmScan: state.llmScan,
      };
      if (state.mode === "file") {
        params.fileContent = state.fileContent;
        params.fileName = state.fileName;
      } else {
        params.url = state.url;
      }
      const result = await rpc<ScanResult>("skills.import", params);
      onStateChange({
        ...state,
        step: "review",
        scanSummary: result.scanSummary,
        tempId: result.tempId,
        skillName: result.skillName,
      });
    } catch (err) {
      onStateChange({ ...state, step: "error", error: String(err) });
    }
  };

  const handleConfirm = async () => {
    if (!state.tempId) return;
    onStateChange({ ...state, step: "confirming" });
    try {
      await rpc("skills.import", {
        mode: state.mode,
        confirm: true,
        tempId: state.tempId,
        skillName: state.skillName,
      });
      onStateChange({ ...state, step: "done" });
      onImported();
    } catch (err) {
      onStateChange({ ...state, step: "error", error: String(err) });
    }
  };

  const handleCancel = () => onStateChange(createImportState());

  const canSubmit =
    state.mode === "file"
      ? Boolean(state.fileName && state.fileContent)
      : Boolean(state.url.trim());

  return (
    <div className="mb-5 border border-border-solid p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-sm font-bold uppercase tracking-wide text-fg">
          IMPORT SKILL
        </span>
        <button
          onClick={handleCancel}
          className="font-mono text-xs uppercase tracking-wider text-fg hover:text-fg-faint transition-all"
        >
          [X]
        </button>
      </div>

      {/* Done */}
      {state.step === "done" && (
        <div className="border border-border-solid p-4 text-center">
          <p className="font-mono text-sm uppercase tracking-wider text-fg">
            SKILL IMPORTED SUCCESSFULLY
          </p>
          <button
            onClick={handleCancel}
            className="mt-3 border border-border-solid px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
          >
            CLOSE
          </button>
        </div>
      )}

      {/* Error */}
      {state.step === "error" && (
        <div className="border border-border-solid p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-fg mb-2">ERROR</p>
          <p className="font-mono text-xs text-fg-faint break-all">{state.error}</p>
          <button
            onClick={handleCancel}
            className="mt-3 border border-border-solid px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
          >
            CLOSE
          </button>
        </div>
      )}

      {/* Scanning */}
      {state.step === "scanning" && (
        <div className="p-6 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.15em] text-fg">
            SCANNING FOR SECURITY ISSUES...
          </p>
          <p className="mt-2 font-mono text-xs text-fg-faint">THIS MAY TAKE A MOMENT</p>
        </div>
      )}

      {/* Confirming */}
      {state.step === "confirming" && (
        <div className="p-6 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.15em] text-fg">
            INSTALLING SKILL...
          </p>
        </div>
      )}

      {/* Input step */}
      {state.step === "input" && (
        <div>
          {/* Mode tabs */}
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => onStateChange({ ...state, mode: "file" })}
              className={`px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
                state.mode === "file"
                  ? "bg-accent text-accent-fg font-bold"
                  : "border border-border-solid text-fg hover:bg-active"
              }`}
            >
              FILE
            </button>
            <button
              onClick={() => onStateChange({ ...state, mode: "url" })}
              className={`px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
                state.mode === "url"
                  ? "bg-accent text-accent-fg font-bold"
                  : "border border-border-solid text-fg hover:bg-active"
              }`}
            >
              URL
            </button>
          </div>

          {/* File input */}
          {state.mode === "file" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.zip,.tar.gz,.tgz"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="border border-border-solid px-4 py-2 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
              >
                {state.fileName || "CHOOSE FILE (.MD, .ZIP, .TAR.GZ)"}
              </button>
              {state.fileName && (
                <p className="mt-2 font-mono text-xs text-fg-faint">
                  SELECTED: {state.fileName}
                </p>
              )}
            </div>
          )}

          {/* URL input */}
          {state.mode === "url" && (
            <div data-focus-container className="flex items-center border-2 border-border-solid bg-surface-alt focus-within:border-accent transition-colors">
              <span className="pl-3 font-mono text-xs text-fg">&gt;</span>
              <input
                type="url"
                value={state.url}
                onChange={(e) => onStateChange({ ...state, url: e.target.value })}
                placeholder="HTTPS://GITHUB.COM/OWNER/REPO OR DIRECT URL"
                className="w-full bg-transparent px-2 py-2.5 font-mono text-sm text-fg placeholder:text-fg-dim focus:outline-none focus-visible:outline-none"
              />
            </div>
          )}

          {/* LLM scan toggle */}
          <label className="mt-4 flex items-center gap-3 cursor-pointer">
            <button
              onClick={() => onStateChange({ ...state, llmScan: !state.llmScan })}
              className={`shrink-0 w-5 h-5 border border-border-solid font-mono text-xs flex items-center justify-center transition-all ${
                state.llmScan ? "bg-accent text-accent-fg" : "text-fg hover:bg-active"
              }`}
            >
              {state.llmScan ? "X" : ""}
            </button>
            <span className="font-mono text-xs uppercase tracking-wider text-fg">
              ENABLE AI SECURITY ANALYSIS
            </span>
          </label>

          {/* Submit */}
          <button
            onClick={handleScan}
            disabled={!canSubmit}
            className="mt-4 bg-accent px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            SCAN & REVIEW
          </button>
        </div>
      )}

      {/* Review step */}
      {state.step === "review" && state.scanSummary && (
        <ScanReview
          skillName={state.skillName}
          summary={state.scanSummary}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan Review Component
// ---------------------------------------------------------------------------
function ScanReview({
  skillName,
  summary,
  onConfirm,
  onCancel,
}: {
  skillName: string;
  summary: SkillScanSummary;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasCritical = summary.critical > 0;
  const hasWarn = summary.warn > 0;
  const isClean = !hasCritical && !hasWarn;

  const criticalFindings = summary.findings.filter((f) => f.severity === "critical");
  const warnFindings = summary.findings.filter((f) => f.severity === "warn");

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-sm font-bold uppercase tracking-wide text-fg">
          SCAN RESULTS
        </span>
        <span className="font-mono text-xs text-fg-faint">
          &quot;{skillName}&quot; — {summary.scannedFiles} FILE(S) SCANNED
        </span>
      </div>

      {isClean && (
        <div className="border border-border-solid p-3 mb-3">
          <p className="font-mono text-xs uppercase tracking-wider text-fg">
            NO SECURITY ISSUES FOUND
          </p>
        </div>
      )}

      {hasCritical && (
        <FindingGroup label="CRITICAL" findings={criticalFindings} />
      )}

      {hasWarn && (
        <FindingGroup label="WARNINGS" findings={warnFindings} />
      )}

      {/* LLM Analysis */}
      {summary.llmAnalysis && (
        <div className="border-t border-border-solid pt-3 mt-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-accent text-accent-fg px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
              AI
            </span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-fg">
              RISK: {summary.llmAnalysis.riskLevel.toUpperCase()}
            </span>
          </div>
          <p className="font-mono text-xs text-fg-faint whitespace-pre-wrap leading-relaxed">
            {summary.llmAnalysis.reasoning}
          </p>
          {summary.llmAnalysis.findings.length > 0 && (
            <div className="mt-2">
              {summary.llmAnalysis.findings.map((f, i) => (
                <FindingRow key={i} finding={f} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={onConfirm}
          className="bg-accent px-6 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all"
        >
          CONFIRM IMPORT
        </button>
        <button
          onClick={onCancel}
          className="border border-border-solid px-4 py-2 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}

function FindingGroup({ label, findings }: { label: string; findings: SkillScanFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-fg mb-2">
        {label} ({findings.length})
      </p>
      {findings.map((f, i) => (
        <FindingRow key={i} finding={f} />
      ))}
    </div>
  );
}

function FindingRow({ finding }: { finding: SkillScanFinding }) {
  return (
    <div className="border-b border-border-muted py-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-fg">{finding.message}</span>
        {finding.source === "llm" && (
          <span className="bg-accent text-accent-fg px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider shrink-0">
            AI
          </span>
        )}
      </div>
      <p className="font-mono text-[11px] text-fg-faint mt-0.5">
        {finding.file}:{finding.line} — {finding.evidence}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AgentSkills({ agentId }: { agentId: string }) {
  const rpc = useGatewayStore((s) => s.rpc);
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [functionFilter, setFunctionFilter] = useState<FunctionTag | null>(null);
  const [search, setSearch] = useState("");
  const [importState, setImportState] = useState<ImportState>(createImportState);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const result = await rpc<{ skills: SkillStatusEntry[] }>("skills.status", { agentId });
      setSkills(result.skills);
    } catch (err) {
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSkill = async (skillKey: string, enabled: boolean) => {
    try {
      await rpc("skills.update", { skillKey, enabled });
      setSkills((prev) =>
        prev.map((s) => (s.key === skillKey ? { ...s, enabled } : s))
      );
    } catch (err) {
      alert(String(err));
      await fetchSkills();
    }
  };

  // Compute function tag counts from full skill list
  const functionCounts = useMemo(() => {
    const counts = new Map<FunctionTag, number>();
    for (const tag of FUNCTION_TAGS) {
      counts.set(tag.key, 0);
    }
    for (const skill of skills) {
      for (const tag of getSkillTags(skill)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [skills]);

  // Apply all filters
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return skills.filter((s) => {
      if (!matchesStatus(s, statusFilter)) return false;
      if (functionFilter && !getSkillTags(s).includes(functionFilter)) return false;
      if (q) {
        const haystack = `${s.key} ${s.name} ${s.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [skills, statusFilter, functionFilter, search]);

  const clearFilters = () => {
    setStatusFilter("all");
    setFunctionFilter(null);
    setSearch("");
  };

  const hasActiveFilters = statusFilter !== "all" || functionFilter !== null || search !== "";

  if (loading) {
    return <div className="font-mono text-sm uppercase tracking-[0.15em] text-fg">LOADING SKILLS...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold uppercase tracking-wide text-fg">SKILLS</h3>
          <span className="font-mono text-xs text-fg-faint">{skills.length} TOTAL</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setImportState(
                importState.step === "idle"
                  ? { ...createImportState(), step: "input" }
                  : createImportState()
              )
            }
            className="bg-accent px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all"
          >
            + IMPORT
          </button>
          <button
            onClick={fetchSkills}
            className="border border-border-solid px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* Import panel */}
      <ImportPanel
        state={importState}
        onStateChange={setImportState}
        rpc={rpc}
        onImported={fetchSkills}
      />

      {/* Search box */}
      <div data-focus-container className="mb-4 flex items-center border-2 border-border-solid bg-surface-alt focus-within:border-accent transition-colors">
        <span className="pl-3 font-mono text-xs text-fg">&gt;</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH SKILLS..."
          className="w-full bg-transparent px-2 py-2.5 font-mono text-sm text-fg placeholder:text-fg-dim focus:outline-none focus-visible:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="pr-3 font-mono text-xs text-fg hover:text-fg-faint transition-colors"
          >
            [X]
          </button>
        )}
      </div>

      {/* Status filters */}
      <div className="mb-3 flex flex-wrap gap-1">
        {STATUS_FILTERS.map((f) => {
          const count = skills.filter((s) => matchesStatus(s, f.key)).length;
          const isActive = statusFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(isActive && f.key !== "all" ? "all" : f.key)}
              className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-all ${
                isActive
                  ? "bg-accent text-accent-fg font-bold"
                  : "border border-border-solid text-fg hover:bg-active"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${isActive ? "text-accent-fg" : "text-fg-faint"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Function category filters */}
      <div className="mb-4 flex flex-wrap gap-1">
        {FUNCTION_TAGS.map((tag) => {
          const count = functionCounts.get(tag.key) ?? 0;
          if (count === 0) return null;
          const isActive = functionFilter === tag.key;
          return (
            <button
              key={tag.key}
              onClick={() => setFunctionFilter(isActive ? null : tag.key)}
              className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all ${
                isActive
                  ? "bg-accent text-accent-fg font-bold"
                  : "border border-border-interactive text-fg hover:bg-active"
              }`}
            >
              {tag.label}
              <span className={`ml-1.5 ${isActive ? "text-accent-fg" : "text-fg-faint"}`}>
                {count}
              </span>
            </button>
          );
        })}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-faint hover:text-fg transition-all"
          >
            CLEAR ALL
          </button>
        )}
      </div>

      {/* Results count */}
      {hasActiveFilters && (
        <p className="mb-3 font-mono text-xs text-fg-faint">
          {filtered.length} OF {skills.length} SKILLS
        </p>
      )}

      {/* Skills list */}
      {filtered.length === 0 ? (
        <div className="border border-border-solid p-6 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.15em] text-fg">NO MATCHING SKILLS</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 border border-border-solid px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
            >
              CLEAR FILTERS
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((skill, idx) => {
            const tags = getSkillTags(skill);
            return (
              <div
                key={skill.key ?? idx}
                className={`border border-border-solid p-4 transition-all ${
                  !skill.eligible ? "opacity-40" : "hover:bg-active"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Left: skill info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-sm shrink-0 text-fg">
                        {skill.enabled ? "●" : "○"}
                      </span>
                      <span className="font-mono text-sm font-bold uppercase tracking-wide text-fg">
                        {skill.name}
                      </span>
                      {skill.bundled && (
                        <span className="border border-border-solid px-2 py-0.5 font-mono text-[10px] text-fg uppercase tracking-wider shrink-0">
                          BUNDLED
                        </span>
                      )}
                      {!skill.eligible && (
                        <span className="border border-border-solid px-2 py-0.5 font-mono text-[10px] text-fg uppercase tracking-wider shrink-0">
                          INELIGIBLE
                        </span>
                      )}
                      {/* Function tags */}
                      {tags.map((t) => {
                        const label = FUNCTION_TAGS.find((ft) => ft.key === t)?.label ?? t;
                        return (
                          <button
                            key={t}
                            onClick={() => setFunctionFilter(functionFilter === t ? null : t)}
                            className={`px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider shrink-0 transition-all ${
                              functionFilter === t
                                ? "bg-accent text-accent-fg"
                                : "border border-border-interactive text-fg-faint hover:text-fg"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {skill.description && (
                      <p className="mt-1.5 ml-6 font-mono text-xs text-fg-faint leading-relaxed">
                        {skill.description}
                      </p>
                    )}
                    {skill.missing && skill.missing.length > 0 && (
                      <p className="mt-1.5 ml-6 font-mono text-xs text-fg">
                        MISSING: {skill.missing.join(", ")}
                      </p>
                    )}
                  </div>

                  {/* Right: toggle */}
                  <button
                    onClick={() => toggleSkill(skill.key, !skill.enabled)}
                    disabled={!skill.eligible}
                    className={`shrink-0 px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
                      skill.enabled
                        ? "bg-accent text-accent-fg"
                        : "border border-border-solid text-fg hover:bg-active"
                    }`}
                  >
                    {skill.enabled ? "[ON]" : "[OFF]"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
