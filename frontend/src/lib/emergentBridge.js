/**
 * emergentBridge.js — "Send to Emergent" one-click helper.
 *
 * Takes a Project Mode task + its parent project and produces a ready-to-
 * paste prompt for emergent.sh. Copies it to the clipboard and opens
 * Emergent in a new tab. The agent at the receiving end gets all the
 * context it needs (project, milestone, priority, the actual ask).
 */
const EMERGENT_BASE_URL = "https://app.emergent.sh";

/**
 * Build the markdown prompt block that gets pasted into Emergent.
 * Kept short + scannable — Emergent's input box gets noisy quickly.
 */
export function buildEmergentPrompt({ task, project, milestoneTitle }) {
  if (!task) return "";
  const lines = [];
  lines.push(`# ${task.title}`);
  lines.push("");

  // Compact context block
  const ctxBits = [];
  if (project?.name) ctxBits.push(`**Project:** ${project.name}`);
  if (project?.client_email) ctxBits.push(`**Client:** ${project.client_email}`);
  if (milestoneTitle) ctxBits.push(`**Milestone:** ${milestoneTitle}`);
  if (task.priority) ctxBits.push(`**Priority:** ${task.priority}`);
  if (task.due_date) {
    const due = new Date(task.due_date).toLocaleDateString();
    ctxBits.push(`**Due:** ${due}`);
  }
  if (ctxBits.length) {
    lines.push(ctxBits.join(" · "));
    lines.push("");
  }

  // The actual prompt — Project Mode tasks are already authored as
  // Emergent-ready descriptions by the AI generator, so we pass it through
  // verbatim.
  if (task.description?.trim()) {
    lines.push(task.description.trim());
  } else {
    lines.push("(No description yet — please outline the implementation plan.)");
  }

  // Always-true house rules — saves the team re-typing every time.
  lines.push("");
  lines.push("---");
  lines.push("**House rules:**");
  lines.push("- All backend routes prefixed `/api`.");
  lines.push("- Use `MONGO_URL` + `DB_NAME` from `backend/.env` (do not hard-code).");
  lines.push("- Frontend must call `process.env.REACT_APP_BACKEND_URL` for API.");
  lines.push("- Every interactive element gets a unique `data-testid`.");
  lines.push("- Reuse shadcn primitives in `/app/frontend/src/components/ui/`.");
  return lines.join("\n");
}

/**
 * Copy the prompt to clipboard and open Emergent in a new tab.
 * Returns the prompt text so callers can show it in a toast or modal.
 */
export async function sendToEmergent({ task, project, milestoneTitle }) {
  const prompt = buildEmergentPrompt({ task, project, milestoneTitle });
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    // Some browsers block clipboard outside HTTPS or focused contexts —
    // open Emergent anyway; the user can paste manually from a fallback.
  }
  window.open(EMERGENT_BASE_URL, "_blank", "noopener,noreferrer");
  return prompt;
}

export { EMERGENT_BASE_URL };
