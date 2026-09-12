import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getLocalizedMetadata } from "@/lib/seo/metadata";

const maintenanceMetadata: Metadata = {
  title: "Maintenance | HuntZen",
  robots: { index: false },
};

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata(maintenanceMetadata, "maintenance");
}

export default async function MaintenancePage() {
  const t = await getTranslations("maintenance");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Wrench className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-lg">
            {t("description")}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("backSoon")}
        </p>
        <div className="flex justify-center">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
