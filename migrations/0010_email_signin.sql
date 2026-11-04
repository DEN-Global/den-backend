CREATE TABLE den_email_signin_challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used_at INTEGER);
CREATE INDEX den_email_signin_user ON den_email_signin_challenges(user_id,expires_at);
