/**
 * UploadZoneCompact - Zone d'upload compacte avec preview
 * Version optimisée de l'upload zone pour gagner de l'espace
 */

'use client'

import { useState, useCallback, useRef } from 'react'
import { FileText, Upload, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface UploadZoneCompactProps {
  onUpload: (file: File) => void
  accept?: string
  maxSize?: number // in MB
  disabled?: boolean
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function UploadZoneCompact({
  onUpload,
  accept = '.pdf,.doc,.docx',
  maxSize = 5,
  disabled = false,
  className
}: UploadZoneCompactProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    const sizeInMB = file.size / (1024 * 1024)
    if (sizeInMB > maxSize) {
      return `Le fichier est trop volumineux (${sizeInMB.toFixed(1)}MB). Limite: ${maxSize}MB`
    }

    // Check file type
    const allowedExtensions = accept.split(',').map(ext => ext.trim().toLowerCase())
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowedExtensions.includes(fileExtension)) {
      return `Type de fichier non supporté. Formats acceptés: ${accept}`
    }

    return null
  }, [accept, maxSize])

  // Handle file selection
  const handleFileSelect = useCallback((selectedFile: File) => {
    const validationError = validateFile(selectedFile)

    if (validationError) {
      setError(validationError)
      setFile(null)
      return
    }

    setError(null)
    setFile(selectedFile)
    onUpload(selectedFile)
  }, [validateFile, onUpload])

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [disabled, handleFileSelect])

  // Handle file input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }, [handleFileSelect])

  // Handle remove file
  const handleRemove = useCallback(() => {
    setFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Handle click to open file dialog
  const handleClick = useCallback(() => {
    if (!disabled && !file) {
      fileInputRef.current?.click()
    }
  }, [disabled, file])

  return (
    <div className={cn('space-y-3', className)}>
      {/* Upload Zone */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl transition-all',
          'flex items-center justify-center',
          file ? 'h-auto p-4' : 'h-32 p-6',
          isDragging && !disabled && 'border-blue-500 bg-blue-50',
          !isDragging && !disabled && !file && 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 cursor-pointer',
          disabled && 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed',
          error && 'border-red-300 bg-red-50'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        {/* Content */}
        {file ? (
          // File preview
          <div className="flex items-center gap-3 w-full">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleRemove()
              }}
              disabled={disabled}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          // Upload prompt
          <div className="text-center">
            <Upload className={cn(
              'h-8 w-8 mx-auto mb-2',
              isDragging ? 'text-blue-500' : 'text-gray-400'
            )} />
            <p className="text-sm font-medium text-gray-700 mb-1">
              {isDragging ? 'Déposez votre fichier ici' : 'Glissez-déposez votre CV'}
            </p>
            <p className="text-xs text-gray-500">
              ou <span className="text-blue-600 font-medium">parcourez</span> vos fichiers
            </p>
          </div>
        )}
      </div>

      {/* Helper text / Error message */}
      {error ? (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center">
          Formats acceptés: PDF, DOCX • Taille max: {maxSize}MB
        </p>
      )}
    </div>
  )
}
