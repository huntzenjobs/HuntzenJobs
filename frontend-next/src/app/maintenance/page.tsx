import type { Metadata } from "next";
import { Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Maintenance | HuntZen",
  robots: { index: false },
};

export default function MaintenancePage() {
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
            Maintenance en cours
          </h1>
          <p className="text-muted-foreground text-lg">
            HuntZen est temporairement indisponible pour une mise à jour.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Nous serons de retour très prochainement. Merci pour votre patience.
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
