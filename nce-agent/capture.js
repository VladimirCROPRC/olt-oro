(() => {
 'use strict';
 const channel='OLT_ORO_NCE_V1',host='nce-fan-bi0514.infra.orange.intra';
 let enabled=false,last=null,busy=false,generation=0,waitingReported=false;
 const originalFetch=window.fetch.bind(window);
 const originalOpen=XMLHttpRequest.prototype.open,originalSend=XMLHttpRequest.prototype.send,originalHeader=XMLHttpRequest.prototype.setRequestHeader;
 const requests=new WeakMap();
 function eligible(url){try{const u=new URL(url,location.href);return u.protocol==='https:'&&u.hostname===host&&u.port==='31943'&&u.pathname==='/rest/fmwebsite/v1/commands'&&u.searchParams.get('_cmd')==='1103'}catch{return false}}
 function emit(type,data){window.postMessage({channel,type,data},location.origin)}
 function remember(url,body,headers){
  if(!eligible(url)||typeof body!=='string')return;
  try{const payload=JSON.parse(body);if(payload.cmd!==1103||!payload.parameters?.jobId)return;
   const key=JSON.stringify([payload.parameters.jobId,payload.parameters.modelID]);
   if(!last||last.key!==key)generation++;
   last={url:new URL(url,location.href).href,payload,headers,key};
  }catch{}
 }
 XMLHttpRequest.prototype.open=function(method,url,...args){requests.set(this,{method,url,headers:{}});return originalOpen.call(this,method,url,...args)};
 XMLHttpRequest.prototype.setRequestHeader=function(name,value){const request=requests.get(this);if(request)request.headers[name]=value;return originalHeader.call(this,name,value)};
 XMLHttpRequest.prototype.send=function(body){const request=requests.get(this);if(request?.method?.toUpperCase()==='POST')remember(request.url,body,request.headers);return originalSend.call(this,body)};
 window.fetch=function(input,options){const url=typeof input==='string'?input:input?.url;
  if((options?.method||input?.method||'GET').toUpperCase()==='POST')remember(url,options?.body,Object.fromEntries(new Headers(options?.headers||{})));
  return originalFetch(input,options);
 };
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.channel!==channel)return;
  if(event.data.type==='CONTROL'){const next=event.data.data?.enabled===true;if(next!==enabled)generation++;enabled=next;if(enabled)poll()}
  if(event.data.type==='POLL'&&enabled)poll();
 });
 async function poll(){
  if(!enabled||busy)return;
  if(!last){if(!waitingReported){emit('STATUS',{message:'Deschide Current Alarms și apasă Refresh pentru a detecta filtrul.'});waitingReported=true}return}
  busy=true;const run=generation,request=last;let rows=[],total=null,complete=false;
  try{
   for(let page=0;page<200;page++){
    if(!enabled||run!==generation)return;
    const body=JSON.parse(JSON.stringify(request.payload));body.parameters={...body.parameters,from:page*55+1,to:(page+1)*55,autoRefresh:false,scrollLock:false,csns:[]};
    const url=new URL(request.url);url.searchParams.set('_t',String(Date.now()));
    const headers=new Headers();for(const [key,value] of Object.entries(request.headers)){if(['content-type','roarand','x-requested-with'].includes(key.toLowerCase()))headers.set(key,value)}
    headers.set('Content-Type','application/json');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    let response;try{response=await originalFetch(url.href,{method:'POST',credentials:'same-origin',headers,body:JSON.stringify(body),redirect:'error',signal:controller.signal})}finally{clearTimeout(timeout)}
    if(response.status===401||response.status===403){enabled=false;emit('EXPIRED',{message:'NCE a refuzat sesiunea. Autentifică-te manual, apoi pornește din nou agentul.'});return}
    if(!response.ok)throw Error('NCE nu a acceptat cererea.');
    const data=(await response.json()).parameters;
    if(!Array.isArray(data?.data))throw Error('NCE nu a returnat o listă de alarme. Actualizează Current Alarms.');
    const count=Number(data.total);if(!Number.isSafeInteger(count)||count<0)throw Error('Total NCE invalid.');
    if(total===null)total=count;
    if(count!==total)throw Error('Lista s-a schimbat în timpul preluării. Agentul va reîncerca.');
    rows.push(...data.data);
    if((page+1)*55>=total){complete=rows.length>=total;break}
    if(!data.data.length)break;
   }
   if(!enabled||run!==generation)return;
   // Only operational fiber fields leave this tab. Cookies and request payload stay here.
   const records=rows.filter(row=>['772907009','772874247'].includes(String(row.alarmId))&&String(row.cleared)==='0').map(row=>({csn:row.csn,alarmId:row.alarmId,cleared:row.cleared,meName:row.meName,moi:row.moi,alarmName:row.alarmName,latestOccurUtc:row.latestOccurUtc}));
   emit('SNAPSHOT',{records,total,read:rows.length,complete});
  }catch{emit('STATUS',{message:'Preluarea NCE nu a reușit sau lista s-a schimbat. Datele anterioare sunt păstrate; reîncercare în 30 s.'})}
  finally{busy=false}
 }
 setInterval(poll,30000);
})();
