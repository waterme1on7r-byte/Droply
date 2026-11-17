'use strict';
const {Pool}=require('pg'),{createRegistry}=require('./auth-store');
function createPostgresStore(connectionString,{pool:provided}={}){
 let pool=provided;
 if(!pool){const url=new URL(connectionString);const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);for(const p of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(p);pool=new Pool({connectionString:url.href,ssl:local?false:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:30000,query_timeout:15000});}
 pool.on?.('error',()=>{});
 const ready=(async()=>{const client=await pool.connect();try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(74920261117)');
  await client.query('CREATE TABLE IF NOT EXISTS droply_auth_state (id integer PRIMARY KEY CHECK (id = 1), state jsonb NOT NULL)');
  await client.query("INSERT INTO droply_auth_state (id,state) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING",[JSON.stringify({version:1,devices:{},invites:{}})]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}})();
 async function run(method,args){await ready;const client=await pool.connect();try{
  await client.query('BEGIN');const result=await client.query('SELECT state FROM droply_auth_state WHERE id = 1 FOR UPDATE');if(result.rows.length!==1)throw Error('Authentication state missing; restore database');let next;
  const registry=createRegistry(result.rows[0].state,value=>{next=value;});const value=registry[method](...args);
  if(next)await client.query('UPDATE droply_auth_state SET state = $1::jsonb WHERE id = 1',[JSON.stringify(next)]);
  await client.query('COMMIT');return value;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}}
 const api={ready,close:()=>pool.end()};for(const method of ['register','invite','enroll','authenticate','registered','active','revoke','devices'])api[method]=(...args)=>run(method,args);return api;
}
module.exports={createPostgresStore};
