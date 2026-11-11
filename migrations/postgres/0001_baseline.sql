-- DEN platform baseline for PostgreSQL (Supabase).
-- Equivalent to the SQLite/D1 migrations 0001-0016, with PostgreSQL types and triggers.
-- No user accounts, production rates or countries are activated.

CREATE TABLE den_users (
  id TEXT PRIMARY KEY NOT NULL,
  auth_subject TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL CHECK(created_at >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'))
);

CREATE TABLE den_roles (
  code TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('platform','facility')),
  requires_trade BIGINT NOT NULL DEFAULT 0 CHECK(requires_trade IN (0,1))
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
  singleton BIGINT PRIMARY KEY CHECK(singleton = 1),
  enabled BIGINT NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision >= 0),
  changed_at BIGINT,
  changed_by TEXT REFERENCES den_users(id)
);
INSERT INTO den_trade_state(singleton) VALUES(1);

CREATE TABLE den_countries (
  code TEXT PRIMARY KEY NOT NULL CHECK(length(code) = 2),
  currency TEXT NOT NULL CHECK(length(currency) = 3),
  active BIGINT NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  international_enabled BIGINT NOT NULL DEFAULT 0 CHECK(international_enabled IN (0,1))
);

CREATE TABLE den_warehouse_businesses (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES den_users(id),
  legal_name TEXT NOT NULL CHECK(length(trim(legal_name)) > 0),
  country TEXT NOT NULL REFERENCES den_countries(code),
  verification_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
  first_approved_at BIGINT CHECK(first_approved_at >= 0),
  created_at BIGINT NOT NULL CHECK(created_at >= 0),
  CHECK(status != 'approved' OR (verification_key IS NOT NULL AND length(verification_key) > 0 AND first_approved_at IS NOT NULL))
);

CREATE OR REPLACE FUNCTION den_raise_business_activation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.first_approved_at IS NOT NULL AND NEW.first_approved_at IS DISTINCT FROM OLD.first_approved_at THEN
    RAISE EXCEPTION 'FIRST_ACTIVATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_business_activation_immutable BEFORE UPDATE OF first_approved_at ON den_warehouse_businesses
FOR EACH ROW EXECUTE FUNCTION den_raise_business_activation_immutable();

CREATE OR REPLACE FUNCTION den_raise_verified_business_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.verification_key IS NOT NULL AND NEW.verification_key IS DISTINCT FROM OLD.verification_key THEN
    RAISE EXCEPTION 'VERIFIED_BUSINESS_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_verified_business_key_immutable BEFORE UPDATE OF verification_key ON den_warehouse_businesses
FOR EACH ROW EXECUTE FUNCTION den_raise_verified_business_immutable();

CREATE OR REPLACE FUNCTION den_raise_verified_business_retained() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.verification_key IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFIED_BUSINESS_RETAINED';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER den_verified_business_no_delete BEFORE DELETE ON den_warehouse_businesses
FOR EACH ROW EXECUTE FUNCTION den_raise_verified_business_retained();

CREATE TABLE den_warehouse_facilities (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES den_warehouse_businesses(id),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  country TEXT NOT NULL REFERENCES den_countries(code),
  address TEXT NOT NULL,
  capacity_kg BIGINT NOT NULL CHECK(capacity_kg >= 0),
  ownership TEXT NOT NULL DEFAULT 'partner' CHECK(ownership IN ('partner','den')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspended')),
  UNIQUE(id,business_id)
);

CREATE TABLE den_facility_memberships (
  user_id TEXT NOT NULL REFERENCES den_users(id),
  facility_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES den_roles(code),
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(user_id,facility_id,role),
  FOREIGN KEY(facility_id,business_id) REFERENCES den_warehouse_facilities(id,business_id)
);

CREATE OR REPLACE FUNCTION den_raise_membership_role_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM den_roles WHERE code=NEW.role AND scope='facility') THEN
    RAISE EXCEPTION 'FACILITY_ROLE_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_membership_role_scope BEFORE INSERT ON den_facility_memberships
FOR EACH ROW EXECUTE FUNCTION den_raise_membership_role_scope();
CREATE TRIGGER den_membership_update_role_scope BEFORE UPDATE OF role ON den_facility_memberships
FOR EACH ROW EXECUTE FUNCTION den_raise_membership_role_scope();

