(() => {
 const form=document.getElementById('nl-form'), message=document.getElementById('nl-message'), button=document.getElementById('nl-submit');
 let enabled=false, consentVersion='';
 async function setup() {
  try {
   const response=await fetch('/api/newsletter/config',{cache:'no-store'});
   if(!response.ok) throw Error();
   const config=await response.json(); enabled=config.enabled===true;consentVersion=config.consentVersion;
   button.disabled=!enabled;
   message.textContent=enabled?'신청 후 받은 메일에서 구독을 확인해 주세요.':'구독 서비스를 준비하고 있습니다. 현재 이메일은 저장되지 않습니다.';
   button.textContent=enabled?'무료로 칼럼 받아보기 →':'구독 오픈 준비 중';
  }catch { message.textContent='구독 서비스를 준비하고 있습니다. 현재 이메일은 저장되지 않습니다.';button.disabled=true;button.textContent='구독 오픈 준비 중'; }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!enabled || !form.reportValidity()) return;
  button.disabled=true;message.textContent='확인 이메일을 요청하고 있습니다…';
  try {
   const response=await fetch('/api/newsletter/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.elements.email.value,website:form.elements.website.value,consent:form.elements.consent.checked,consentVersion})});
   const result=await response.json();
   if(!response.ok) throw Error(result.error||'신청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
   message.textContent=result.message;form.reset();
  }catch(error){message.textContent=error.message;}
  finally{button.disabled=false;}
 });
 fetch('/data/newsletter.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(issues=>{
  const container=document.getElementById('nl-archive');
  if(!issues.length)return;
  container.replaceChildren();
  for(const issue of issues) {
   const details=document.createElement('details'),summary=document.createElement('summary'),date=document.createElement('span'),title=document.createElement('strong'),body=document.createElement('div');
   details.className='nl-issue';date.textContent=issue.date;title.textContent=issue.title;summary.append(date,title);body.className='nl-issue-body';
   for(const text of issue.paragraphs){const p=document.createElement('p');p.textContent=text;body.append(p);}
   details.append(summary,body);container.append(details);
  }
 }).catch(()=>{document.getElementById('nl-archive').textContent='칼럼 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';});
 setup();
})();
