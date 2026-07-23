set search_path = public;

insert into public.legal_documents (kind, version, title, body, published, created_by)
values ('terms', 1, 'CrimeAI Terms of Service', $TOS$
CRIMEAI TERMS OF SERVICE
Public Safety Crime Center (PSCC) · Effective: July 22, 2026 · Version 1.0

PLEASE READ CAREFULLY. THESE TERMS INCLUDE A BINDING ARBITRATION CLAUSE AND CLASS ACTION WAIVER (SECTION 14) THAT AFFECT YOUR LEGAL RIGHTS.

1. ACCEPTANCE
By creating an account or using CrimeAI (the "Service"), operated by BlackSeed Labs / TORR AI ("CrimeAI," "we," "us"), you agree to these Terms and our Privacy Policy. If you do not agree, do not use the Service.

2. THE SERVICE — INFORMATIONAL ONLY, NOT AN EMERGENCY SERVICE
CrimeAI is a community safety-awareness social network. IT IS NOT AN EMERGENCY SERVICE, NOT A SUBSTITUTE FOR 911, AND NOT AFFILIATED WITH ANY LAW ENFORCEMENT AGENCY. If you are in danger or witness an emergency, call 911 immediately. All information in the Service — including community reports, incident data, safety scores, alerts, maps, and AI responses — is provided for general awareness only and may be incomplete, delayed, unverified, or inaccurate. You must not rely on the Service to make safety-critical decisions.

3. ELIGIBILITY & ACCOUNTS
You must be at least 13 years old (and at least 18, or have parental consent, to submit crime reports or stream live). You are responsible for your account, your password, and all activity under your account. Provide accurate information and keep it current. One account per person; no impersonation.

4. YOUR CONTENT & LICENSE
You own the content you post (posts, reels, threads, reports, live streams, comments, messages). By posting, you grant CrimeAI a worldwide, non-exclusive, royalty-free, transferable, sublicensable license to host, store, reproduce, modify (for formatting), display, and distribute that content in connection with operating, promoting, and improving the Service. Public content is visible to other users and may appear on maps, feeds, and alerts. This license ends when you delete your content, except where it has been shared with others who have not deleted it, or where retention is required by law.

5. COMMUNITY CRIME REPORTING RULES
Reports are UNVERIFIED COMMUNITY INFORMATION, not official records. You agree to: (a) report only in good faith what you personally observed; (b) never knowingly post false, misleading, or exaggerated reports — false reporting may violate criminal law and will result in termination; (c) never use the Service to harass, dox, stalk, accuse, or identify private individuals (no names, faces, license plates, or addresses of private persons); (d) never organize or encourage vigilantism, confrontation, or interference with law enforcement; (e) film only from a safe, lawful location, and only what is lawful to record in a public place. You are solely responsible for your reports and any consequences of them. We may share content with law enforcement in response to valid legal process or where we believe in good faith there is a risk of serious harm.

6. VERIFICATION & LABELS
"Verified" badges, safety scores, trust labels, and similar indicators are informational tools generated from community and data signals. They are NOT guarantees of identity, accuracy, or safety, and we disclaim all liability arising from reliance on them.

7. ARTIFICIAL INTELLIGENCE
The Service includes AI features ("CrimeAI" conversations, ranking, alerting, moderation assistance, verification signals — powered by TORR AI and third-party models). AI OUTPUT MAY BE WRONG. It is generated automatically, is not reviewed by humans before delivery, is not legal, medical, security, or professional advice, and must not be your basis for safety-critical action. By design, the Service does not offer facial recognition of private individuals, does not generate race- or ethnicity-based descriptions, and does not perform predictive policing of individuals. You will not use AI features to attempt any of those things.

8. DATA & TRACKING
We collect and process account data, profile data, precise location (with your permission), content and media, usage analytics and event tracking, and device information, as described in the Privacy Policy. By using the Service you consent to that collection and processing. If you enable SMS or push alerts, you consent to receive them (message/data rates may apply; reply STOP to opt out of SMS).

9. PROHIBITED CONDUCT
No unlawful use; no harassment, hate, or threats; no false emergencies or panic-inducing content; no spam or scraping; no interference with the Service or its security; no reverse engineering; no use of the Service to train competing models; no content that infringes others' rights or privacy.

10. MODERATION & ENFORCEMENT
We may remove content, restrict features (including LIVE), suspend, or terminate accounts at any time, with or without notice, for any violation of these Terms or risk to the community. Command Center administrators may review content and account activity for safety, moderation, and legal compliance.

11. INTELLECTUAL PROPERTY & DMCA
The Service, including the CrimeAI name, owl-shield logo, software, and design, is owned by BlackSeed Labs / TORR AI and protected by law. Copyright complaints: legal@publicsafetycrimecenter.com (include the information required by 17 U.S.C. § 512(c)(3)). Repeat infringers will be terminated.

12. DISCLAIMER OF WARRANTIES
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR AVAILABILITY. WE DO NOT WARRANT THAT ALERTS OR INFORMATION WILL BE TIMELY, COMPLETE, OR ACCURATE, OR THAT THE SERVICE WILL PREVENT ANY CRIME, INJURY, OR LOSS.

13. LIMITATION OF LIABILITY & INDEMNITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, CRIMEAI, BLACKSEED LABS, TORR AI, AND THEIR OFFICERS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS ARISING FROM USER CONTENT, COMMUNITY REPORTS, AI OUTPUT, RELIANCE ON THE SERVICE, OR ACTS OR OMISSIONS OF OTHER USERS OR THIRD PARTIES. OUR TOTAL LIABILITY FOR ALL CLAIMS SHALL NOT EXCEED THE GREATER OF ONE HUNDRED U.S. DOLLARS (US$100) OR THE AMOUNT YOU PAID US IN THE PAST 12 MONTHS. Some states do not allow certain limitations; in those states, liability is limited to the fullest extent permitted. You agree to indemnify and hold us harmless from claims arising out of your content, your reports, or your violation of these Terms or of law.

14. DISPUTE RESOLUTION — ARBITRATION & CLASS ACTION WAIVER
Any dispute arising out of or relating to these Terms or the Service will be resolved by BINDING INDIVIDUAL ARBITRATION administered by the American Arbitration Association under its Consumer Arbitration Rules, rather than in court, except that either party may bring an individual claim in small-claims court. YOU AND CRIMEAI EACH WAIVE THE RIGHT TO A JURY TRIAL AND TO PARTICIPATE IN A CLASS, COLLECTIVE, OR REPRESENTATIVE ACTION. You may opt out of arbitration within 30 days of first accepting these Terms by emailing legal@publicsafetycrimecenter.com with your account email and a statement that you opt out.

15. GOVERNING LAW & VENUE
These Terms are governed by the laws of the State of Florida and applicable U.S. federal law, without regard to conflict-of-laws rules. Any proceeding not subject to arbitration shall be brought exclusively in the state or federal courts located in Miami-Dade County, Florida, and you consent to their jurisdiction.

16. CHANGES & TERMINATION
We may update these Terms; material changes will be presented in the app and your continued use constitutes acceptance. You may stop using the Service and delete your account at any time. Sections that by their nature survive termination (4, 5, 11–15) survive.

17. CONTACT
BlackSeed Labs / TORR AI · legal@publicsafetycrimecenter.com
$TOS$, true, 'system')
on conflict (kind, version) do nothing;

