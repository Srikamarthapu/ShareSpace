# ShareSpace decision history

This is a historical record of the PRD discussion, including superseded proposals and options. [PRD.md](../PRD.md) is the single canonical v1 specification; [WORK_SPLIT.md](WORK_SPLIT.md) defines ownership and [BUILD_PLAN.md](BUILD_PLAN.md) defines delivery gates. The source PRDs below were removed from the current tree and remain recoverable from the cited Git commit. Large-output summarization remains proposed; billing is deferred until after v1. This record does not assert that any feature is implemented.

## Sources

- Mann: `PRDS/PRD.md`, branch `mann/prds`, commit `25e3b7196adffce74c1514746bc00af01f0c8f21`.
- Sri: `PRDS/Builder_Collaboration_Workspace_PRD.pdf` on the same branch. Its SHA-256 matches the originally supplied PDF exactly: `a75d9b327e616caf23e62f03e4f26a94220186980559d60da3c15d3d6701b1ac`.
- The source files are product proposals. Technical assertions about hooks, endpoints, model probabilities, and callback flows are not verified capabilities merely because they appear in a PRD.

## Already established by the user

- Product/repository name: **ShareSpace**; GitHub repository is private.
- Sponsor requirements: **Supabase, Vercel, Stripe**; Google AI Studio is optional.
- The initial code is a WIP checkpoint. Use the reconciled decisions and current build plan for v1; finalize large-output handling before committing to full-output storage or model summaries.
- The existing starter does not determine which product proposal wins. A future $20 Stripe subscription upgrade for more teammates and repositories remains on the backlog. All billing work is deferred until v1 is implemented; billing interval, price unit, and plan limits remain open. See decision 3.

## Discussion queue

Discuss one item at a time. Related choices may collapse after an earlier decision.

