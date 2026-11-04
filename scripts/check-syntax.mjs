import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const name of readdirSync('src').filter(n=>n.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',`src/${name}`],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
