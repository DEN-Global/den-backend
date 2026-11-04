CREATE TABLE den_credentials (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES den_users(id),
 email TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 totp_secret TEXT,
 totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(totp_enabled IN (0,1)),
 last_totp_counter INTEGER NOT NULL DEFAULT -1
);
CREATE TABLE den_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES den_users(id),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 authenticated_at INTEGER NOT NULL,
 mfa_at INTEGER,
 csrf_token TEXT NOT NULL
);
CREATE INDEX den_session_user ON den_sessions(user_id);
CREATE TABLE den_admin_accounts (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES den_users(id),
 level TEXT NOT NULL CHECK(level IN ('primary_super_admin','lesser_super_admin','ordinary')),
 permissions TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(permissions))
);
CREATE TABLE den_rate_buckets (
 key TEXT PRIMARY KEY NOT NULL,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
ALTER TABLE den_warehouse_businesses ADD COLUMN profile TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(profile));
ALTER TABLE den_warehouse_businesses ADD COLUMN submitted_at INTEGER;
ALTER TABLE den_warehouse_businesses ADD COLUMN reviewed_by TEXT REFERENCES den_users(id);
ALTER TABLE den_warehouse_businesses ADD COLUMN review_reason TEXT;
ALTER TABLE den_warehouse_facilities ADD COLUMN services TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(services));
CREATE TABLE den_staff_invitations (
 id TEXT PRIMARY KEY NOT NULL,
 business_id TEXT NOT NULL,
 facility_id TEXT NOT NULL,
 email TEXT NOT NULL,
 roles TEXT NOT NULL CHECK(json_valid(roles)),
 token_hash TEXT NOT NULL UNIQUE,
 invited_by TEXT NOT NULL REFERENCES den_users(id),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 accepted_by TEXT REFERENCES den_users(id),
 accepted_at INTEGER,
 revoked_at INTEGER,
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
 created_at INTEGER NOT NULL,
 idempotency_key TEXT NOT NULL,
 UNIQUE(facility_id,idempotency_key),
 FOREIGN KEY(facility_id,business_id) REFERENCES den_warehouse_facilities(id,business_id)
);
CREATE TRIGGER den_warehouse_records_no_update BEFORE UPDATE ON den_warehouse_records
BEGIN SELECT RAISE(ABORT,'WAREHOUSE_RECORD_APPEND_ONLY'); END;
CREATE TRIGGER den_warehouse_records_no_delete BEFORE DELETE ON den_warehouse_records
BEGIN SELECT RAISE(ABORT,'WAREHOUSE_RECORD_APPEND_ONLY'); END;
CREATE TABLE den_transaction_guards (id TEXT PRIMARY KEY NOT NULL, valid INTEGER NOT NULL CHECK(valid=1));
CREATE TRIGGER den_totp_counter_monotonic BEFORE UPDATE OF last_totp_counter ON den_credentials
WHEN OLD.totp_enabled=1 AND NEW.last_totp_counter <= OLD.last_totp_counter
BEGIN SELECT RAISE(ABORT,'TOTP_REPLAY_REJECTED'); END;
INSERT INTO den_countries(code,currency) VALUES ('NG','NGN'),('GH','GHS'),('GB','GBP'),('US','USD'),('MA','MAD'),('KE','KES'),('FR','EUR'),('DE','EUR') ON CONFLICT(code) DO NOTHING;
