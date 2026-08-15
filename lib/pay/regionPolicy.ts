"use client";

// PaymentRegionPolicy — THE single decision point for whether external
// purchase UI (paywall, prices, upgrade CTAs, checkout links) may render.
// Guideline 3.1.1(a): the external-purchase-link allowance applies only to
// the US App Store storefront, so on iOS the answer comes from StoreKit 2's
// Storefront.current.countryCode (via the in-repo pscc-storefront plugin) —
// never device locale, never IP, never the profile.
//
// Rules (per docs/appstore-remediation):
//   web      → allowed  (a browser is not an App Store)
//   android  → allowed  (Google Play compliance is its own track — documented)
//   ios      → allowed only when the storefront is in the allowed list;
//              unknown/nil storefront fails CLOSED (blocked).
//
// Storefronts expand by CONFIG, not code: set NEXT_PUBLIC_ALLOWED_STOREFRONTS
// to a comma-separated ISO alpha-3 list (defaults to "USA").
//
// Do not scatter `if (isUS)` checks — every purchase surface asks this module
// (usePaymentRegion), and the answer re-evaluates when the app foregrounds
// because the storefront can change at runtime.

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

export type PaymentRegion = "allowed" | "blocked";

const DEFAULT_ALLOWED = ["USA"]; // ISO 3166-1 alpha-3, as StoreKit reports it

export function allowedStorefronts(): string[] {
  const env = process.env.NEXT_PUBLIC_ALLOWED_STOREFRONTS;
  const list = env ? env.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : DEFAULT_ALLOWED;
  return list.length ? list : DEFAULT_ALLOWED;
}

// Pure decision — unit-tested with USA / non-US / nil storefronts.
export function decideRegion(platform: string, storefrontCountry: string | null, allowed: string[] = allowedStorefronts()): PaymentRegion {
  if (platform !== "ios") return "allowed"; // web + android (see header)
  if (!storefrontCountry) return "blocked"; // unknown storefront fails closed
  return allowed.includes(storefrontCountry.toUpperCase()) ? "allowed" : "blocked";
}

async function readStorefrontCountry(): Promise<string | null> {
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<{ getCountry(): Promise<{ code?: string }> }>("PsccStorefront");
    const { code } = await plugin.getCountry();
    return code || null;
  } catch {
    return null; // plugin unavailable → policy fails closed on iOS
  }
}

// ── evaluated state + subscriptions ─────────────────────────────
let current: PaymentRegion | null = null;
const subscribers = new Set<(r: PaymentRegion) => void>();
let listening = false;

function platform(): string {
  try { return Capacitor.getPlatform(); } catch { return "web"; }
}

async function evaluate(): Promise<PaymentRegion> {
  const p = platform();
  const region = p === "ios" ? decideRegion(p, await readStorefrontCountry()) : decideRegion(p, null);
  if (region !== current) {
    current = region;
    subscribers.forEach((fn) => fn(region));
  }
  return region;
}

async function ensureForegroundReEval(): Promise<void> {
  if (listening || platform() === "web") return;
  listening = true;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("resume", () => { evaluate(); });
  } catch { /* app plugin unavailable — launch-time answer stands */ }
}

export async function paymentRegionPolicy(): Promise<PaymentRegion> {
  ensureForegroundReEval();
  return current ?? evaluate();
}

// React surface for purchase UI. iOS starts BLOCKED until the storefront
// answers (fail closed — a brief absence of the paywall beats flashing
// purchase UI at a storefront that must never see it).
export function usePaymentRegion(): PaymentRegion {
  const [region, setRegion] = useState<PaymentRegion>(() => current ?? (platform() === "ios" ? "blocked" : "allowed"));
  useEffect(() => {
    subscribers.add(setRegion);
    paymentRegionPolicy().then(setRegion);
    return () => { subscribers.delete(setRegion); };
  }, []);
  return region;
}
