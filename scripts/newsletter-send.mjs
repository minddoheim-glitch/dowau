// Operator-only tool. No secrets in arguments, files, logs, or browser JavaScript.
// Plan: NEWSLETTER_ADMIN_TOKEN in your secure environment, then --plan ISSUE_ID
// Send: requires --send ISSUE_ID --approve FINGERPRINT from the reviewed plan.
const [mode,issueId,flag,approval]=process.argv.slice(2);
if(!['--plan','--send'].includes(mode)||!issueId||mode==='--send'&&(flag!=='--approve'||!approval)) throw Error('Use --plan ISSUE_ID or --send ISSUE_ID --approve FINGERPRINT');
const token=process.env.NEWSLETTER_ADMIN_TOKEN;
if(!token||token.length<32) throw Error('Set NEWSLETTER_ADMIN_TOKEN in the secure operator environment.');
const action=mode==='--plan'?'plan':'send';
async function call(body){
 const r=await fetch(`https://dowwalabs.com/api/newsletter/${action}`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 if(!r.ok) throw Error(`Request failed (${r.status}). Inspect sanitized server status before resuming.`);
 return r.json();
}
if(action==='plan') console.log(JSON.stringify(await call({issueId}),null,2));
else {
 let after='';
 do {const result=await call({issueId,approval,after});console.log(JSON.stringify({sent:result.sent,skipped:result.skipped}));after=result.next;if(after)await new Promise(resolve=>setTimeout(resolve,1000));}while(after);
}
