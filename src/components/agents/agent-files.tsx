"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useEffect, useState, useCallback, useRef } from "react";
import type { AgentFileEntry } from "@/lib/gateway/types";

// ---------------------------------------------------------------------------
// File icon mapping
// ---------------------------------------------------------------------------
const FILE_ICONS: Record<string, string> = {
  "agents.md": "◈",
  "soul.md": "◉",
  "tools.md": "◆",
  "identity.md": "◎",
  "bootstrap.md": "◇",
};

function getFileIcon(name: string): string {
  return FILE_ICONS[name] ?? "□";
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function formatDate(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${min}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AgentFiles({ agentId }: { agentId: string }) {
  const rpc = useGatewayStore((s) => s.rpc);
  const [files, setFiles] = useState<AgentFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = content !== originalContent;
  const lineCount = content.split("\n").length;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rpc<{ files: AgentFileEntry[] }>("agents.files.list", { agentId });
      setFiles(result.files);
    } catch (err) {
      console.error("Failed to load files:", err);
    } finally {
      setLoading(false);
    }
  }, [agentId, rpc]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Keyboard shortcut: Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && selectedFile && !saving) saveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, selectedFile, saving]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFile = async (name: string) => {
    if (isDirty && !confirm("You have unsaved changes. Discard them?")) return;
    setFileLoading(true);
    setSelectedFile(name);
    setSaveMessage(null);
    try {
      const result = await rpc<{ file: AgentFileEntry }>("agents.files.get", { agentId, name });
      const text = result.file.content ?? "";
      setContent(text);
      setOriginalContent(text);
    } catch (err) {
      console.error("Failed to load file:", err);
      setContent("");
      setOriginalContent("");
    } finally {
      setFileLoading(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await rpc("agents.files.set", { agentId, name: selectedFile, content });
      setOriginalContent(content);
      setSaveMessage("SAVED");
      setTimeout(() => setSaveMessage(null), 2000);
      await fetchFiles();
    } catch (err) {
      setSaveMessage(`ERROR: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    setContent(originalContent);
  };

  if (loading) {
    return (
      <div className="font-mono text-sm uppercase tracking-[0.15em] text-fg">
        LOADING FILES...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold uppercase tracking-wide text-fg">FILES</h3>
          <span className="font-mono text-xs text-fg-faint">{files.length} FILES</span>
        </div>
        <button
          onClick={fetchFiles}
          className="border border-border-solid px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
        >
          REFRESH
        </button>
      </div>

      <div className="flex gap-0 border border-border-solid">
        {/* File sidebar */}
        <div className="w-56 shrink-0 border-r border-border-solid bg-surface">
          {/* Sidebar header */}
          <div className="border-b border-border-solid px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
              EXPLORER
            </span>
          </div>

          {/* File list */}
          <div>
            {files.map((f) => {
              const isSelected = selectedFile === f.name;
              return (
                <button
                  key={f.name}
                  onClick={() => loadFile(f.name)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 font-mono text-xs transition-all ${
                    isSelected
                      ? "bg-active text-fg border-l-2 !border-l-accent"
                      : "text-fg-faint hover:text-fg hover:bg-hover border-l-2 !border-l-transparent"
                  } ${f.missing ? "opacity-40" : ""}`}
                >
                  <span className="shrink-0 text-[11px]">{getFileIcon(f.name)}</span>
                  <span className="truncate font-bold uppercase tracking-wide">{f.name}</span>
                  {f.missing && (
                    <span className="ml-auto border border-border-solid px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-fg shrink-0">
                      NEW
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* File details (when selected) */}
          {selectedFile && (() => {
            const f = files.find((x) => x.name === selectedFile);
            if (!f) return null;
            return (
              <div className="border-t border-border-solid px-3 py-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint mb-2">
                  DETAILS
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-fg-faint">SIZE</span>
                    <span className="text-fg">{formatSize(f.size)}</span>
                  </div>
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="text-fg-faint">LINES</span>
                    <span className="text-fg">{lineCount}</span>
                  </div>
                  {f.updatedAtMs && (
                    <div className="flex justify-between font-mono text-[10px]">
                      <span className="text-fg-faint">MODIFIED</span>
                      <span className="text-fg">{formatDate(f.updatedAtMs)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Editor pane */}
        <div className="flex-1 flex flex-col min-h-[600px]">
          {selectedFile ? (
            <>
              {/* Editor toolbar */}
              <div className="flex items-center justify-between border-b border-border-solid px-3 py-1.5 bg-surface">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold uppercase tracking-wide text-fg">
                    {getFileIcon(selectedFile)} {selectedFile}
                  </span>
                  {isDirty && (
                    <span className="bg-accent text-accent-fg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">
                      MODIFIED
                    </span>
                  )}
                  {saveMessage && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                      {saveMessage}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {isDirty && (
                    <button
                      onClick={discardChanges}
                      className="border border-border-solid px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg hover:bg-active transition-all"
                    >
                      DISCARD
                    </button>
                  )}
                  <button
                    onClick={() => loadFile(selectedFile)}
                    className="border border-border-solid px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg hover:bg-active transition-all"
                  >
                    RELOAD
                  </button>
                  <button
                    onClick={saveFile}
                    disabled={!isDirty || saving}
                    className="bg-accent px-4 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {saving ? "SAVING..." : "SAVE"}
                  </button>
                </div>
              </div>

              {/* Editor body with line numbers */}
              {fileLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="font-mono text-sm uppercase tracking-[0.15em] text-fg">
                    LOADING...
                  </span>
                </div>
              ) : (
                <div className="flex-1 flex overflow-hidden">
                  {/* Line numbers */}
                  <div className="shrink-0 select-none border-r border-border-muted bg-surface-alt px-2 py-3 text-right overflow-hidden">
                    {Array.from({ length: lineCount }, (_, i) => (
                      <div
                        key={i}
                        className="font-mono text-[11px] leading-[1.65] text-fg-ghost"
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  {/* Textarea */}
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="flex-1 bg-surface p-3 font-mono text-[13px] leading-[1.65] text-fg focus:outline-none resize-none overflow-auto"
                    spellCheck={false}
                    onScroll={(e) => {
                      // Sync line numbers scroll with textarea
                      const target = e.target as HTMLTextAreaElement;
                      const lineNums = target.previousElementSibling as HTMLElement;
                      if (lineNums) lineNums.scrollTop = target.scrollTop;
                    }}
                  />
                </div>
              )}

              {/* Status bar */}
              <div className="flex items-center justify-between border-t border-border-solid px-3 py-1 bg-surface-alt">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[10px] text-fg-faint uppercase tracking-wider">
                    {lineCount} LINES
                  </span>
                  <span className="font-mono text-[10px] text-fg-faint uppercase tracking-wider">
                    {content.length} CHARS
                  </span>
                </div>
                <span className="font-mono text-[10px] text-fg-ghost uppercase tracking-wider">
                  CMD+S TO SAVE
                </span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="font-mono text-fg-ghost text-4xl">□</div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-faint">
                SELECT A FILE TO EDIT
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {files.filter((f) => !f.missing).slice(0, 4).map((f) => (
                  <button
                    key={f.name}
                    onClick={() => loadFile(f.name)}
                    className="border border-border-solid px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg hover:bg-active transition-all"
                  >
                    {getFileIcon(f.name)} {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
