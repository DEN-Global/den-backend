-- Additive initial schema. No user accounts, production rates or countries are activated.
CREATE TABLE den_users (
  id TEXT PRIMARY KEY NOT NULL,
  auth_subject TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'))
);
CREATE TABLE den_roles (
  code TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('platform','facility')),
  requires_trade INTEGER NOT NULL DEFAULT 0 CHECK(requires_trade IN (0,1))
);
INSERT INTO den_roles(code,scope,requires_trade) VALUES
 ('finance_admin','platform',0), ('rider_verification_admin','platform',0),
 ('organization_verification_admin','platform',0), ('community_moderation_admin','platform',0),
 ('delivery_operations_admin','platform',0), ('shipping_admin','platform',0),
 ('support_admin','platform',0), ('security_audit_admin','platform',0),
 ('global_shipping_admin','platform',1), ('international_trade_admin','platform',1),
 ('warehouse_admin','platform',1),
 ('warehouse_manager','facility',0), ('receiving_officer','facility',0),
 ('inventory_officer','facility',0), ('packing_officer','facility',0),
 ('dispatch_officer','facility',0), ('warehouse_auditor','facility',0);
CREATE TABLE den_trade_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  changed_at INTEGER,
  changed_by TEXT REFERENCES den_users(id)
);
INSERT INTO den_trade_state(singleton) VALUES(1);
CREATE TABLE den_countries (
  code TEXT PRIMARY KEY NOT NULL CHECK(length(code) = 2),
  currency TEXT NOT NULL CHECK(length(currency) = 3),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  international_enabled INTEGER NOT NULL DEFAULT 0 CHECK(international_enabled IN (0,1))
);
CREATE TABLE den_warehouse_businesses (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES den_users(id),
  legal_name TEXT NOT NULL CHECK(length(trim(legal_name)) > 0),
  country TEXT NOT NULL REFERENCES den_countries(code),
  verification_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
  first_approved_at INTEGER CHECK(first_approved_at >= 0),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  CHECK(status != 'approved' OR (verification_key IS NOT NULL AND length(verification_key) > 0 AND first_approved_at IS NOT NULL))
);
-- verification_key is an opaque canonical business verification identifier, never raw identity data.
CREATE TRIGGER den_business_activation_immutable BEFORE UPDATE OF first_approved_at ON den_warehouse_businesses
WHEN OLD.first_approved_at IS NOT NULL AND NEW.first_approved_at IS NOT OLD.first_approved_at
BEGIN SELECT RAISE(ABORT,'FIRST_ACTIVATION_IMMUTABLE'); END;
CREATE TRIGGER den_verified_business_key_immutable BEFORE UPDATE OF verification_key ON den_warehouse_businesses
WHEN OLD.verification_key IS NOT NULL AND NEW.verification_key IS NOT OLD.verification_key
BEGIN SELECT RAISE(ABORT,'VERIFIED_BUSINESS_IMMUTABLE'); END;
CREATE TRIGGER den_verified_business_no_delete BEFORE DELETE ON den_warehouse_businesses
WHEN OLD.verification_key IS NOT NULL
BEGIN SELECT RAISE(ABORT,'VERIFIED_BUSINESS_RETAINED'); END;
CREATE TABLE den_warehouse_facilities (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES den_warehouse_businesses(id),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  country TEXT NOT NULL REFERENCES den_countries(code),
  address TEXT NOT NULL,
  capacity_kg INTEGER NOT NULL CHECK(capacity_kg >= 0),
  ownership TEXT NOT NULL DEFAULT 'partner' CHECK(ownership IN ('partner','den')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspended')),
  UNIQUE(id,business_id)
);
CREATE TABLE den_facility_memberships (
  user_id TEXT NOT NULL REFERENCES den_users(id),
  facility_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES den_roles(code),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(user_id,facility_id,role),
  FOREIGN KEY(facility_id,business_id) REFERENCES den_warehouse_facilities(id,business_id)
);
CREATE TRIGGER den_membership_role_scope BEFORE INSERT ON den_facility_memberships
WHEN NOT EXISTS(SELECT 1 FROM den_roles WHERE code=NEW.role AND scope='facility')
BEGIN SELECT RAISE(ABORT,'FACILITY_ROLE_REQUIRED'); END;
CREATE TRIGGER den_membership_update_role_scope BEFORE UPDATE OF role ON den_facility_memberships
WHEN NOT EXISTS(SELECT 1 FROM den_roles WHERE code=NEW.role AND scope='facility')
BEGIN SELECT RAISE(ABORT,'FACILITY_ROLE_REQUIRED'); END;
CREATE TABLE den_shipments (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES den_warehouse_businesses(id),
  customer_id TEXT NOT NULL REFERENCES den_users(id),
  origin_country TEXT NOT NULL REFERENCES den_countries(code),
  destination_country TEXT NOT NULL REFERENCES den_countries(code),
  international INTEGER NOT NULL CHECK(international IN (0,1)),
  status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','in_progress','delivered','cancelled')),
  created_at INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  UNIQUE(business_id,idempotency_key),
  UNIQUE(id,business_id),
  CHECK(international = 1 OR origin_country = destination_country)
);
CREATE TRIGGER den_shipment_international_lock BEFORE INSERT ON den_shipments
WHEN NEW.international = 1 AND (
 NOT EXISTS(SELECT 1 FROM den_trade_state WHERE singleton=1 AND enabled=1)
 OR NOT EXISTS(SELECT 1 FROM den_countries WHERE code=NEW.origin_country AND active=1 AND international_enabled=1)
 OR NOT EXISTS(SELECT 1 FROM den_countries WHERE code=NEW.destination_country AND active=1 AND international_enabled=1)
)
BEGIN SELECT RAISE(ABORT,'TRADE_OR_COUNTRY_LOCKED'); END;
CREATE TRIGGER den_shipment_route_immutable BEFORE UPDATE OF international,origin_country,destination_country ON den_shipments
WHEN NEW.international IS NOT OLD.international OR NEW.origin_country IS NOT OLD.origin_country OR NEW.destination_country IS NOT OLD.destination_country
BEGIN SELECT RAISE(ABORT,'SHIPMENT_ROUTE_IMMUTABLE'); END;
CREATE TABLE den_shipment_events (
  id TEXT PRIMARY KEY NOT NULL,
  shipment_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES den_users(id),
  facility_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  FOREIGN KEY(shipment_id,business_id) REFERENCES den_shipments(id,business_id),
  FOREIGN KEY(facility_id,business_id) REFERENCES den_warehouse_facilities(id,business_id),
  UNIQUE(shipment_id,idempotency_key)
);
CREATE INDEX den_events_timeline ON den_shipment_events(shipment_id,occurred_at,id);
CREATE TRIGGER den_events_no_update BEFORE UPDATE ON den_shipment_events
BEGIN SELECT RAISE(ABORT,'CUSTODY_EVENTS_APPEND_ONLY'); END;
CREATE TRIGGER den_events_no_delete BEFORE DELETE ON den_shipment_events
BEGIN SELECT RAISE(ABORT,'CUSTODY_EVENTS_APPEND_ONLY'); END;
CREATE TABLE den_audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL REFERENCES den_users(id),
  action TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE
);
CREATE TRIGGER den_audit_no_update BEFORE UPDATE ON den_audit_events
BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER den_audit_no_delete BEFORE DELETE ON den_audit_events
BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
