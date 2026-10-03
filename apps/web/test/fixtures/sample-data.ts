import { z } from "zod";

// Deliberately not API envelopes: fixture IDs cannot be ingested as real UUID events.
export const sampleTaskSchema = z.object({
  id: z.string().max(80),
  title: z.string().min(1).max(100),
  owner: z.enum(["Sam", "Sri"]),
  scope: z.string().min(1).max(2000),
  state: z.enum(["active", "needs_coordination", "proposed", "paused", "awaiting_review"]),
  branch: z.string().max(100),
  files: z.array(z.string().max(200)).max(5),
  sessionId: z.string().max(80),
});
export type SampleTask = z.infer<typeof sampleTaskSchema>;
export const sampleStateSchema = z.object({
  version: z.literal(1),
  tasks: z.array(sampleTaskSchema).max(20),
  resolution: z
    .object({
      action: z.enum(["coordinate", "revise", "proceed", "reuse"]),
      objective: z.string().min(1).max(2000),
      createdAt: z.string().datetime(),
    })
    .nullable(),
  sharingPaused: z.boolean(),
});
export type SampleState = z.infer<typeof sampleStateSchema>;
export const initialSample: SampleState = {
  version: 1,
  sharingPaused: false,
  resolution: null,
  tasks: [
    {
      id: "sample-api",
      title: "Saved-college API",
      owner: "Sam",
      scope: "Create the saved-college endpoints, persistence, and per-user access checks.",
      state: "active",
      branch: "feature/saved-colleges",
      files: ["app/api/saved/route.ts", "lib/saved-colleges.ts"],
      sessionId: "sample-sam",
    },
    {
      id: "sample-shortlist",
      title: "Personal shortlist",
      owner: "Sri",
      scope: "Let people save colleges to a personal shortlist and manage their saved choices.",
      state: "needs_coordination",
      branch: "feature/shortlist",
      files: ["app/shortlist/page.tsx"],
      sessionId: "sample-sri",
    },
  ],
};
export const stateLabels: Record<SampleTask["state"], string> = {
  active: "Active",
  needs_coordination: "Needs coordination",
  proposed: "Proposed",
  paused: "Paused",
  awaiting_review: "Awaiting review",
};
export type SampleEvent = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  time: string;
  title: string;
  content: string;
  file?: string;
};
export const sampleEvents: SampleEvent[] = [
  {
    id: "sam-request",
    sessionId: "sample-sam",
    role: "user",
    time: "10:32",
    title: "Sam shared a prompt",
    content:
      "Build the saved-college API. Each person should be able to save, list, and remove their own colleges. I’ll own the backend and access checks.",
  },
  {
    id: "sam-response",
    sessionId: "sample-sam",
    role: "assistant",
    time: "10:33",
    title: "Claude Code outlined the sample API scope",
    content:
      "The sample response outlines API and persistence. The planned interface is GET /api/saved and POST /api/saved with a collegeId. The frontend is outside this request.",
  },
  {
    id: "sam-tool",
    sessionId: "sample-sam",
    role: "tool",
    time: "10:35",
    title: "Redacted sample tool activity",
    content:
      '{\n  "tool_name": "Read",\n  "relative_paths": ["app/api/colleges/route.ts"],\n  "status": "success",\n  "result_excerpt": "Existing college search route",\n  "redacted": true\n}',
    file: "app/api/colleges/route.ts",
  },
  {
    id: "sri-request",
    sessionId: "sample-sri",
    role: "user",
    time: "10:38",
    title: "Sri shared a prompt",
    content:
      "Build a personal shortlist so people can save colleges and manage their choices. Include the backend needed to store each person’s list.",
  },
  {
    id: "sri-response",
    sessionId: "sample-sri",
    role: "assistant",
    time: "10:38",
    title: "Sample advisory generated",
    content:
      "The sample advisory notes that Sam’s saved-college work includes persistence and API support. Consider the scope overlap before starting. This scripted sample is not a live provider result.",
  },
];

export function parseSampleState(raw: string | null): SampleState {
  if (!raw || raw.length > 100_000) return structuredClone(initialSample);
  try {
    return sampleStateSchema.parse(JSON.parse(raw));
  } catch {
    return structuredClone(initialSample);
  }
}

export function resolveSample(
  state: SampleState,
  action: NonNullable<SampleState["resolution"]>["action"],
  objective: string,
): SampleState {
  const trimmed = objective.trim();
  return sampleStateSchema.parse({
    ...state,
    resolution: { action, objective: trimmed, createdAt: new Date().toISOString() },
    tasks: state.tasks.map((task) =>
      task.id === "sample-shortlist"
        ? {
            ...task,
            scope: trimmed,
            title: action === "coordinate" ? "Shortlist interface" : task.title,
            state: "proposed",
          }
        : task,
    ),
  });
}
