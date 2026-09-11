import { v4 as uuidv4 } from "uuid";

// La valeur initiale est identique côté serveur et client pour éviter un écart d'hydratation.
export const INITIAL_ASSISTANT_SESSION_ID = "";

export function createAssistantSessionId(): string {
  return uuidv4();
}
