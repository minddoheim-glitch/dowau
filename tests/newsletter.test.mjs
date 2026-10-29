import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle,hash} from '../newsletter/service.mjs';
const schema=readFileSync(new URL('../newsletter/schema.sql',import.meta.url),'utf8');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
 const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return sqlite.prepare(sql).run(...args);},async all(){return {results:sqlite.prepare(sql).all(...args)};}};},async first(){return sqlite.prepare(sql).get()||null;}};}};
 return {sqlite,env:{DB,NEWSLETTER_ENABLED:'true',PRIVACY_READY:'true',SITE_ORIGIN:'https://dowwalabs.com',RESEND_API_KEY:'test-not-a-real-key',MAIL_FROM:'test@example.com',SENDER_FOOTER:'Test sender — local tests only',RATE_LIMIT_SALT:'test-salt-only-'.repeat(4),UNSUBSCRIBE_SIGNING_KEY:'test-sign-only-'.repeat(4),NEWSLETTER_ADMIN_TOKEN:'test-admin-only-'.repeat(4)}};
}
function request(action,body,options={}){return new Request('https://dowwalabs.com/api/newsletter/'+action,{method:'POST',headers:{Origin:'https://dowwalabs.com','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...options.headers},body:JSON.stringify(body),...options});}
const form={email:'reader@example.com',consent:true,consentVersion:'2026-10-29-v1'};
const column={id:'test-column',title:'Test column',date:'2026-10-29',kind:'column',approved:true,published:true,paragraphs:['<safe> Test paragraph.']};
test('configuration fails closed by default',async()=>{const response=await handle(new Request('https://dowwalabs.com/api/newsletter/config'),{});assert.equal((await response.json()).enabled,false);assert.equal((await handle(request('subscribe',form),{})).status,503);});
test('subscription requires consent and same-site origin',async()=>{const {env,sqlite}=fixture();assert.equal((await handle(request('subscribe',{...form,consent:false}),env)).status,400);assert.equal((await handle(request('subscribe',form,{headers:{Origin:'https://attacker.example','Content-Type':'application/json'}}),env)).status,403);assert.equal(sqlite.prepare('select count(*) n from subscribers').get().n,0);});
test('confirmation mail, no stored raw tokens, double opt-in, and no duplicate sends',async t=>{
 const {env,sqlite}=fixture();let calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');calls.push(JSON.parse(options.body));return Response.json({id:'fake-local-only'});});
 assert.equal((await handle(request('subscribe',form),env)).status,202);assert.equal(calls.length,1);
 const row=sqlite.prepare('select * from subscribers').get();assert.equal(row.status,'pending');
 const link=calls[0].text.match(/https:\/\/\S+/)[0];const raw=new URL(link).searchParams.get('token');assert.notEqual(row.confirm_hash,raw);assert.equal(row.confirm_hash,await hash(raw));
 await handle(new Request(link),env);assert.equal(sqlite.prepare('select status from subscribers').get().status,'pending');
 await handle(new Request(link,{method:'POST'}),env);assert.equal(sqlite.prepare('select status from subscribers').get().status,'active');
 await handle(request('subscribe',form),env);assert.equal(calls.length,1);
 const expired=await handle(new Request(link,{method:'POST'}),env);assert.match(await expired.text(),/만료/);
});
test('expired confirmation never activates subscriber',async t=>{
 const {env,sqlite}=fixture();let link;t.mock.method(globalThis,'fetch',async(_,o)=>{link=JSON.parse(o.body).text.match(/https:\/\/\S+/)[0];return Response.json({id:'fake'});});await handle(request('subscribe',form),env);sqlite.exec('update subscribers set confirm_until=0');await handle(new Request(link,{method:'POST'}),env);assert.equal(sqlite.prepare('select status from subscribers').get().status,'pending');
});
test('provider failure is never reported as completed subscription',async t=>{const {env,sqlite}=fixture();t.mock.method(globalThis,'fetch',async()=>Response.json({error:'hidden'},{status:500}));const r=await handle(request('subscribe',form),env);assert.equal(r.status,503);assert.equal(sqlite.prepare('select status from subscribers').get().status,'pending');assert.doesNotMatch(JSON.stringify(await r.json()),/hidden|test-not-a-real-key/);});
test('confirmation requests are rate limited',async t=>{const {env}=fixture();env.CONFIRM_HOURLY_LIMIT='1';t.mock.method(globalThis,'fetch',async()=>Response.json({id:'fake'}));assert.equal((await handle(request('subscribe',form),env)).status,202);assert.equal((await handle(request('subscribe',{...form,email:'second@example.com'}),env)).status,429);});
function active(sqlite){sqlite.prepare("insert into subscribers values(?,?,'active',NULL,NULL,?,?,?, ?,NULL,?)").run('test-reader','reader@example.com','unused-hash','test',1,1,1);}
test('only authenticated, approved columns can be planned; no emails sent',async()=>{const {env,sqlite}=fixture();active(sqlite);assert.equal((await handle(request('plan',{issueId:column.id}),env,[column])).status,401);const req=request('plan',{issueId:column.id},{headers:{Authorization:'Bearer '+env.NEWSLETTER_ADMIN_TOKEN}});const r=await handle(req,env,[column]);const plan=await r.json();assert.equal(plan.activeSubscribers,1);assert.equal(plan.fingerprint,await hash(JSON.stringify(column)));const denied=await handle(request('plan',{issueId:column.id},{headers:{Authorization:'Bearer '+env.NEWSLETTER_ADMIN_TOKEN}}),env,[{...column,kind:'journaling'}]);assert.equal(denied.status,400);});
test('send disabled without explicit activation and content fingerprint',async()=>{const {env}=fixture();const r=await handle(request('send',{issueId:column.id},{headers:{Authorization:'Bearer '+env.NEWSLETTER_ADMIN_TOKEN}}),env,[column]);assert.equal(r.status,403);});
test('one campaign delivered once; unsubscribe GET harmless and POST works even when sends paused',async t=>{
 const {env,sqlite}=fixture();active(sqlite);env.NEWSLETTER_SEND_ENABLED='true';let calls=[];t.mock.method(globalThis,'fetch',async(_,o)=>{calls.push(JSON.parse(o.body));return Response.json({id:'fake'});});const send=()=>handle(request('send',{issueId:column.id,approval:awaited},{headers:{Authorization:'Bearer '+env.NEWSLETTER_ADMIN_TOKEN}}),env,[column]);const awaited=await hash(JSON.stringify(column));
 assert.equal((await (await send()).json()).sent,1);assert.equal((await (await send()).json()).skipped,1);assert.equal(calls.length,1);assert.match(calls[0].html,/&lt;safe&gt;/);
 const link=calls[0].text.match(/구독 해지: (https:\/\/\S+)/)[1];env.NEWSLETTER_ENABLED='false';await handle(new Request(link),env);assert.equal(sqlite.prepare('select status from subscribers').get().status,'active');await handle(new Request(link,{method:'POST'}),env);assert.equal(sqlite.prepare('select status from subscribers').get().status,'unsubscribed');
});
test('uncertain provider delivery is locked against automatic resend',async t=>{const {env,sqlite}=fixture();active(sqlite);env.NEWSLETTER_SEND_ENABLED='true';let attempts=0;t.mock.method(globalThis,'fetch',async()=>{attempts++;throw Error('provider timeout');});const make=async()=>handle(request('send',{issueId:column.id,approval:await hash(JSON.stringify(column))},{headers:{Authorization:'Bearer '+env.NEWSLETTER_ADMIN_TOKEN}}),env,[column]);assert.equal((await make()).status,503);assert.equal(sqlite.prepare('select status from deliveries').get().status,'uncertain');await make();assert.equal(attempts,1);});
