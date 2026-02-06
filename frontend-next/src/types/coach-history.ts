/**
 * Coach History Type Definitions
 * Sprint 5: Coach conversation history with Supabase storage
 * Aligned with Supabase schema and existing ChatMessage interface
 */

import { z } from 'zod'
import type { Message as ChatMessageType } from '@/components/coach/chat-message'

// ============================================================================
// ZOD SCHEMAS (Runtime validation)
// ============================================================================

export const CoachMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(), // ISO string
})

export const ConversationContextSchema = z.object({
  jobTitle: z.string().optional(),
  cvUploaded: z.boolean().optional(),
  topics: z.array(z.string()).optional(),
}).passthrough() // Allow additional properties

export const CoachConversationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_id: z.string(),
  messages: z.array(CoachMessageSchema),
  context: ConversationContextSchema.optional().nullable(),
  title: z.string().max(60).optional().nullable(),
  is_favorite: z.boolean().default(false),
  message_count: z.number().int().optional(),
  last_message_at: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const ConversationMetadataSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  is_favorite: z.boolean(),
  message_count: z.number().int(),
  last_message_at: z.string(),
  created_at: z.string(),
  preview: z.string().optional(),
})

export const ConversationListFiltersSchema = z.object({
  searchQuery: z.string().optional(),
  showFavoritesOnly: z.boolean().optional(),
  dateRange: z.enum(['all', 'week', 'month']).optional(),
  sortBy: z.enum(['date', 'message_count', 'title']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

// ============================================================================
// TYPESCRIPT TYPES (Inferred from Zod schemas)
// ============================================================================

export type CoachMessage = z.infer<typeof CoachMessageSchema>
export type ConversationContext = z.infer<typeof ConversationContextSchema>
export type CoachConversation = z.infer<typeof CoachConversationSchema>
export type ConversationMetadata = z.infer<typeof ConversationMetadataSchema>
export type ConversationListFilters = z.infer<typeof ConversationListFiltersSchema>

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export const SaveConversationRequestSchema = z.object({
  messages: z.array(CoachMessageSchema),
  conversationId: z.string().uuid().optional(),
  sessionId: z.string(),
  context: ConversationContextSchema.optional(),
})

export const SaveConversationResponseSchema = z.object({
  success: z.boolean(),
  conversationId: z.string().uuid(),
  title: z.string().optional(),
})

export const GenerateTitleRequestSchema = z.object({
  messages: z.array(CoachMessageSchema).max(5),
})

export const GenerateTitleResponseSchema = z.object({
  title: z.string().max(60),
  fallback_used: z.boolean().default(false),
})

export type SaveConversationRequest = z.infer<typeof SaveConversationRequestSchema>
export type SaveConversationResponse = z.infer<typeof SaveConversationResponseSchema>
export type GenerateTitleRequest = z.infer<typeof GenerateTitleRequestSchema>
export type GenerateTitleResponse = z.infer<typeof GenerateTitleResponseSchema>

// ============================================================================
// EXPORT TYPES
// ============================================================================

export const ExportOptionsSchema = z.object({
  format: z.enum(['pdf', 'markdown']),
  includeMetadata: z.boolean().default(true),
  includeTimestamps: z.boolean().default(true),
})

export const ExportMetadataSchema = z.object({
  title: z.string(),
  exportedAt: z.string(),
  messageCount: z.number().int(),
  conversationDate: z.string(),
})

export type ExportOptions = z.infer<typeof ExportOptionsSchema>
export type ExportMetadata = z.infer<typeof ExportMetadataSchema>

// ============================================================================
// HOOK RETURN TYPE
// ============================================================================

export interface UseCoachHistoryReturn {
  // Data
  conversations: ConversationMetadata[]
  currentConversationId: string | null

  // Loading states
  isLoading: boolean
  isSaving: boolean
  isDeleting: boolean

  // Errors
  error: Error | null

  // Actions
  saveConversation: (
    messages: CoachMessage[],
    sessionId: string,
    conversationId?: string
  ) => Promise<string | null>

  loadConversation: (conversationId: string) => Promise<CoachConversation | null>

  deleteConversation: (conversationId: string) => Promise<void>

  toggleFavorite: (conversationId: string) => Promise<void>

  searchConversations: (query: string) => ConversationMetadata[]

  filterConversations: (filters: ConversationListFilters) => ConversationMetadata[]

  generateTitle: (messages: CoachMessage[]) => Promise<string>

  // State setters
  setCurrentConversationId: (id: string | null) => void

  // Utilities
  refreshConversations: () => Promise<void>
  clearError: () => void
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert existing ChatMessageType to CoachMessage (for database storage)
 */
export function toCoachMessage(chatMsg: ChatMessageType): CoachMessage {
  return {
    id: chatMsg.id,
    role: chatMsg.role,
    content: chatMsg.content,
    timestamp:
      typeof chatMsg.timestamp === 'string'
        ? chatMsg.timestamp
        : chatMsg.timestamp.toISOString(),
  }
}

/**
 * Convert CoachMessage to ChatMessageType (for UI display)
 */
export function toChatMessage(coachMsg: CoachMessage): ChatMessageType {
  return {
    id: coachMsg.id,
    role: coachMsg.role,
    content: coachMsg.content,
    timestamp: new Date(coachMsg.timestamp),
  }
}

/**
 * Generate simple fallback title from messages (client-side)
 */
export function generateSimpleTitle(messages: CoachMessage[], maxLength: number = 60): string {
  if (messages.length === 0) return 'Nouvelle conversation'

  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (!firstUserMessage) return 'Nouvelle conversation'

  const title = firstUserMessage.content.slice(0, maxLength)
  return title.length < firstUserMessage.content.length ? `${title}...` : title
}

/**
 * Convert CoachConversation to ConversationMetadata (for list display)
 */
export function toConversationMetadata(conv: CoachConversation): ConversationMetadata {
  const firstUserMessage = conv.messages.find((m) => m.role === 'user')

  return {
    id: conv.id,
    title: conv.title || generateSimpleTitle(conv.messages),
    is_favorite: conv.is_favorite,
    message_count: conv.message_count || conv.messages.length,
    last_message_at: conv.last_message_at || conv.updated_at,
    created_at: conv.created_at,
    preview: firstUserMessage?.content.slice(0, 100),
  }
}

/**
 * Validate data with Zod schema (throws on invalid)
 */
export function validateCoachMessage(data: unknown): CoachMessage {
  return CoachMessageSchema.parse(data)
}

export function validateCoachConversation(data: unknown): CoachConversation {
  return CoachConversationSchema.parse(data)
}

export function validateConversationMetadata(data: unknown): ConversationMetadata {
  return ConversationMetadataSchema.parse(data)
}
