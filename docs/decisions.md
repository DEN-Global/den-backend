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
