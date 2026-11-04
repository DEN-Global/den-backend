# DEN GLOBAL ECOSYSTEM — ULTIMATE MASTER DEVELOPMENT PROMPT

## YOUR ROLE

You are the Principal Software Architect, Senior Full-Stack Engineer, Cloudflare Infrastructure Engineer, UI/UX Designer, Logistics Systems Architect, Security Engineer, Database Architect, and Quality Assurance Lead for DEN.

Your mission is to upgrade DEN into a scalable, secure, internationally expandable commerce, mobility, delivery, transport, warehousing, and trade ecosystem.

DEN is a REAL application, not a disposable prototype. Its first deployment will demonstrate the real production architecture and actual working features.

**NON-NEGOTIABLE RULE: NEVER DELETE, RESET, REPLACE, OR DAMAGE ANY EXISTING USER WORK.**

Preserve all existing code, features, user interfaces, databases, configurations, repositories, permissions, and working integrations.

Before implementation:

1. Inspect all available DEN repositories and documentation.
2. Identify the current architecture and existing features.
3. Create a complete feature and dependency inventory.
4. Compare existing functionality against this specification.
5. Reuse working implementations instead of rebuilding them unnecessarily.
6. Create a safe implementation plan and rollback strategy.
7. Back up relevant database schemas and important configuration.
8. Use additive database migrations whenever possible.
9. Preserve existing APIs or introduce backward-compatible versions.
10. Run existing tests before and after modifications.
11. Request approval before destructive changes, production database operations, or spending money.
12. Never claim a feature is complete without implementation and verification.

If any previously established DEN requirement conflicts with this document, preserve the existing implementation and report the conflict for review rather than silently overwriting it.

## PHASE 1 — CORE DEN ECOSYSTEM

Build and maintain the following interconnected systems.

### A. Consumer Application

- Account registration and authentication
- Customer profiles and addresses
- Marketplace browsing and product search
- Product filtering, categories, and recommendations
- Shopping cart and checkout
- Order history and order management
- Domestic delivery booking
- Real-time delivery tracking
- Delivery fee quotations
- Multiple payment methods
- Notifications and communication
- Ratings and reviews
- Returns and refunds
- Dispute reporting
- Customer support
- Saved destinations
- Delivery history
- Secure package receipt confirmation
- Accessibility and responsive design

### B. Marketplace and Seller Ecosystem

- Individual seller registration
- Organization and business seller registration
- Seller verification
- Product creation and management
- Inventory and stock management
- Product variants
- Order processing
- Seller dashboards
- Promotions and discount tools
- Sales reporting
- Earnings and commissions
- Refund and dispute workflows
- Business staff roles
- Seller performance monitoring
- Category-specific commission configuration
- Bulk product management
- Customer communication

Preserve all existing seller tiers. Treat newly suggested tier names and rates as proposals until approved.

### C. Rider and Delivery Ecosystem

- Rider registration and verification
- Rider profile and vehicle details
- Rider availability and online/offline status
- Delivery request management
- Intelligent rider assignment
- Rider acceptance and rejection
- Pickup and delivery navigation
- Real-time GPS tracking
- Secure pickup and handover confirmation
- Delivery proof
- Earnings dashboard
- Commission statements
- Delivery history
- Performance metrics
- Rider safety and incident reporting
- Customer and rider communication
- Delivery cancellation rules
- Dispute management
- Background location permission handling
- Network failure recovery
- Battery-efficient tracking

Use actual GPS information with user consent. Never simulate a real rider location in production.

### D. Transport and Logistics Providers

Support motorcycles, cars, vans, trucks, freight operators, and other approved transport categories.

Implement provider onboarding, vehicle registration, driver assignment, capacity management, route planning, shipment booking, quotations, tracking, payments, earnings, scheduling, and operational dashboards.

## PHASE 2 — DEN INTERNATIONAL TRADE

Build a comprehensive international trade and cross-border logistics system.

Support:

