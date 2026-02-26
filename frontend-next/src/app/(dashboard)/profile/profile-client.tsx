'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { User, CreditCard, Settings, UserCircle, Gift, Copy, Check, MousePointerClick, TrendingUp } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AvatarUpload } from '@/components/profile/avatar-upload'
import { ProfileForm } from '@/components/profile/profile-form'
import { SubscriptionCard } from '@/components/profile/subscription-card'
import { SettingsSection } from '@/components/profile/settings-section'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ProfilePageClientProps {
  user: {
    id: string
    email: string
    emailVerified: boolean
  }
  profile: {
    id: string
    email: string | null
    full_name: string | null
    avatar_url: string | null
    preferred_language?: string
    email_notifications?: boolean
    newsletter_subscribed?: boolean
  }
}


function ReferralWidget({ userId }: { userId: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [stats, setStats] = useState({ total_clicks: 0, total_signups: 0, total_conversions: 0 })
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const fetchCode = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${backendUrl}/api/referrals/my-code`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setCode(data.code)
      setStats({ total_clicks: data.total_clicks, total_signups: data.total_signups, total_conversions: data.total_conversions })
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCode() }, [fetchCode])

  const referralLink = code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?ref=${code}`
    : ''

  const copyLink = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    toast.success('Lien copié !')
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="h-32 animate-pulse bg-gray-100 rounded-xl" />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-black mb-2">Parrainez vos proches</h2>
        <p className="text-gray-600">Partagez votre lien. Quand un ami souscrit, vous gagnez des jours offerts.</p>
      </div>
      <Card className="border-2 border-[#00D9FF]/30 bg-[#00D9FF]/5">
        <CardContent className="pt-6 space-y-3">
          <p className="text-xs text-gray-500 font-medium">Votre lien de parrainage</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm font-mono text-gray-700 overflow-hidden text-ellipsis whitespace-nowrap">{referralLink}</div>
            <Button size="sm" onClick={copyLink} className="shrink-0 bg-[#00D9FF] hover:bg-[#00C4EA] text-white">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-gray-400">Code : <span className="font-mono font-semibold">{code}</span></p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Clics', value: stats.total_clicks, icon: MousePointerClick },
          { label: 'Inscriptions', value: stats.total_signups, icon: Gift },
          { label: 'Conversions', value: stats.total_conversions, icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 text-center">
              <Icon className="h-5 w-5 mx-auto mb-1 text-[#00D9FF]" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Comment ça marche ?</strong> Quand un ami souscrit via votre lien, vous recevez automatiquement des jours offerts.
      </div>
    </div>
  )
}

export function ProfilePageClient({ user, profile }: ProfilePageClientProps) {
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [fullName, setFullName] = useState(profile.full_name || '')

  // Handle avatar upload success
  const handleAvatarUpload = (newUrl: string) => {
    setAvatarUrl(newUrl)
  }

  // Handle profile save success
  const handleProfileSave = (newFullName: string) => {
    setFullName(newFullName)
  }

  return (
    <div className="space-y-6">
      {/* Hero Header - HuntZen Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl border border-gray-200 shadow-sm"
      >
        <div className="flex items-center gap-4 mb-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center shadow-lg shadow-[#00D9FF]/30"
          >
            <UserCircle className="w-7 h-7 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black text-black">Mon Profil</h1>
        </div>
        <p className="text-base text-gray-700 leading-relaxed">
          Gérez vos informations personnelles, votre abonnement et vos préférences
        </p>
      </motion.div>

      {/* Main Content with Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm"
      >
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="profile"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <User className="w-4 h-4 mr-2" />
              Profil
            </TabsTrigger>
            <TabsTrigger
              value="subscription"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Abonnement
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <Settings className="w-4 h-4 mr-2" />
              Paramètres
            </TabsTrigger>
            <TabsTrigger
              value="referral"
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#00D9FF] rounded-none px-6 py-4 transition-all data-[state=active]:text-[#00D9FF] font-medium"
            >
              <Gift className="w-4 h-4 mr-2" />
              Parrainage
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="p-8 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Avatar Section */}
              <div className="lg:col-span-1 flex justify-center lg:justify-start">
                <AvatarUpload
                  userId={user.id}
                  currentAvatarUrl={avatarUrl}
                  userName={fullName}
                  userEmail={user.email}
                  onUploadSuccess={handleAvatarUpload}
                  size="xl"
                />
              </div>

              {/* Profile Form Section */}
              <div className="lg:col-span-2">
                <ProfileForm
                  userId={user.id}
                  initialFullName={fullName}
                  email={user.email}
                  emailVerified={user.emailVerified}
                  onSaveSuccess={handleProfileSave}
                />
              </div>
            </motion.div>
          </TabsContent>

          {/* Subscription Tab */}
          <TabsContent value="subscription" className="p-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-3xl space-y-6"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-black mb-2">
                  Votre abonnement
                </h2>
                <p className="text-gray-600">
                  Consultez votre plan actuel, votre utilisation quotidienne et gérez votre
                  abonnement
                </p>
              </div>

              {/* Subscription Card with Plan & Quotas */}
              <SubscriptionCard />
            </motion.div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="p-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-3xl"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-black mb-2">Paramètres</h2>
                <p className="text-gray-600">
                  Personnalisez votre expérience HuntZen avec vos préférences
                </p>
              </div>

              <SettingsSection
                userId={user.id}
                initialSettings={{
                  preferred_language: profile.preferred_language,
                  email_notifications: profile.email_notifications,
                  newsletter_subscribed: profile.newsletter_subscribed,
                }}
              />
            </motion.div>
          </TabsContent>
          <TabsContent value="referral" className="p-8">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-2xl">
              <ReferralWidget userId={user.id} />
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Help Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-[#00D9FF]/10 border-2 border-[#00D9FF]/30 rounded-2xl p-6"
      >
        <h3 className="font-bold text-black mb-2">Besoin d'aide ?</h3>
        <p className="text-gray-700 text-sm mb-4">
          Notre équipe support est là pour vous aider. N'hésitez pas à nous contacter si
          vous avez des questions sur votre compte ou votre abonnement.
        </p>
        <div className="flex gap-3">
          <a
            href="mailto:support@huntzen.com"
            className="text-sm text-[#00D9FF] hover:text-black hover:underline font-medium transition-colors"
          >
            support@huntzen.com
          </a>
          <span className="text-gray-400">•</span>
          <a
            href="/help"
            className="text-sm text-[#00D9FF] hover:text-black hover:underline font-medium transition-colors"
          >
            Centre d'aide
          </a>
        </div>
      </motion.div>
    </div>
  )
}