| # | Decision | Mann proposal | Sri proposal | Classification / source |
| --- | --- | --- | --- | --- |
| 1 | What happens after an overlap warning? | Inject a warning with teammate/session context and record it in a Conflicts feed. | Save a scope decision, preview approved context, deliver it on explicit resubmission, and observe the resulting work. | Release-scope difference: Mann §§4.5, 5.6, 10; Sri pp.6, 14, 32. |
| 2 | Agent support in the first release | Claude Code, then Codex and Cursor; demo-critical path uses Claude Code. | One proven Claude Code adapter; second adapter later. | Resolved: Claude Code and Codex required; Cursor deferred. Mann §§3, 10; Sri pp.5, 8, 30. |
| 3 | Team/project/repository scope | Multiple flat teams and linked repositories per user. | One organization, project, and repository in the first UI. | Resolved: one team/one repo initially, with a $20 subscription upgrade option for more teammates/repos. Billing completion is lower priority if time permits. Mann §§4.2, 5.1, 7; Sri pp.5, 7, 22. |
| 4 | How existing implementation is checked | Own coding agent searches locally after an injected instruction; server compares shared intent and recent diffs. | App checks approved versioned code snapshots and bounded source evidence as well as team intent. | Resolved: A, with Jev comparing supplied team context and Claude Code/Codex searching local code. No first-release source indexing pipeline. Mann §5.6; Sri pp.11–13. |
| 5 | Advisory or interrupting checks | Warning-only; blocking explicitly excluded. | Advisory default, optional review-on-likely-duplicate that stops a submitted prompt for explicit review. | Resolved by decision 1: warning-only for the first release. Failure/unknown visibility is resolved separately in 12a. |
| 6 | What represents ongoing work? | Sessions, recent prompts, diff snapshots, and activity timestamps. | Explicit task records/revisions, lifecycle, ownership, and active-intent revisions. | Resolved: shared sessions and recent request/activity context; separate task records and lifecycle are deferred. Mann §§5.5–5.6, 7; Sri pp.9, 15, 22. |
| 7 | Sharing consent and connection scope | User default plus per-repo overrides; user-level hooks and repo linking. Initial default not specified. | Default not sharing; explicit session consent, repository-bound device, approved capture preview. | Resolved: repository-level opt-in, automatic sharing for future sessions in that repository, and pause/private-session controls. Unlinked repos stay private. Mann §§4.1–4.3, 5.2; Sri pp.8, 25. |
| 8 | Jev personal-content screening | A redacted prompt goes to a privacy-check function and Jev; flagged/unavailable results pause upload. | Local redaction and intentional sharing; no automatic personal-content classifier required. | Resolved: automated personal-content screening deferred; retain local secret redaction and manual pause/private controls. Mann §§4.4, 5.4; Sri pp.8, 26. |
| 9 | Backend location | Supabase Edge Functions for ingestion and model calls. | Next.js API endpoints on Vercel for those responsibilities. | Resolved: Supabase Edge Functions for the application API, Supabase Auth/Postgres/Realtime, and the Next.js web app on Vercel. Compute is not required for v1. Mann §6; Sri p.21. |
| 10 | CLI credentials and revocation | Browser login hands user access/refresh tokens to the CLI. | Project/repository-bound, revocable device credentials. | Resolved: B, separate repository-scoped device credentials approved through browser sign-in and independently revocable. These are ShareSpace credentials, separate from Claude Code/Codex account credentials. Mann §6.4; Sri pp.7–8, 25–26. |
| 11 | Invitations | Reusable team link that an admin can rotate. | Hashed, single-use, expiring/revocable invitation with atomic consumption. | Resolved for the demo: A, reusable invite link with sign-in required and admin rotation. Single-use invitations and seven-day expiry are deferred. Mann §5.1; Sri p.7. |
| 12 | Failures, confidence, and freshness | Conflict failure continues without a warning; verdict probability shown; live based on a recent event. | Visible unknown on failure; evidence-first explanations rather than raw confidence; heartbeat freshness distinct from task state. | Resolved: 12a visible nonblocking failure status; 12b numeric model score with warning/context and verified score semantics; 12c event-based recent-activity timestamps for the demo, without separate heartbeats. Mann §§5.4–5.6; Sri pp.8–12, 15, 27. |
| 13 | Retention and payload/storage scope | Retention undecided; larger tool output/diffs stored in Supabase Storage. | Proposed 14-day retention; bounded excerpts and no large attachment storage in P0. | 13a resolved: storage-based rolling history with per-user warnings, oldest-first cleanup, and a shared database guard; no fixed 14-day expiry. Payload/storage scope (13b) remains pending. Mann §§5.5, 6.3, 7, 12; Sri pp.22–23, 26. |
| 14 | Sponsor feature roles | Supabase/Vercel/Jev included; Stripe and Gemini absent. | Supabase/Vercel/Jev included; billing deferred, Gemini absent. | User explicitly deferred all Stripe/billing until after v1. Future $20 subscription details remain open under decision 3. Gemini remains optional. Existing sandbox Checkout is not a v1 requirement. |

## Compatible details and technical follow-ups

- Both prioritize a TypeScript monorepo, a local CLI, local secret redaction, a Next.js web UI, Supabase, Vercel, Jev, and a real two-builder Claude Code demo.
- Mann excludes cross-transcript search; Sri asks for search inside a session. Those can coexist.
- Transcript comments/reactions are different from a scope-specific coordination thread; choose the latter only if decision 1 requires it.
- One proposal's omission of deduplication, race protection, deletion propagation, source access checks, or unknown states is not automatically a vote against those safeguards.
- Verify all proposed Claude/Cursor/Codex hooks against exact installed versions before promising compatibility.
- Verify the proposed Jev gateway endpoint, request schema, and probability semantics against current official documentation before implementing them.
- Review CLI login callback token handling before adopting the proposed browser-to-localhost flow.

## Decision 1 — approved: A / awareness and warnings

Question: for the first release, what should happen after a likely overlap is found?

- A. Warning and session link only; user coordinates outside ShareSpace.
- B. Lightweight coordination: warning with evidence, a recorded choice/revised objective, and approved context for the next agent prompt. Defer a negotiation thread and richer task management.
- C. Full coordination workflow described in Sri's PDF, including task boundaries, teammate acceptance where relevant, structured context packets, and delivery acknowledgement.

User decision: **A.** "I think A is good enough, just a warning is fine."

First-release behavior: show shared sessions, warn the agent about likely overlapping work with a link to the relevant teammate session, and retain the warning in the feed. The warning is advisory; users coordinate through their existing workflow.

Defer saved scope-resolution workflows, teammate acceptance threads, approved continuation packets, and delivery acknowledgement. This also resolves item 5 in favor of non-blocking warnings. It does not decide how existing-code evidence is obtained, which agent integrations ship, or how unavailable checks are communicated.