insert into public.legal_documents (kind, version, title, body, published, created_by)
values ('privacy', 1, 'CrimeAI Privacy Policy', $PP$
CRIMEAI PRIVACY POLICY
Public Safety Crime Center (PSCC) · Effective: July 22, 2026 · Version 1.0

This Policy explains what we collect, how we use it, and your choices. By using CrimeAI you agree to this Policy.

1. INFORMATION WE COLLECT
• Account: name, email, username, password (hashed), phone (optional), profile photo, bio.
• Location: your home area and, with your device permission, precise location — used for local feeds, maps, alerts, and safety scores. Community reports include an approximate location by design.
• Content: posts, reels, threads, reports, live streams and replays, comments, messages, and media you upload (photos/video, including camera captures).
• Usage & tracking: in-app events (app opens, views, posts, likes, follows, reports, searches and similar actions), timestamps, and interaction data used for analytics, ranking, and safety.
• Device & technical: device type, OS, app version, IP address, crash and performance data.
• Communications: feedback you send, support messages, and applications (e.g., Live Ambassador).

2. HOW WE USE INFORMATION
To operate the Service (feeds, maps, alerts, messaging); to personalize content by location, interests, and follows; to power AI features (conversations, ranking, alert decisions, moderation and verification signals — processed by TORR AI and vetted third-party AI providers); to send safety alerts and notifications you enable (push, SMS, email); for analytics and product improvement; for security, anti-abuse, moderation, and enforcement of our Terms; and to comply with law.

3. HOW WE SHARE INFORMATION
• Public content: posts, reports, profiles, and live streams are visible to other users per your privacy settings (private accounts limit visibility to approved followers).
• Service providers: hosting, database, analytics, communications (e.g., email/SMS delivery), and AI processing vendors, bound by contract to protect your data.
• Legal & safety: we may disclose information in response to valid legal process (subpoena, court order, warrant), or where we believe in good faith it is necessary to prevent imminent harm, investigate fraud or abuse, or protect the rights and safety of users and the public. Where permitted, we will notify you of legal demands for your data.
• Business transfers: in a merger, acquisition, or asset sale, data may transfer subject to this Policy.
• WE DO NOT SELL YOUR PERSONAL INFORMATION and we do not share it with third parties for their own advertising.

4. LOCATION CHOICES
Precise location is optional and controlled by your device permissions. You can use the app with an approximate home area only. Alert radius and categories are configurable in Settings.

5. AI PROCESSING
Content and usage signals may be processed by AI systems to rank feeds, route alerts, assist moderation, and answer your questions. By design the Service does not use facial recognition of private individuals, does not produce race- or ethnicity-based descriptions, and does not perform predictive policing of individuals.

6. RETENTION & DELETION
We keep data while your account is active. When you delete content it is removed from the Service; residual copies may persist briefly in backups. When you delete your account, we delete or de-identify personal data within 30 days, except records we must keep for legal, safety, or security purposes (including report and moderation records where retention is legally required or necessary to defend legal claims).

7. YOUR RIGHTS
Depending on your state (including Florida, California, Colorado, Connecticut, Virginia, Texas, Oregon, Montana, and others with comprehensive privacy laws), you may have rights to access, correct, delete, or obtain a copy of your personal data, and to appeal a decision. Submit requests to privacy@publicsafetycrimecenter.com; we will verify your identity and respond within the time required by law. We do not discriminate against you for exercising your rights.

8. CHILDREN
CrimeAI is not directed to children under 13 and we do not knowingly collect their data (COPPA). If you believe a child under 13 has an account, contact us and we will delete it.

9. SECURITY
We use industry-standard safeguards: encrypted transport (TLS), hashed passwords, row-level database security, role-based admin access, and audit logging of administrative actions. No system is 100% secure; report concerns to security@publicsafetycrimecenter.com.

10. COMMUNICATIONS
You control push, SMS, and email alerts in Settings. For SMS, message/data rates may apply; reply STOP to unsubscribe, HELP for help.

11. CHANGES
We will post updates here and present material changes in the app. The "Effective" date above reflects the latest version.

12. CONTACT
BlackSeed Labs / TORR AI · privacy@publicsafetycrimecenter.com
$PP$, true, 'system')
on conflict (kind, version) do nothing;
