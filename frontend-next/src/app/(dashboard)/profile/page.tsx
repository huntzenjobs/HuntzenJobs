import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfilePageClient } from "./profile-client";
import { PageGate } from "@/components/auth/page-gate";

export default async function ProfilePage() {
  // Get user from Supabase (server-side)
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Redirect to login if not authenticated
  if (authError || !user) {
    redirect("/login");
  }

  // Fetch user profile data
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Use defaults if profile doesn't exist yet
  const profileData = profile || {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || "",
    avatar_url: user.user_metadata?.avatar_url || null,
    preferred_language: "fr",
    email_notifications: true,
    newsletter_subscribed: false,
  };

  return (
    <PageGate featureFlag="page_profile">
      <ProfilePageClient
        user={{
          id: user.id,
          email: user.email!,
          emailVerified: !!user.email_confirmed_at,
        }}
        profile={profileData}
      />
    </PageGate>
  );
}
