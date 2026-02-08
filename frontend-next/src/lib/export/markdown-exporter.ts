/**
 * Markdown Exporter for Coach Conversations
 * Sprint 5: Export conversations as formatted Markdown files
 */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { CoachMessage, ExportMetadata } from '@/types/coach-history'

/**
 * Export conversation to Markdown format
 * @param messages - Array of conversation messages
 * @param metadata - Conversation metadata (title, date, etc.)
 */
export function exportToMarkdown(
  messages: CoachMessage[],
  metadata: ExportMetadata
): void {
  const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss')
  const filename = `huntzen-coach-${timestamp}.md`

  // Build markdown content
  const lines: string[] = [
    `# ${metadata.title}`,
    '',
    `**Exporté le:** ${format(new Date(metadata.exportedAt), 'PPPp', { locale: fr })}`,
    `**Date de conversation:** ${format(new Date(metadata.conversationDate), 'PPP', { locale: fr })}`,
    `**Nombre de messages:** ${metadata.messageCount}`,
    '',
    '---',
    '',
  ]

  // Add messages
  messages.forEach((msg) => {
    const roleLabel = msg.role === 'user' ? '👤 Vous' : '🤖 Coach HuntZen'
    const timestamp = format(new Date(msg.timestamp), 'HH:mm:ss')

    lines.push(
      `## ${roleLabel}`,
      '',
      msg.content,
      '',
      `*${timestamp}*`,
      '',
      '---',
      ''
    )
  })

  // Footer
  lines.push(
    '',
    '---',
    '',
    `*Généré par HuntZen JobSearch - ${format(new Date(), 'PPP', { locale: fr })}*`
  )

  const content = lines.join('\n')

  // Download file
  downloadFile(content, filename, 'text/markdown;charset=utf-8')
}

/**
 * Helper: Trigger file download
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
