import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
mkdirSync('.build',{recursive:true});
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',platform:'neutral',external:['node:crypto','node:util'],outfile:'.build/worker.mjs',target:'es2022',minify:true});
console.log('Worker API bundle built at .build/worker.mjs');
