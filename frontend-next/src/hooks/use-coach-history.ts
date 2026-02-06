/**
 * useCoachHistory - Hook for managing coach conversation history
 * Sprint 5: Supabase-primary storage with localStorage fallback
 * Uses React Query for automatic cache management and optimistic updates
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/jwt-provider'
import { useSubscription } from '@/contexts/subscription-context'
import { toast } from 'sonner'
import type {
  CoachConversation,
  CoachMessage,
  ConversationMetadata,
  ConversationListFilters,
  UseCoachHistoryReturn,
} from '@/types/coach-history'
import {
  toConversationMetadata,
  generateSimpleTitle,
  CoachConversationSchema,
} from '@/types/coach-history'

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'coach_conversations_fallback'
const QUERY_KEY = 'coach-conversations'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch conversations from Supabase
 */
async function fetchConversationsFromSupabase(userId: string): Promise<ConversationMetadata[]> {
  const { data, error } = await supabase
    .from('coach_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(100) // Reasonable limit for performance

  if (error) throw error

  // Validate and convert to metadata
  const conversations = (data || []).map((conv) => {
    try {
      const validated = CoachConversationSchema.parse(conv)
      return toConversationMetadata(validated)
    } catch (e) {
      console.error('Invalid conversation data:', conv, e)
      return null
    }
  }).filter((c): c is ConversationMetadata => c !== null)

  return conversations
}

/**
 * Save to localStorage as fallback
 */
function saveToLocalStorage(conversations: ConversationMetadata[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  } catch (e) {
    console.warn('Failed to save to localStorage:', e)
    // If quota exceeded, try to clear old entries
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      try {
        const nonFavorites = conversations.filter((c) => !c.is_favorite)
        const keepOnly = [...conversations.filter((c) => c.is_favorite), ...nonFavorites.slice(0, 10)]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(keepOnly))
        toast.warning('Espace de stockage limité - anciennes conversations supprimées')
      } catch (retryError) {
        console.error('Failed to save even after cleanup:', retryError)
      }
    }
  }
}

/**
 * Load from localStorage
 */