The starter's sample coordination UI and draft resolution schema are not required features under this decision. Reconcile that implementation after the product decisions are complete.

## Decision 2 — approved: Claude Code and Codex

- A. Claude Code only for the first release; add Codex and Cursor afterward.
- B. Claude Code, Codex, and Cursor must all be supported before the first release is complete.

Both PRDs start implementation with Claude Code. The difference is the release requirement, not which adapter to build first. Exact installed-version compatibility still needs verification.

User decision: **Claude Code and Codex.** "Claude code and codex"

Both integrations are required for the first release. Cursor is deferred. The proposed documents target local CLI adapters; exact supported versions and capabilities must be verified before advertising integration support. Do not infer that either integration already works from this product decision.

## Decision 3 — approved: one team/repository initially, subscription expansion

- A. One team and one repository in the first release.
- B. One team with multiple linked repositories; team switching comes later.
- C. Multiple teams, each with multiple linked repositories, as in Mann's proposal.

The current comparison concerns first-release scope, not a permanent product limit. Repository boundaries and authorization must remain explicit under every option.

User decision: **A for now**, with an option to add more teammates and repositories through a **$20 Stripe subscription**. The option should be present; making billing fully functional and testing it can happen near the end if time permits.

- Base scope: one team and one repository. Base member allowance is not yet specified.
- Planned paid upgrade: additional teammates and repositories within the team. Multiple teams have not been approved.
- Preserve an upgrade entry point and describe unavailable billing honestly until it is connected.
- Recurring billing period (monthly/yearly), whether $20 is per team or per seat, and both base/paid limits remain undecided. Do not create a Stripe Price or assume monthly/per-team pricing yet.
- Implement and test subscription checkout, webhook-driven access, and subscription lifecycle after the core collaboration flow, subject to available time.
- The existing one-time sandbox Checkout/receipt scaffold is not a subscription implementation and will need to be reconciled with this decision.

Latest user update: "Keep the Stripe and billing stuff for later. We're gonna first implement the first version of our PRD and then get back to that later." This supersedes the earlier request to include an upgrade option in the first milestone. Defer new billing pages, upgrade prompts, Stripe integration work, pricing/plan-limit decisions, and billing tests until after the core v1 works. Leave the existing sandbox scaffold out of the v1 acceptance path; no billing resources are provisioned or modified by this decision.

## Decision 4 — approved: local code search, Jev overlap checks

- A. ShareSpace checks teammate overlap and tells the user's own coding agent to search the local codebase before implementing (Mann §5.6).
- B. ShareSpace also retrieves approved, versioned source snippets and performs its own existing-implementation evidence check (Sri pp.11–13).

Both approaches retain teammate overlap warnings. This choice determines who performs the existing-code check and whether source indexing/retrieval is needed in the first release.

User decision: **A**, with Jev involved: "A, we can have jev do this".

Responsibility split recorded from that choice:

- ShareSpace supplies authorized, redacted request and teammate activity context to Jev.
- Jev classifies the request and evaluates likely overlap using that supplied context; application code validates its result and presents the advisory warning.
- Claude Code or Codex searches the local repository for existing implementation before building.
- A ShareSpace-managed source index and repository search pipeline are deferred.

Technical clarification: Jev evaluates supplied state; it does not independently inspect the user's filesystem. Source-backed judgments by Jev would require us or the local agent to retrieve and supply that evidence. Verified against [TypeSafe state documentation](https://docs.typesafe.ai/concepts/state) and [Choice documentation](https://docs.typesafe.ai/primitives/choice) on October 3, 2026. This role split is explained to the user alongside recording the decision; no live integration is claimed.

## Decision 5 — resolved by decision 1

Warnings are advisory. No blocking/review requirement in the first release. Decision 12a resolves failure visibility: continue with a small unavailable/unknown status.

## Decision 6 — approved: session-based work tracking

- A. Use shared agent sessions and recent request/activity context to show ongoing work and compare overlap. No separate task board or user-maintained task lifecycle in the first release.
- B. Also create explicit task records with their own scope, lifecycle status, and revisions, separate from sessions.

User decision: **A.**

Show ongoing work through the builder's shared agent session, recent request, branch, and observed activity. Supply authorized session context to Jev for overlap checks. Defer a separate task board, task records, and a user-maintained task lifecycle. Session summaries describe observed activity; they do not prove a feature is implemented or complete.

