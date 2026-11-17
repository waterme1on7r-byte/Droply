const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path');
const {createStore}=require('../auth-store'),{createServer}=require('../server');
test('automatic registration is idempotent and cannot replace or revive an identity',()=>{
 const store=createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'droply-auto-')),'state.json')),id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
 assert.deepEqual(store.register(id,token),{id});assert.deepEqual(store.register(id,token),{id});assert.equal(store.register(id,crypto.randomBytes(32).toString('base64url')),null);assert.equal(store.authenticate(token),id);
 store.revoke(require('../auth-store').codeFor(id));assert.equal(store.register(id,token),null);
});
test('a new device can register over HTTP without an invitation or administrator token',async t=>{
 const instance=createServer({env:{AUTH_STORE_FILE:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'droply-http-')),'state.json')}});
 await new Promise(r=>instance.server.listen(0,'127.0.0.1',r));t.after(()=>instance.close());const root='http://127.0.0.1:'+instance.server.address().port;
 const payload={id:crypto.randomUUID(),token:crypto.randomBytes(32).toString('base64url')};
 const send=()=>fetch(root+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 assert.equal((await send()).status,200);assert.equal((await send()).status,200);assert.equal(instance.store.authenticate(payload.token),payload.id);
});

