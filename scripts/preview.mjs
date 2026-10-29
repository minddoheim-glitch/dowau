import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4'};
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/newsletter/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({enabled:false,consentVersion:'2026-10-29-v1'}));return;}
 if(pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'미리보기에서는 신청 저장과 메일 발송을 하지 않습니다.'}));return;}
 try {
  const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)) throw Error();
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(5193,'127.0.0.1',()=>console.log('Newsletter preview: http://127.0.0.1:5193/#newsletter (mail disabled)'));
