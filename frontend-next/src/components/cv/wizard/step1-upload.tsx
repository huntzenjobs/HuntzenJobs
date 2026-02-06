/**
 * Step1Upload - First step of CV analysis wizard
 * Features: Upload file OR paste text, file preview, historique button
 */

'use client'

import { useState } from 'react'
import { FileText, History } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UploadZoneCompact } from '@/components/cv/upload-zone-compact'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface Step1UploadProps {
  uploadMethod: 'file' | 'text'
  file: File | null
  cvText: string
  onUploadMethodChange: (method: 'file' | 'text') => void
  onFileChange: (file: File | null) => void
  onTextChange: (text: string) => void
  onShowHistory: () => void
  onNext: () => void
  historyCount: number
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Step1Upload({
  uploadMethod,
  file,
  cvText,
  onUploadMethodChange,
  onFileChange,
  onTextChange,
  onShowHistory,
  onNext,
  historyCount,
  className
}: Step1UploadProps) {
  const canProceed =
    (uploadMethod === 'file' && file !== null) ||
    (uploadMethod === 'text' && cvText.trim().length > 0)

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Historique button */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Télécharger votre CV</h2>
          <p className="text-sm text-gray-600 mt-1">
            Importez votre CV ou collez le texte pour commencer l'analyse
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onShowHistory}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          Historique
          {historyCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
              {historyCount}
            </span>
          )}
        </Button>
      </div>

      {/* Upload Tabs */}
      <Tabs
        value={uploadMethod}
        onValueChange={(value) => onUploadMethodChange(value as 'file' | 'text')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="file" className="gap-2">
            <FileText className="h-4 w-4" />
            Importer un fichier
          </TabsTrigger>
          <TabsTrigger value="text">Coller le texte</TabsTrigger>
        </TabsList>

        {/* Tab: Upload File */}
        <TabsContent value="file" className="mt-6">
          <UploadZoneCompact
            onUpload={(uploadedFile) => onFileChange(uploadedFile)}
          />
        </TabsContent>

        {/* Tab: Paste Text */}
        <TabsContent value="text" className="mt-6 space-y-3">
          <Textarea
            placeholder="Collez ici le contenu de votre CV..."
            value={cvText}
            onChange={(e) => onTextChange(e.target.value)}
            className="min-h-[200px] resize-y"
          />
          <p className="text-xs text-gray-500">
            Collez votre CV au format texte (copié depuis un PDF ou un document Word)
          </p>
        </TabsContent>
      </Tabs>

      {/* Next Button */}
      <div className="flex justify-end pt-4">
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-8"
        >
          Continuer
          <svg
            className="ml-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Button>
      </div>
    </div>
  )
}
