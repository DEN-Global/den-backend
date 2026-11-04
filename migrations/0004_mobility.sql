-- Domestic transport/shipment preparation; no provider booking or approved fare implied.
CREATE TABLE den_transport_profiles (
 user_id TEXT PRIMARY KEY REFERENCES den_users(id),
 vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('motorcycle','car','bus','van','truck','boat')),
 registration_reference TEXT NOT NULL,
 country TEXT NOT NULL REFERENCES den_countries(code),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 created_at INTEGER NOT NULL
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
 weight_grams INTEGER CHECK(weight_grams IS NULL OR weight_grams>0),
 transport_mode TEXT NOT NULL CHECK(transport_mode IN ('road','air','sea')),
 status TEXT NOT NULL DEFAULT 'quote_requested' CHECK(status IN ('quote_requested','cancelled')),
 created_at INTEGER NOT NULL,
 idempotency_key TEXT NOT NULL,
 UNIQUE(user_id,idempotency_key)
);
CREATE TRIGGER den_mobility_domestic_insert BEFORE INSERT ON den_mobility_requests
WHEN NEW.origin_country<>NEW.destination_country
BEGIN SELECT RAISE(ABORT,'INTERNATIONAL_PROVIDER_REQUIRED'); END;
