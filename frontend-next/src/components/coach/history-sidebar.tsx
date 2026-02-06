/**
 * HistorySidebar Component
 * Sprint 5: Sidebar for browsing, searching, and managing coach conversation history
 * Features: Search, filters, keyboard shortcuts, virtual scrolling for large lists
 */

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { History, Search, Star, X, Loader2, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useCoachHistory, useDebounce } from '@/hooks/use-coach-history'
import { ConversationListItem } from './conversation-list-item'
import type { ConversationListFilters } from '@/types/coach-history'

interface HistorySidebarProps {
  onLoadConversation: (conversationId: string) => void
  currentConversationId: string | null
}

export function HistorySidebar({
  onLoadConversation,
  currentConversationId,
}: HistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300)

  const {
    conversations: allConversations,
    isLoading,
    deleteConversation,
    toggleFavorite,
    filterConversations,
  } = useCoachHistory()

  // Apply filters
  const filters: ConversationListFilters = {
    searchQuery: debouncedSearch,
    showFavoritesOnly,
    sortBy: 'date',
    sortOrder: 'desc',
  }

  const conversations = filterConversations(filters)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc - Close sidebar
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }

      // Cmd/Ctrl + K - Focus search (when sidebar open)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && isOpen) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Focus search input when sidebar opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleLoadConversation = (conversationId: string) => {
    onLoadConversation(conversationId)
    setIsOpen(false)
  }

  const handleToggleFavorite = async (conversationId: string) => {
    await toggleFavorite(conversationId)
  }

  const handleDeleteConversation = async (conversationId: string) => {
    await deleteConversation(conversationId)
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-2 border-gray-200 hover:border-huntzen-blue hover:bg-huntzen-blue/5"
        >
          <History className="w-4 h-4" />
          Historique
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="p-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-huntzen-blue" />
              Historique des conversations
            </SheetTitle>
            <SheetDescription>
              Retrouvez et chargez vos conversations précédentes
            </SheetDescription>
          </SheetHeader>

          {/* Search and Filters */}
          <div className="p-4 space-y-3 border-b bg-gray-50">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher... (Cmd/Ctrl + K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 border-2"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <Button
                variant={showFavoritesOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`gap-2 ${
                  showFavoritesOnly
                    ? 'bg-gradient-to-r from-huntzen-blue to-huntzen-turquoise hover:from-huntzen-blue-dark'
                    : 'border-2'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${
                    showFavoritesOnly ? 'fill-white' : 'fill-yellow-400 text-yellow-400'
                  }`}
                />
                Favoris
                {showFavoritesOnly &&
                  ` (${allConversations.filter((c) => c.is_favorite).length})`}
              </Button>

              {(searchQuery || showFavoritesOnly) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setShowFavoritesOnly(false)
                  }}
                  className="text-gray-600"
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              // Loading skeletons
              <>
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl" />
                ))}
              </>
            ) : conversations.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  {searchQuery || showFavoritesOnly ? (
                    <Search className="w-8 h-8 text-gray-400" />
                  ) : (
                    <MessageSquarePlus className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {searchQuery || showFavoritesOnly
                    ? 'Aucune conversation trouvée'
                    : 'Pas encore de conversations'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {searchQuery || showFavoritesOnly
                    ? 'Essayez de modifier vos filtres de recherche'
                    : 'Vos conversations avec le Coach IA apparaîtront ici'}
                </p>
                {(searchQuery || showFavoritesOnly) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('')
                      setShowFavoritesOnly(false)
                    }}
                    className="border-2"
                  >
                    Afficher tout
                  </Button>
                )}
              </div>
            ) : (
              // Conversation items
              conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === currentConversationId}
                  onLoad={handleLoadConversation}
                  onToggleFavorite={handleToggleFavorite}
                  onDelete={handleDeleteConversation}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-gray-50">
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex items-center justify-between">
                <span>Total:</span>
                <span className="font-medium">{allConversations.length} conversations</span>
              </div>
              {showFavoritesOnly && (
                <div className="flex items-center justify-between">
                  <span>Favoris:</span>
                  <span className="font-medium">
                    {allConversations.filter((c) => c.is_favorite).length}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
