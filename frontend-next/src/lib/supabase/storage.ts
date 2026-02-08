/**
 * Supabase Storage helper functions for avatar uploads
 * Handles file validation, upload, and deletion
 */

import { createClient } from './client'
import { logAvatarUpdate } from '@/lib/security/logger'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const BUCKET_NAME = 'avatars'

/**
 * Validates an image file for avatar upload
 * @param file The file to validate
 * @returns Error message if invalid, null if valid
 */
export function validateAvatarFile(file: File): string | null {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return `Le fichier est trop volumineux. Taille maximale: 2 MB`
  }

  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Format non supporté. Formats acceptés: JPG, PNG, WebP`
  }

  return null
}

/**
 * Uploads an avatar to Supabase Storage
 * @param file The image file to upload
 * @param userId The user's ID
 * @returns The public URL of the uploaded avatar, or null on error
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<{ url: string | null; error: string | null }> {
  // Validate file
  const validationError = validateAvatarFile(file)
  if (validationError) {
    return { url: null, error: validationError }
  }

  const supabase = createClient()

  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now()
    const fileExt = file.name.split('.').pop()
    const fileName = `${userId}/${timestamp}.${fileExt}`

    // Upload file
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return { url: null, error: `Erreur lors de l'upload: ${uploadError.message}` }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(uploadData.path)

    if (!urlData.publicUrl) {
      return { url: null, error: 'Impossible de générer l\'URL publique' }
    }

    return { url: urlData.publicUrl, error: null }
  } catch (err) {
    console.error('Unexpected error during upload:', err)
    return { url: null, error: 'Une erreur inattendue est survenue' }
  }
}

/**
 * Deletes an avatar from Supabase Storage
 * @param avatarUrl The full public URL of the avatar to delete
 * @param userId The user's ID (for verification)
 * @returns True if successful, false otherwise
 */
export async function deleteAvatar(
  avatarUrl: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient()

  try {
    // Extract the file path from the public URL
    // URL format: https://{project}.supabase.co/storage/v1/object/public/avatars/{userId}/{filename}
    const urlParts = avatarUrl.split(`/${BUCKET_NAME}/`)
    if (urlParts.length !== 2) {
      console.error('Invalid avatar URL format')
      return false
    }

    const filePath = urlParts[1]

    // Verify the file belongs to this user
    if (!filePath.startsWith(`${userId}/`)) {
      console.error('Avatar does not belong to this user')
      return false
    }

    // Delete the file
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath])

    if (error) {
      console.error('Delete error:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('Unexpected error during deletion:', err)
    return false
  }
}

/**
 * Updates the user's avatar URL in the profiles table
 * @param userId The user's ID
 * @param avatarUrl The new avatar URL
 * @returns True if successful, false otherwise
 */
export async function updateProfileAvatar(
  userId: string,
  avatarUrl: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient()

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId)

    if (error) {
      console.error('Profile update error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Unexpected error updating profile:', err)
    return { success: false, error: 'Erreur lors de la mise à jour du profil' }
  }
}

/**
 * Complete avatar change flow: upload new, delete old, update profile
 * @param file The new avatar file
 * @param userId The user's ID
 * @param oldAvatarUrl The current avatar URL (to delete)
 * @returns The new avatar URL or null on error
 */
export async function changeAvatar(
  file: File,
  userId: string,
  oldAvatarUrl?: string | null
): Promise<{ url: string | null; error: string | null }> {
  // Upload new avatar
  const { url: newUrl, error: uploadError } = await uploadAvatar(file, userId)

  if (uploadError || !newUrl) {
    // Log failed avatar upload
    await logAvatarUpdate(userId, false)
    return { url: null, error: uploadError || 'Upload échoué' }
  }

  // Update profile with new URL
  const { success: updateSuccess, error: updateError } = await updateProfileAvatar(
    userId,
    newUrl
  )

  if (!updateSuccess) {
    // Log failed profile update
    await logAvatarUpdate(userId, false)
    return { url: null, error: updateError || 'Mise à jour du profil échouée' }
  }

  // Delete old avatar if it exists (don't fail if this errors)
  if (oldAvatarUrl && oldAvatarUrl.includes(BUCKET_NAME)) {
    await deleteAvatar(oldAvatarUrl, userId)
  }

  // Log successful avatar update
  await logAvatarUpdate(userId, true)

  return { url: newUrl, error: null }
}
