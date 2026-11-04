import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../migrations/0001_foundation.sql',import.meta.url),'utf8');
function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');db.exec(sql);
  db.exec(`INSERT INTO den_users VALUES('u1','subject1',0,'active'),('u2','subject2',0,'active');
    INSERT INTO den_countries VALUES('NG','NGN',1,0),('GH','GHS',1,0);
    INSERT INTO den_warehouse_businesses(id,owner_id,legal_name,country,created_at) VALUES('b1','u1','Business 1','NG',0),('b2','u2','Business 2','NG',0);
    INSERT INTO den_warehouse_facilities(id,business_id,name,country,address,capacity_kg) VALUES('f1','b1','Facility 1','NG','Test address',100);`);
  return db;
}
function book(db,international=1,key='k1') {
  db.prepare('INSERT INTO den_shipments VALUES(?,?,?,?,?,?,?,?,?)').run('s1','b1','u1','NG',international?'GH':'NG',international,'booked',0,key);
}
test('migration defaults trade off and creates no active roles or pricing',t=>{
  const db=fixture(t);assert.equal(db.prepare('SELECT enabled FROM den_trade_state').get().enabled,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM den_roles').get().n,17);
});
test('business activation timestamp cannot be reset or replayed by deleting business',t=>{
  const db=fixture(t);db.exec("UPDATE den_warehouse_businesses SET status='approved', verification_key='verified-business',first_approved_at=1000 WHERE id='b1'");
  assert.throws(()=>db.exec("UPDATE den_warehouse_businesses SET first_approved_at=2000 WHERE id='b1'"),/FIRST_ACTIVATION_IMMUTABLE/);
  assert.throws(()=>db.exec("DELETE FROM den_warehouse_businesses WHERE id='b1'"),/VERIFIED_BUSINESS_RETAINED/);
  assert.throws(()=>db.exec("UPDATE den_warehouse_businesses SET verification_key='verified-business' WHERE id='b2'"),/UNIQUE/);
});
test('facility staff cannot be stored against another business or a platform role',t=>{
  const db=fixture(t);
  assert.throws(()=>db.exec("INSERT INTO den_facility_memberships VALUES('u2','f1','b2','receiving_officer',1)"),/FOREIGN KEY/);
  assert.throws(()=>db.exec("INSERT INTO den_facility_memberships VALUES('u1','f1','b1','finance_admin',1)"),/FACILITY_ROLE_REQUIRED/);
  db.exec("INSERT INTO den_facility_memberships VALUES('u1','f1','b1','receiving_officer',1),('u1','f1','b1','inventory_officer',1)");
  assert.equal(db.prepare('SELECT count(*) AS n FROM den_facility_memberships').get().n,2);
});
test('international bookings fail at database layer when master or either country is locked',t=>{
  const db=fixture(t);assert.throws(()=>book(db),/TRADE_OR_COUNTRY_LOCKED/);
  db.exec('UPDATE den_trade_state SET enabled=1');assert.throws(()=>book(db),/TRADE_OR_COUNTRY_LOCKED/);
  db.exec("UPDATE den_countries SET international_enabled=1 WHERE code='NG'");assert.throws(()=>book(db),/TRADE_OR_COUNTRY_LOCKED/);
  db.exec('UPDATE den_countries SET international_enabled=1');book(db);
  db.exec('UPDATE den_trade_state SET enabled=0');assert.equal(db.prepare('SELECT count(*) AS n FROM den_shipments').get().n,1);
  assert.throws(()=>db.exec("UPDATE den_shipments SET destination_country='NG'"),/SHIPMENT_ROUTE_IMMUTABLE/);
});
test('domestic booking is available while international trade is locked',t=>{book(fixture(t),0);});
test('custody events enforce tenant relationships, idempotency and append-only history',t=>{
  const db=fixture(t);book(db,0);
  const insert=db.prepare('INSERT INTO den_shipment_events VALUES(?,?,?,?,?,?,?,?,?)');
  assert.throws(()=>insert.run('e0','s1','b2','u1',null,'received',0,1,'offline-1'),/FOREIGN KEY/);
  insert.run('e1','s1','b1','u1','f1','received',0,1,'offline-1');
  assert.throws(()=>insert.run('e2','s1','b1','u1','f1','received',0,1,'offline-1'),/UNIQUE/);
  assert.throws(()=>db.exec("UPDATE den_shipment_events SET event_type='delivered'"),/APPEND_ONLY/);
  assert.throws(()=>db.exec('DELETE FROM den_shipment_events'),/APPEND_ONLY/);
});
test('audit rows cannot be updated or deleted through normal SQL',t=>{
  const db=fixture(t);db.exec("INSERT INTO den_audit_events(actor_id,action,occurred_at,payload,previous_hash,event_hash) VALUES('u1','test',0,'{}','genesis','test-hash')");
  assert.throws(()=>db.exec("UPDATE den_audit_events SET action='other'"),/AUDIT_APPEND_ONLY/);
  assert.throws(()=>db.exec('DELETE FROM den_audit_events'),/AUDIT_APPEND_ONLY/);
});
