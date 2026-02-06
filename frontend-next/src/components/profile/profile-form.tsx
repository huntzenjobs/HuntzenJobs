'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { LogOut, Save, X, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ProfileFormProps {
  userId: string
  initialFullName?: string
  email: string
  emailVerified?: boolean
  onSaveSuccess?: (newFullName: string) => void
}

export function ProfileForm({
  userId,
  initialFullName = '',
  email,
  emailVerified = true,
  onSaveSuccess,
}: ProfileFormProps) {
  const [fullName, setFullName] = useState(initialFullName)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const router = useRouter()

  // Handle full name change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setFullName(newValue)
    setHasChanges(newValue !== initialFullName)
  }

  // Validate full name
  const validateFullName = (name: string): string | null => {
    if (!name || name.trim().length === 0) {
      return 'Le nom complet est requis'
    }
    if (name.trim().length < 2) {
      return 'Le nom doit contenir au moins 2 caractères'
    }
    if (name.length > 100) {
      return 'Le nom ne peut pas dépasser 100 caractères'
    }
    return null
  }

  // Handle save
  const handleSave = async () => {
    // Validate
    const validationError = validateFullName(fullName)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSaving(true)

    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        console.error('Profile update error:', error)
        toast.error('Erreur lors de la mise à jour du profil')
        return
      }

      toast.success('Profil mis à jour avec succès')
      setHasChanges(false)

      // Notify parent component
      if (onSaveSuccess) {
        onSaveSuccess(fullName.trim())
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      toast.error('Une erreur inattendue est survenue')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    setFullName(initialFullName)
    setHasChanges(false)
  }

  // Handle logout
  const handleLogout = async () => {
    setIsLoggingOut(true)

    try {
      const supabase = createClient()
      await supabase.auth.signOut()

      toast.success('Déconnexion réussie')
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('Logout error:', err)
      toast.error('Erreur lors de la déconnexion')
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Full Name Field */}
      <div className="space-y-2">
        <Label htmlFor="fullName">Nom complet</Label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={handleNameChange}
          placeholder="Votre nom complet"
          disabled={isSaving}
          className="max-w-md"
        />
        <p className="text-xs text-gray-500">
          Votre nom sera affiché dans votre profil et visible par les recruteurs.
        </p>
      </div>

      {/* Email Field (Read-only) */}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="flex items-center gap-2 max-w-md">
          <Input
            id="email"
            type="email"
            value={email}
            disabled
            readOnly
            className="bg-gray-50 cursor-not-allowed"
          />
          {emailVerified && (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Vérifié
            </Badge>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Votre email ne peut pas être modifié. Contactez le support si nécessaire.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>

          {hasChanges && (
            <Button
              onClick={handleCancel}
              variant="outline"
              disabled={isSaving}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Annuler
            </Button>
          )}
        </div>

        <div className="sm:ml-auto">
          <Button
            onClick={handleLogout}
            variant="destructive"
            disabled={isLoggingOut}
            className="gap-2 w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? 'Déconnexion...' : 'Se déconnecter'}
          </Button>
        </div>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">💡 Astuce</p>
        <p>
          Un profil complet améliore vos chances d'être repéré par les recruteurs.
          Ajoutez votre nom complet et une photo professionnelle.
        </p>
      </div>
    </div>
  )
}