CREATE TABLE den_shipments (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL REFERENCES den_warehouse_businesses(id),
  customer_id TEXT NOT NULL REFERENCES den_users(id),
  origin_country TEXT NOT NULL REFERENCES den_countries(code),
  destination_country TEXT NOT NULL REFERENCES den_countries(code),
  international BIGINT NOT NULL CHECK(international IN (0,1)),
  status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','in_progress','delivered','cancelled')),
  created_at BIGINT NOT NULL,
  idempotency_key TEXT NOT NULL,
  UNIQUE(business_id,idempotency_key),
  UNIQUE(id,business_id),
  CHECK(international = 1 OR origin_country = destination_country)
);

CREATE OR REPLACE FUNCTION den_raise_shipment_international_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.international = 1 AND (
    NOT EXISTS(SELECT 1 FROM den_trade_state WHERE singleton=1 AND enabled=1)
    OR NOT EXISTS(SELECT 1 FROM den_countries WHERE code=NEW.origin_country AND active=1 AND international_enabled=1)
    OR NOT EXISTS(SELECT 1 FROM den_countries WHERE code=NEW.destination_country AND active=1 AND international_enabled=1)
  ) THEN
    RAISE EXCEPTION 'TRADE_OR_COUNTRY_LOCKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_shipment_international_lock BEFORE INSERT ON den_shipments
FOR EACH ROW EXECUTE FUNCTION den_raise_shipment_international_lock();

CREATE OR REPLACE FUNCTION den_raise_shipment_route_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.international IS DISTINCT FROM OLD.international
     OR NEW.origin_country IS DISTINCT FROM OLD.origin_country
     OR NEW.destination_country IS DISTINCT FROM OLD.destination_country THEN
    RAISE EXCEPTION 'SHIPMENT_ROUTE_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_shipment_route_immutable BEFORE UPDATE OF international,origin_country,destination_country ON den_shipments
FOR EACH ROW EXECUTE FUNCTION den_raise_shipment_route_immutable();

CREATE TABLE den_shipment_events (
  id TEXT PRIMARY KEY NOT NULL,
  shipment_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES den_users(id),
  facility_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at BIGINT NOT NULL,
  received_at BIGINT NOT NULL,
  idempotency_key TEXT NOT NULL,
  FOREIGN KEY(shipment_id,business_id) REFERENCES den_shipments(id,business_id),
  FOREIGN KEY(facility_id,business_id) REFERENCES den_warehouse_facilities(id,business_id),
  UNIQUE(shipment_id,idempotency_key)
);
CREATE INDEX den_events_timeline ON den_shipment_events(shipment_id,occurred_at,id);

CREATE OR REPLACE FUNCTION den_raise_custody_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CUSTODY_EVENTS_APPEND_ONLY';
END $$;
CREATE TRIGGER den_events_no_update BEFORE UPDATE ON den_shipment_events
FOR EACH ROW EXECUTE FUNCTION den_raise_custody_events_append_only();
CREATE TRIGGER den_events_no_delete BEFORE DELETE ON den_shipment_events
FOR EACH ROW EXECUTE FUNCTION den_raise_custody_events_append_only();

CREATE TABLE den_audit_events (
  sequence BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES den_users(id),
  action TEXT NOT NULL,
  occurred_at BIGINT NOT NULL,
  payload TEXT NOT NULL CHECK(pg_input_is_valid(payload,'json')),
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE
);

CREATE OR REPLACE FUNCTION den_raise_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_APPEND_ONLY';
END $$;
CREATE TRIGGER den_audit_no_update BEFORE UPDATE ON den_audit_events
FOR EACH ROW EXECUTE FUNCTION den_raise_audit_append_only();
CREATE TRIGGER den_audit_no_delete BEFORE DELETE ON den_audit_events
FOR EACH ROW EXECUTE FUNCTION den_raise_audit_append_only();

