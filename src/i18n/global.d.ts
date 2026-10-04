import type messages from "../../messages/fr.json";
import type { Locale } from "./config";

// Type-checks every translation key against the French catalogue.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