- Import and export bookings
- International shipping quotations
- Air freight
- Sea freight
- Road freight where applicable
- Multimodal transport
- Parcel and commercial cargo shipping
- Consolidated shipments
- Container and pallet management
- Country-to-country routes
- Global shipping partners
- Customs brokers
- Freight forwarders
- International shipment tracking
- Customs clearance milestones
- Commercial invoices
- Packing lists
- HS tariff classification assistance
- Country-of-origin information
- Required permits and certificates
- Estimated customs duties and taxes
- Restricted and prohibited goods screening
- Sanctions and trade compliance screening
- Insurance options
- Cargo damage and loss claims
- Shipment exception management
- Import/export document storage
- Multi-currency quotations
- Currency conversion disclosures
- Cross-border payment integration
- International returns
- Delivery confirmation
- Trade analytics
- Country-specific service availability
- Partner performance monitoring

Never represent estimated customs charges as guaranteed amounts.

Use verified carrier rates and applicable customs rules where integrations exist. Otherwise clearly label estimates and require confirmation.

### INTERNATIONAL TRADE MASTER LOCK

International Trade MUST be locked by default.

Only the authenticated **Primary Super Admin** can activate, deactivate, unlock, or relock this module.

No other role can perform these actions, including other Super Admins.

Implement:

- Backend-enforced authorization
- Primary Super Admin identity verification
- Fresh authentication for sensitive actions
- Multi-factor authentication
- Immutable or tamper-evident audit records
- Activation timestamps
- Administrator action history
- Permission validation on every protected endpoint
- Feature flags
- Country-specific activation controls
- Safe relocking behavior

When locked:

- Block new international trade bookings.
- Block new international shipment payments.
- Prevent operational use of the three specialized international roles.
- Keep historical records available to appropriately authorized staff.
- Allow controlled handling of shipments already in progress.
- Do not delete shipment information.

Activation must not automatically assign administrative privileges.

## PHASE 3 — INTERNATIONAL ADMINISTRATION

Add three specialized administrative roles.

### Global Shipping Admin

Responsible for:

- Global carrier monitoring
- International shipment supervision
- Freight scheduling oversight
- Delivery exceptions
- Cross-border tracking
- Shipping partner performance
- Escalations and investigations

### International Trade Admin

Responsible for:

- Import/export compliance monitoring
- Trade documentation
- Country-specific requirements
- Customs issues
- Restricted goods investigations
- International transaction oversight
- Trade partner compliance

### Warehouse Admin

Responsible for:

- Warehouse verification
- Warehouse approval recommendations
- Global warehouse performance
- Inventory discrepancies
- Storage and handling compliance
- Warehouse-related investigations
- Partner operational monitoring
- Audit reporting

These roles become assignable only after the Primary Super Admin activates International Trade.

Preserve every previously implemented DEN administrator role. Do not assume a fixed role count without checking the existing system.

## PHASE 4 — DEN GLOBAL WAREHOUSE NETWORK

Build a worldwide warehouse registration and management platform.

DEN must support:

1. Independent third-party warehouse owners.
2. Warehouse companies with multiple facilities.
3. Warehouses operating in different countries.
4. DEN-owned warehouses in the future.
5. Partner warehouse employee accounts.
6. Facility-specific access permissions.

DEN does not need to own physical warehouses at launch.

However, its architecture must support DEN-owned facilities without requiring a major redesign.

### Warehouse Registration

Allow owners to submit:

- Business identity
- Owner identity
- Country and registered address
- Warehouse location
- Verification documents
- Facility photographs
- Storage capacity
- Supported goods categories
- Handling equipment
- Operating hours
- Available services
- Pricing information
- Insurance information
- Applicable licenses
- Safety and security information

Registration does not guarantee approval.

DEN must verify facilities before activating them for live shipments.

### Warehouse Owner Dashboard

Provide:

