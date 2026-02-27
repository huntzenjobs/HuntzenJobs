"use client";

/**
 * Contexte global pour gérer l'assistant sélectionné
 *
 * Permet de persister la sélection de l'expert humain à travers
 * l'application et dans le localStorage
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { AssistantType } from "@/types/assistant";
import { DEFAULT_ASSISTANT } from "@/config/assistants";

interface AssistantContextType {
  /** Assistant actuellement sélectionné */
  selectedAssistant: AssistantType;

  /** Fonction pour changer l'assistant */
  setSelectedAssistant: (type: AssistantType) => void;

  /** Est-ce que le contexte est en train de charger ? */
  isLoading: boolean;
}

const AssistantContext = createContext<AssistantContextType | undefined>(
  undefined,
);

const STORAGE_KEY = "huntzen_selected_assistant";

interface AssistantProviderProps {
  children: ReactNode;
}

/**
 * Provider du contexte Assistant
 * À wrapper autour de l'app pour accès global
 */
export function AssistantProvider({ children }: AssistantProviderProps) {
  const [selectedAssistant, setSelectedAssistantState] =
    useState<AssistantType>(DEFAULT_ASSISTANT);
  const [isLoading, setIsLoading] = useState(true);

  // Charger la sélection depuis localStorage au montage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isValidAssistantType(stored)) {
        setSelectedAssistantState(stored as AssistantType);
      }
    } catch (error) {
      console.error("Failed to load assistant from localStorage:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fonction pour changer l'assistant avec persistence
  const setSelectedAssistant = (type: AssistantType) => {
    try {
      setSelectedAssistantState(type);
      localStorage.setItem(STORAGE_KEY, type);
    } catch (error) {
      console.error("Failed to save assistant to localStorage:", error);
    }
  };

  const value: AssistantContextType = {
    selectedAssistant,
    setSelectedAssistant,
    isLoading,
  };

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

/**
 * Hook pour utiliser le contexte Assistant
 * Lève une erreur si utilisé en dehors du Provider
 */
export function useAssistant(): AssistantContextType {
  const context = useContext(AssistantContext);
  if (context === undefined) {
    throw new Error("useAssistant must be used within an AssistantProvider");
  }
  return context;
}

/**
 * Hook optionnel qui retourne undefined si pas de Provider
 * Utile pour les composants qui peuvent fonctionner sans contexte
 */
export function useOptionalAssistant(): AssistantContextType | undefined {
  return useContext(AssistantContext);
}

/**
 * Validation du type d'assistant
 */
function isValidAssistantType(value: string): boolean {
  const validTypes: AssistantType[] = [
    "career-coach",
    "job-scout",
    "cv-analyzer",
    "cv-adapter",
    "interview-sim",
    "branding",
  ];
  return validTypes.includes(value as AssistantType);
}