## Decision 7 — approved: repository-level sharing opt-in

- A. Approve each session individually before its activity is shared.
- B. Enable sharing for a repository once; future sessions in that repository share automatically, with controls to pause sharing or make a session private.

User decision: **B.**

The builder explicitly enables sharing for a repository once. Future sessions in that repository share automatically, with controls to pause sharing or make a session private. Unlinked repositories remain private. This does not authorize global sharing across unrelated repositories. Automated personal-content screening is deferred under decision 8.

## Decision 8 — approved: automated personal-content screening deferred

Local secret redaction remains required under either option.

- A. Use local redaction and the manual pause/private controls only in the first release.
- B. Also send redacted prompts from sharing-enabled sessions to Jev for a personal-content check. A flagged prompt or unavailable check pauses team sharing until the user explicitly chooses to share or keep the session private.

For B, the screen controls visibility to teammates, not whether text leaves the laptop: the redacted prompt is sent to the backend/Jev before the classification result exists. Sessions already marked private remain excluded. The model's decision is not a guarantee that all personal content is detected, and this adds a potential delay or false alarm to automatic sharing.

User decision: defer this feature for now. "I think thats an edge case we shouldn't worry about for now"

First-release scope follows A: retain local secret redaction and manual pause/private controls; omit the personal-content classifier, its upload-pausing workflow, and its separate model call. Jev remains responsible for teammate-overlap classification. This decision does not remove privacy controls or decide how overlap-check failures are displayed.

## Decision 9 — approved: Supabase Edge Functions backend

- A. Next.js API endpoints on Vercel handle event ingestion and Jev calls. Supabase provides authentication, Postgres, and Realtime.
- B. Supabase Edge Functions handle event ingestion and Jev calls; the Next.js dashboard stays on Vercel.

User decision: **B.** "Ok lets go in that direction then, next?"

Use Supabase Edge Functions for the application API, including agent event ingestion and Jev overlap checks. Keep the Next.js interface on Vercel, with Supabase Auth/Postgres/Realtime for accounts and shared state. Supabase Compute is not required for v1. The existing agent endpoints are placeholders; implementing this boundary remains future work after reconciliation. The existing Next.js one-time sandbox billing routes must be reconciled with the selected subscription design when billing is implemented; they have not been migrated by this decision.

### Supabase Compute follow-up (October 3, 2026)

