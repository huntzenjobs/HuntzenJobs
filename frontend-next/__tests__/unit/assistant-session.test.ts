import { describe, expect, it } from "vitest";
import {
  createAssistantSessionId,
  INITIAL_ASSISTANT_SESSION_ID,
} from "@/lib/assistant-session";

describe("assistant session initialisation", () => {
  it("uses a stable value during server rendering and hydration", () => {
    expect(INITIAL_ASSISTANT_SESSION_ID).toBe("");
  });

  it("creates a UUID only after the client has mounted", () => {
    expect(createAssistantSessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
