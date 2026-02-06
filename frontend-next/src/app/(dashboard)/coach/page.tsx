'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpandableTextarea } from '@/components/ui/expandable-textarea'
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  Clock,
  Lock,
  History,
  Mic,
  AlertTriangle,
  Plus,
} from 'lucide-react'
import { huntzenApi } from '@/lib/api/huntzen-client'
import { v4 as uuidv4 } from 'uuid'
import { useSubscription } from '@/contexts/subscription-context'
import { CoachTimer as CoachTimerBadge } from '@/components/coach/coach-timer'
import { ChatMessage, TypingIndicator, type Message as ChatMessageType } from '@/components/coach/chat-message'
import { WelcomeScreen } from '@/components/coach/welcome-screen'
import { QuickQuestionsDrawer } from '@/components/coach/quick-questions-drawer'
import { HistorySidebar } from '@/components/coach/history-sidebar'
import { ExportDialog } from '@/components/coach/export-dialog'
import { useCoachHistory, useDebounce } from '@/hooks/use-coach-history'
import { toCoachMessage, toChatMessage } from '@/types/coach-history'

export default function CoachPage() {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => uuidv4())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Freemium state
  const {
    coachTimeRemaining,
    startCoachSession,
    stopCoachSession,
    isCoachSessionActive,
    hasFeature,
    openPricingModal,
    isFreePlan,
    limits,
  } = useSubscription()

  // History state
  const {
    conversations,
    currentConversationId,
    saveConversation,
    loadConversation,
    setCurrentConversationId,
  } = useCoachHistory()

  // Debounce messages for auto-save (2s delay)
  const debouncedMessages = useDebounce(messages, 2000)

  const canChat = coachTimeRemaining > 0 || limits.coach_minutes_per_day === Infinity

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    if (seconds === Infinity || seconds > 3600 * 24) return 'Illimite'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Warning threshold (1 minute)
  const isTimeWarning = isFreePlan && coachTimeRemaining <= 60 && coachTimeRemaining > 0

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Stop session when leaving page
  useEffect(() => {
    return () => {
      if (isCoachSessionActive) {
        stopCoachSession()
      }
    }
  }, [isCoachSessionActive, stopCoachSession])

  // Auto-save conversation (debounced)
  useEffect(() => {
    if (
      debouncedMessages.length > 0 &&
      !loading &&
      hasFeature('has_coach_history')
    ) {
      const coachMessages = debouncedMessages.map(toCoachMessage)

      saveConversation(
        coachMessages,
        sessionId,
        currentConversationId || undefined
      ).then((id) => {
        if (id && !currentConversationId) {
          setCurrentConversationId(id)
        }
      })
    }
  }, [
    debouncedMessages,
    loading,
    saveConversation,
    sessionId,
    currentConversationId,
    hasFeature,
    setCurrentConversationId,
  ])

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || loading) return

    // Check if user can still chat
    if (!canChat) {
      openPricingModal('coach_minutes_per_day')
      return
    }

    // Start timer on first message
    if (!isCoachSessionActive && isFreePlan) {
      startCoachSession()
    }

    const userMessage: ChatMessageType = {
      id: uuidv4(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await huntzenApi.sendCoachMessage(messageText, sessionId)

      const assistantMessage: ChatMessageType = {
        id: uuidv4(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: ChatMessageType = {
        id: uuidv4(),
        role: 'assistant',
        content:
          'Desole, une erreur est survenue. Pouvez-vous reformuler votre question ?',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  // Handle time up
  const handleTimeUp = () => {
    openPricingModal('coach_minutes_per_day')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleSimulation = () => {
    if (!hasFeature('has_interview_sim')) {
      openPricingModal('has_interview_sim')
      return
    }
    // TODO: Implement interview simulation
  }

  // Load conversation from history
  const handleLoadConversation = async (conversationId: string) => {
    const conversation = await loadConversation(conversationId)

    if (conversation) {
      // Convert CoachMessages back to ChatMessages
      const chatMessages = conversation.messages.map(toChatMessage)

      setMessages(chatMessages)
      setCurrentConversationId(conversation.id)
    }
  }

  // Start new conversation
  const handleNewConversation = () => {
    setMessages([])
    setCurrentConversationId(null)
    setInput('')
  }

  // Check if we should show welcome screen (no messages)
  const showWelcome = messages.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Hero Header - HuntZen Style */}
      <div className="flex items-start justify-between gap-4 mb-6 bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-sm">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-huntzen-blue flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-black text-gray-900">
              Coach IA Carrière
            </h1>
          </div>
          <p className="text-gray-600 text-base">
            Posez vos questions sur la recherche d&apos;emploi, les entretiens, ou votre carrière
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Timer for free users */}
          {isFreePlan && (
            <CoachTimerBadge
              totalSeconds={coachTimeRemaining}
              onTimeUp={handleTimeUp}
            />
          )}

          {/* Export button (if has messages and feature access) */}
          {hasFeature('has_coach_history') && messages.length > 0 && (
            <ExportDialog
              messages={messages.map(toCoachMessage)}
              title={
                currentConversationId
                  ? conversations.find((c) => c.id === currentConversationId)?.title
                  : undefined
              }
              conversationDate={
                messages[0]?.timestamp instanceof Date
                  ? messages[0].timestamp.toISOString()
                  : messages[0]?.timestamp
              }
            />
          )}

          {/* History sidebar */}
          {hasFeature('has_coach_history') ? (
            <HistorySidebar
              onLoadConversation={handleLoadConversation}
              currentConversationId={currentConversationId}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPricingModal('has_coach_history')}
              className="gap-2 border-2 border-gray-200 hover:border-huntzen-blue hover:bg-huntzen-blue/5"
            >
              <History className="w-4 h-4" />
              Historique
              <Lock className="w-3 h-3" />
            </Button>
          )}

          {/* New conversation button */}
          {messages.length > 0 && hasFeature('has_coach_history') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewConversation}
              className="gap-2 border-2 border-gray-200 hover:border-huntzen-blue hover:bg-huntzen-blue/5"
            >
              <Plus className="w-4 h-4" />
              Nouvelle
            </Button>
          )}

          {/* Simulation button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSimulation}
            className="gap-2 border-2 border-gray-200 hover:border-huntzen-blue hover:bg-huntzen-blue/5"
          >
            <Mic className="w-4 h-4" />
            Simulation
            {!hasFeature('has_interview_sim') && <Lock className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Chat Section */}
        <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-2 border-gray-200">
          {/* Time warning banner */}
          {isTimeWarning && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">
                Il vous reste moins d&apos;une minute ! Passez Premium pour un temps illimité.
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                onClick={() => openPricingModal('coach_minutes_per_day')}
              >
                Passer Premium
              </Button>
            </div>
          )}

          <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Welcome screen when no messages */}
            {showWelcome && (
              <WelcomeScreen onQuestionClick={sendMessage} />
            )}

            {/* Chat messages */}
            {!showWelcome && messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                showAvatar
                showTimestamp
                enableCopy
              />
            ))}

            {/* Typing indicator */}
            {loading && <TypingIndicator />}

            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input section */}
          <div className="border-t-2 border-gray-200 p-4">
            {canChat ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <ExpandableTextarea
                    value={input}
                    onChange={setInput}
                    placeholder="Posez votre question..."
                    disabled={loading}
                    minHeight={44}
                    maxHeight={120}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault()
                        if (input.trim() && !loading) {
                          sendMessage(input)
                        }
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  size="lg"
                  className="bg-gradient-to-r from-huntzen-blue to-huntzen-turquoise hover:from-huntzen-blue-dark hover:to-huntzen-turquoise h-12 px-6"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
                  <Clock className="w-6 h-6 text-gray-400" />
                </div>
                <p className="font-medium text-gray-700 mb-1">
                  Temps écoulé
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  Vous avez utilisé vos {limits.coach_minutes_per_day} minutes gratuites
                </p>
                <Button
                  onClick={() => openPricingModal('coach_minutes_per_day')}
                  className="h-12 text-base font-bold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Débloquer le temps illimité
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Quick Questions Drawer */}
        <QuickQuestionsDrawer
          onQuestionClick={sendMessage}
          initiallyCollapsed={false}
          className="hidden lg:flex"
        />
      </div>
    </div>
  )
}
