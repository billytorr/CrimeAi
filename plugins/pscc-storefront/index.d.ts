export interface PsccStorefrontPlugin {
  /** App Store storefront country (ISO 3166-1 alpha-3, e.g. "USA"), or absent when unavailable. */
  getCountry(): Promise<{ code?: string }>;
}
export declare const PsccStorefront: PsccStorefrontPlugin;
