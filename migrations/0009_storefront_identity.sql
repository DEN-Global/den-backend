ALTER TABLE den_profiles ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN logo TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN about TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN license TEXT NOT NULL DEFAULT '';
ALTER TABLE den_organizations ADD COLUMN support TEXT NOT NULL DEFAULT '';
ALTER TABLE den_products ADD COLUMN image TEXT NOT NULL DEFAULT '';
ALTER TABLE den_products ADD COLUMN description TEXT NOT NULL DEFAULT '';
CREATE TABLE den_notification_preferences(user_id TEXT PRIMARY KEY REFERENCES den_users(id),browser_alerts INTEGER NOT NULL DEFAULT 0 CHECK(browser_alerts IN(0,1)));