-- 0002_warehouse_api
CREATE TABLE den_credentials (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES den_users(id),
 email TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 totp_secret TEXT,
 totp_enabled BIGINT NOT NULL DEFAULT 0 CHECK(totp_enabled IN (0,1)),
 last_totp_counter BIGINT NOT NULL DEFAULT -1
);
CREATE TABLE den_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES den_users(id),
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 authenticated_at BIGINT NOT NULL,
 mfa_at BIGINT,
 csrf_token TEXT NOT NULL
);
CREATE INDEX den_session_user ON den_sessions(user_id);
CREATE TABLE den_admin_accounts (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES den_users(id),
 level TEXT NOT NULL CHECK(level IN ('primary_super_admin','lesser_super_admin','ordinary')),
 permissions TEXT NOT NULL DEFAULT '[]' CHECK(pg_input_is_valid(permissions,'json'))
);
CREATE TABLE den_rate_buckets (
 key TEXT PRIMARY KEY NOT NULL,
 count BIGINT NOT NULL,
 expires_at BIGINT NOT NULL
);
ALTER TABLE den_warehouse_businesses ADD COLUMN profile TEXT NOT NULL DEFAULT '{}' CHECK(pg_input_is_valid(profile,'json'));
ALTER TABLE den_warehouse_businesses ADD COLUMN submitted_at BIGINT;
ALTER TABLE den_warehouse_businesses ADD COLUMN reviewed_by TEXT REFERENCES den_users(id);
ALTER TABLE den_warehouse_businesses ADD COLUMN review_reason TEXT;
ALTER TABLE den_warehouse_facilities ADD COLUMN services TEXT NOT NULL DEFAULT '[]' CHECK(pg_input_is_valid(services,'json'));
CREATE TABLE den_staff_invitations (
 id TEXT PRIMARY KEY NOT NULL,
 business_id TEXT NOT NULL,
 facility_id TEXT NOT NULL,
 email TEXT NOT NULL,
 roles TEXT NOT NULL CHECK(pg_input_is_valid(roles,'json')),
 token_hash TEXT NOT NULL UNIQUE,
 invited_by TEXT NOT NULL REFERENCES den_users(id),
 created_at BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 accepted_by TEXT REFERENCES den_users(id),
 accepted_at BIGINT,
 revoked_at BIGINT,
 FOREIGN KEY(facility_id,business_id) REFERENCES den_warehouse_facilities(id,business_id)
);
CREATE INDEX den_invitation_business ON den_staff_invitations(business_id,created_at);
CREATE TABLE den_warehouse_records (
 id TEXT PRIMARY KEY NOT NULL,
 business_id TEXT NOT NULL,
 facility_id TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES den_users(id),
 operation TEXT NOT NULL CHECK(operation IN ('receive','inventory','pack','dispatch','audit')),
 package_reference TEXT NOT NULL,
 notes TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 idempotency_key TEXT NOT NULL,
 UNIQUE(facility_id,idempotency_key),
 FOREIGN KEY(facility_id,business_id) REFERENCES den_warehouse_facilities(id,business_id)
);

CREATE OR REPLACE FUNCTION den_raise_warehouse_record_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'WAREHOUSE_RECORD_APPEND_ONLY';
END $$;
CREATE TRIGGER den_warehouse_records_no_update BEFORE UPDATE ON den_warehouse_records
FOR EACH ROW EXECUTE FUNCTION den_raise_warehouse_record_append_only();
CREATE TRIGGER den_warehouse_records_no_delete BEFORE DELETE ON den_warehouse_records
FOR EACH ROW EXECUTE FUNCTION den_raise_warehouse_record_append_only();

-- Guard rows hold a boolean invariant evaluated inside the batch transaction.
CREATE TABLE den_transaction_guards (id TEXT PRIMARY KEY NOT NULL, valid BOOLEAN NOT NULL CHECK(valid));

CREATE OR REPLACE FUNCTION den_raise_totp_counter_monotonic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.totp_enabled=1 AND NEW.last_totp_counter <= OLD.last_totp_counter THEN
    RAISE EXCEPTION 'TOTP_REPLAY_REJECTED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_totp_counter_monotonic BEFORE UPDATE OF last_totp_counter ON den_credentials
FOR EACH ROW EXECUTE FUNCTION den_raise_totp_counter_monotonic();

INSERT INTO den_countries(code,currency) VALUES ('NG','NGN'),('GH','GHS'),('GB','GBP'),('US','USD'),('MA','MAD'),('KE','KES'),('FR','EUR'),('DE','EUR') ON CONFLICT(code) DO NOTHING;

