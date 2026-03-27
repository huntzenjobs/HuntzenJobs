/**
 * Configuration des assistants (agents humains experts)
 *
 * WORDING IMPORTANT : Ce sont des interfaces pour communiquer avec des
 * agents humains spécialisés (coach carrière humain, recruteur humain, etc.)
 *
 * Les textes visibles (name, shortName, description, specialties, exampleQuestions)
 * sont stockés sous forme de clés i18n dans le namespace "coaches" des fichiers
 * de traduction (messages/fr.json, en.json, etc.).
 */

import {
  Briefcase,
  FileText,
  UserCheck,
  FileEdit,
  Mic,
  Linkedin,
} from "lucide-react";
import { AssistantConfig, AssistantType } from "@/types/assistant";

/**
 * Configuration complète de tous les assistants disponibles
 */
export const ASSISTANTS_CONFIG: Record<AssistantType, AssistantConfig> = {
  "career-coach": {
    id: "career-coach",
    nameKey: "nova.name",
    personaName: "Nova",
    shortNameKey: "nova.shortName",
    descriptionKey: "nova.description",
    icon: UserCheck,
    color: "#2563eb", // blue-600
    bgColor: "#dbeafe", // blue-100
    accentColor: "#7C3AED", // violet-700
    avatarUrl:
      "https://api.dicebear.com/9.x/personas/svg?seed=Nova&backgroundColor=dbeafe",
    isPremium: false,
    specialtiesKeys: [
      "nova.specialty1",
      "nova.specialty2",
      "nova.specialty3",
      "nova.specialty4",
    ],
    exampleQuestionsKeys: ["nova.q1", "nova.q2", "nova.q3"],
    apiEndpoint: "/api/coach/chat",
    responseTime: "< 2 min",
  },

  "job-scout": {
    id: "job-scout",
    nameKey: "maria.name",
    personaName: "Maria",
    shortNameKey: "maria.shortName",
    descriptionKey: "maria.description",
    icon: Briefcase,
    color: "#059669", // emerald-600
    bgColor: "#d1fae5", // emerald-100
    accentColor: "#0D9488", // teal-600
    avatarUrl:
      "https://api.dicebear.com/9.x/avataaars/svg?seed=Maria-pro&backgroundColor=d1fae5&accessories=prescription02&clotheColor=3c4f5c&clothing=blazerAndSweater&eyebrow=default&eyes=happy&facialHair=blank&hairColor=4a312c&mouth=smile&skinColor=light&top=longHairStraight",
    isPremium: false,
    specialtiesKeys: [
      "maria.specialty1",
      "maria.specialty2",
      "maria.specialty3",
      "maria.specialty4",
    ],
    exampleQuestionsKeys: ["maria.q1", "maria.q2", "maria.q3"],
    apiEndpoint: "/api/jobs/search",
    responseTime: "< 3 min",
  },

  "cv-analyzer": {
    id: "cv-analyzer",
    nameKey: "sofia.name",
    personaName: "Sofia",
    shortNameKey: "sofia.shortName",
    descriptionKey: "sofia.description",
    icon: FileText,
    color: "#7c3aed", // violet-600
    bgColor: "#ede9fe", // violet-100
    accentColor: "#EC4899", // pink-500
    avatarUrl:
      "https://api.dicebear.com/9.x/personas/svg?seed=Sofia&backgroundColor=ede9fe",
    isPremium: false,
    specialtiesKeys: [
      "sofia.specialty1",
      "sofia.specialty2",
      "sofia.specialty3",
      "sofia.specialty4",
      "sofia.specialty5",
    ],
    exampleQuestionsKeys: ["sofia.q1", "sofia.q2", "sofia.q3"],
    apiEndpoint: "/api/assistant/cv-analyzer",
    responseTime: "< 5 min",
  },

  // cv-adapter est conservé pour le backend (apply-modal) mais retiré de l'UI.
  // Sofia (cv-analyzer) absorbe ce rôle en mode chat.
  "cv-adapter": {
    id: "cv-adapter",
    nameKey: "cvAdapter.name",
    shortNameKey: "cvAdapter.shortName",
    descriptionKey: "cvAdapter.description",
    icon: FileEdit,
    color: "#dc2626", // red-600
    bgColor: "#fee2e2", // red-100
    avatarUrl:
      "https://api.dicebear.com/9.x/personas/svg?seed=Adapter&backgroundColor=fee2e2",
    isPremium: false,
    specialtiesKeys: [
      "cvAdapter.specialty1",
      "cvAdapter.specialty2",
      "cvAdapter.specialty3",
      "cvAdapter.specialty4",
    ],
    exampleQuestionsKeys: ["cvAdapter.q1", "cvAdapter.q2", "cvAdapter.q3"],
    apiEndpoint: "/api/cv-adapter/adapt",
    responseTime: "< 5 min",
  },

  "interview-sim": {
    id: "interview-sim",
    nameKey: "lucas.name",
    personaName: "Lucas",
    shortNameKey: "lucas.shortName",
    descriptionKey: "lucas.description",
    icon: Mic,
    color: "#ea580c", // orange-600
    bgColor: "#ffedd5", // orange-100
    accentColor: "#EA580C", // orange-600
    avatarUrl:
      "https://api.dicebear.com/9.x/personas/svg?seed=Lucas&backgroundColor=ffedd5",
    isPremium: true,
    isComingSoon: true,
    specialtiesKeys: [
      "lucas.specialty1",
      "lucas.specialty2",
      "lucas.specialty3",
      "lucas.specialty4",
    ],
    exampleQuestionsKeys: ["lucas.q1", "lucas.q2", "lucas.q3"],
    apiEndpoint: "/api/interview/start",
    responseTime: "Session live 30 min",
  },

  branding: {
    id: "branding",
    nameKey: "david.name",
    personaName: "David",
    shortNameKey: "david.shortName",
    descriptionKey: "david.description",
    icon: Linkedin,
    color: "#0077b5",
    bgColor: "#dbeafe",
    accentColor: "#DC2626", // red-600
    avatarUrl:
      "https://api.dicebear.com/9.x/avataaars/svg?seed=David-pro&backgroundColor=dbeafe&accessories=blank&clotheColor=3c4f5c&clothing=blazerAndSweater&eyebrow=defaultNatural&eyes=default&facialHair=beardLight&hairColor=2c1b18&mouth=smile&skinColor=light&top=shortHairShortFlat",
    isPremium: false,
    specialtiesKeys: [
      "david.specialty1",
      "david.specialty2",
      "david.specialty3",
      "david.specialty4",
    ],
    exampleQuestionsKeys: ["david.q1", "david.q2", "david.q3", "david.q4"],
    apiEndpoint: "/api/branding/chat",
    responseTime: "< 2 min",
  },
};

