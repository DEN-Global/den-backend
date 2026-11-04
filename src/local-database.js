// Local development/test adapter only. Worker requests use the native D1 binding.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
export function openLocalDatabase(filename=':memory:') {
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec('CREATE TABLE IF NOT EXISTS den_schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)');
 const directory=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(directory).filter(x=>x.endsWith('.sql')).sort()) {
  const sql=readFileSync(new URL(name,directory),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
  const existing=sqlite.prepare('SELECT checksum FROM den_schema_migrations WHERE name=?').get(name);
  if(existing){if(existing.checksum!==checksum)throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${name}`);continue;}
  sqlite.exec('BEGIN IMMEDIATE');
  try {sqlite.exec(sql);sqlite.prepare('INSERT INTO den_schema_migrations VALUES(?,?)').run(name,checksum);sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}
 }
 function prepare(sql) {
  const stmt=sqlite.prepare(sql);let args=[];
  return {bind(...values){args=values;return this;},async first(){return stmt.get(...args)??null;},async all(){return {results:stmt.all(...args)};},async run(){const result=stmt.run(...args);return {success:true,meta:{changes:Number(result.changes)}};},_execute(){const result=stmt.run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};
 }
 return {sqlite,prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s._execute());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},close(){sqlite.close();}};
}
