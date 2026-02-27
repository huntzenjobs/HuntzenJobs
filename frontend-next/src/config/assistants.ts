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
    name: "Assistant Coach Carrière",
    shortName: "Assistant Coach Carrière",
    description: "Discutez avec un expert en orientation professionnelle",
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
      "Comment me reconvertir dans la tech ?",
      "Quel plan de carrière pour progresser ?",
      "Quelles formations pour mes objectifs ?",
    ],
    apiEndpoint: "/api/coach/chat",
    responseTime: "< 2 min",
  },

  "job-scout": {
    id: "job-scout",
    name: "Assistant Recherche d'Emploi",
    shortName: "Assistant Recherche d'Emploi",
    description: "Aide personnalisée pour votre recherche d'emploi",
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
      "Comment trouver des offres cachées ?",
      "Où postuler dans mon secteur ?",
      "Comment approcher un recruteur ?",
    ],
    apiEndpoint: "/api/jobs/search",
    responseTime: "< 3 min",
  },

  "cv-analyzer": {
    id: "cv-analyzer",
    name: "Assistant Expert CV",
    shortName: "Assistant Expert CV",
    description: "Optimisation professionnelle de votre CV",
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
    ],
    exampleQuestions: [
      "Mon CV passe-t-il les ATS ?",
      "Comment améliorer mon CV ?",
      "Quels mots-clés utiliser ?",
    ],
    apiEndpoint: "/api/cv/analyze",
    responseTime: "< 5 min",
  },

  "cv-adapter": {
    id: "cv-adapter",
    name: "Assistant Adaptation CV",
    shortName: "Assistant Adaptation CV",
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
    name: "Assistant Simulation Entretien",
    shortName: "Assistant Simulation Entretien",
    description: "Entraînement avec un recruteur professionnel",
    icon: Mic,
    color: "#ea580c", // orange-600
    bgColor: "#ffedd5", // orange-100
    isPremium: true, // Service premium
    certificationBadge: "Recruteur certifié",
    specialties: [
      "Entretien technique",
      "Entretien RH",
      "Questions pièges",
      "Communication verbale",
    ],
    exampleQuestions: [
      "Comment me préparer à un entretien tech ?",
      "Quelles questions pièges prévoir ?",
      "Comment gérer le stress ?",
    ],
    apiEndpoint: "/api/interview/start", // À créer (Sprint 2)
    responseTime: "Session live 30 min",
  },

  branding: {
    id: "branding",
    name: "Assistant Branding",
    shortName: "Assistant Branding",
    description: "Créez votre présence LinkedIn et X avec l'IA",
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
      "Aide-moi à rédiger un post LinkedIn sur ma reconversion",
      "Comment développer ma marque personnelle ?",
      "Crée un post engageant sur mon expertise",
    ],
    apiEndpoint: "/api/branding/chat",
    responseTime: "< 2 min",
  },
};

/**
 * Ordre d'affichage des assistants dans l'UI
 */
export const ASSISTANTS_ORDER: AssistantType[] = [
  "career-coach",
  "job-scout",
  "cv-analyzer",
  "cv-adapter",
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
 * Helper pour obtenir tous les assistants (dans l'ordre)
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