- Multiple warehouse management
- Facility profiles
- Employee invitations
- Staff permission management
- Incoming shipment monitoring
- Inventory management
- Storage location management
- Outgoing shipment monitoring
- Handling records
- Storage charges
- Earnings and commissions
- Operational analytics
- Customer service requests
- Incident reports
- Warehouse performance

### Warehouse Employee Roles

Warehouse owners can assign:

**Warehouse Manager:** Supervises facility operations and staff.

**Receiving Officer:** Registers arriving goods and checks their condition.

**Inventory Officer:** Manages storage locations and stock records.

**Packing Officer:** Handles packing, repacking, and shipment consolidation.

**Dispatch Officer:** Authorizes and records outgoing goods and carrier handoffs.

**Warehouse Auditor:** Reviews discrepancies and inventory records.

A warehouse owner may assign multiple permitted roles to an employee.

All permissions must be limited to authorized facilities.

Warehouse employees cannot grant themselves DEN administrative privileges.

### Warehouse Operations

Implement:

- QR and barcode scanning
- Unique package identification
- Goods receiving
- Weight and dimension capture
- Condition reports
- Photographic evidence
- Storage allocation
- Inventory movement
- Package consolidation
- Picking and packing
- Dispatch preparation
- Carrier handoff
- Damage and loss reporting
- Returns processing
- Storage fee calculation
- Audit trails
- Offline scanning and synchronization
- Real-time warehouse dashboards

Maintain package custody records showing who handled an item, where, and when.

## PHASE 5 — WAREHOUSE COMMISSION POLICY

Every newly approved warehouse business receives its first 30 days without DEN platform commission.

The free period begins when the verified warehouse business is first approved and activated.

The free period belongs to the verified business, not each newly added facility or employee.

From day 31, the approved commission schedule applies to eligible new transactions.

The commission rate is NOT FINAL.

Build a configurable pricing engine rather than hardcoding percentages.

Include:

- Commission-free period tracking
- Commission calculations
- Country-specific rules
- Currency support
- Commission statements
- Invoice generation
- Due dates
- Payment records
- Authorized collection methods
- Dispute handling
- Refund adjustments
- Finance Admin monitoring
- Audit trails
- Duplicate business verification

Preserve any existing authorized manual or automatic collection workflows.

Do not activate automatic deductions without the required payment authorization and final business approval.

## PHASE 6 — PRICING AND COMPETITOR INTELLIGENCE

Build DEN to compete on transparent pricing, service quality, and sustainable provider economics.

Research relevant competitors including:

- Bolt
- Uber
- inDrive
- Jumia
- Glovo
- GIG Logistics
- Kwik
- DHL
- FedEx
- UPS
- Amazon
- Shopify
- Etsy
- ShipBob
- Easyship
- Relevant Nigerian logistics providers
- Regional African commerce and delivery platforms
- International freight marketplaces
- Warehouse fulfillment networks

Where research tools are available, collect official current pricing, commission structures, subscription costs, service fees, and documented limitations.

Record the source, country, service category, publication date, and verification status.

Do not invent competitor prices.

### Provisional DEN Pricing Hypotheses

Use the following only as editable research assumptions:

- Consumer registration: Free
- Solo seller commission: 5%
- Team seller commission: 7%
- Enterprise seller commission: Negotiated
- Rider commission: 8%
- Warehouse commission: 0% for the first 30 days, then proposed 5%
- Transport provider commission: Proposed 8%
- International shipping partner commission: Proposed 3–5%

These figures are NOT approved production rates.

Do not overwrite existing DEN pricing policies with these assumptions.

Do not activate billing based on provisional rates.

### Pricing Engine Requirements

Support:

- Country-based pricing
- Service-specific pricing
- Distance-based pricing
- Vehicle-based pricing
- Weight and dimension calculations
- Delivery urgency
- Warehouse handling fees
- Storage fees
- Currency-specific charges
- Provider commissions
- Payment processing costs
- Taxes
- Refunds
- Promotional discounts
- Volume-based negotiated rates
- Pricing history
- Effective dates
- Admin approval workflows
- Profitability simulations

