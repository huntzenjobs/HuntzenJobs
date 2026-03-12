/**
 * Types pour le système multi-assistant avec agents humains experts
 *
 * IMPORTANT : Les assistants sont des interfaces pour communiquer avec des
 * agents humains spécialisés (pas des IA autonomes)
 */

import { LucideIcon } from "lucide-react";

/**
 * Types d'assistants disponibles (interfaces pour experts humains)
 */
export type AssistantType =
  | "career-coach" // Coach Carrière humain
  | "job-scout" // Expert Recherche d'Emploi
  | "cv-analyzer" // Expert CV
  | "cv-adapter" // Spécialiste Adaptation CV
  | "interview-sim" // Recruteur pour simulation entretien
  | "branding"; // Expert Personal Branding

/**
 * Configuration d'un assistant (agent humain expert)
 */
export interface AssistantConfig {
  /** Identifiant unique de l'assistant */
  id: AssistantType;

  /** Nom de l'expert (ex: "Marie Dupont - Coach Carrière") */
  name: string;

  /** Prénom du persona Gamma (ex: "Nova", "Maria", "Sofia") */
  personaName?: string;

  /** Titre court (ex: "Coach Carrière") */
  shortName: string;

  /** Description du service humain */
  description: string;

  /** Icône pour l'UI */
  icon: LucideIcon;

  /** Couleur de branding (hex ou tailwind class) */
  color: string;

  /** Couleur de fond (plus claire) */
  bgColor: string;

  /** Est-ce un service premium ? */
  isPremium: boolean;

  /** Badge de certification (ex: "Certifié RNCP", "10 ans d'expérience") */
  certificationBadge?: string;

  /** Spécialités de l'expert */
  specialties: string[];

  /** Questions types posées par les utilisateurs */
  exampleQuestions: string[];

  /** Endpoint API pour cet assistant */
  apiEndpoint: string;

  /** Temps de réponse moyen (ex: "< 2 minutes") */
  responseTime?: string;

  /** Feature disponible prochainement — affiche un teaser au clic */
  isComingSoon?: boolean;
}

/**
 * Message dans une conversation avec un assistant
 */
export interface AssistantMessage {
  /** ID unique du message */
  id: string;

  /** Type d'assistant qui a géré ce message */
  assistantType: AssistantType;

  /** Rôle (user ou assistant) */
  role: "user" | "assistant";

  /** Contenu du message */
  content: string;

  /** Timestamp */
  timestamp: Date;

  /** Le message a-t-il été traité par un humain expert ? */
  handledByHuman?: boolean;

  /** Nom de l'expert qui a répondu (si applicable) */
  expertName?: string;

  /** Métadonnées additionnelles */
  metadata?: Record<string, any>;
}

/**
 * Session de conversation avec un assistant
 */
export interface AssistantSession {
  /** ID de la session */
  id: string;

  /** Type d'assistant */
  assistantType: AssistantType;

  /** ID de l'utilisateur */
  userId: string;

  /** Titre de la conversation (généré par LLM ou manuel) */
  title: string;

  /** Messages de la conversation */
  messages: AssistantMessage[];

  /** Date de création */
  createdAt: Date;

  /** Dernière mise à jour */
  updatedAt: Date;

  /** Statut de la session */
  status: "active" | "completed" | "archived";
}

/**
 * Limites freemium par assistant
 */
export interface AssistantLimits {
  /** Type d'assistant */
  assistantType: AssistantType;

  /** Nombre de sessions/mois (plan gratuit) */
  freeSessions: number;

  /** Durée max par session (en minutes, plan gratuit) */
  freeSessionDuration?: number;

  /** Fonctionnalités disponibles en gratuit */
  freeFeatures: string[];

  /** Fonctionnalités réservées aux plans premium */
  premiumFeatures: string[];
}
