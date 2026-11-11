import {test} from 'node:test';
import assert from 'node:assert/strict';
import {translateSql,numberPlaceholders} from '../src/postgres-database.js';

test('positional placeholders become numbered parameters',()=>{
 assert.equal(numberPlaceholders('SELECT * FROM t WHERE a=? AND b=?'),'SELECT * FROM t WHERE a=$1 AND b=$2');
 assert.equal(numberPlaceholders('INSERT INTO t(id) VALUES(?)'),'INSERT INTO t(id) VALUES($1)');
});

test('placeholder rewriting ignores quoted literals',()=>{
 assert.equal(numberPlaceholders("SELECT ?,'literal ?',? FROM t"),"SELECT $1,'literal ?',$2 FROM t");
 assert.equal(numberPlaceholders("SELECT 'it''s ?',? FROM t"),"SELECT 'it''s ?',$1 FROM t");
});

test('SQLite JSON helpers map to PostgreSQL equivalents',()=>{
 assert.equal(translateSql("SELECT json_extract(payload,'$.businessId') FROM den_audit_events"),"SELECT (payload::jsonb)->>'businessId' FROM den_audit_events");
 assert.equal(translateSql("SELECT group_concat(m.role) FROM den_facility_memberships m"),"SELECT string_agg(m.role,',') FROM den_facility_memberships m");
 assert.equal(
  translateSql("SELECT json_group_array(json_object('name',l.name,'quantity',l.quantity)) FROM den_order_lines l"),
  "SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity)) FROM den_order_lines l",
 );
});

test('null-safe IS comparisons use IS NOT DISTINCT FROM',()=>{
 assert.equal(translateSql('SELECT rider_id IS ? AND state=? FROM den_orders'),'SELECT rider_id IS NOT DISTINCT FROM $1 AND state=$2 FROM den_orders');
 assert.equal(translateSql('SELECT id FROM t WHERE a IS NULL AND b IS NOT NULL'),'SELECT id FROM t WHERE a IS NULL AND b IS NOT NULL');
});

test('statements without SQLite-only syntax are only renumbered',()=>{
 assert.equal(translateSql('UPDATE den_orders SET state=? WHERE id=? AND state=?'),'UPDATE den_orders SET state=$1 WHERE id=$2 AND state=$3');
 assert.equal(translateSql("INSERT INTO den_transaction_guards(id,valid) VALUES(?,(SELECT revision=? FROM den_trade_state WHERE singleton=1))"),
  'INSERT INTO den_transaction_guards(id,valid) VALUES($1,(SELECT revision=$2 FROM den_trade_state WHERE singleton=1))');
});
