'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { User, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * ChatMessage - Message bubble component for Coach chat
 *
 * Features:
 * - User vs Assistant differentiation
 * - Markdown rendering for assistant messages
 * - Relative timestamps (hover to show)
 * - Animated avatar
 * - Copy message button
 *
 * UX Benefits:
 * - Clear visual hierarchy
 * - Professional markdown formatting
 * - Timestamps for context without clutter
 */

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date | string
}

export interface ChatMessageProps {
  message: Message
  /** Show avatar (default: true) */
  showAvatar?: boolean
  /** Show timestamp on hover (default: true) */
  showTimestamp?: boolean
  /** Enable copy button (default: true) */
  enableCopy?: boolean
  /** Custom className */
  className?: string
}

export function ChatMessage({
  message,
  showAvatar = true,
  showTimestamp = true,
  enableCopy = true,
  className,
}: ChatMessageProps) {
  const [showCopyButton, setShowCopyButton] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const isUser = message.role === 'user'
  const timestamp = typeof message.timestamp === 'string' 
    ? new Date(message.timestamp) 
    : message.timestamp

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Relative time
  const relativeTime = React.useMemo(() => {
    try {
      return formatDistanceToNow(timestamp, {
        addSuffix: true,
        locale: fr,
      })
    } catch (error) {
      return 'à l\'instant'
    }
  }, [timestamp])

  return (
    <div
      className={cn(
        'group flex gap-3 animate-fade-in',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
      onMouseEnter={() => setShowCopyButton(true)}
      onMouseLeave={() => setShowCopyButton(false)}
    >
      {/* Avatar (assistant only, on left) */}
      {!isUser && showAvatar && (
        <div className="flex-shrink-0">
          <div className="relative size-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
            <Sparkles className="size-4 text-white animate-pulse" />
            
            {/* Animated glow */}
            <div className="absolute inset-0 rounded-full bg-violet-400/30 animate-ping" 
                 style={{ animationDuration: '3s' }} />
          </div>
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          'flex flex-col gap-1 max-w-[80%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Bubble content */}
        <div
          className={cn(
            'relative px-4 py-3 rounded-2xl',
            'transition-all duration-200',
            isUser
              ? [
                  'bg-gradient-to-br from-blue-500 to-blue-600',
                  'text-white',
                  'rounded-br-md', // Sharp corner bottom-right
                  'shadow-md hover:shadow-lg',
                ]
              : [
                  'bg-white',
                  'text-gray-900',
                  'border-2 border-gray-200',
                  'rounded-bl-md', // Sharp corner bottom-left
                  'shadow-sm hover:shadow-md',
                ]
          )}
        >
          {/* User: plain text */}
          {isUser && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          )}

          {/* Assistant: markdown */}
          {!isUser && (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Customize markdown rendering
                  p: ({ children }) => (
                    <p className="mb-2 last:mb-0 leading-relaxed text-gray-900">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="mb-2 pl-4 space-y-1 list-disc">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-2 pl-4 space-y-1 list-decimal">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-gray-900">{children}</li>
                  ),
                  code: ({ inline, children, ...props }: any) =>
                    inline ? (
                      <code
                        className="px-1.5 py-0.5 bg-gray-100 text-violet-600 rounded text-xs font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <code
                        className="block p-3 bg-gray-50 rounded-lg text-xs font-mono overflow-x-auto"
                        {...props}
                      >
                        {children}
                      </code>
                    ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900">{children}</strong>
                  ),
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 underline"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Copy button (assistant only) */}
          {!isUser && enableCopy && showCopyButton && (
            <button
              onClick={handleCopy}
              className={cn(
                'absolute -top-2 -right-2',
                'size-6 rounded-full',
                'bg-gray-800 hover:bg-gray-900',
                'flex items-center justify-center',
                'shadow-md',
                'transition-all duration-150',
                'opacity-0 group-hover:opacity-100'
              )}
              aria-label="Copier le message"
            >
              {copied ? (
                <svg className="size-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="size-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Timestamp (on hover) */}
        {showTimestamp && (
          <div
            className={cn(
              'text-xs text-gray-400',
              'opacity-0 group-hover:opacity-100',
              'transition-opacity duration-150',
              'px-2'
            )}
          >
            {relativeTime}
          </div>
        )}
      </div>

      {/* Avatar (user only, on right) */}
      {isUser && showAvatar && (
        <div className="flex-shrink-0">
          <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
            <User className="size-4 text-white" />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * TypingIndicator - Shows when assistant is typing
 */
export function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="relative size-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
          <Sparkles className="size-4 text-white animate-pulse" />
          <div className="absolute inset-0 rounded-full bg-violet-400/30 animate-ping" 
               style={{ animationDuration: '3s' }} />
        </div>
      </div>

      {/* Typing dots */}
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white border-2 border-gray-200 shadow-sm">
        <div className="flex gap-1">
          <div className="size-2 rounded-full bg-gray-400 animate-bounce" 
               style={{ animationDelay: '0ms', animationDuration: '1s' }} />
          <div className="size-2 rounded-full bg-gray-400 animate-bounce" 
               style={{ animationDelay: '200ms', animationDuration: '1s' }} />
          <div className="size-2 rounded-full bg-gray-400 animate-bounce" 
               style={{ animationDelay: '400ms', animationDuration: '1s' }} />
        </div>
      </div>
    </div>
  )
}