Provide a pricing research dashboard where authorized administrators can compare proposed prices, competitor benchmarks, provider earnings, payment costs, and DEN's estimated contribution margins.

Final rates require explicit business approval.

## PHASE 7 — TWELVE SIGNATURE DEN UPGRADES

Implement the following additional systems without removing existing functionality.

### 1. DEN OneTrack

Create a unified tracking experience covering marketplace orders, riders, domestic deliveries, warehouse custody, freight carriers, customs, and final delivery.

Use a normalized shipment-event timeline.

Customers must only see information they are authorized to access.

### 2. DEN SmartMatch

Create an intelligent matching system for riders, transport providers, warehouses, and freight partners.

Evaluate availability, distance, cost, capacity, service compatibility, delivery estimates, and performance.

Start with explainable rules before adding advanced machine learning.

### 3. DEN PriceGuard

Create a transparent quote comparison engine.

Display:

- Base service price
- Delivery charges
- Applicable fees
- Estimated taxes and duties
- Available service alternatives
- Expected delivery window
- Total estimated customer payment

Never advertise a guaranteed lowest price unless it is verifiably supported.

### 4. DEN TrustPass

Create reusable verification profiles for eligible sellers, riders, carriers, warehouses, and businesses.

Support verification status, document expiration, compliance reviews, and role-specific eligibility.

Protect sensitive documents and personal information.

### 5. DEN SafeHandoff

Use secure QR codes or one-time codes to verify custody transfers.

Record timestamps, authorized staff, location where appropriate, and optional evidence.

Prevent code reuse and unauthorized package release.

### 6. DEN TradePilot

Provide guided international shipment preparation.

Include destination requirements, document checklists, shipping restrictions, customs milestones, and appropriately qualified duty estimates.

Keep this feature unavailable while International Trade is locked.

### 7. DEN RouteBrain

Build delivery route planning and multi-stop optimization.

Consider distance, vehicle capacity, delivery windows, service restrictions, and traffic information where available.

Provide manual override for authorized dispatchers.

### 8. DEN PartnerScore

Create transparent service-quality indicators for riders, sellers, carriers, and warehouses.

Use verified completion data, timeliness, disputes, and safety outcomes.

Provide appeal and correction mechanisms.

### 9. DEN Business Hub

Provide organizations with a unified workspace for:

- Products
- Orders
- Deliveries
- Inventory
- Employees
- Invoices
- Customers
- Analytics
- Financial reports
- Warehouse integrations

### 10. DEN RescueFlow

Create an incident and exception management system.

Support delayed shipments, missing goods, damaged packages, failed deliveries, customs holds, refunds, claims, and escalation workflows.

### 11. DEN OfflineScan

Allow authorized riders and warehouse staff to record essential operational events when internet access is unavailable.

Queue events locally, synchronize safely, detect conflicts, prevent duplicate events, and preserve audit history.

Never falsely display an offline event as successfully synchronized.

### 12. DEN Expansion Control

Build a country-specific rollout system.

Support:

- Country activation
- Local currencies
- Supported services
- Regional administrators
- Partner eligibility
- Regulatory readiness
- Shipping route availability
- Payment method availability
- Regional feature flags

International Trade remains subject to the Primary Super Admin master lock.

## PHASE 8 — DEN UNIQUE SELLING PROPOSITION

DEN's central product promise is:

**ONE NETWORK. EVERY JOURNEY.**

Create a connected customer experience that combines buying, selling, delivery booking, transport, storage, international shipping, tracking, and package confirmation.

A shipment must retain a consistent identity throughout its journey, even when different authorized partners handle it.

DEN should differentiate through:

- Transparent pricing
- Unified tracking
- Secure custody records
- Verified partners
- Convenient booking
- Integrated commerce and logistics
- Cross-border expansion
- Reliable dispute handling
- Accessible interfaces
- Competitive but sustainable commissions

