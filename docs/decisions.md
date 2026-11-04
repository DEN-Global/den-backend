# Confirmed decisions and implementation status

Reviewed 2026-11-04 from the user-linked ChatGPT project conversation:
https://chatgpt.com/g/g-p-6aea3bb9dd8881918f22778638476421-travel/c/6aea2e3b-a2fc-83e9-bd74-c083e2871470

## Additional context recovered from the conversation

The user confirmed the master blueprint and asked Codex to create the required repositories after the user creates the DEN Global organization. The organization is DEN-Global. CLI discovery and the connected GitHub listing both found only den-docs, whose README contains a heading. There is no available existing application to extend. New additive implementation may begin without assuming that inaccessible older work does not exist.

The proposed repository boundaries are den-consumer, den-rider, den-marketplace, den-admin, den-warehouse, den-logistics, den-backend and den-infrastructure. Create them as stages require working code rather than publishing empty applications.

Warehouse owners manage staff and daily operations; DEN administrators provide oversight. Registration preparation can be available while international trade is locked, but international operational activation requires both the master unlock and warehouse approval.

The chat references a monthly admin-controlled collection process, manual collection and authorized seven-day automatic collection. The exact historical policy and authorization semantics must be recovered before implementing deductions. No deduction is enabled by this implementation.

All commission tiers/rates remain undecided pending research and approval. Previously mentioned competitor prices are conversation claims, not newly verified research, and must not be used as current billing facts.

## History limitation

The conversation lazily loads older messages. The recovered portion includes warehouse responsibilities, commission policy, pricing discussion, the complete consolidated blueprint and organization/repository planning. Earlier history has not yet been fully reviewed. Do not claim that all older role, seller tier, design or collection decisions have been verified.

## Stage report

New files: src/policy.js, test/policy.test.js, package.json, README.md, docs/master-requirements.md, docs/decisions.md and .github/workflows/check.yml.

Validation: 17 Node test cases passed; JavaScript syntax check passed. There were no baseline application tests because no application code was available. Tests exercise the policy library; no HTTP, database, identity-provider or deployment integration is claimed.

Next dependencies: recover remaining history; establish authentication and role registry; build transactional persistence, audit chain and API adapters; then warehouse registration and owner/staff workflows. The master requirements remain the full delivery scope, not a list of completed features.

## Full chronological review update

The browser subsequently loaded backward to the first greeting and project discussion. The original user explicitly said the project starts from scratch. The source-unavailable blocker in the initial workspace audit is therefore resolved for new development. The existing den-docs repository remains untouched.

### Decisions recovered beyond the final prompt

