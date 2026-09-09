import { describe, expect, it } from "vitest";

import { CoachConversationSchema } from "@/types/coach-history";

const conversation = {
  id: "1e72e00a-5976-4466-8970-c4ff1ed51cd3",
  user_id: "3abda780-30fb-46c8-a5c3-5bfa7938d688",
  session_id: "session-1",
  messages: [
    {
      role: "user",
      content: "Bonjour",
      timestamp: "2026-09-09T12:00:00.000Z",
    },
  ],
  context: null,
  title: null,
  is_favorite: false,
  message_count: 1,
  last_message_at: "2026-09-09T12:00:00.000Z",
  created_at: "2026-09-09T12:00:00.000Z",
  updated_at: "2026-09-09T12:00:00.000Z",
  assistant_type: "coach",
};

describe("CoachConversationSchema", () => {
  it("ajoute un identifiant stable aux anciens messages", () => {
    const parsed = CoachConversationSchema.parse(conversation);

    expect(parsed.messages[0]?.id).toBe(`${conversation.id}-0`);
  });

  it("conserve les identifiants déjà enregistrés", () => {
    const parsed = CoachConversationSchema.parse({
      ...conversation,
      messages: [{ ...conversation.messages[0], id: "message-1" }],
    });

    expect(parsed.messages[0]?.id).toBe("message-1");
  });
});
