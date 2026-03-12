"use client";

import { useEffect, useRef, useState } from "react";
import { Send, ExternalLink } from "lucide-react";
import Fuse from "fuse.js";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useSupportChat, type SupportMessage } from "@/hooks/use-support";

interface SupportChatbotProps {
  onOpenTicket: () => void;
}

interface FaqEntry {
  keywords: string[];
  question: string;
  answer: string;
  links: Array<{ label: string; href: string }>;
  category: string;
}

const QUICK_CHIPS = [
  "Comment analyser mon CV ?",
  "Quel coach IA choisir ?",
  "Comment rechercher des offres ?",
  "Différence Gratuit vs Pro ?",
  "Comment suivre mes candidatures ?",
  "Comment adapter mon CV à une offre ?",
];

export function SupportChatbot({ onOpenTicket }: SupportChatbotProps) {
  const { user } = useAuth();
  const { messages, isLoading, sendMessage } = useSupportChat();
  const [input, setInput] = useState("");
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>([]);
  const [fuse, setFuse] = useState<Fuse<FaqEntry> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "vous";

  // Load FAQ JSON and initialize Fuse
  useEffect(() => {
    fetch("/support-faq.json")
      .then((r) => r.json())
      .then((data) => {
        const entries: FaqEntry[] = data.entries || [];
        setFaqEntries(entries);
        setFuse(
          new Fuse(entries, {
            keys: ["keywords", "question"],
            threshold: 0.3,
            includeScore: true,
          })
        );
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (question: string) => {
    const q = question.trim();
    if (!q || isLoading) return;
    setInput("");

    // Fuzzy match FAQ first
    const faqResult = fuse?.search(q)[0];
    const faqMatch = faqResult && faqResult.score !== undefined && faqResult.score < 0.3
      ? faqResult.item
      : null;

    await sendMessage(q, faqMatch ? { answer: faqMatch.answer } : null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {/* Welcome */}
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-sm">
                👋 Bonjour <strong>{firstName}</strong> ! Comment puis-je vous aider ?
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium px-1">Questions fréquentes :</p>
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleSend(chip)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-huntzen-blue hover:bg-huntzen-blue/5 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onOpenTicket={onOpenTicket} />
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-1 px-3 py-2 bg-muted/50 rounded-xl w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question..."
            maxLength={500}
            disabled={isLoading}
            className="flex-1 text-sm bg-muted/50 rounded-lg px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-huntzen-blue disabled:opacity-50"
          />
          <Button
            size="sm"
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isLoading}
            className="px-3"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  onOpenTicket,
}: {
  message: SupportMessage;
  onOpenTicket: () => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-sm",
          isUser
            ? "bg-huntzen-blue text-white rounded-br-sm"
            : "bg-muted/70 rounded-bl-sm"
        )}
      >
        {!isUser && message.type && (
          <div className="mb-1">
            {message.type === "faq" && (
              <Badge variant="outline" className="text-[10px] h-4 border-green-500 text-green-600">
                FAQ
              </Badge>
            )}
            {message.type === "ai" && (
              <Badge variant="outline" className="text-[10px] h-4 border-blue-400 text-blue-500">
                IA
              </Badge>
            )}
          </div>
        )}

        {message.type === "guardrail" ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{message.content}</p>
            <button
              onClick={onOpenTicket}
              className="text-xs text-huntzen-blue hover:underline flex items-center gap-1"
            >
              Ouvrir un ticket <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert text-inherit [&>p]:m-0 [&>ul]:mt-1 [&>ol]:mt-1">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