- Global architecture from the outset; do not assume a Nigeria-only launch or activate any country without readiness checks.
- One platform and shared login with separate role interfaces and repositories. Retain den-manager, den-dispatch, den-transport and den-shipment concepts; later proposed den-marketplace/den-logistics names are not authorization to silently rename or discard those responsibilities.
- Consumer mode is common. Consumer + business manager or Consumer + rider are permitted. Ordinary store-manager + delivery-rider combination is prohibited. An independent passenger driver may manage their own transport business/finances without receiving unrelated store-management powers. Organization employees and warehouse staff are scoped memberships, not automatic store-owner accounts.
- Riders may choose goods delivery, passenger transport or both subject to approved vehicle capabilities, licenses, route and country availability. Boats/ferries, refrigerated transport and long-distance freight belong in future eligibility models alongside bicycles, motorcycles, cars, buses, vans and trucks.
- Rider communities help members discover jobs under explicit contracts. Maximum five active communities per rider. Merchant links are separate and do not consume community slots. Community creator control and fees are limited by the agreed contract, with no invented default deductions.
- Merchant-linked qualified nearby riders have acceptance priority. Other riders may see requests but cannot claim during that priority interval. The exact fallback interval remains configurable and unresolved.
- First server-confirmed rider acceptance reserves an order even before preparation is complete. Declining before pickup reopens it. Organization button is Ready (supersedes earlier Accept wording). Pickup requires Ready, assigned authenticated rider, organization QR identification, and an authorized organization employee's Confirm Handoff. A reusable organization QR is not sufficient proof of custody.
- Consumer tracking starts after acceptance with consented location sharing. Physical pickup and custody remain a separate milestone. Both manager and consumer see the same authorized underlying events.
- Emergency employee delivery was proposed for unclaimed orders after 5–10 minutes, with authenticated employee ID, explicit permission and vehicle eligibility. The conversation contains ambiguous follow-up; do not silently finalize timing/exclusivity policy or enable the feature without a resolved specification.
- Organization leadership: owner, optional assistant manager, team leads and employees. Departments/permissions are customizable, with sales, orders and dispatch isolated. A solo owner does not need employee teams. Initial employee capacity was discussed as 50–60; keep a configurable cap rather than an irreversible hardcoded assumption.
- Consumers search products across sellers, browse individual storefronts, follow/favorite organizations, and leave 1–5-star reviews/comments on a separate community page.
- No private consumer–organization contact, including indirect direct messages via staff accounts. Manager/employee/team messaging and delivery-specific manager/rider and rider/consumer conversations remain allowed only for authorized members.
- Product payments are digital only at ordering. Organization settlement follows verified product payment and provider constraints. Delivery is paid on arrival, cash or digital. These are separate payments tied to one order; do not combine them into mandatory prepaid delivery checkout.
- Cash-payment confirmation is distinct from delivery confirmation. Cash collected must not also be credited as withdrawable digital wallet funds. Digital delivery earnings require verified payment plus completed delivery.
- Delivery confirmation: customer has a five-digit code; assigned rider enters it; a short-lived order-specific QR is unlocked on the rider's phone; customer scans to confirm receipt. Require expiry, retry limits and single use. Alternate-recipient/failure procedures are not finalized.
- One permanent order document combines the product-payment receipt and the later delivery-payment/completion receipt. Preserve identifiers, times and subsequent adjustments.
- Wallets for all participating roles with separate NGN, USD, GBP and EUR balances; real deposits/withdrawals/conversion require licensed partner support. Linking a bank account does not grant access to unrelated bank activity or authorize debits.
- Commissions are monthly, not immediate per-sale deductions. The user adopted three progressive monthly sales brackets subject to research. Historical example thresholds/rates and later lower flat-rate suggestions remain competing research candidates, not approved production schedules. Preserve support for progressive pricing.
- Collection is manually controlled by default. Automatic collection requires explicit administrator enablement, valid customer/business payment authorization and seven full days after notice. Disputes/holds block collection. Eligibility calculation does not authorize or perform money movement.
- At least two Super Admin accounts are intended. Only Primary manages Lesser Super Admins; Lesser Super Admins manage ordinary admins but cannot change any Super Admin. Ordinary roles cannot promote themselves. The Primary account needs protected recovery. Final trade-lock authority is exclusively Primary, superseding earlier suggestions that any Super Admin could unlock.
- Preserve Finance, Rider Verification, Organization Verification, Community Moderation, Delivery Operations, Shipping, Support and Security/Audit ordinary departments. Three international roles are additional, with no fixed total assumed in code. Multi-role admin assignment was recommended, but the user's brief response was ambiguous; keep explicit permissions and do not infer universal ordinary-admin authority.

### Conflicts and deferred policy

The user explicitly put refunds on hold earlier. The final blueprint includes returns/refunds. Preserve refund/dispute data-model extensibility, but leave automatic compensation and refund eligibility disabled pending review; do not invent liability rules. This does not prevent a future authorized payment reversal implementation.

The initial API suggestions included Supabase/Vercel. The user later explicitly selected Cloudflare instead of Supabase; Cloudflare is the controlling infrastructure direction. Historical competitor prices and Cloudflare limits in the chat require current official-source verification before use. No live pricing or quota facts were validated in this stage.

### Updated code-stage result

31 Node policy tests pass, plus syntax validation. Additional implemented policy functions cover protected admin hierarchy, progressive commission brackets, automatic-collection eligibility, account-mode exclusion, five-community cap and allowed private-chat routes. These remain domain policies awaiting trusted authentication, storage and transactional API adapters. No live users, MFA challenges, accounts, warehouses, payments, tracking feeds or production resources were created.

The new private backend repository is https://github.com/DEN-Global/den-backend . Initial GitHub Actions checks passed. Future changes must preserve and extend this baseline.
