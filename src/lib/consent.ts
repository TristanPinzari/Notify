import { useSyncExternalStore } from "react";
import posthog from "posthog-js";

export const CONSENT_KEY = "cookie-consent";
const CONSENT_EVENT = "consent-change";

export function applyConsent(value: "accepted" | "declined") {
  localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new Event(CONSENT_EVENT));
  if (value === "accepted") {
    posthog.set_config({ persistence: "localStorage+cookie" });
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
}

export function consentSubscribe(cb: () => void) {
  window.addEventListener(CONSENT_EVENT, cb);
  return () => window.removeEventListener(CONSENT_EVENT, cb);
}

export function useConsent() {
  return useSyncExternalStore(
    consentSubscribe,
    () => localStorage.getItem(CONSENT_KEY),
    () => null,
  );
}
