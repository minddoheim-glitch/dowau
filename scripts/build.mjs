import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { issues } from '../data/newsletter-issues.mjs';
// Never publish server sources, SQL, operation records, or secrets as static files.
await rm('dist',{recursive:true,force:true});
await mkdir('dist/data',{recursive:true});
for(const path of ['index.html','css','js','image','favicon.ico','robots.txt','sitemap.xml','llms.txt']) {
 try { await cp(path,`dist/${path}`,{recursive:true}); } catch(e) { if(e.code!=='ENOENT') throw e; }
}
const published=issues.filter(i=>i.kind==='column' && i.approved===true && i.published===true);
await writeFile('dist/data/newsletter.json',JSON.stringify(published));
await writeFile('dist/_redirects','/class https://my-page-style-maker.lovable.app/free-lecture 302\n/class/ https://my-page-style-maker.lovable.app/free-lecture 302\n');
await writeFile('dist/_headers',`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; img-src 'self' data: https:; media-src 'self'; connect-src 'self' https://api.rss2json.com https://www.google-analytics.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
`);
console.log('Built homepage and approved newsletter archive. No mail sent.');