/**
 * Ordre d'affichage des assistants dans l'UI (cv-adapter exclu — géré en backend)
 */
export const ASSISTANTS_ORDER: AssistantType[] = [
  "career-coach",
  "job-scout",
  "cv-analyzer",
  "interview-sim",
  "branding",
];

/**
 * Assistant par défaut au premier chargement
 */
export const DEFAULT_ASSISTANT: AssistantType = "career-coach";

/**
 * Helper pour obtenir la config d'un assistant
 */
export function getAssistantConfig(type: AssistantType): AssistantConfig {
  return ASSISTANTS_CONFIG[type];
}

/**
 * Helper pour obtenir tous les assistants (dans l'ordre, sans cv-adapter)
 */
export function getAllAssistants(): AssistantConfig[] {
  return ASSISTANTS_ORDER.map((type) => ASSISTANTS_CONFIG[type]);
}

/**
 * Helper pour obtenir les assistants gratuits
 */
export function getFreeAssistants(): AssistantConfig[] {
  return getAllAssistants().filter((a) => !a.isPremium);
}

/**
 * Helper pour obtenir les assistants premium
 */
export function getPremiumAssistants(): AssistantConfig[] {
  return getAllAssistants().filter((a) => a.isPremium);
}

/**
 * Mapping coach DB id -> AssistantType
 * Used to bridge between DB coach_config.id and frontend AssistantType
 */
export const COACH_ID_TO_ASSISTANT: Record<string, AssistantType> = {
  nova: "career-coach",
  maria: "job-scout",
  sofia: "cv-analyzer",
  lucas: "interview-sim",
  david: "branding",
};

/**
 * Reverse mapping AssistantType -> coach DB id
 */
export const ASSISTANT_TO_COACH_ID: Record<string, string> = {
  "career-coach": "nova",
  "job-scout": "maria",
  "cv-analyzer": "sofia",
  "interview-sim": "lucas",
  branding: "david",
};
