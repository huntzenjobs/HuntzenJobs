import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

import { detectLocale, isSupportedLocale } from "./detect-locale";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const headerStore = await headers();
  const locale = cookieStore.get("LOCALE_MANUAL")?.value === "1" && isSupportedLocale(rawLocale)
    ? rawLocale
    : detectLocale(
        headerStore.get("x-vercel-ip-country"),
        headerStore.get("accept-language"),
      );

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
