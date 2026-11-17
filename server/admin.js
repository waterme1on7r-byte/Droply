'use strict';
// Admin credentials stay on the administrator's machine/server, never in app builds.
(async()=>{
 const [command,code]=process.argv.slice(2),root=new URL(process.env.DROPLY_ADMIN_URL||''),token=process.env.DROPLY_ADMIN_TOKEN||'';
 if(root.protocol!=='https:'&&!(root.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(root.hostname)))throw Error('HTTPS is required');
 if(token.length<32)throw Error('Set DROPLY_ADMIN_TOKEN in this shell');
 if(!['invite','revoke','devices'].includes(command))throw Error('Usage: node admin.js invite DRP-XXXX-XXXX-XXXX | revoke CODE | devices');
 const route=command==='invite'?'invites':command==='revoke'?'revoke':'devices';
 const response=await fetch(new URL('/admin/'+route,root),{method:command==='devices'?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:command==='devices'?undefined:JSON.stringify({code,replace:process.argv.includes('--replace')}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Administrator request failed');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
