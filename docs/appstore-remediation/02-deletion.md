# PHASE 2 — In-app account deletion, hardened (Guideline 5.1.1(v))

## What already existed (audit §0.2) and is unchanged
- Settings → Danger zone → **Delete account** — two taps from Settings root, native UI, not a mailto/web link.
- Two-step confirmation with **typed `DELETE`** — the stronger of the MD's two accepted patterns.
- Real deletion: removing the `auth.users` row cascades (`ON DELETE CASCADE`) through profiles, posts, reports, comments, likes, follows, messages, saved locations, alert subscriptions, and scoring records.

## What Phase 2 added

| Change | File |
|---|---|
| **Backend deletion endpoint** — cancels the Authorize.Net **ARB subscription FIRST**, then deletes. If the ARB cancel genuinely fails, deletion **aborts** with a clear message (never an orphaned recurring charge). "Already cancelled/terminated" ARB responses count as success. | `app/api/me/delete/route.ts` |
| Client now calls the endpoint instead of the bare RPC (which couldn't touch Authorize.Net); server error text surfaces inline under the confirm input. | `lib/moderation.ts` `deleteMyAccount()` |
| **Audit log** — one row per deletion with the user id stored **only as SHA-256**, plus whether a subscription was active/cancelled. RLS enabled with no policies → service-role only. Audit insert can never block deletion. | `supabase/account-deletion-audit.sql` |
| **Plain-language screen**: what's deleted, what's retained and why (verification/consent records where law requires — matching the Privacy Policy), and that an active Protector subscription is cancelled with no further charges. | `components/screens/SettingsScreen.tsx` |

## Design notes
- Cancel-before-delete ordering is the whole point: deleting first would destroy `tier_subscriptions.anet_subscription_id` — the only key to stop the charge.
- The MD's "subscription must be cancelled separately (link to Phase 4 flow)" was implemented as the stronger guarantee: **deletion itself cancels ARB**, and the screen says so. Phase 4's manage/cancel flow remains for users who want to cancel *without* deleting.
- Migration to apply: `supabase/account-deletion-audit.sql` (listed in APPLY.md). Without it, deletion still works — only the audit row is skipped by design.

## Checklist rows closed
- [x] Account deletion reachable in two taps from settings *(pre-existing, verified)*
- [x] Deletion cancels any active ARB subscription in the same transaction *(app/api/me/delete/route.ts — cancel-first, abort-on-failure)*
- [x] Deletion cascades across user-generated content *(FK cascade, pre-existing)*
- [x] Deletion event logged with hashed identifier *(account_deletions table)*
