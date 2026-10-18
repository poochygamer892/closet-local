# REA analysis and implementation scope

Date: 2026-10-18

This document records the public, static observations used to define No Local. The implementation is an independent open-source app; it does not include Fitted source code, branding, private assets, or private user data.

## Evidence

| Surface | Observation | REA evidence |
| --- | --- | --- |
| `https://fittedcloset.com/` | Public landing page with wardrobe cataloging, AI styling, closet value, resale, and social/community sections. Public modules were analyzed as inert JavaScript/JSX. | `ev_fb1fe5e62759889b2d7c9ccec10b06732f2eaacdba51a8e7fb24bfee49dd6d7c` |
| `https://app.fittedcloset.com/onboarding` | Public onboarding route. It exposes Apple sign-in, email/phone entry, and terms/privacy copy; no authenticated interior was accessed. The downloaded public chunks were statically analyzed. | `ev_7a15a849f8939de88173661cc9bcd8d2a120826442d27bc63d305a3efa29b856` |
| User-provided XAPK | `Fitted_11.0.7_APKPure.xapk`, Fitted 11.0.7, package `com.fittedcloset.app`, version code `170`, target SDK `36`, 204,725,242 bytes. It contains one base APK, 19 configuration APKs, an icon, and `manifest.json`. | `ev_ac3ba39ccbc5b9bde60e33ab130964550e3088157c6ed421c778292a9a6f9153` |

The XAPK SHA-256 is `5817e55e11b837e0d87c1471ef6f2d6a80710e1cb1f02f34497c0f206e280a47`.

## Scope derived from observations

No Local implements the reusable, local-first parts of the observed product category:

- private local account and per-user SQLite ownership checks;
- adding multiple garment photos, optional local background removal, and editable garment tags;
- closet inventory, categories, total value, cost per wear, and wear logging;
- outfit/looks builder, local lookbook export, and a natural-language prompt surface;
- packing lists;
- optional ONNX models stored on-device, with manual tagging when models are absent;
- Android and iOS native projects through Expo/React Native.

Marketplace payouts, third-party cross-posting, social feeds, weather/calendar integrations, digital-twin try-on, and remote AI are intentionally out of the first open-source baseline. They require external services, credentials, or product-specific data contracts and are tracked as future adapters rather than copied implementations.

## Limitations and confidence

- The landing page and onboarding were observed publicly with Playwright because REA browser MCP targets were not exposed in this session; their local JavaScript trees were then analyzed with REA's JavaScript application analyzer.
- REA's artifact graph verified the XAPK container and split inventory. APK manifest/code inspection was not completed because the caller-supplied `REA_JADX_MCP_JAR` is not configured; REA does not install JADX automatically.
- REA parses JavaScript as inert text. Static relationships, endpoints, and module graphs are evidence of shipped text, not proof of runtime behavior.
- No authentication, private API, or private user data was accessed. The app is therefore scoped from public claims and shipped-artifact inventory, not from undocumented private behavior.

