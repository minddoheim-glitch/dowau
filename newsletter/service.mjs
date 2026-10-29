import { issues } from '../data/newsletter-issues.mjs';
const CONSENT = '2026-10-29-v1';
const encoder = new TextEncoder();
export async function hash(value) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function signatureFor(secret, value) {
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function token() { return [...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function json(body, status=200) { return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}); }
function escape(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function configured(env) {
 return env.NEWSLETTER_ENABLED==='true' && env.DB && env.RESEND_API_KEY && env.MAIL_FROM && env.SITE_ORIGIN==='https://dowwalabs.com' && env.PRIVACY_READY==='true' && env.SENDER_FOOTER && env.RATE_LIMIT_SALT?.length>=32 && env.UNSUBSCRIBE_SIGNING_KEY?.length>=32;
}
async function limit(env,key,max,now) {
 const r=await env.DB.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`).bind(key,now+7200,max).first();
 return !!r;
}
async function mail(env,to,subject,html,text,key,headers={}) {
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',signal:AbortSignal.timeout(10000),
  headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},
  body:JSON.stringify({from:env.MAIL_FROM,to:[to],subject,html,text,headers})
 });
 if(!response.ok) throw new Error('mail_delivery_unconfirmed');
 const body=await response.json();
 if(typeof body.id!=='string') throw new Error('mail_delivery_unconfirmed');
 return body.id;
}
function page(title,body) {
 return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)} · 도와유</title><style>body{background:#0d0d0b;color:#f0ede6;font:18px/1.8 system-ui;margin:12vh auto;padding:24px;max-width:560px}a{color:#c8a96e}button{background:#c8a96e;padding:14px 24px;border:0;border-radius:8px;font:inherit;cursor:pointer}</style><h1>${escape(title)}</h1>${body}<p><a href="/#newsletter">뉴스레터로 돌아가기</a></p></html>`,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function admin(request,env) {
 const supplied=request.headers.get('Authorization')||'';
 if(!env.NEWSLETTER_ADMIN_TOKEN || env.NEWSLETTER_ADMIN_TOKEN.length<32) return false;
 return await hash(supplied) === await hash(`Bearer ${env.NEWSLETTER_ADMIN_TOKEN}`);
}
export async function handle(request,env,catalog=issues) {
 try { return await route(request,env,catalog); } catch { return json({error:'처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503); }
}
async function route(request,env,catalog) {
 const url=new URL(request.url), action=url.pathname.split('/').filter(Boolean).pop();
 const now=Math.floor(Date.now()/1000);
 if(action==='config' && request.method==='GET') return json({enabled:!!configured(env),consentVersion:CONSENT});
 if(!env.DB && ['leave','confirm','unsubscribe'].includes(action)) return json({error:'잠시 후 다시 시도해 주세요.'},503);
 if(action==='leave') {
  const id=url.searchParams.get('id'), signature=url.searchParams.get('signature');
  if(!id || !signature || !env.UNSUBSCRIBE_SIGNING_KEY || env.UNSUBSCRIBE_SIGNING_KEY.length<32 || signature!==await signatureFor(env.UNSUBSCRIBE_SIGNING_KEY,id)) return page('유효하지 않은 링크입니다','<p>메일의 구독 해지 링크를 확인해 주세요.</p>');
  if(request.method==='GET') return page('구독을 해지할까요?','<form method="post"><button>구독 해지</button></form>');
  if(request.method!=='POST') return json({error:'method_not_allowed'},405);
  await env.DB.prepare("UPDATE subscribers SET status='unsubscribed',unsubscribed_at=?,confirm_hash=NULL,confirm_until=NULL WHERE id=?").bind(now,id).run();
  return page('구독이 해지되었습니다','<p>다음 발송부터 이메일을 보내지 않습니다.</p>');
 }
 if(action==='confirm' || action==='unsubscribe') {
  const raw=url.searchParams.get('token');
  if(!raw || !/^[a-f0-9]{64}$/.test(raw)) return page('유효하지 않은 링크입니다','<p>메일에 있는 링크를 다시 확인해 주세요.</p>');
  const digest=await hash(raw);
  if(request.method==='GET') {
   // Link scanners must never confirm subscriptions or unsubscribe a person.
   return page(action==='confirm'?'구독을 확정할까요?':'뉴스레터 구독을 해지할까요?',`<p>${action==='confirm'?'아래 버튼을 누르면 도와유 칼럼을 이메일로 받아보실 수 있습니다.':'해지하면 앞으로 보내는 칼럼 이메일을 받지 않습니다.'}</p><form method="post"><button type="submit">${action==='confirm'?'구독 확정':'구독 해지'}</button></form>`);
  }
  if(request.method!=='POST') return json({error:'method_not_allowed'},405);
  if(action==='confirm') {
   const r=await env.DB.prepare(`UPDATE subscribers SET status='active',confirmed_at=?,confirm_hash=NULL,confirm_until=NULL WHERE confirm_hash=? AND confirm_until>=? AND status='pending' RETURNING id`).bind(now,digest,now).first();
   return r?page('구독이 완료되었습니다','<p>새로운 칼럼을 준비해서 보내드리겠습니다.</p>'):page('만료되었거나 사용한 링크입니다','<p>아직 구독하지 않았다면 홈페이지에서 다시 신청해 주세요.</p>');
  }
  const r=await env.DB.prepare(`UPDATE subscribers SET status='unsubscribed',unsubscribed_at=?,confirm_hash=NULL,confirm_until=NULL WHERE unsubscribe_hash=? RETURNING id`).bind(now,digest).first();
  return r?page('구독이 해지되었습니다','<p>다음 발송부터 이메일을 보내지 않습니다.</p>'):page('유효하지 않은 링크입니다','<p>메일의 구독 해지 링크를 확인해 주세요.</p>');
 }
 if(!configured(env)) return json({error:'구독 서비스를 준비하고 있습니다. 아직 신청이 저장되지 않았습니다.'},503);
 if(request.method!=='POST') return json({error:'method_not_allowed'},405);
 if(action==='subscribe') {
  if(request.headers.get('Origin')!==env.SITE_ORIGIN) return json({error:'허용되지 않은 요청입니다.'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'invalid_request'},415);
  const rawBody=await request.text();
  if(encoder.encode(rawBody).length>2048) return json({error:'invalid_request'},413);
  let b; try { b=JSON.parse(rawBody); } catch { return json({error:'invalid_request'},400); }
  if(b.website) return json({message:'확인 이메일을 확인해 주세요.'},202);
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
  if(email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n]/.test(email) || b.consent!==true || b.consentVersion!==CONSENT) return json({error:'이메일 주소와 수신 동의를 확인해 주세요.'},400);
  // IP is hashed with a server secret; raw IPs are never stored.
  if(!env.RATE_LIMIT_SALT || env.RATE_LIMIT_SALT.length<32) return json({error:'구독 서비스를 준비하고 있습니다.'},503);
  const ip=request.headers.get('CF-Connecting-IP');
  if(!ip) return json({error:'구독 서비스를 준비하고 있습니다.'},503);
  const bucket=Math.floor(now/3600);
  if(!await limit(env,`global:${bucket}`,Math.min(Number(env.CONFIRM_HOURLY_LIMIT)||50,50),now) || !await limit(env,`ip:${bucket}:${await hash(env.RATE_LIMIT_SALT+ip)}`,10,now)) return json({error:'신청이 많습니다. 잠시 후 다시 시도해 주세요.'},429);
  const existing=await env.DB.prepare('SELECT id,status,last_request_at FROM subscribers WHERE email=?').bind(email).first();
  const generic=()=>json({message:'확인 이메일을 확인해 주세요. 이미 구독 중이라면 새 메일은 보내지 않습니다.'},202);
  if(existing?.status==='active' || existing && existing.last_request_at>now-600) return generic();
  const confirm=token(), unsub=token();
  const cHash=await hash(confirm), uHash=await hash(unsub);
  const saved=await env.DB.prepare(`INSERT INTO subscribers(id,email,status,confirm_hash,confirm_until,unsubscribe_hash,consent_version,consent_at,last_request_at) VALUES (?,?,'pending',?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET status='pending',confirm_hash=excluded.confirm_hash,confirm_until=excluded.confirm_until,consent_version=excluded.consent_version,consent_at=excluded.consent_at,last_request_at=excluded.last_request_at WHERE subscribers.status!='active' AND subscribers.last_request_at<=? RETURNING id`).bind(crypto.randomUUID(),email,cHash,now+86400,uHash,CONSENT,now,now,now-600).first();
  if(!saved) return generic();
  const link=`${env.SITE_ORIGIN}/api/newsletter/confirm?token=${confirm}`;
  await mail(env,email,'도와유 뉴스레터 구독을 확인해 주세요',`<p>도와유 칼럼 뉴스레터를 신청하셨나요?</p><p><a href="${link}">구독 확인하기</a></p><p>24시간 안에 확인해 주세요. 신청하지 않았다면 이 메일을 무시해 주세요.</p>`,`구독 확인: ${link}\n24시간 안에 확인해 주세요. 신청하지 않았다면 무시하셔도 됩니다.`,`confirm-${saved.id}-${cHash}`);
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();
  return generic();
 }
 if(!await admin(request,env)) return json({error:'unauthorized'},401);
 const b=await request.json();
 const issue=catalog.find(i=>i.id===b.issueId && i.kind==='column' && i.approved===true && i.published===true);
 if(!issue) return json({error:'승인·공개한 칼럼만 발송할 수 있습니다.'},400);
 const fingerprint=await hash(JSON.stringify(issue));
 const count=await env.DB.prepare("SELECT count(*) AS total FROM subscribers WHERE status='active'").first();
 if(action==='plan') return json({issueId:issue.id,title:issue.title,fingerprint,activeSubscribers:count.total,subject:`[도와유 칼럼] ${issue.title}`,paragraphs:issue.paragraphs});
 if(action!=='send') return json({error:'not_found'},404);
 if(env.NEWSLETTER_SEND_ENABLED!=='true' || b.approval!==fingerprint) return json({error:'발송 승인과 운영 활성화가 필요합니다.'},403);
 if(!env.UNSUBSCRIBE_SIGNING_KEY || env.UNSUBSCRIBE_SIGNING_KEY.length<32) return json({error:'발송 설정을 확인해 주세요.'},503);
 const after=typeof b.after==='string'?b.after:'';
 const subscribers=await env.DB.prepare("SELECT id,email,unsubscribe_hash FROM subscribers WHERE status='active' AND id>? ORDER BY id LIMIT 10").bind(after).all();
 let sent=0, skipped=0;
 for(const sub of subscribers.results) {
  // Claim at most once. Uncertain deliveries stay locked for manual provider reconciliation.
  const claim=await env.DB.prepare("INSERT INTO deliveries(issue_id,subscriber_id,status,attempted_at) SELECT ?,?,'sending',? WHERE EXISTS(SELECT 1 FROM subscribers WHERE id=? AND status='active') ON CONFLICT DO NOTHING RETURNING subscriber_id").bind(issue.id,sub.id,now,sub.id).first();
  if(!claim) { skipped++; continue; }
  // Only a one-way hash is stored; derive a signed, stable unsubscribe token for campaign mail.
  const signature=await signatureFor(env.UNSUBSCRIBE_SIGNING_KEY,sub.id);
  const unsub=`${env.SITE_ORIGIN}/api/newsletter/leave?id=${encodeURIComponent(sub.id)}&signature=${signature}`;
  const link=`${env.SITE_ORIGIN}/#newsletter`;
  const text=issue.paragraphs.join('\n\n')+`\n\n${env.SENDER_FOOTER}\n홈페이지: ${link}\n구독 해지: ${unsub}`;
  const html=`<h1>${escape(issue.title)}</h1>`+issue.paragraphs.map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('')+`<hr><p>${escape(env.SENDER_FOOTER)}</p><p>도와유 칼럼 · <a href="${link}">홈페이지에서 읽기</a> · <a href="${unsub}">구독 해지</a></p>`;
  try {
   const providerId=await mail(env,sub.email,`[도와유 칼럼] ${issue.title}`,html,text,`issue-${issue.id}-${sub.id}`,{'List-Unsubscribe':`<${unsub}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'});
   await env.DB.prepare("UPDATE deliveries SET status='sent',provider_id=? WHERE issue_id=? AND subscriber_id=?").bind(providerId,issue.id,sub.id).run(); sent++;
  } catch {
   await env.DB.prepare("UPDATE deliveries SET status='uncertain' WHERE issue_id=? AND subscriber_id=?").bind(issue.id,sub.id).run();
   return json({error:'발송 결과가 불확실합니다. 공급자 기록 확인 전 재시도하지 마세요.',sent},503);
  }
 }
 return json({sent,skipped,next:subscribers.results.length===10?subscribers.results.at(-1).id:null});
}
