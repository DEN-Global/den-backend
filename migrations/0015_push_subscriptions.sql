CREATE TABLE IF NOT EXISTS den_push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES den_users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL,
  subscription_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(endpoint_hash)
);
CREATE INDEX IF NOT EXISTS den_push_subscriptions_user_idx ON den_push_subscriptions(user_id);