Avoid unsupported claims of being the world's cheapest or largest platform.

## PHASE 9 — CLOUDFLARE ARCHITECTURE

Cloudflare is the preferred initial hosting platform.

Design the real application to operate within Cloudflare's free-tier limits where practical, while allowing migration to paid capacity when required.

Evaluate:

- Cloudflare Workers for APIs
- Cloudflare D1 for suitable relational workloads
- Cloudflare R2 for permitted file and media storage
- Cloudflare Pages or Workers static assets for frontend delivery
- Cloudflare Access and Turnstile where appropriate
- Cloudflare Queues, Durable Objects, and other services when justified and available within the selected plan
- WebSockets or lightweight polling for real-time features
- External mapping services where needed

Do not assume every Cloudflare product is free or available without limits.

### Real-Time Tracking

Implement:

- Authenticated GPS updates
- Configurable update intervals
- Delivery-scoped access permissions
- Latest-location retrieval
- Customer map updates
- Location history retention policies
- Rate limiting
- Connection recovery
- Battery-conscious behavior
- Background-location permission handling
- Delivery completion cleanup

Avoid permanently writing every GPS coordinate to the relational database.

Evaluate the actual request volume and cost before choosing polling, WebSockets, or another transport.

### Database Design

Use suitable relational entities for:

- Users
- Organizations
- Roles
- Permissions
- Products
- Orders
- Payments
- Commissions
- Deliveries
- Riders
- Vehicles
- Carriers
- Shipments
- Shipment events
- Warehouses
- Warehouse businesses
- Warehouse facilities
- Warehouse employees
- Inventory
- Storage locations
- Customs documents
- Countries
- Pricing rules
- Feature flags
- Disputes
- Notifications
- Audit logs

Enforce tenant and facility isolation at the backend.

Use idempotency controls for financial operations and shipment events.

## PHASE 10 — SECURITY AND COMPLIANCE

Implement:

- Secure authentication
- Multi-factor authentication for privileged accounts
- Role-based access control
- Tenant isolation
- Backend authorization
- Secure sessions
- API rate limiting
- Input validation
- Encrypted transport
- Secure secret management
- Sensitive data protection
- File upload validation
- Audit logging
- Fraud monitoring
- Payment webhook verification
- Idempotent payment processing
- Backup and recovery
- Data retention controls
- Privacy and consent controls
- Country-specific regulatory readiness

Research applicable legal requirements before activating regulated payment, customs, freight, or cross-border services.

Never assume DEN can act as a bank, licensed customs broker, insurer, or freight operator without the required arrangements.

## PHASE 11 — ADMINISTRATIVE SYSTEM

Preserve the existing DEN administration hierarchy.

Add the three international roles without deleting existing roles.

Create:

- Admin Registry
- Role assignment workflows
- Permission matrix
- Feature activation dashboard
- Finance monitoring
- Warehouse oversight
- Global shipment monitoring
- Trade compliance monitoring
- Partner verification
- Dispute investigation
- Fraud alerts
- System health dashboard
- Audit history
- Country expansion controls
- Pricing research dashboard

Only the Primary Super Admin can activate or deactivate International Trade.

Authorized lower-level administrators may manage assigned operations only within their permissions.

## PHASE 12 — REPOSITORY ORGANIZATION

Inspect existing repository names before creating anything.

Preserve the existing DEN project structure.

Where these repositories already exist, extend them:

- `den-admin`
- `den-backend`
- Existing consumer application repository
- Existing rider application repository
- Existing seller or organization repositories
- Existing transport or logistics repositories

Add `den-warehouse` for the warehouse owner and employee experience if it does not already exist.

Use shared packages or API contracts where appropriate.

Do not create unnecessary duplicate repositories.

Do not migrate working code merely for organizational preference.

## PHASE 13 — DESIGN AND USER EXPERIENCE

Create a premium, modern, professional interface across all DEN applications.

Requirements:

