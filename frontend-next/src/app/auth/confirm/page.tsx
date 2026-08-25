import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing-header";
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
  const tokenHash =
    typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";
  const hasValidParameters = Boolean(tokenHash && type);

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader forceWhite />
      <main
        id="main-content"
        className="flex min-h-screen items-center px-5 pb-16 pt-28 sm:px-8"
      >
        <section className="mx-auto w-full max-w-xl border-l-2 border-[#00D9FF] py-2 pl-6 sm:pl-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
            {hasValidParameters ? t("title") : t("invalidTitle")}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-gray-600 sm:text-lg">
            {hasValidParameters ? t("description") : t("invalidDescription")}
          </p>

          {hasValidParameters ? (
            <form action="/auth/callback" method="post" className="mt-8">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full bg-gray-950 px-7 font-bold text-white hover:bg-gray-800 focus-visible:ring-[#00D9FF] sm:w-auto"
              >
                {t("action")}
              </Button>
            </form>
          ) : (
            <Button asChild size="lg" className="mt-8 h-12 w-full sm:w-auto">
              <Link href="/signup">{t("backToSignup")}</Link>
            </Button>
          )}

          <p className="mt-5 text-sm text-gray-500">{t("securityNote")}</p>
        </section>
      </main>
    </div>
  );
}