function loadFromLocalStorage(): ConversationMetadata[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as ConversationMetadata[]
  } catch (e) {
    console.error('Failed to load from localStorage:', e)
    return []
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function useCoachHistory(): UseCoachHistoryReturn {
  const { userId } = useAuth()
  const { hasFeature } = useSubscription()
  const queryClient = useQueryClient()

  // Local state
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Check feature access
  const canUseHistory = hasFeature('has_coach_history')

  // ============================================================================
  // FETCH CONVERSATIONS (React Query)
  // ============================================================================

  const {
    data: conversations = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: async () => {
      if (!userId) return []

      try {
        const data = await fetchConversationsFromSupabase(userId)
        // Sync to localStorage on successful fetch
        saveToLocalStorage(data)
        return data
      } catch (err) {
        console.error('Failed to fetch from Supabase, using localStorage fallback:', err)
        toast.error('Mode hors ligne - utilisation du cache local')
        return loadFromLocalStorage()
      }
    },
    enabled: !!userId && canUseHistory,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime in v4)
  })

  // ============================================================================
  // SAVE CONVERSATION (Mutation with optimistic update)
  // ============================================================================

  const saveMutation = useMutation({
    mutationFn: async ({
      messages,
      sessionId,
      conversationId,
    }: {
      messages: CoachMessage[]
      sessionId: string
      conversationId?: string
    }) => {
      if (!userId) throw new Error('User not authenticated')

      const title = conversationId ? undefined : generateSimpleTitle(messages, 60)

      if (conversationId) {
        // UPDATE existing conversation
        const { error: updateError } = await supabase
          .from('coach_conversations')
          .update({
            messages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
          .eq('user_id', userId)

        if (updateError) throw updateError
        return conversationId
      } else {
        // INSERT new conversation
        const { data: newConv, error: insertError } = await supabase
          .from('coach_conversations')
          .insert({
            user_id: userId,
            session_id: sessionId,
            messages,
            title,
          })
          .select()
          .single()

        if (insertError) throw insertError
        return newConv.id
      }
    },
    onMutate: async ({ messages, conversationId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: [QUERY_KEY, userId] })

      // Snapshot previous value
      const previousConversations = queryClient.getQueryData<ConversationMetadata[]>([
        QUERY_KEY,
        userId,
      ])

      // Optimistic update
      queryClient.setQueryData<ConversationMetadata[]>([QUERY_KEY, userId], (old = []) => {
        if (conversationId) {
          // Update existing
          return old.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  message_count: messages.length,
                  last_message_at: new Date().toISOString(),
                }
              : c
          )
        } else {
          // Add new (placeholder)
          const newMetadata: ConversationMetadata = {
            id: 'temp-' + Date.now(),
            title: generateSimpleTitle(messages, 60),
            is_favorite: false,
            message_count: messages.length,
            last_message_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            preview: messages.find((m) => m.role === 'user')?.content.slice(0, 100),
          }
          return [newMetadata, ...old]
        }
      })

      return { previousConversations }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousConversations) {
        queryClient.setQueryData([QUERY_KEY, userId], context.previousConversations)
      }

      console.error('Save failed, trying localStorage fallback:', err)
      setError(err as Error)

      // Fallback to localStorage
      try {
        const { messages, sessionId, conversationId } = variables
        const fallbackId = conversationId || `local_${Date.now()}`

        const fallbackConv: ConversationMetadata = {
          id: fallbackId,
          title: generateSimpleTitle(messages, 60),
          is_favorite: false,
          message_count: messages.length,
          last_message_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          preview: messages.find((m) => m.role === 'user')?.content.slice(0, 100),
        }

        const stored = loadFromLocalStorage()
        const updated = conversationId
          ? stored.map((c) => (c.id === conversationId ? fallbackConv : c))
          : [fallbackConv, ...stored]

        saveToLocalStorage(updated)
        queryClient.setQueryData([QUERY_KEY, userId], updated)

        toast.warning('Sauvegarde locale - sera synchronisée plus tard')
      } catch (fallbackErr) {
        console.error('Fallback save also failed:', fallbackErr)
        toast.error('Échec de la sauvegarde de la conversation')
      }
    },
    onSuccess: () => {
      // Refetch to get computed fields from database
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] })
    },
  })

  // ============================================================================
  // DELETE CONVERSATION
  // ============================================================================

  const deleteMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!userId) throw new Error('User not authenticated')

      const { error: deleteError } = await supabase
        .from('coach_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId)

      if (deleteError) throw deleteError
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: [QUERY_KEY, userId] })

      const previousConversations = queryClient.getQueryData<ConversationMetadata[]>([
        QUERY_KEY,
        userId,
      ])

      // Optimistic update
      queryClient.setQueryData<ConversationMetadata[]>([QUERY_KEY, userId], (old = []) =>
        old.filter((c) => c.id !== conversationId)
      )

      return { previousConversations }
    },
    onError: (err, conversationId, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData([QUERY_KEY, userId], context.previousConversations)
      }
      console.error('Delete failed:', err)
      setError(err as Error)
      toast.error('Échec de la suppression')
    },
    onSuccess: () => {
      toast.success('Conversation supprimée')
      // Sync to localStorage
      const current = queryClient.getQueryData<ConversationMetadata[]>([QUERY_KEY, userId])
      if (current) saveToLocalStorage(current)
    },
  })

  // ============================================================================
  // TOGGLE FAVORITE
  // ============================================================================

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!userId) throw new Error('User not authenticated')

      const conversation = conversations.find((c) => c.id === conversationId)
      if (!conversation) throw new Error('Conversation not found')

      const newFavoriteState = !conversation.is_favorite

      const { error: updateError } = await supabase
        .from('coach_conversations')
        .update({ is_favorite: newFavoriteState })
        .eq('id', conversationId)
        .eq('user_id', userId)

      if (updateError) throw updateError

      return { conversationId, newFavoriteState }
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: [QUERY_KEY, userId] })

      const previousConversations = queryClient.getQueryData<ConversationMetadata[]>([
        QUERY_KEY,
        userId,
      ])

      const conversation = conversations.find((c) => c.id === conversationId)

      queryClient.setQueryData<ConversationMetadata[]>([QUERY_KEY, userId], (old = []) =>
        old.map((c) =>
          c.id === conversationId ? { ...c, is_favorite: !c.is_favorite } : c
        )
      )

      return { previousConversations, conversation }
    },
    onError: (err, conversationId, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData([QUERY_KEY, userId], context.previousConversations)
      }
      console.error('Toggle favorite failed:', err)
      setError(err as Error)
    },
    onSuccess: () => {
      const current = queryClient.getQueryData<ConversationMetadata[]>([QUERY_KEY, userId])
      if (current) saveToLocalStorage(current)
    },
  })

  // ============================================================================
  // LOAD CONVERSATION
  // ============================================================================

  const loadConversation = useCallback(
    async (conversationId: string): Promise<CoachConversation | null> => {
      if (!userId) return null

      try {
        const { data, error: loadError } = await supabase
          .from('coach_conversations')
          .select('*')
          .eq('id', conversationId)
          .eq('user_id', userId)
          .single()

        if (loadError) throw loadError

        return CoachConversationSchema.parse(data)
      } catch (err) {
        console.error('Failed to load conversation:', err)
        setError(err as Error)
        toast.error('Échec du chargement de la conversation')
        return null
      }
    },
    [userId]
  )

  // ============================================================================
  // SEARCH CONVERSATIONS (Client-side)
  // ============================================================================

  const searchConversations = useCallback(
    (query: string): ConversationMetadata[] => {
      if (!query.trim()) return conversations

      const lowerQuery = query.toLowerCase()

      return conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(lowerQuery) ||
          c.preview?.toLowerCase().includes(lowerQuery)
      )
    },
    [conversations]
  )

  // ============================================================================
  // FILTER CONVERSATIONS
  // ============================================================================

  const filterConversations = useCallback(
    (filters: ConversationListFilters): ConversationMetadata[] => {
      let filtered = [...conversations]

      // Search query
      if (filters.searchQuery) {
        filtered = searchConversations(filters.searchQuery)
      }

      // Favorites only
      if (filters.showFavoritesOnly) {
        filtered = filtered.filter((c) => c.is_favorite)
      }

      // Date range
      if (filters.dateRange && filters.dateRange !== 'all') {
        const now = new Date()
        const daysAgo = filters.dateRange === 'week' ? 7 : 30
        const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)

        filtered = filtered.filter((c) => new Date(c.last_message_at) >= cutoffDate)
      }

      // Sort
      if (filters.sortBy) {
        filtered.sort((a, b) => {
          let comparison = 0

          switch (filters.sortBy) {
            case 'date':
              comparison =
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime()
              break
            case 'message_count':
              comparison = b.message_count - a.message_count
              break
            case 'title':
              comparison = a.title.localeCompare(b.title)
              break
          }

          return filters.sortOrder === 'asc' ? -comparison : comparison
        })
      }

      return filtered
    },
    [conversations, searchConversations]
  )

  // ============================================================================
  // GENERATE TITLE (Client-side fallback)
  // ============================================================================

  const generateTitle = useCallback(
    async (messages: CoachMessage[]): Promise<string> => {
      // TODO: Call backend API for LLM-generated titles
      // For now, use client-side generation
      return generateSimpleTitle(messages, 60)
    },
    []
  )

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  const saveConversation = useCallback(
    async (
      messages: CoachMessage[],
      sessionId: string,
      conversationId?: string
    ): Promise<string | null> => {
      if (!canUseHistory) {
        console.warn('User does not have access to coach history feature')
        return null
      }

      if (messages.length === 0) return null

      try {
        const result = await saveMutation.mutateAsync({ messages, sessionId, conversationId })
        return result
      } catch (err) {
        console.error('Save conversation error:', err)
        return null
      }
    },
    [canUseHistory, saveMutation]
  )

  const deleteConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      await deleteMutation.mutateAsync(conversationId)
    },
    [deleteMutation]
  )

  const toggleFavorite = useCallback(
    async (conversationId: string): Promise<void> => {
      await toggleFavoriteMutation.mutateAsync(conversationId)
    },
    [toggleFavoriteMutation]
  )

  const refreshConversations = useCallback(async () => {
    await refetch()
  }, [refetch])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    conversations,
    currentConversationId,
    isLoading,
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
    error,
    saveConversation,
    loadConversation,
    deleteConversation,
    toggleFavorite,
    searchConversations,
    filterConversations,
    generateTitle,
    setCurrentConversationId,
    refreshConversations,
    clearError,
  }
}

// ============================================================================
// UTILITY: DEBOUNCE HOOK
// ============================================================================

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
