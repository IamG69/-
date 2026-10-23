import {build} from 'esbuild';
import {cpSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';

rmSync('docs',{recursive:true,force:true});
mkdirSync('docs/static',{recursive:true});

let html=readFileSync('worker/index.html','utf8')
  .replace('href="/static/style.css"','href="./static/style.css"')
  .replace('<script defer src="/static/api.js"></script>','<script defer src="./static/local-api.js"></script>')
  .replace('src="/static/app.js"','src="./static/app.js"');
writeFileSync('docs/index.html',html);
cpSync('worker/style.css','docs/static/style.css');
cpSync('worker/app.js','docs/static/app.js');
cpSync('worker/schema.json','docs/schema.json');
cpSync('worker/seed.json','docs/seed.json');
writeFileSync('docs/.nojekyll','');

await build({entryPoints:['worker/local-api.js'],outfile:'docs/static/local-api.js',bundle:true,format:'iife',platform:'browser',target:['safari15','chrome90'],minify:true});
console.log('Built static GitHub Pages app in docs/');
