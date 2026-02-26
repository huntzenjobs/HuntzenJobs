'use client'

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || ''

async function adminFetch(path: string, options?: RequestInit) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export interface ReferralLeaderEntry {
  id: string
  referral_code: string
  total_clicks: number
  total_signups: number
  total_conversions: number
  referrer_id: string
  profiles: { email: string; full_name: string | null } | null
}

export interface ReferralStats {
  total_referrers: number
  total_signups: number
  total_conversions: number
  total_rewards_applied: number
}

export interface ReferralConfig {
  id: number
  signup_reward_type: string | null
  signup_reward_value: Record<string, any> | null
  conversion_reward_type: string
  conversion_reward_value: Record<string, any>
  is_active: boolean
  updated_at: string
}

export function useAdminReferrals() {
  const fetchLeaderboard = useCallback(async (): Promise<ReferralLeaderEntry[]> => {
    const data = await adminFetch('/api/admin/referrals/leaderboard')
    return data.leaderboard
  }, [])

  const fetchStats = useCallback(async (): Promise<ReferralStats> => {
    return adminFetch('/api/admin/referrals/stats')
  }, [])

  const fetchConfig = useCallback(async (): Promise<ReferralConfig> => {
    return adminFetch('/api/admin/referrals/config')
  }, [])

  const updateConfig = useCallback(async (updates: Partial<ReferralConfig>): Promise<boolean> => {
    try {
      await adminFetch('/api/admin/referrals/config', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      toast.success('Configuration mise à jour')
      return true
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`)
      return false
    }
  }, [])

  const grantReward = useCallback(async (signupId: string): Promise<boolean> => {
    try {
      const data = await adminFetch(`/api/admin/referrals/grant-reward/${signupId}`, {
        method: 'POST',
      })
      if (data.ok) toast.success('Récompense accordée')
      else toast.error('Échec de la récompense')
      return data.ok
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`)
      return false
    }
  }, [])

  return { fetchLeaderboard, fetchStats, fetchConfig, updateConfig, grantReward }
}
