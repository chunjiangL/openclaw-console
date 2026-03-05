/**
 * Parse task breakdown JSON from lead agent responses.
 *
 * Looks for the last fenced ```json block, validates schema,
 * returns structured result with error reasons.
 */

export type ParsedTask = {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
  branch: string;
  assignedWorker: string;
};

export type ParseBreakdownResult =
  | { ok: true; tasks: ParsedTask[] }
  | { ok: false; reason: "no_json_found" | "invalid_json" | "invalid_schema" };

const FENCED_JSON_RE = /```json\s*\n([\s\S]*?)```/g;

function isValidTask(t: unknown): t is ParsedTask {
  if (!t || typeof t !== "object") return false;
  const obj = t as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.title === "string" &&
    typeof obj.description === "string" &&
    Array.isArray(obj.dependencies) &&
    obj.dependencies.every((d: unknown) => typeof d === "string") &&
    typeof obj.branch === "string" &&
    typeof obj.assignedWorker === "string"
  );
}

export function parseTaskBreakdown(text: string): ParseBreakdownResult {
  // Find all fenced json blocks, take the last one
  const matches = [...text.matchAll(FENCED_JSON_RE)];
  if (matches.length === 0) {
    return { ok: false, reason: "no_json_found" };
  }

  const lastMatch = matches[matches.length - 1];
  const jsonStr = lastMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  // Validate schema: { tasks: ParsedTask[] }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid_schema" };
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.tasks)) {
    return { ok: false, reason: "invalid_schema" };
  }

  if (obj.tasks.length === 0) {
    return { ok: false, reason: "invalid_schema" };
  }

  if (!obj.tasks.every(isValidTask)) {
    return { ok: false, reason: "invalid_schema" };
  }

  return { ok: true, tasks: obj.tasks };
}

/**
 * Best-effort PR detection from agent output text.
 * Returns PR number if found, null otherwise.
 *
 * Heuristic v1 — matches common gh CLI output patterns.
 */
export function detectPrCreation(
  text: string,
): { prNumber: number; title: string } | null {
  // gh pr create outputs: "https://github.com/owner/repo/pull/123"
  const urlMatch = text.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (urlMatch) {
    const prNumber = parseInt(urlMatch[1], 10);
    // Try to extract title from nearby context
    const titleMatch = text.match(
      /(?:Creating pull request|Created pull request)[^"]*"([^"]+)"/i,
    );
    return { prNumber, title: titleMatch?.[1] ?? `PR #${prNumber}` };
  }

  // Fallback: "Created pull request #123"
  const textMatch = text.match(
    /[Cc]reated?\s+pull\s+request\s+#(\d+)/,
  );
  if (textMatch) {
    return {
      prNumber: parseInt(textMatch[1], 10),
      title: `PR #${textMatch[1]}`,
    };
  }

  return null;
}
