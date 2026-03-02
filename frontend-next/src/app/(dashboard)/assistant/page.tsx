"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpandableTextarea } from "@/components/ui/expandable-textarea";
import {
  Send,
  Loader2,
  MessageSquare,
  User,
  Sparkles,
  Clock,
  Lock,
  History,
  Mic,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { huntzenApi } from "@/lib/api/huntzen-client";
import { v4 as uuidv4 } from "uuid";
import { useSubscription } from "@/contexts/subscription-context";
import { useAssistant } from "@/contexts/assistant-context";
import { getAssistantConfig } from "@/config/assistants";
import { BotSelector } from "@/components/assistant/bot-selector";
import { CoachTimer as CoachTimerBadge } from "@/components/coach/coach-timer";
import {
  ChatMessage,
  TypingIndicator,
  type Message as ChatMessageType,
} from "@/components/coach/chat-message";
import { WelcomeScreen } from "@/components/coach/welcome-screen";
import { QuickQuestionsDrawer } from "@/components/coach/quick-questions-drawer";
import { HistorySidebar } from "@/components/coach/history-sidebar";
import { ExportDialog } from "@/components/coach/export-dialog";
import { useCoachHistory, useDebounce } from "@/hooks/use-coach-history";
import { toCoachMessage, toChatMessage } from "@/types/coach-history";
import { useTranslations, useLocale } from "next-intl";

export default function AssistantPage() {
  const t = useTranslations("dashboard.assistant");
  const locale = useLocale();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const [brandingState, setBrandingState] = useState<Record<
    string,
    unknown
  > | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);

  // Assistant state
  const { selectedAssistant, setSelectedAssistant } = useAssistant();
  const assistantConfig = getAssistantConfig(selectedAssistant);

  // Reset branding state when switching assistants so stale branding session
  // data does not leak into a different assistant's conversation
  useEffect(() => {
    setBrandingState(null);
  }, [selectedAssistant]);

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
  } = useSubscription();

  // History state
  const {
    conversations,
    currentConversationId,
    saveConversation,
    loadConversation,
    setCurrentConversationId,
  } = useCoachHistory();

  // Debounce messages for auto-save (2s delay)
  const debouncedMessages = useDebounce(messages, 2000);

  const canChat =
    coachTimeRemaining > 0 || limits.coach_minutes_per_day === Infinity;

  // Smart scroll: scroll to user message when sent (best UX)
  useEffect(() => {
    // Only scroll when user sends a new message (not during loading)
    if (messages.length > 0 && messages[messages.length - 1].role === "user") {
      lastUserMessageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [messages]);

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    if (seconds === Infinity || seconds > 3600 * 24) return t("unlimited");
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Warning threshold (3 minutes)
  const isTimeWarning =
    isFreePlan && coachTimeRemaining <= 180 && coachTimeRemaining > 0;

  // Removed auto-scroll for better UX - user controls scrolling manually

  // Stop session when leaving page
  useEffect(() => {
    return () => {
      if (isCoachSessionActive) {
        stopCoachSession();
      }
    };
  }, [isCoachSessionActive, stopCoachSession]);

  // Keep a stable ref to saveConversation to avoid re-triggering the auto-save
  // effect every time saveMutation state changes (which would cause an infinite loop)
  const saveConversationRef = useRef(saveConversation);
  useEffect(() => {
    saveConversationRef.current = saveConversation;
  }, [saveConversation]);

  // Auto-save conversation (debounced)
  useEffect(() => {
    if (
      debouncedMessages.length > 0 &&
      !loading &&
      hasFeature("has_coach_history")
    ) {
      const coachMessages = debouncedMessages.map(toCoachMessage);

      saveConversationRef
        .current(coachMessages, sessionId, currentConversationId || undefined)
        .then((id) => {
          if (id && !currentConversationId) {
            setCurrentConversationId(id);
          }
        });
    }
  }, [
    debouncedMessages,
    loading,
    sessionId,
    currentConversationId,
    hasFeature,
    setCurrentConversationId,
  ]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || loading) return;

    // Check if user can still chat
    if (!canChat) {
      openPricingModal("coach_minutes_per_day");
      return;
    }

    // Start timer on first message
    if (!isCoachSessionActive && isFreePlan) {
      startCoachSession();
    }

    const userMessage: ChatMessageType = {
      id: uuidv4(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Use the appropriate API method based on selected assistant
      let response: {
        success: boolean;
        response: string;
        agent?: string;
        language?: string;
        branding_state?: Record<string, unknown> | null;
      };

      if (selectedAssistant === "branding") {
        const brandingResponse = await huntzenApi.sendBrandingMessage(
          messageText,
          sessionId,
          locale,
          brandingState,
        );
        setBrandingState(brandingResponse.branding_state ?? null);
        response = { ...brandingResponse, agent: "branding" };
      } else {
        response = await huntzenApi.sendAssistantMessage(
          messageText,
          sessionId,
          selectedAssistant,
          locale,
        );
      }

      const assistantMessage: ChatMessageType = {
        id: uuidv4(),
        role: "assistant",
        content: response.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessageType = {
        id: uuidv4(),
        role: "assistant",
        content: t("errorMessage"),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Handle time up
  const handleTimeUp = () => {
    openPricingModal("coach_minutes_per_day");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSimulation = () => {
    // Interview Simulator is coming soon — button is hidden but kept for future use
  };

  // Load conversation from history
  const handleLoadConversation = async (conversationId: string) => {
    const conversation = await loadConversation(conversationId);

    if (conversation) {
      // Convert CoachMessages back to ChatMessages
      const chatMessages = conversation.messages.map(toChatMessage);

      setMessages(chatMessages);
      setCurrentConversationId(conversation.id);
    }
  };

  // Start new conversation
  const handleNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput("");
    setBrandingState(null);
  };

  // Check if we should show welcome screen (no messages)
  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Header - HuntZen Style (Adapté dark mode) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between gap-4 mb-6 bg-gradient-to-br from-white to-gray-50 p-6 rounded-2xl shadow-sm border border-slate-200"
      >
        {/* BotSelector compact à gauche */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-shrink-0"
        >
          <BotSelector variant="compact" />
        </motion.div>

        {/* Info assistant au centre */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex-1 min-w-0"
        >
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] shadow-lg shadow-[#00D9FF]/30"
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </motion.div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 truncate">
                  {assistantConfig.name}
                </h1>
                {assistantConfig.certificationBadge && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex-shrink-0">
                    ✓ {assistantConfig.certificationBadge}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-700 truncate">
                {assistantConfig.description}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Actions à droite */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-2 flex-shrink-0"
        >
          {/* Timer for free users */}
          {isFreePlan && (
            <CoachTimerBadge
              totalSeconds={coachTimeRemaining}
              onTimeUp={handleTimeUp}
            />
          )}

          {/* Export button (if has messages and feature access) */}
          {false && hasFeature("has_coach_history") && messages.length > 0 && (
            <ExportDialog
              messages={messages.map(toCoachMessage)}
              title={
                currentConversationId
                  ? conversations.find((c) => c.id === currentConversationId)
                      ?.title
                  : undefined
              }
              conversationDate={
                messages[0]?.timestamp instanceof Date
                  ? (messages[0].timestamp as Date).toISOString()
                  : (messages[0]?.timestamp as string | undefined)
              }
            />
          )}

          {/* History sidebar */}
          {hasFeature("has_coach_history") ? (
            <HistorySidebar
              onLoadConversation={handleLoadConversation}
              currentConversationId={currentConversationId}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPricingModal("has_coach_history")}
              className="gap-2 bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:border-[#00D9FF] hover:text-slate-900"
            >
              <History className="w-4 h-4" />
              {t("history")}
              <Lock className="w-3 h-3" />
            </Button>
          )}

          {/* New conversation button */}
          {messages.length > 0 && hasFeature("has_coach_history") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewConversation}
              className="gap-2 bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:border-[#00D9FF] hover:text-slate-900"
            >
              <Plus className="w-4 h-4" />
              {t("newConversation")}
            </Button>
          )}

          {/* Simulation button - Caché pour l'instant */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSimulation}
            className="hidden gap-2"
          >
            <Mic className="w-4 h-4" />
            {t("simulation")}
            {!hasFeature("has_interview_sim") && <Lock className="w-3 h-3" />}
          </Button>
        </motion.div>
      </motion.div>

      <div className="flex flex-1">
        {/* Chat Section - Full width */}
        <Card className="w-full flex flex-col shadow-sm border-2 border-slate-200 bg-white">
          {/* Time warning banner */}
          <AnimatePresence>
            {isTimeWarning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-amber-700"
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{t("timeWarning")}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                  onClick={() => openPricingModal("coach_minutes_per_day")}
                >
                  {t("upgradePremium")}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <CardContent className="p-6 space-y-4">
            {/* Welcome screen - Always visible but compact when there are messages */}
            {showWelcome ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <WelcomeScreen onQuestionClick={sendMessage} />
              </motion.div>
            ) : (
              /* Compact assistant info when chatting */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 pb-4 border-b-2 border-gray-100"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-[#00D9FF]/20"
                    style={{ backgroundColor: assistantConfig.bgColor }}
                  >
                    <assistantConfig.icon
                      className="w-6 h-6"
                      style={{ color: assistantConfig.color }}
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      {assistantConfig.shortName}
                      {assistantConfig.certificationBadge && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          ✓ {assistantConfig.certificationBadge}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-slate-700">
                      {assistantConfig.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {assistantConfig.specialties.map((specialty, idx) => (
                    <motion.span
                      key={idx}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="text-xs px-3 py-1 rounded-full font-medium"
                      style={{
                        backgroundColor: assistantConfig.bgColor,
                        color: assistantConfig.color,
                      }}
                    >
                      {specialty}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Chat messages */}
            <AnimatePresence mode="popLayout">
              {messages.map((message, index) => {
                // Attach ref to the last user message for smart scrolling
                const isLastUserMessage =
                  message.role === "user" && index === messages.length - 1;

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    ref={isLastUserMessage ? lastUserMessageRef : null}
                  >
                    <ChatMessage
                      message={message}
                      showAvatar
                      showTimestamp
                      enableCopy
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Typing indicator */}
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <TypingIndicator />
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input section */}
          <div className="border-t-2 border-slate-200 p-4">
            {canChat ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 items-end"
              >
                <div className="flex-1">
                  <ExpandableTextarea
                    value={input}
                    onChange={setInput}
                    placeholder={t("placeholder")}
                    disabled={loading}
                    minHeight={44}
                    maxHeight={120}
                    onKeyDown={(e) => {
                      // Send with Enter (without Shift), new line with Shift+Enter
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (input.trim() && !loading) {
                          sendMessage(input);
                        }
                      }
                      // Also support Ctrl/Cmd+Enter for users who prefer it
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        if (input.trim() && !loading) {
                          sendMessage(input);
                        }
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  size="lg"
                  className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white h-12 px-6 transition-all duration-300"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3"
                >
                  <Clock className="w-6 h-6 text-gray-400" />
                </motion.div>
                <p className="font-bold text-slate-900 mb-1">
                  {t("timeExpiredTitle")}
                </p>
                <p className="text-sm text-slate-700 mb-3">
                  {t("timeExpiredDesc", {
                    minutes: limits.coach_minutes_per_day,
                  })}
                </p>
                <Button
                  onClick={() => openPricingModal("coach_minutes_per_day")}
                  className="h-12 text-base font-bold bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white transition-all duration-300"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  {t("unlockUnlimited")}
                </Button>
              </motion.div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
