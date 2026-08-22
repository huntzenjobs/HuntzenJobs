import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MailCheck, ShieldCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";

interface ConfirmEmailPageProps {
  searchParams: Promise<{
    token_hash?: string | string[];
    type?: string | string[];
  }>;
}

export default async function ConfirmEmailPage({
  searchParams,
}: ConfirmEmailPageProps) {
  const t = await getTranslations("auth.confirmEmail");
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";
  const hasValidParameters = Boolean(tokenHash && type);

  return (
    <AuthLayout>
      <main className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-900/5 sm:p-8">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00D9FF]/10 text-[#00AFCF]">
          {hasValidParameters ? (
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          )}
        </div>

        <h1 className="text-3xl font-black tracking-tight text-gray-950">
          {hasValidParameters ? t("title") : t("invalidTitle")}
        </h1>
        <p className="mt-3 leading-relaxed text-gray-600">
          {hasValidParameters ? t("description") : t("invalidDescription")}
        </p>

        {hasValidParameters ? (
          <form action="/auth/callback" method="post" className="mt-8">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full bg-[#00D9FF] font-bold text-gray-950 hover:bg-[#00C4EA] focus-visible:ring-[#00D9FF]"
            >
              {t("action")}
            </Button>
          </form>
        ) : (
          <Button asChild size="lg" className="mt-8 h-12 w-full">
            <Link href="/signup">{t("backToSignup")}</Link>
          </Button>
        )}

        <p className="mt-5 text-center text-sm text-gray-500">
          {t("securityNote")}
        </p>
      </main>
    </AuthLayout>
  );
}