-- 0003_platform
CREATE TABLE den_profiles(user_id TEXT PRIMARY KEY REFERENCES den_users(id),display_name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '');
CREATE TABLE den_addresses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),label TEXT NOT NULL,address TEXT NOT NULL,country TEXT NOT NULL REFERENCES den_countries(code));
CREATE TABLE den_organizations(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES den_users(id),name TEXT NOT NULL,country TEXT NOT NULL REFERENCES den_countries(code),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),created_at BIGINT NOT NULL);
CREATE TABLE den_riders(user_id TEXT PRIMARY KEY REFERENCES den_users(id),vehicle TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),created_at BIGINT NOT NULL);
CREATE TABLE den_products(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES den_organizations(id),name TEXT NOT NULL,price_minor BIGINT NOT NULL CHECK(price_minor>0),currency TEXT NOT NULL CHECK(length(currency)=3),stock BIGINT NOT NULL CHECK(stock>=0),active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
CREATE TABLE den_cart(user_id TEXT NOT NULL REFERENCES den_users(id),product_id TEXT NOT NULL REFERENCES den_products(id),quantity BIGINT NOT NULL CHECK(quantity BETWEEN 1 AND 100),PRIMARY KEY(user_id,product_id));
CREATE TABLE den_orders(id TEXT PRIMARY KEY,consumer_id TEXT NOT NULL REFERENCES den_users(id),organization_id TEXT NOT NULL REFERENCES den_organizations(id),rider_id TEXT REFERENCES den_users(id),address TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'placed' CHECK(state IN('placed','reserved','picked_up','delivered')),ready BIGINT NOT NULL DEFAULT 0,org_scanned BIGINT NOT NULL DEFAULT 0,handoff BIGINT NOT NULL DEFAULT 0,product_total BIGINT NOT NULL CHECK(product_total>0),currency TEXT NOT NULL,product_payment TEXT NOT NULL CHECK(product_payment='sandbox_digital_paid'),delivery_payment TEXT NOT NULL CHECK(delivery_payment IN('cash_due','cash_confirmed','sandbox_digital_due','sandbox_digital_paid')),cash_hash TEXT,delivery_hash TEXT NOT NULL,pickup_token TEXT NOT NULL,completion_token TEXT,qr_expires_at BIGINT,code_verified BIGINT NOT NULL DEFAULT 0,created_at BIGINT NOT NULL,delivered_at BIGINT);
CREATE TABLE den_order_lines(order_id TEXT NOT NULL REFERENCES den_orders(id),product_id TEXT NOT NULL REFERENCES den_products(id),name TEXT NOT NULL,quantity BIGINT NOT NULL,unit_price BIGINT NOT NULL,PRIMARY KEY(order_id,product_id));
CREATE TABLE den_order_secrets(order_id TEXT PRIMARY KEY REFERENCES den_orders(id),delivery_code TEXT NOT NULL,cash_code TEXT);
CREATE TABLE den_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),message TEXT NOT NULL,created_at BIGINT NOT NULL);
CREATE INDEX den_orders_consumer ON den_orders(consumer_id,created_at);
CREATE INDEX den_orders_rider ON den_orders(rider_id,state);
CREATE INDEX den_products_org ON den_products(organization_id);

CREATE OR REPLACE FUNCTION den_raise_no_manager_rider() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM den_organizations WHERE owner_id=NEW.user_id) THEN
    RAISE EXCEPTION 'MANAGER_RIDER_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_no_manager_rider BEFORE INSERT ON den_riders
FOR EACH ROW EXECUTE FUNCTION den_raise_no_manager_rider();

CREATE OR REPLACE FUNCTION den_raise_no_rider_manager() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM den_riders WHERE user_id=NEW.owner_id) THEN
    RAISE EXCEPTION 'MANAGER_RIDER_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_no_rider_manager BEFORE INSERT ON den_organizations
FOR EACH ROW EXECUTE FUNCTION den_raise_no_rider_manager();

