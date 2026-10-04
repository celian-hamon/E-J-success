import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, TIME_ZONE } from "./config";

// No locale in the URL: the language comes from the user's choice (cookie),
// then the browser's Accept-Language, then French.
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : negotiateLocale((await headers()).get("accept-language"));

  return {
    locale: locale ?? DEFAULT_LOCALE,
    timeZone: TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
