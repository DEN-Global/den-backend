CREATE TABLE den_admin_role_templates (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 level TEXT NOT NULL CHECK(level IN ('ordinary','lesser_super_admin')),
 permissions TEXT NOT NULL CHECK(json_valid(permissions)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
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
 locked INTEGER NOT NULL CHECK(locked IN(0,1)),
 revision INTEGER NOT NULL,
 changed_by TEXT NOT NULL REFERENCES den_users(id),
 changed_at INTEGER NOT NULL
);
