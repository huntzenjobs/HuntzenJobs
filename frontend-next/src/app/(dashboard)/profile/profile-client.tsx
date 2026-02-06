'use client'

import { useState } from 'react'
import { User, CreditCard, Settings, UserCircle } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AvatarUpload } from '@/components/profile/avatar-upload'
import { ProfileForm } from '@/components/profile/profile-form'
import { SubscriptionCard } from '@/components/profile/subscription-card'
import { SettingsSection } from '@/components/profile/settings-section'

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
      <div className="bg-white p-8 rounded-2xl border-2 border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-huntzen-blue flex items-center justify-center">
            <UserCircle className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-4xl font-black text-gray-900">Mon Profil</h1>
        </div>
        <p className="text-lg text-gray-600">
          Gérez vos informations personnelles, votre abonnement et vos préférences
        </p>
      </div>

      {/* Main Content with Tabs */}
      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="profile"
              className="data-[state=active]:border-b-2 data-[state=active]:border-huntzen-blue rounded-none px-6 py-4"
            >
              <User className="w-4 h-4 mr-2" />
              Profil
            </TabsTrigger>
            <TabsTrigger
              value="subscription"
              className="data-[state=active]:border-b-2 data-[state=active]:border-huntzen-blue rounded-none px-6 py-4"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Abonnement
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="data-[state=active]:border-b-2 data-[state=active]:border-huntzen-blue rounded-none px-6 py-4"
            >
              <Settings className="w-4 h-4 mr-2" />
              Paramètres
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="p-8 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
            </div>
          </TabsContent>

          {/* Subscription Tab */}
          <TabsContent value="subscription" className="p-8">
            <div className="max-w-3xl space-y-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Votre abonnement
                </h2>
                <p className="text-gray-600">
                  Consultez votre plan actuel, votre utilisation quotidienne et gérez votre
                  abonnement
                </p>
              </div>

              {/* Subscription Card with Plan & Quotas */}
              <SubscriptionCard />
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="p-8">
            <div className="max-w-3xl">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Paramètres</h2>
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
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Help Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Besoin d'aide ?</h3>
        <p className="text-blue-700 text-sm mb-4">
          Notre équipe support est là pour vous aider. N'hésitez pas à nous contacter si
          vous avez des questions sur votre compte ou votre abonnement.
        </p>
        <div className="flex gap-3">
          <a
            href="mailto:support@huntzen.com"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            support@huntzen.com
          </a>
          <span className="text-blue-400">•</span>
          <a
            href="/help"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Centre d'aide
          </a>
        </div>
      </div>
    </div>
  )
}
