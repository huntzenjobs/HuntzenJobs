/**
 * ExportDialog Component
 * Sprint 5: Dialog for exporting coach conversations as PDF or Markdown
 * Features format selection, options, and export with loading state
 */

'use client'

import React, { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import type { CoachMessage, ExportMetadata } from '@/types/coach-history'
import { exportToMarkdown } from '@/lib/export/markdown-exporter'
import { exportToPDF, validatePDFSize } from '@/lib/export/pdf-exporter'

interface ExportDialogProps {
  messages: CoachMessage[]
  title?: string
  conversationDate?: string
}

export function ExportDialog({ messages, title, conversationDate }: ExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [format, setFormat] = useState<'pdf' | 'markdown'>('pdf')
  const [isExporting, setIsExporting] = useState(false)

  if (messages.length === 0) {
    return null
  }

  const metadata: ExportMetadata = {
    title: title || 'Conversation Coach IA',
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    conversationDate: conversationDate || messages[0]?.timestamp || new Date().toISOString(),
  }

  const handleExport = async () => {
    setIsExporting(true)

    try {
      if (format === 'pdf') {
        // Validate PDF size
        const validation = validatePDFSize(messages.length)
        if (validation.warning) {
          toast.warning(validation.warning)
        }

        // Export PDF
        await exportToPDF(messages, metadata)
        toast.success('PDF généré avec succès !')
      } else {
        // Export Markdown
        exportToMarkdown(messages, metadata)
        toast.success('Markdown exporté avec succès !')
      }

      setIsOpen(false)
    } catch (error) {
      console.error('Export error:', error)
      toast.error(
        format === 'pdf'
          ? 'Échec de la génération du PDF'
          : "Échec de l'export Markdown"
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-2 border-gray-200 hover:border-huntzen-blue hover:bg-huntzen-blue/5"
        >
          <FileDown className="w-4 h-4" />
          Exporter
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exporter la conversation</DialogTitle>
          <DialogDescription>
            Choisissez le format d'export pour sauvegarder cette conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Format Selection */}
          <div className="space-y-2">
            <Label>Format d'export</Label>
            <RadioGroup value={format} onValueChange={(value) => setFormat(value as 'pdf' | 'markdown')}>
              <div className="flex items-center space-x-2 border-2 border-gray-200 rounded-lg p-3 hover:border-huntzen-blue transition-colors cursor-pointer">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="flex-1 cursor-pointer">
                  <div className="font-medium">PDF</div>
                  <div className="text-xs text-gray-500">
                    Document formaté avec le design HuntZen (recommandé)
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 border-2 border-gray-200 rounded-lg p-3 hover:border-huntzen-blue transition-colors cursor-pointer">
                <RadioGroupItem value="markdown" id="markdown" />
                <Label htmlFor="markdown" className="flex-1 cursor-pointer">
                  <div className="font-medium">Markdown</div>
                  <div className="text-xs text-gray-500">
                    Fichier texte avec formatage simple (.md)
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Preview Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
            <div className="font-medium text-gray-700 mb-1">Aperçu de l'export</div>
            <div className="text-gray-600 space-y-1">
              <div>📄 Titre: {metadata.title}</div>
              <div>💬 Messages: {metadata.messageCount}</div>
              <div>
                📦 Taille estimée: ~
                {format === 'pdf'
                  ? `${Math.ceil(messages.length * 0.5)}KB`
                  : `${Math.ceil(messages.length * 0.3)}KB`}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isExporting}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="bg-gradient-to-r from-huntzen-blue to-huntzen-turquoise hover:from-huntzen-blue-dark hover:to-huntzen-turquoise"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Export en cours...
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 mr-2" />
                Exporter
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