-- 0004_mobility
CREATE TABLE den_transport_profiles (
 user_id TEXT PRIMARY KEY REFERENCES den_users(id),
 vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('motorcycle','car','bus','van','truck','boat')),
 registration_reference TEXT NOT NULL,
 country TEXT NOT NULL REFERENCES den_countries(code),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 created_at BIGINT NOT NULL
);
CREATE TABLE den_mobility_requests (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES den_users(id),
 kind TEXT NOT NULL CHECK(kind IN ('passenger','shipment')),
 origin_country TEXT NOT NULL REFERENCES den_countries(code),
 destination_country TEXT NOT NULL REFERENCES den_countries(code),
 pickup TEXT NOT NULL,
 destination TEXT NOT NULL,
 vehicle_type TEXT NOT NULL,
 weight_grams BIGINT CHECK(weight_grams IS NULL OR weight_grams>0),
 transport_mode TEXT NOT NULL CHECK(transport_mode IN ('road','air','sea')),
 status TEXT NOT NULL DEFAULT 'quote_requested' CHECK(status IN ('quote_requested','cancelled')),
 created_at BIGINT NOT NULL,
 idempotency_key TEXT NOT NULL,
 UNIQUE(user_id,idempotency_key)
);

CREATE OR REPLACE FUNCTION den_raise_mobility_domestic_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin_country <> NEW.destination_country THEN
    RAISE EXCEPTION 'INTERNATIONAL_PROVIDER_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_mobility_domestic_insert BEFORE INSERT ON den_mobility_requests
FOR EACH ROW EXECUTE FUNCTION den_raise_mobility_domestic_insert();

-- 0005_services
CREATE TABLE den_service_messages(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES den_orders(id),channel TEXT NOT NULL CHECK(channel IN('rider_consumer','manager_rider')),sender_id TEXT NOT NULL REFERENCES den_users(id),body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),created_at BIGINT NOT NULL);
CREATE INDEX den_service_messages_scope ON den_service_messages(order_id,channel,created_at);
CREATE TABLE den_service_locations(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES den_orders(id),rider_id TEXT NOT NULL REFERENCES den_users(id),latitude DOUBLE PRECISION NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude DOUBLE PRECISION NOT NULL CHECK(longitude BETWEEN -180 AND 180),accuracy_meters DOUBLE PRECISION NOT NULL CHECK(accuracy_meters BETWEEN 0 AND 10000),recorded_at BIGINT NOT NULL,received_at BIGINT NOT NULL,simulated BIGINT NOT NULL CHECK(simulated IN(0,1)),UNIQUE(order_id,recorded_at));
CREATE INDEX den_service_locations_scope ON den_service_locations(order_id,recorded_at);
CREATE TABLE den_service_wallet_entries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),currency TEXT NOT NULL CHECK(length(currency)=3),amount_minor BIGINT NOT NULL,reference TEXT NOT NULL,created_at BIGINT NOT NULL);
CREATE INDEX den_service_wallet_scope ON den_service_wallet_entries(user_id,currency,created_at);
ALTER TABLE den_notifications ADD COLUMN read_at BIGINT;

CREATE OR REPLACE FUNCTION den_raise_message_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MESSAGE_APPEND_ONLY';
END $$;
CREATE TRIGGER den_service_messages_immutable BEFORE UPDATE ON den_service_messages
FOR EACH ROW EXECUTE FUNCTION den_raise_message_append_only();

CREATE OR REPLACE FUNCTION den_raise_location_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LOCATION_APPEND_ONLY';
END $$;
CREATE TRIGGER den_service_locations_immutable BEFORE UPDATE ON den_service_locations
FOR EACH ROW EXECUTE FUNCTION den_raise_location_append_only();

CREATE OR REPLACE FUNCTION den_raise_wallet_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'WALLET_APPEND_ONLY';
END $$;
CREATE TRIGGER den_service_wallet_immutable BEFORE UPDATE ON den_service_wallet_entries
FOR EACH ROW EXECUTE FUNCTION den_raise_wallet_append_only();
CREATE TRIGGER den_service_wallet_no_delete BEFORE DELETE ON den_service_wallet_entries
FOR EACH ROW EXECUTE FUNCTION den_raise_wallet_append_only();

-- 0006_communities
CREATE TABLE den_communities(id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),country TEXT NOT NULL REFERENCES den_countries(code),creator_id TEXT NOT NULL REFERENCES den_users(id),created_at BIGINT NOT NULL);
CREATE TABLE den_community_memberships(community_id TEXT NOT NULL REFERENCES den_communities(id),user_id TEXT NOT NULL REFERENCES den_users(id),joined_at BIGINT NOT NULL,PRIMARY KEY(community_id,user_id));
CREATE INDEX den_memberships_user ON den_community_memberships(user_id);

