# Pinned DEN service sources

Private source packages are vendored to keep backend builds deterministic without cross-repository credentials. `manifest.json` pins repository, package and JSON contract version plus SHA-256 of each copied `src/index.js`. `test/services.test.js` verifies every pinned file. To update: review source package tests, copy reviewed source, update manifest hashes, and run full backend tests/build. This is not a package registry or a deployed service mesh.

`src/services-api.js` mounts authenticated persisted chat, tracking, in-app notifications and read-only wallet endpoints. The outer API must enforce session, Origin and CSRF validation before calling `handleServices`. Actor identity and current DB order participant IDs establish scope. Chat bodies are plain text. Audit events intentionally exclude message bodies and precise location coordinates. Message/location reads return at most 100/one records respectively; archival/pagination/retention policies are still needed for production.

Wallet and payments primitives are pinned for future settlement integration. No public posting/funding/withdrawal endpoint exists. The wallet read model has no funded balance by default. No provider events are accepted as live money. Do not infer funds from product sandbox receipts or cash collected.

Locations are rider-reported; `reported` does not prove physical authenticity. The caller must explicitly mark simulated samples, stale samples are labeled, no ETA is invented. Production consent, retention, spoofing response and map-provider integration remain pending.
