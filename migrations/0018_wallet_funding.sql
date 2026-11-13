CREATE TABLE den_wallet_funding(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),request_key TEXT NOT NULL,
 tx_ref TEXT NOT NULL UNIQUE,amount_minor BIGINT NOT NULL CHECK(amount_minor BETWEEN 10000 AND 10000000),
 currency TEXT NOT NULL CHECK(currency='NGN'),customer_email TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','credited')),
 checkout_url TEXT NOT NULL DEFAULT '',provider_transaction_id TEXT UNIQUE,
 created_at BIGINT NOT NULL,credited_at BIGINT,UNIQUE(user_id,request_key)
);
CREATE INDEX den_wallet_funding_user ON den_wallet_funding(user_id,created_at);
