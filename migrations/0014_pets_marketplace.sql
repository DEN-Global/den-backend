CREATE TABLE den_pet_profiles (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES den_users(id),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 species TEXT NOT NULL CHECK(species IN ('dog','cat','bird','fish','small_animal','reptile','other')),
 breed TEXT NOT NULL DEFAULT '' CHECK(length(breed)<=100),
 age_months INTEGER CHECK(age_months IS NULL OR age_months BETWEEN 0 AND 600),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
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
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 reviewed_by TEXT REFERENCES den_users(id),
 reviewed_at INTEGER,
 review_reason TEXT NOT NULL DEFAULT '' CHECK(length(review_reason)<=1000)
);
CREATE INDEX den_pet_services_discovery ON den_pet_services(status,category,updated_at);
CREATE INDEX den_pet_services_organization ON den_pet_services(organization_id,status);
