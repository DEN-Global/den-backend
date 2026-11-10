CREATE TABLE den_orbit_schedules(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),config_json TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX den_orbit_schedules_user_created ON den_orbit_schedules(user_id,created_at DESC);
CREATE TABLE den_orbit_swaps(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES den_users(id),schedule_id TEXT REFERENCES den_orbit_schedules(id),data_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX den_orbit_swaps_user_created ON den_orbit_swaps(user_id,created_at DESC);
