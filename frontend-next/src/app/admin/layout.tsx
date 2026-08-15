import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "@/components/admin/admin-nav";
import { AdminSearchDialog } from "@/components/admin/admin-search-dialog";

export const metadata = {
  title: "Admin — HuntZen",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated → redirect to login
  if (!user) {
    redirect("/login?redirectTo=/admin");
  }

  // Check is_admin from DB (source of truth — see migration 20260227000001)
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  // Not admin → redirect to dashboard
  if (!profile?.is_admin) {
    redirect("/jobs");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <AdminNav />
      <AdminSearchDialog />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="container mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
