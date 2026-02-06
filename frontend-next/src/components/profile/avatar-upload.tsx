'use client'

import { useState, useRef } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Camera, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { changeAvatar, validateAvatarFile } from '@/lib/supabase/storage'
import { cn } from '@/lib/utils'
import { useAnnounceSuccess, useAnnounceError } from '@/hooks/use-announce'

interface AvatarUploadProps {
  userId: string
  currentAvatarUrl?: string | null
  userName?: string
  userEmail?: string
  onUploadSuccess?: (newUrl: string) => void
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'w-16 h-16',
  md: 'w-24 h-24',
  lg: 'w-32 h-32',
  xl: 'w-40 h-40',
}

export function AvatarUpload({
  userId,
  currentAvatarUrl,
  userName,
  userEmail,
  onUploadSuccess,
  className,
  size = 'xl',
}: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadButtonRef = useRef<HTMLButtonElement>(null)
  const announceSuccess = useAnnounceSuccess()
  const announceError = useAnnounceError()

  // Get initials for fallback
  const getInitials = () => {
    if (userName) {
      const names = userName.split(' ')
      if (names.length >= 2) {
        return `${names[0][0]}${names[1][0]}`.toUpperCase()
      }
      return userName.substring(0, 2).toUpperCase()
    }
    if (userEmail) {
      return userEmail.substring(0, 2).toUpperCase()
    }
    return 'U'
  }

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file
    const validationError = validateAvatarFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }

    // Show preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
      setSelectedFile(file)
    }
    reader.readAsDataURL(file)
  }

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)

    try {
      const { url, error } = await changeAvatar(
        selectedFile,
        userId,
        currentAvatarUrl
      )

      if (error || !url) {
        toast.error(error || 'Erreur lors de l\'upload')
        announceError(error || 'Erreur lors de l\'upload')
        return
      }

      toast.success('Photo de profil mise à jour')
      announceSuccess('Photo de profil mise à jour')
      setPreviewUrl(null)
      setSelectedFile(null)

      // Notify parent component
      if (onUploadSuccess) {
        onUploadSuccess(url)
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Return focus to upload button for keyboard users
      setTimeout(() => {
        uploadButtonRef.current?.focus()
      }, 100)
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Une erreur est survenue')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    setPreviewUrl(null)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const displayUrl = previewUrl || currentAvatarUrl

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Avatar with hover overlay */}
      <div className="relative group">
        <Avatar className={cn(sizeClasses[size], 'ring-2 ring-offset-2 ring-gray-200 group-hover:ring-huntzen-blue transition-all')}>
          <AvatarImage src={displayUrl || undefined} alt={userName || 'Avatar'} />
          <AvatarFallback className="bg-gradient-to-br from-huntzen-blue to-huntzen-turquoise text-white text-2xl font-semibold">
            {getInitials()}
          </AvatarFallback>
        </Avatar>

        {/* Hover overlay - only show if not uploading and no preview */}
        {!isUploading && !previewUrl && (
          <button
            onClick={triggerFileInput}
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            aria-label="Changer votre photo de profil"
            aria-describedby="avatar-instructions"
          >
            <Camera className="w-8 h-8 text-white" aria-hidden="true" />
          </button>
        )}

        {/* Loading overlay */}
        {isUploading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full"
            role="status"
            aria-live="polite"
            aria-label="Upload en cours"
          >
            <Loader2 className="w-8 h-8 text-white animate-spin" aria-hidden="true" />
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleFileSelect}
          className="sr-only"
          disabled={isUploading}
          aria-label="Sélectionner une image de profil"
          aria-describedby="avatar-instructions"
        />
      </div>

      {/* Action buttons */}
      {!previewUrl && (
        <Button
          ref={uploadButtonRef}
          onClick={triggerFileInput}
          variant="outline"
          size="sm"
          disabled={isUploading}
          className="gap-2"
          aria-describedby="avatar-instructions"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          Modifier la photo
        </Button>
      )}

      {/* Upload/Cancel buttons when preview is shown */}
      {previewUrl && !isUploading && (
        <div className="flex gap-2">
          <Button
            onClick={handleUpload}
            size="sm"
            disabled={isUploading}
            className="gap-2"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Enregistrer
          </Button>
          <Button
            onClick={handleCancel}
            variant="outline"
            size="sm"
            disabled={isUploading}
          >
            Annuler
          </Button>
        </div>
      )}

      {/* Help text + Screen reader instructions */}
      <p id="avatar-instructions" className="text-xs text-gray-500 text-center max-w-[200px]">
        JPG, PNG ou WebP. Max 2 MB.
      </p>
    </div>
  )
}
