/**
 * CVHistoryDrawer - Drawer showing CV analysis history
 * Features: list of past analyses, quick stats, click to reload
 */

'use client'

import { FileText, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScoreRing } from '@/components/cv/score-ring'
import type { CVAnalysisResult } from '@/hooks/use-cv-history'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface CVHistoryDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: CVAnalysisResult[]
  onSelectAnalysis: (analysis: CVAnalysisResult) => void
  onDeleteAnalysis?: (id: string) => void
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CVHistoryDrawer({
  open,
  onOpenChange,
  history,
  onSelectAnalysis,
  onDeleteAnalysis,
  className
}: CVHistoryDrawerProps) {
  const handleSelect = (analysis: CVAnalysisResult) => {
    onSelectAnalysis(analysis)
    onOpenChange(false) // Close drawer after selection
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation() // Prevent triggering onSelectAnalysis
    if (onDeleteAnalysis) {
      onDeleteAnalysis(id)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('w-full sm:w-[450px] overflow-y-auto', className)}
      >
        <SheetHeader className="text-left mb-6">
          <SheetTitle className="text-2xl font-bold">
            Historique des analyses
          </SheetTitle>
          <SheetDescription>
            {history.length === 0 ? (
              'Aucune analyse enregistrée'
            ) : (
              <>
                {history.length} analyse{history.length > 1 ? 's' : ''} enregistrée
                {history.length > 1 ? 's' : ''}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* History List */}
        {history.length > 0 ? (
          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'group relative p-4 border-2 rounded-xl',
                  'hover:border-blue-300 hover:shadow-md',
                  'transition-all duration-200 cursor-pointer',
                  'bg-white'
                )}
                onClick={() => handleSelect(item)}
              >
                {/* Header with file name and score */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate mb-1">
                      {item.fileName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.analyzedAt && !isNaN(new Date(item.analyzedAt).getTime())
                        ? formatDistanceToNow(new Date(item.analyzedAt), {
                            addSuffix: true,
                            locale: fr,
                          })
                        : 'Date inconnue'}
                    </p>
                  </div>

                  {/* Score ring - smaller size */}
                  <div className="flex-shrink-0">
                    <ScoreRing
                      score={item.score}
                      size={50}
                      label=""
                      showAnimation={false}
                      animationDuration={0}
                    />
                  </div>
                </div>

                {/* Quick stats */}
                <div className="flex items-center gap-2 flex-wrap">
                  {item.strengths.length > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-green-50 text-green-700 border-green-200"
                    >
                      {item.strengths.length} point{item.strengths.length > 1 ? 's' : ''} fort
                      {item.strengths.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {item.weaknesses.length > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                    >
                      {item.weaknesses.length} faiblesse{item.weaknesses.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {item.suggestions.length > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                    >
                      {item.suggestions.length} suggestion{item.suggestions.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                {/* Delete button (appears on hover) */}
                {onDeleteAnalysis && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'absolute top-2 right-2',
                      'opacity-0 group-hover:opacity-100',
                      'transition-opacity duration-200',
                      'h-8 w-8 p-0',
                      'hover:bg-red-50 hover:text-red-600'
                    )}
                    onClick={(e) => handleDelete(e, item.id)}
                    aria-label="Supprimer cette analyse"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Empty state
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <FileText className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Aucune analyse enregistrée
            </h3>
            <p className="text-sm text-gray-500 max-w-[280px]">
              Téléchargez un CV pour commencer votre première analyse
            </p>
          </div>
        )}

        {/* Footer info */}
        {history.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Cliquez sur une analyse pour la recharger
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