The user asked about hosting the backend in Supabase or Supabase Compute. [Supabase Compute](https://supabase.com/compute) is a distinct service for sandboxes and long-running backend services, with Node/Deno/Dockerfile support. Its current page identifies it as private alpha and intended for internal evaluation rather than production/end-customer workloads. Access has not been verified for this team.

For the currently selected scope, event ingestion, short evidence retrieval, a Jev call, and Stripe webhooks are request-based work. The working assessment is that [Supabase Edge Functions](https://supabase.com/docs/guides/functions) fit those responsibilities without requiring a persistent Compute service. Exact latency, provider SDK compatibility, and deployed operation still require a spike; no speed or cost advantage has been measured. Supabase Realtime supplies the persistent update channel.

Compute remains a possible internal experiment if the team has alpha access or later needs long-running workers. The user approved Edge Functions, not provisioning Compute. Application changes remain paused during PRD reconciliation.

## Decision 10 — approved: repository-scoped device credentials

Both options can begin with browser sign-in. The distinction is the credential stored by the local ShareSpace adapter used with Claude Code and Codex.

- A. Store the user's Supabase access and refresh tokens locally and call the backend as that user, subject to the user's permissions. This follows Mann §6.4 and requires less custom pairing infrastructure.
- B. After browser approval, issue a separate device credential limited to the approved repository and required adapter operations. Support revoking that connection independently of the user's other sessions. This follows Sri pp.7–8, 25–26 and requires a pairing and credential-validation flow.

User decision: **B.** "Lets go with your rec, next"

Use a separate repository-scoped device credential after browser approval, with independent revocation for that connection. These credentials authenticate the adapter to ShareSpace; they do not reuse Claude Code or Codex subscription/account credentials. Exact token format, secure local storage, expiry/rotation, and browser pairing mechanics remain implementation details to verify. This decision does not authorize sharing from unlinked repositories or remove backend membership checks.

## Decision 11 — approved for demo: reusable teammate invitations

- A. A reusable team invite link. Signed-in users with the link can join; an admin can rotate it to stop future use. This follows Mann §5.1.
- B. A separate single-use invite link for each join, expiring after seven days unless revoked sooner. Accepting it requires sign-in. Store only its token hash and consume it atomically so it cannot admit multiple users. This follows Sri p.7, including the proposed seven-day default.

User decision: **A.** "A is simpler, its fine for the demo"

Use a reusable team invite link for the demo. A signed-in user with a valid link can join as a member, subject to the selected membership limits. An admin can rotate the link to prevent future use of the old link; rotating it does not remove existing members. Single-use invitations and the proposed seven-day expiry are deferred. This decision does not authorize sending any invitations during reconciliation.

## Decision 12a — approved: visible, nonblocking check failures

Both options allow the coding agent to continue when Jev or the backend fails or times out; blocking checks were already excluded by decision 1. An unsuccessful check remains unknown internally and must never be represented as a successful clear result.

- A. Continue silently, without a user-facing failure notice. This follows Mann §5.6's fail-open behavior.
- B. Continue and show a small status message such as "Overlap check unavailable — continuing." This follows Sri's visible-unknown requirement without adding an approval step.

User decision: **B.**

On an overlap-check failure or timeout, let the coding agent continue and show a small status message such as "Overlap check unavailable — continuing." Preserve unknown as distinct from a completed check with no overlap found. Do not add a blocking dialog or approval step.

## Decision 12b — approved: numeric model score with overlap warnings

Both options include relevant teammate/session context and a link to the shared session, as approved in decision 1.

- A. Also display the model's numeric confidence/probability alongside its overlap verdict, following Mann §5.5. Verify the provider's score semantics before implementation; do not label an unverified score as a measured likelihood of correctness.
- B. Show a plain-language overlap warning and the supporting shared context without a numeric confidence percentage, following Sri's evidence-first presentation.

User decision: **A.**

Include the model's numeric score alongside the overlap warning, supporting teammate/session context, and session link. Verify the provider's returned values and score semantics before choosing a percentage label; do not invent a score or describe it as measured accuracy. Missing scores remain unavailable. Classification thresholds remain an implementation detail to validate.

## Decision 12c — approved for demo: recent session activity

- A. Use received session events and their timestamps to show recent activity, for example "Last activity 2 minutes ago." No separate periodic connection signal is required for the demo. This follows Mann §5.5's event-based approach, with labels that describe observed activity rather than assert current connectivity.
- B. Also send a periodic lightweight heartbeat from the local adapter to show connection freshness separately from session activity. Sri p.8 proposes a 15-second interval and a stale threshold of 60 seconds; these are proposed defaults to verify during implementation.

User decision: **A.**

For the demo, show recent-activity timestamps from session events without a separate heartbeat mechanism. Silence or a disconnected adapter never proves the work is finished, and recent activity does not prove current connectivity. Use explicit session stop/end events where supported; do not infer feature completion from them. Delayed/retried events must not be presented as new activity merely because they arrived recently.

## Decision 13a — approved: storage-based rolling session history

User decision: retain history in a sliding window based on storage usage, warn near a reasonable per-person allowance, and automatically delete older histories to avoid exhausting the free database tier. The user delegated choosing reasonable thresholds. This supersedes the proposed fixed 14-day expiry; history can remain longer while usage stays low.

Starting demo defaults selected under that authorization (decimal MB):

- Per-user shared-history content ceiling: **50 MB total across the user's repositories**, not 50 MB per session or repository.
- At a projected **40 MB**, warn the user that the oldest history is being removed and prune oldest inactive stored sessions until accounted usage is **30 MB or lower**. Check during ingestion, with periodic reconciliation as a backstop, rather than waiting for a daily cleanup.
- Preserve the current active session. If eligible older history cannot make enough room, pause accepting further shared content before the 50 MB ceiling; show a storage-limited status and let the local coding agent continue. An indefinitely active session is not exempt from the byte ceiling.
- Count stored event content, diff excerpts, and related content in the budget. If object storage is later selected, its content must also be accounted for. Purge derived excerpts with their source history and invalidate cached content; old evidence links should show that history was removed. Retry handling must not resurrect pruned sessions.
- Track **actual total database size separately** because per-user content bytes do not include all database overhead. At **350 MB**, warn and initiate eligible cleanup/maintenance; at a projected **400 MB**, stop accepting new session-content writes if safe headroom cannot be established. Resume only after fresh server-side measurements and conservative write reservations establish room, normally below the 350 MB threshold. Do not delete other users' below-threshold history merely to satisfy one user's allowance.

Use atomic byte reservations and bounded batches so simultaneous uploads cannot each spend the same available quota. Provider dashboard metrics alone are too stale for admission control. If usage measurements are unavailable, do not assume space is free. These are conservative initial thresholds, not a tested guarantee: physical storage includes indexes, database-maintenance overhead, other tables, and independent writes. Verify concurrent uploads, realistic event mixes, cleanup failure, oversized active sessions, and storage reuse before claiming the design prevents quota exhaustion. Adding users requires checking shared capacity; a per-person allowance does not create new Supabase capacity.

Scope: remove only ShareSpace's saved shared content and associated excerpts, never the original local agent history or repository files. Retention-related deletion should be explained when sharing is enabled and surfaced when cleanup starts. No live ingestion, cleanup job, or data deletion is implemented by this PRD decision; application changes remain paused during reconciliation.

Capacity evidence checked October 3, 2026: [Supabase pricing](https://supabase.com/pricing) lists a 500 MB database allowance per Free project. [Database size guidance](https://supabase.com/docs/guides/platform/database-size) explains that this is shared project capacity, includes more than payload bytes, can become read-only at the limit, and does not necessarily shrink immediately after rows are deleted. Illustrative prior assumptions of two builders each generating 1,000 events/day at 4,000 bytes/event yield 8 MB/day; these are not measured ShareSpace traffic. The rolling policy bounds retained content instead of assuming a fixed number of days fits all usage.

## Decision 13b — pending: large tool outputs and diffs

- A. Store bounded, redacted text excerpts in database events for the demo. Mark truncation visibly and omit a separate large-output file store. This follows Sri's bounded-capture scope.
- B. Also preserve larger redacted tool outputs/diffs as files in Supabase Storage, linked from database events. This follows Mann's storage proposal and adds file access, fetching, deletion, and separate provider storage accounting.
- C. Use the user's existing DeepSeek endpoint selectively to summarize oversized tool outputs/diffs, storing a bounded summary plus compact exact evidence. This is a new user-proposed alternative, not a requirement from either PRD.

Initial recommendation was A for the demo. After the user's summarization proposal, C is a promising hybrid, conditional on a small quality/latency/cost check of the actual endpoint; A remains its fallback. The user has asked for an assessment, not yet approved C. All choices require explicit size limits and must count retained content toward the user's history budget; B does not authorize unlimited outputs or a source indexing pipeline.

DeepSeek follow-up: preserve short redacted outputs and user prompts; summarize only large tool outputs/diffs. Extract source facts deterministically (event IDs, paths, timestamps, tool name, exit status, changed-file/hunk metadata, and bounded exact errors/code excerpts). Store generated text separately, labeled as an AI summary with coverage/truncation information and source references. Validate structured output and enforce a byte budget; accept a summary only when it is smaller than the material it replaces. A source hash can identify the input but cannot recover discarded details. Summaries are lossy and must not be treated as an exact transcript, reconstructable patch, or authoritative proof of code behavior. Jev overlap checks retain exact user intent and verified metadata/excerpts as available rather than silently relying solely on generated prose.

Redact locally before any model request. Sending the larger content to an external model is a distinct data-processing step even if only its summary is stored; disclose that in repository sharing setup. Bound transient processing input and do not persist the full raw output by default. Run summarization outside the prompt/overlap critical path with a bounded processing lifecycle; if unavailable, retain a bounded exact excerpt with an explicit unavailable/truncated label. The storage quota and oldest-first cleanup remain in force. Model calls add cost and latency, so reducing database bytes does not itself prove lower total cost. The existing endpoint's identity, model size, supported output mode, credentials, quality, and pricing are unverified; no live calls or integration changes have been made. DeepSeek's official [JSON Output guide](https://api-docs.deepseek.com/guides/json_mode/) documents JSON mode, but that does not establish schema/factual correctness or the user's gateway capabilities.

Decision: **Awaiting user input.**
