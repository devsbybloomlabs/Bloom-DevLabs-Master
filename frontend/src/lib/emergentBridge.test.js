/**
 * Unit tests for the Emergent bridge.
 * Pure-function tests against the buildEmergentPrompt builder.
 */
import { buildEmergentPrompt } from "./emergentBridge";

describe("buildEmergentPrompt", () => {
  const baseTask = {
    id: "t1",
    title: "Build the marketing hero",
    description:
      "Build a React component at /src/pages/Landing.jsx that renders a sticky hero with H1, subtext, and a primary CTA. Use shadcn Button + the existing tokens.css.",
    priority: "high",
    milestone_id: "m1",
    due_date: "2026-06-15T00:00:00Z",
  };
  const project = { name: "Acme Workspace", client_email: "client@acme.co" };
  const milestoneTitle = "Build — Core flows";

  it("includes the task title as a heading", () => {
    const out = buildEmergentPrompt({ task: baseTask, project, milestoneTitle });
    expect(out).toMatch(/^# Build the marketing hero/);
  });

  it("includes project + client + milestone + priority + due", () => {
    const out = buildEmergentPrompt({ task: baseTask, project, milestoneTitle });
    expect(out).toContain("**Project:** Acme Workspace");
    expect(out).toContain("**Client:** client@acme.co");
    expect(out).toContain("**Milestone:** Build — Core flows");
    expect(out).toContain("**Priority:** high");
    expect(out).toMatch(/\*\*Due:\*\* /);
  });

  it("passes the task description through verbatim", () => {
    const out = buildEmergentPrompt({ task: baseTask, project, milestoneTitle });
    expect(out).toContain(baseTask.description);
  });

  it("includes the always-true house rules block", () => {
    const out = buildEmergentPrompt({ task: baseTask, project, milestoneTitle });
    expect(out).toContain("**House rules:**");
    expect(out).toContain("/api");
    expect(out).toContain("MONGO_URL");
    expect(out).toContain("REACT_APP_BACKEND_URL");
    expect(out).toContain("data-testid");
    expect(out).toContain("shadcn");
  });

  it("gracefully handles tasks without a description", () => {
    const t = { ...baseTask, description: "" };
    const out = buildEmergentPrompt({ task: t, project, milestoneTitle });
    expect(out).toContain("(No description yet");
  });

  it("returns empty string when task is null", () => {
    expect(buildEmergentPrompt({ task: null })).toBe("");
  });

  it("works without project or milestone (graceful degradation)", () => {
    const out = buildEmergentPrompt({ task: baseTask });
    expect(out).toContain(baseTask.title);
    expect(out).toContain(baseTask.description);
    // Context bits should be absent — no "Project:" line
    expect(out).not.toContain("**Project:**");
  });
});
