import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from 'node:fs';
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,loader:{'.html':'text','.css':'text'},plugins:[{name:'raw-js',setup(b){b.onResolve({filter:/\?raw$/},args=>({path:new URL(args.path.slice(0,-4),'file://'+args.resolveDir+'/').pathname,namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},args=>({contents:readFileSync(args.path,'utf8'),loader:'text'}));}}]});
cpSync('.openai/hosting.json','dist/.openai/hosting.json');cpSync('drizzle','dist/drizzle',{recursive:true});
console.log('Built Worker with unchanged research fields and Excel download');

writeFileSync('dist/server/wrangler.json',JSON.stringify({name:'research-patient-cards',main:'index.js',compatibility_date:'2026-10-01',d1_databases:[{binding:'DB',database_name:'research-cards',database_id:'local-research-cards',migrations_dir:'../../drizzle'}]},null,2));
