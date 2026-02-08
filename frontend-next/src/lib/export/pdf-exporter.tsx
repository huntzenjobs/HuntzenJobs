/**
 * PDF Exporter for Coach Conversations
 * Sprint 5: Export conversations as styled PDF using @react-pdf/renderer
 * 2-4x faster than jsPDF, with HuntZen branding
 */

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Font,
} from '@react-pdf/renderer'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { CoachMessage, ExportMetadata } from '@/types/coach-history'

// ============================================================================
// STYLES (HuntZen Design System)
// ============================================================================

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#2563eb', // HuntZen blue
    padding: 20,
    marginBottom: 20,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#e0e7ff',
  },
  metadata: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  metadataText: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 4,
  },
  messageContainer: {
    marginBottom: 15,
  },
  messageUser: {
    backgroundColor: '#3b82f6', // Blue
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageAssistant: {
    backgroundColor: '#8b5cf6', // Purple
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageRole: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  messageContent: {
    fontSize: 10,
    color: '#ffffff',
    lineHeight: 1.6,
  },
  messageTimestamp: {
    fontSize: 8,
    color: '#e5e7eb',
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
  separator: {
    marginVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
})

// ============================================================================
// PDF DOCUMENT COMPONENT
// ============================================================================

interface ConversationPDFProps {
  messages: CoachMessage[]
  metadata: ExportMetadata
}

const ConversationPDF: React.FC<ConversationPDFProps> = ({ messages, metadata }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header with HuntZen branding */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🤖 HuntZen Coach IA</Text>
        <Text style={styles.headerSubtitle}>Votre coach carrière intelligent</Text>
      </View>

      {/* Metadata section */}
      <View style={styles.metadata}>
        <Text style={[styles.metadataText, { fontSize: 14, color: '#111827', fontWeight: 'bold', marginBottom: 8 }]}>
          {metadata.title}
        </Text>
        <Text style={styles.metadataText}>
          Date: {format(new Date(metadata.conversationDate), 'PPP', { locale: fr })}
        </Text>
        <Text style={styles.metadataText}>
          Messages: {metadata.messageCount}
        </Text>
        <Text style={styles.metadataText}>
          Exporté le: {format(new Date(metadata.exportedAt), 'PPp', { locale: fr })}
        </Text>
      </View>

      <View style={styles.separator} />

      {/* Messages */}
      {messages.map((msg, index) => {
        const isUser = msg.role === 'user'
        const roleLabel = isUser ? '👤 Vous' : '🤖 Coach'

        return (
          <View key={msg.id} style={styles.messageContainer}>
            <View style={isUser ? styles.messageUser : styles.messageAssistant}>
              <Text style={styles.messageRole}>{roleLabel}</Text>
              <Text style={styles.messageContent}>{msg.content}</Text>
              <Text style={styles.messageTimestamp}>
                {format(new Date(msg.timestamp), 'HH:mm:ss', { locale: fr })}
              </Text>
            </View>
          </View>
        )
      })}

      {/* Footer */}
      <Text style={styles.footer}>
        Généré par HuntZen JobSearch - huntzen.fr | Coaching IA personnalisé
      </Text>
    </Page>
  </Document>
)

// ============================================================================
// EXPORT FUNCTION
// ============================================================================

/**
 * Export conversation to PDF format
 * Uses @react-pdf/renderer for 2-4x faster generation than jsPDF
 * @param messages - Array of conversation messages
 * @param metadata - Conversation metadata (title, date, etc.)
 */
export async function exportToPDF(
  messages: CoachMessage[],
  metadata: ExportMetadata
): Promise<void> {
  try {
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss')
    const filename = `huntzen-coach-${timestamp}.pdf`

    // Generate PDF blob
    const blob = await pdf(<ConversationPDF messages={messages} metadata={metadata} />).toBlob()

    // Download file
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('PDF generation error:', error)
    throw new Error('Échec de la génération du PDF')
  }
}

/**
 * Validate that conversation is not too large for PDF export
 * Warn if >200 messages (generation may take >12s)
 */
export function validatePDFSize(messageCount: number): { canExport: boolean; warning?: string } {
  if (messageCount > 200) {
    return {
      canExport: true,
      warning: `Cette conversation contient ${messageCount} messages. La génération du PDF peut prendre environ ${Math.ceil(messageCount / 16)} secondes.`,
    }
  }

  return { canExport: true }
}
