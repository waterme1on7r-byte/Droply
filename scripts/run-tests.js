const fs=require('fs'),{spawnSync}=require('child_process');
const files=fs.readdirSync('test').filter(n=>n.endsWith('.test.js')).map(n=>'test/'+n);
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
process.exit(result.status??1);
