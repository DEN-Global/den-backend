CREATE TABLE den_storefront_comments(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES den_organizations(id),product_id TEXT REFERENCES den_products(id),author_id TEXT NOT NULL REFERENCES den_users(id),body TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER);
CREATE INDEX den_storefront_comments_feed ON den_storefront_comments(created_at DESC);