CREATE OR REPLACE FUNCTION den_raise_rider_community_cap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM den_riders WHERE user_id=NEW.user_id)
     AND (SELECT COUNT(*) FROM den_community_memberships WHERE user_id=NEW.user_id)>=5 THEN
    RAISE EXCEPTION 'RIDER_COMMUNITY_LIMIT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_rider_community_cap BEFORE INSERT ON den_community_memberships
FOR EACH ROW EXECUTE FUNCTION den_raise_rider_community_cap();

CREATE OR REPLACE FUNCTION den_raise_rider_application_community_cap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM den_community_memberships WHERE user_id=NEW.user_id)>5 THEN
    RAISE EXCEPTION 'RIDER_COMMUNITY_LIMIT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER den_rider_application_community_cap BEFORE INSERT ON den_riders
FOR EACH ROW EXECUTE FUNCTION den_raise_rider_application_community_cap();

CREATE TABLE den_community_posts(id TEXT PRIMARY KEY,community_id TEXT NOT NULL REFERENCES den_communities(id),author_id TEXT NOT NULL REFERENCES den_users(id),body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),created_at BIGINT NOT NULL,deleted_at BIGINT);
CREATE INDEX den_posts_community ON den_community_posts(community_id,created_at);
CREATE TABLE den_community_comments(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES den_community_posts(id),author_id TEXT NOT NULL REFERENCES den_users(id),body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 1000),created_at BIGINT NOT NULL,deleted_at BIGINT);
CREATE TABLE den_organization_reviews(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES den_organizations(id),order_id TEXT NOT NULL UNIQUE REFERENCES den_orders(id),author_id TEXT NOT NULL REFERENCES den_users(id),rating BIGINT NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),created_at BIGINT NOT NULL,deleted_at BIGINT);
CREATE INDEX den_reviews_org ON den_organization_reviews(organization_id,created_at);

-- 0007_admin_console
CREATE TABLE den_admin_role_templates (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 level TEXT NOT NULL CHECK(level IN ('ordinary','lesser_super_admin')),
 permissions TEXT NOT NULL CHECK(pg_input_is_valid(permissions,'json')),
 revision BIGINT NOT NULL DEFAULT 1,
 updated_at BIGINT NOT NULL
);
INSERT INTO den_admin_role_templates VALUES
 ('sub-admin','Sub Admin','lesser_super_admin','[]',1,0),
 ('finance-admin','Finance Admin','ordinary','["finance_admin"]',1,0),
 ('verification-admin','Verification Admin','ordinary','["organization_verification_admin","rider_verification_admin","warehouse.review"]',1,0);
CREATE TABLE den_admin_role_assignments (
 user_id TEXT PRIMARY KEY REFERENCES den_admin_accounts(user_id),
 role_id TEXT NOT NULL REFERENCES den_admin_role_templates(id)
);
CREATE TABLE den_admin_page_locks (
 page TEXT PRIMARY KEY,
 locked BIGINT NOT NULL CHECK(locked IN(0,1)),
 revision BIGINT NOT NULL,
 changed_by TEXT NOT NULL REFERENCES den_users(id),
 changed_at BIGINT NOT NULL
);

-- 0008_workspace_access
CREATE TABLE den_workspace_choices (
 user_id TEXT PRIMARY KEY REFERENCES den_users(id),
 role TEXT NOT NULL CHECK(role IN ('manager','rider','dispatch','transport','shipment','warehouse')),
 selected_at BIGINT NOT NULL
);

CREATE OR REPLACE FUNCTION den_raise_workspace_choice_permanent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'WORKSPACE_CHOICE_PERMANENT';
END $$;
CREATE TRIGGER den_workspace_choice_immutable BEFORE UPDATE ON den_workspace_choices
FOR EACH ROW EXECUTE FUNCTION den_raise_workspace_choice_permanent();
CREATE TRIGGER den_workspace_choice_retained BEFORE DELETE ON den_workspace_choices
FOR EACH ROW EXECUTE FUNCTION den_raise_workspace_choice_permanent();

