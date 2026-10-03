# `@workspace/integrations`

Server-side, optional provider helpers for ShareSpace. The package currently includes a one-shot Google AI Studio/Gemini summarizer. Configure an available model ID and a server-only `GEMINI_API_KEY`; without the key, the helper returns `unavailable` without making a request.

`createSummarizeApprovedContext` accepts one explicit `callerApproved` boolean and a bounded list of at most 20 approved context items (32 KiB total). It does not accept or retrieve conversation history. A caller must select and approve the exact supplied context before invoking it. The request is sent through the official `@google/genai` SDK as a stateless `models.generateContent` call. Context is delimited as data and treated as untrusted input by the system instruction.

The response is constrained to JSON, parsed with Zod, and checked so every label cites an ID from the approved input. Invalid output, provider errors, timeouts, missing credentials, or browser invocation return `unavailable`; they do not produce an approval or clear decision. Labels and caveats are model-generated suggestions and still require application policy and human review. Abort is client-side cancellation; a timed-out provider request may still be processed or billed.

No endpoint, authentication path, Jev API, billing policy, or model-selection default is added here. The caller remains responsible for membership authorization, caller approval UX, deployment secrets, and sharing disclosures.
