CREATE TABLE den_registration_email_challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used_at INTEGER);
CREATE INDEX den_registration_email_challenges_email ON den_registration_email_challenges(email,expires_at);