-- 0009_rider_vehicle_verification and 0009_storefront_identity
ALTER TABLE den_riders ADD COLUMN vehicle_plate TEXT NOT NULL DEFAULT '';
ALTER TABLE den_riders ADD COLUMN plate_photo TEXT NOT NULL DEFAULT '';
ALTER TABLE den_profiles ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN logo TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN about TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN license TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN support TEXT NOT NULL DEFAULT '';
ALTER TABLE den_products ADD COLUMN image TEXT NOT NULL DEFAULT '';
ALTER TABLE den_products ADD COLUMN description TEXT NOT NULL DEFAULT '';
CREATE TABLE den_notification_preferences(user_id TEXT PRIMARY KEY REFERENCES den_users(id),browser_alerts BIGINT NOT NULL DEFAULT 0 CHECK(browser_alerts IN(0,1)));

-- 0010_email_signin
CREATE TABLE den_email_signin_challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),code_hash TEXT NOT NULL,expires_at BIGINT NOT NULL,attempts BIGINT NOT NULL DEFAULT 0,used_at BIGINT);
CREATE INDEX den_email_signin_user ON den_email_signin_challenges(user_id,expires_at);

-- 0011_storefront_comments
CREATE TABLE den_storefront_comments(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES den_organizations(id),product_id TEXT REFERENCES den_products(id),author_id TEXT NOT NULL REFERENCES den_users(id),body TEXT NOT NULL,created_at BIGINT NOT NULL,deleted_at BIGINT);
CREATE INDEX den_storefront_comments_feed ON den_storefront_comments(created_at DESC);

-- 0012_transaction_alerts
CREATE OR REPLACE FUNCTION den_notify_service_wallet_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO den_notifications(id,user_id,message,created_at)
  VALUES(
    'wallet:'||NEW.id,
    NEW.user_id,
    'Wallet transaction recorded: '||NEW.currency||' '||to_char(NEW.amount_minor/100.0,'FM999999990.00')||' · '||NEW.reference,
    NEW.created_at
  );
  RETURN NEW;
END $$;
CREATE TRIGGER den_service_wallet_alert AFTER INSERT ON den_service_wallet_entries
FOR EACH ROW EXECUTE FUNCTION den_notify_service_wallet_entry();

-- 0013_activate_registered_stores
-- Registration no longer needs manual approval. Preserve explicit rejection/suspension decisions.
UPDATE den_organizations SET status='approved' WHERE status='pending';

-- 0014_pets_marketplace
CREATE TABLE den_pet_profiles (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES den_users(id),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 species TEXT NOT NULL CHECK(species IN ('dog','cat','bird','fish','small_animal','reptile','other')),
 breed TEXT NOT NULL DEFAULT '' CHECK(length(breed)<=100),
 age_months BIGINT CHECK(age_months IS NULL OR age_months BETWEEN 0 AND 600),
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL
);
CREATE INDEX den_pet_profiles_owner ON den_pet_profiles(owner_id,created_at);
CREATE TABLE den_pet_services (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES den_organizations(id),
 category TEXT NOT NULL CHECK(category IN ('grooming','walking','boarding','sitting','training','daycare')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 1200),
 area TEXT NOT NULL CHECK(length(trim(area)) BETWEEN 1 AND 100),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 reviewed_by TEXT REFERENCES den_users(id),
 reviewed_at BIGINT,
 review_reason TEXT NOT NULL DEFAULT '' CHECK(length(review_reason)<=1000)
);
CREATE INDEX den_pet_services_discovery ON den_pet_services(status,category,updated_at);
CREATE INDEX den_pet_services_organization ON den_pet_services(organization_id,status);

-- 0015_push_subscriptions
CREATE TABLE IF NOT EXISTS den_push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES den_users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL,
  subscription_encrypted TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(endpoint_hash)
);
CREATE INDEX IF NOT EXISTS den_push_subscriptions_user_idx ON den_push_subscriptions(user_id);

-- 0016_registration_email_verification
CREATE TABLE den_registration_email_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at BIGINT NOT NULL,attempts BIGINT NOT NULL DEFAULT 0,used_at BIGINT);
CREATE INDEX den_registration_email_challenges_email ON den_registration_email_challenges(email,expires_at);
