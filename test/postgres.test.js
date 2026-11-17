const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {createPostgresStore}=require('../postgres-store'),{codeFor}=require('../auth-store');
test('Postgres commits one-use invites atomically and persists across store instances',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const a=createPostgresStore(process.env.TEST_DATABASE_URL),b=createPostgresStore(process.env.TEST_DATABASE_URL);
 try{
  await Promise.all([a.ready,b.ready]);const id=crypto.randomUUID(),invite=await a.invite(codeFor(id));
  const results=await Promise.all([a.enroll(invite.invitation,id),b.enroll(invite.invitation,id)]);
  assert.equal(results.filter(Boolean).length,1);const enrolled=results.find(Boolean);
  assert.equal(await b.authenticate(enrolled.token),id);await assert.rejects(a.invite('invalid-code'));
  assert.equal(await b.authenticate(enrolled.token),id);await a.revoke(codeFor(id));assert.equal(await b.authenticate(enrolled.token),null);
 }finally{await Promise.all([a.close(),b.close()]);}
});
