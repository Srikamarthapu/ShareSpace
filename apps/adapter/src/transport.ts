import { eventBatchSchema } from "@workspace/core";

export type EventBatch = ReturnType<typeof eventBatchSchema.parse>;

export interface EventTransport {
  push(batch: EventBatch): Promise<{
    accepted_event_ids: string[];
    duplicate_event_ids: string[];
  }>;
}

export function validateTransportBatch(events: unknown[]): EventBatch {
  const parsed = eventBatchSchema.safeParse({ events });
  if (!parsed.success) throw new Error("Event batch did not match the shared contract.");
  return parsed.data;
}
