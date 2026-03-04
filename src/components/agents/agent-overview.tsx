"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useState, useEffect, useCallback } from "react";

type IdentityFields = {
  name: string;
  creature: string;
  vibe: string;
  emoji: string;
  avatar: string;
};

const EMPTY_IDENTITY: IdentityFields = { name: "", creature: "", vibe: "", emoji: "", avatar: "" };

const FIELD_KEYS: (keyof IdentityFields)[] = ["name", "creature", "vibe", "emoji", "avatar"];

const FIELD_LABELS: Record<keyof IdentityFields, string> = {
  name: "NAME",
  creature: "CREATURE",
  vibe: "VIBE",
  emoji: "EMOJI",
  avatar: "AVATAR",
};

const FIELD_HINTS: Record<keyof IdentityFields, string> = {
  name: "Agent name for prefixing messages",
  creature: "AI, robot, familiar, ghost, etc.",
  vibe: "sharp, warm, chaotic, calm, etc.",
  emoji: "Signature emoji for reactions",
  avatar: "URL, workspace path, or data URI",
};

/** Parse IDENTITY.md into structured fields. */
function parseIdentity(content: string): IdentityFields {
  const fields = { ...EMPTY_IDENTITY };
  for (const line of content.split("\n")) {
    const match = line.match(/^-\s*\*{0,2}(\w+):?\*{0,2}\s*(.+)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase() as keyof IdentityFields;
    if (key in fields) {
      fields[key] = match[2].trim();
    }
  }
  return fields;
}

/** Serialize structured fields back to IDENTITY.md format. */
function serializeIdentity(fields: IdentityFields): string {
  return FIELD_KEYS
    .filter((k) => fields[k].trim())
    .map((k) => `- **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${fields[k].trim()}`)
    .join("\n") + "\n";
}

export function AgentOverview({ agentId }: { agentId: string }) {
  const agents = useGatewayStore((s) => s.agents);
  const rpc = useGatewayStore((s) => s.rpc);
  const loadAgents = useGatewayStore((s) => s.loadAgents);
  const agent = agents.find((a) => a.agentId === agentId);

  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<IdentityFields>(EMPTY_IDENTITY);
  const [originalFields, setOriginalFields] = useState<IdentityFields>(EMPTY_IDENTITY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadIdentity = useCallback(async () => {
    // Don't re-fetch while user is editing — would discard unsaved changes
    if (editing) return;
    setLoading(true);
    try {
      const result = await rpc<{ file: { content?: string; missing?: boolean } }>(
        "agents.files.get", { agentId, name: "identity.md" }
      );
      const parsed = parseIdentity(result.file?.content ?? "");
      // Fall back to display name if identity.md has no name
      if (!parsed.name && agent?.name) parsed.name = agent.name;
      setFields(parsed);
      setOriginalFields(parsed);
    } catch {
      const fallback = { ...EMPTY_IDENTITY, name: agent?.name ?? "" };
      setFields(fallback);
      setOriginalFields(fallback);
    } finally {
      setLoading(false);
    }
  }, [agentId, agent?.name, rpc, editing]);

  useEffect(() => { loadIdentity(); }, [loadIdentity]);

  if (!agent) return null;

  const handleEdit = () => setEditing(true);

  const handleCancel = () => {
    setFields(originalFields);
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    let nameUpdated = false;
    try {
      const trimmedName = fields.name.trim();

      // 1. Update config display name if changed
      if (trimmedName && trimmedName !== agent.name) {
        await rpc("agents.update", { agentId, name: trimmedName });
        nameUpdated = true;
      }

      // 2. Write full IDENTITY.md
      await rpc("agents.files.set", {
        agentId,
        name: "identity.md",
        content: serializeIdentity(fields),
      });

      await loadAgents();
      setOriginalFields(fields);
      setEditing(false);
    } catch (err) {
      // If name was updated but file write failed, still refresh agents
      if (nameUpdated) await loadAgents().catch(() => {});
      alert(String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof IdentityFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="border border-border-default p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-fg-dim">{"▓"}</span>
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-fg">
            IDENTITY
          </h3>
        </div>
        <div className="h-px bg-divider-dim mb-4" />

        {loading ? (
          <p className="font-mono text-[10px] text-fg-dim uppercase tracking-wider">LOADING...</p>
        ) : editing ? (
          <div className="space-y-3">
            {FIELD_KEYS.map((key) => (
              <div key={key}>
                <label className="mb-1 flex items-baseline gap-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted">{FIELD_LABELS[key]}</span>
                  <span className="font-mono text-[8px] text-fg-ghost">{FIELD_HINTS[key]}</span>
                </label>
                <input
                  type="text"
                  value={fields[key]}
                  onChange={(e) => updateField(key, e.target.value)}
                  placeholder={FIELD_HINTS[key].toUpperCase()}
                  className="w-full border border-border-interactive bg-surface px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-border-focus"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg disabled:opacity-30"
              >
                {saving ? "SAVING..." : "SAVE"}
              </button>
              <button
                onClick={handleCancel}
                className="border border-border-interactive px-4 py-2 font-mono text-xs uppercase tracking-wider text-fg-muted hover:text-fg transition-all"
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {fields.emoji && (
                <span className="text-2xl">{fields.emoji}</span>
              )}
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-fg">{fields.name || agent.name}</p>
                <p className="font-mono text-[10px] text-fg-dim">{agent.agentId}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {fields.creature && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-dim w-20 shrink-0">CREATURE</span>
                  <span className="font-mono text-xs text-fg-subtle">{fields.creature}</span>
                </div>
              )}
              {fields.vibe && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-dim w-20 shrink-0">VIBE</span>
                  <span className="font-mono text-xs text-fg-subtle">{fields.vibe}</span>
                </div>
              )}
              {fields.avatar && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-dim w-20 shrink-0">AVATAR</span>
                  <span className="font-mono text-xs text-fg-subtle truncate">{fields.avatar}</span>
                </div>
              )}
            </div>
            {agent.workspace && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-dim w-20 shrink-0">WORKSPACE</span>
                <span className="font-mono text-xs text-fg-subtle truncate">{agent.workspace}</span>
              </div>
            )}
            <button
              onClick={handleEdit}
              className="border border-border-interactive px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg hover:border-border-hover transition-all"
            >
              EDIT IDENTITY
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
