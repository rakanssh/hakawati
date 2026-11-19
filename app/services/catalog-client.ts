import { createCatalogTransport } from "@/services/catalog.service";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";

/** The catalog transports the account settings allow: public reads, and signed-in calls when signed in. */
export function currentCatalogTransports() {
  const settings = useSyncSettingsStore.getState();
  const baseUrl = settings.cloudBaseUrl.trim();
  const token = settings.accessToken.trim();
  const expired =
    settings.accessTokenExpiresAt !== null &&
    settings.accessTokenExpiresAt <= Date.now();
  const signedIn = Boolean(settings.accountId && token && !expired);
  const publicTransport = baseUrl ? createCatalogTransport({ baseUrl }) : null;
  const authTransport =
    baseUrl && signedIn
      ? createCatalogTransport({ baseUrl, accessToken: token })
      : null;
  return {
    baseUrl,
    publicTransport,
    authTransport,
    readTransport: authTransport ?? publicTransport,
  };
}