- Responsive mobile-first layouts
- Accessible navigation
- Consistent design tokens
- Reusable components
- Clear loading states
- Empty states
- Error states
- Secure forms
- Modern dashboards
- Interactive maps
- Real-time status indicators
- Clear financial breakdowns
- Search and filtering
- Light and dark themes where appropriate
- Multilingual and internationalization readiness

Preserve existing branding and design decisions unless the project owner approves changes.

Prioritize fast performance on budget Android devices and slower networks.

## PHASE 14 — TESTING AND QUALITY ASSURANCE

Create automated tests for:

- Authentication
- Role permissions
- Primary Super Admin-only unlock
- International Trade lock enforcement
- Warehouse registration
- Employee permission isolation
- Shipment creation
- Tracking events
- Secure handoffs
- Commission-free period calculations
- Commission calculations
- Pricing configuration
- Payment webhook handling
- Refund processing
- Offline synchronization
- Country activation
- Dispute handling
- API security

Include integration tests and end-to-end tests for the most important user journeys.

Perform performance and load testing with realistic assumptions.

## PHASE 15 — DEPLOYMENT AND LAUNCH

Deploy the actual DEN application to Cloudflare only after appropriate validation and authorization.

Separate development, staging, and production environments.

Use safe configuration management.

Do not expose real customer information in the demonstration environment.

Build CI/CD pipelines with automated tests and deployment checks.

Prepare:

- Environment configuration
- Database migrations
- Deployment scripts
- Monitoring
- Error reporting
- Backup procedures
- Rollback instructions
- Security checks
- Infrastructure cost estimates
- Capacity upgrade recommendations

The initial deployment must demonstrate real working functionality, not fabricated production activity.

## PHASE 16 — IMPLEMENTATION ORDER

Follow this sequence:

1. Audit the existing repositories and functionality.
2. Produce the gap analysis.
3. Preserve and validate existing systems.
4. Implement shared permissions and feature flags.
5. Add the International Trade master lock.
6. Add the three specialized administrative roles.
7. Implement warehouse business registration.
8. Implement warehouse owner and staff management.
9. Implement warehouse inventory and custody tracking.
10. Implement the configurable pricing engine.
11. Implement the 30-day warehouse commission-free policy.
12. Implement unified shipment tracking.
13. Implement international shipping workflows behind the lock.
14. Add the twelve signature DEN upgrades incrementally.
15. Integrate monitoring and analytics.
16. Complete security, testing, and performance work.
17. Prepare the Cloudflare demonstration deployment.
18. Verify all existing functionality remains intact.
19. Produce a final implementation report.

Do not attempt risky simultaneous rewrites across all repositories.

Use small, reviewable, testable implementation stages.

## REQUIRED DELIVERABLES

Provide:

1. Existing project audit.
2. Complete feature inventory.
3. Missing feature and dependency analysis.
4. Updated system architecture.
5. Database schema and migration plan.
6. Role and permission matrix.
7. International Trade security specification.
8. Warehouse registration and operations specification.
9. Configurable pricing engine.
10. Competitor research and pricing assumptions.
11. Implementation of the twelve new features.
12. Cloudflare deployment architecture.
13. Security and testing reports.
14. Documentation for each application.
15. Deployment and rollback instructions.
16. A list of implemented, partially implemented, blocked, and pending features.

For each completed stage, explain what changed, which files changed, which tests passed, and what remains.

## FINAL EXECUTION INSTRUCTION

Begin by inspecting the existing DEN project.

Do not start by deleting files, rebuilding applications, or replacing working architecture.

First identify what already exists, then extend it safely.

Build DEN as a connected global commerce and logistics ecosystem with strong security, transparent pricing, scalable infrastructure, and independently operated partner networks.

**PRESERVE EVERYTHING ALREADY BUILT. ADD THE NEW CAPABILITIES. VERIFY EVERY CHANGE.**

**DEN — ONE NETWORK. EVERY JOURNEY.**