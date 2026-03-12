/**
 * Configuration des assistants (agents humains experts)
 *
 * WORDING IMPORTANT : Ce sont des interfaces pour communiquer avec des
 * agents humains spécialisés (coach carrière humain, recruteur humain, etc.)
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
    name: "Nova – Coach Carrière",
    personaName: "Nova",
    shortName: "Coach Carrière",
    description:
      "Je t'aide à clarifier ce que tu veux vraiment pour ta carrière et à construire un plan pour y arriver.",
    icon: UserCheck,
    color: "#2563eb", // blue-600
    bgColor: "#dbeafe", // blue-100
    isPremium: false,
    certificationBadge: "Certifié RNCP",
    specialties: [
      "Orientation professionnelle",
      "Reconversion",
      "Plan de carrière",
      "Formation continue",
    ],
    exampleQuestions: [
      "On va définir ton objectif de carrière.",
      "Tu veux évoluer, changer de job ou gagner plus ?",
      "On construit ton plan ensemble.",
    ],
    apiEndpoint: "/api/coach/chat",
    responseTime: "< 2 min",
  },

  "job-scout": {
    id: "job-scout",
    name: "Maria – Coach Recherche d'Emploi",
    personaName: "Maria",
    shortName: "Recherche d'Emploi",
    description:
      "Je t'aide à trouver les bonnes offres et à postuler efficacement.",
    icon: Briefcase,
    color: "#059669", // emerald-600
    bgColor: "#d1fae5", // emerald-100
    isPremium: false,
    certificationBadge: "10+ ans d'expérience",
    specialties: [
      "Stratégie de recherche",
      "Ciblage d'entreprises",
      "Candidature spontanée",
      "Réseau professionnel",
    ],
    exampleQuestions: [
      "Je viens de trouver des offres qui peuvent t'intéresser.",
      "On va optimiser ta recherche pour trouver plus vite.",
      "Comment approcher un recruteur ?",
    ],
    apiEndpoint: "/api/jobs/search",
    responseTime: "< 3 min",
  },

  "cv-analyzer": {
    id: "cv-analyzer",
    name: "Sofia – Expert CV",
    personaName: "Sofia",
    shortName: "Expert CV",
    description:
      "Je t'aide à créer un CV qui attire l'attention des recruteurs.",
    icon: FileText,
    color: "#7c3aed", // violet-600
    bgColor: "#ede9fe", // violet-100
    isPremium: false,
    certificationBadge: "Expert RH",
    specialties: [
      "Analyse ATS",
      "Structure et mise en page",
      "Mots-clés sectoriels",
      "Impact des expériences",
      "Adaptation à une offre d'emploi",
    ],
    exampleQuestions: [
      "Je peux améliorer ton CV en quelques minutes.",
      "Ton CV peut être beaucoup plus impactant.",
      "Quels mots-clés utiliser ?",
    ],
    apiEndpoint: "/api/cv/analyze",
    responseTime: "< 5 min",
  },

  // cv-adapter est conservé pour le backend (apply-modal) mais retiré de l'UI.
  // Sofia (cv-analyzer) absorbe ce rôle en mode chat.
  "cv-adapter": {
    id: "cv-adapter",
    name: "Assistant Adaptation CV",
    shortName: "Adaptation CV",
    description: "Personnalisation par un spécialiste pour chaque offre",
    icon: FileEdit,
    color: "#dc2626", // red-600
    bgColor: "#fee2e2", // red-100
    isPremium: false,
    certificationBadge: "Spécialiste Candidature",
    specialties: [
      "Matching CV-offre",
      "Reformulation ciblée",
      "Alignement compétences",
      "Optimisation mots-clés",
    ],
    exampleQuestions: [
      "Comment adapter mon CV à cette offre ?",
      "Quelles compétences mettre en avant ?",
      "Comment reformuler mon expérience ?",
    ],
    apiEndpoint: "/api/cv-adapter/adapt",
    responseTime: "< 5 min",
  },

  "interview-sim": {
    id: "interview-sim",
    name: "Lucas – Coach Entretien",
    personaName: "Lucas",
    shortName: "Coach Entretien",
    description:
      "Je te prépare aux entretiens pour que tu sois prêt le jour J.",
    icon: Mic,
    color: "#ea580c", // orange-600
    bgColor: "#ffedd5", // orange-100
    isPremium: true,
    isComingSoon: true,
    certificationBadge: "Recruteur certifié",
    specialties: [
      "Entretien technique",
      "Entretien RH",
      "Questions pièges",
      "Communication verbale",
    ],
    exampleQuestions: [
      "On va simuler un entretien.",
      "Je vais te poser les questions que les recruteurs posent vraiment.",
      "Comment gérer le stress ?",
    ],
    apiEndpoint: "/api/interview/start",
    responseTime: "Session live 30 min",
  },

  branding: {
    id: "branding",
    name: "Jeff – Coach Personal Branding",
    personaName: "Jeff",
    shortName: "Personal Branding",
    description: "Je t'aide à construire un profil qui attire les recruteurs.",
    icon: Linkedin,
    color: "#0077b5",
    bgColor: "#dbeafe",
    isPremium: false,
    certificationBadge: "Expert Personal Branding",
    specialties: [
      "Posts LinkedIn viraux",
      "Storytelling professionnel",
      "Personal branding X/Twitter",
      "Stratégie de contenu",
    ],
    exampleQuestions: [
      "Ton profil peut devenir beaucoup plus attractif.",
      "On va améliorer ta présence professionnelle.",
      "Comment développer ma marque personnelle ?",
    ],
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
