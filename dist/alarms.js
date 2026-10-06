'use strict';
const localAlarms=location.hostname==='127.0.0.1';
const alarmPanel=document.createElement('section');alarmPanel.className='alarm-panel';
alarmPanel.innerHTML=localAlarms?'<a class="secondary" href="agent.html" target="_blank" rel="noopener">Instalează agentul NCE ↗</a><button id="load-nce-session" class="secondary" type="button">Încarcă sesiune HAR</button><input id="nce-har-file" type="file" accept=".har,application/json" hidden><button id="sync-alarms" class="secondary" type="button">Preia alarme fibra</button><button id="show-alarm-olts" class="secondary" type="button">Arată OLT cu alarme</button><p id="alarm-status" role="status">Se citește captura locală…</p>':'<a class="secondary" href="http://127.0.0.1:8765/" target="_blank" rel="noopener">Alarme prin serviciul local ↗</a>';
document.querySelector('.sidebar').insertBefore(alarmPanel,$('port-panel'));
let localAlarmToken=null,lastAlarmUpdate=null;
function acceptAlarmSnapshot(data){
 lastAlarmUpdate=data.updated||null;
 oltAlarmAliases=data.oltAliases||{};
 fiberAlarms=data.alarms||[];
 const browserAgent=data.source.startsWith('Agent browser');$('sync-alarms').disabled=browserAgent;$('sync-alarms').textContent=browserAgent?'Agent: actualizare automată':'Preia alarme fibra';
 const los=fiberAlarms.filter(a=>a.kind==='LOS'&&!a.cleared).length,ont=fiberAlarms.filter(a=>a.kind==='ONT'&&!a.cleared).length;
 $('alarm-status').textContent=`${data.source}: ${los} LOS · ${ont} ONT · ${data.read}/${data.total} înregistrări${data.complete?'':' · LISTĂ PARȚIALĂ'}${data.updated?' · '+new Date(data.updated).toLocaleString('ro'):''}${data.unverifiedNce?' · Excepție certificat NCE activă':''}${data.sessionAuthPresent===false&&data.source.startsWith('HAR')?' · HAR fără autentificare: exportă with sensitive data':''}`;
 if(selectedData&&dpMap){const previous=selectedOlts.size;selectAlarmOlts();renderPorts();renderMap(selectedOlts.size!==previous)}
}
if(localAlarms){
 setInterval(()=>fetch('/api/alarms',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(data.updated&&data.updated!==lastAlarmUpdate)acceptAlarmSnapshot(data)}).catch(()=>{}),3000);
 fetch('/api/alarms',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{localAlarmToken=data.token;acceptAlarmSnapshot(data)}).catch(()=>$('alarm-status').textContent='Serviciul local nu este disponibil.');
 $('load-nce-session').addEventListener('click',()=>$('nce-har-file').click());
 $('nce-har-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file||!localAlarmToken)return;
  if(file.size>64*1024*1024){$('alarm-status').textContent='Selectează un HAR de maximum 64 MB.';event.target.value='';return}
  const button=$('load-nce-session');button.disabled=true;
  try{
   const response=await fetch('/api/session',{method:'POST',headers:{'X-Local-Token':localAlarmToken},body:file});
   const data=await response.json();if(!response.ok)throw Error(data.error||'HAR invalid.');acceptAlarmSnapshot(data);
  }catch(error){$('alarm-status').textContent=error.message}
  finally{button.disabled=false;event.target.value=''}
 });
 $('sync-alarms').addEventListener('click',async()=>{
  if(!localAlarmToken)return;
  const button=$('sync-alarms');button.disabled=true;$('alarm-status').textContent='Se preiau alarmele din NCE…';
  try{
   const response=await fetch('/api/alarms/sync',{method:'POST',headers:{'X-Local-Token':localAlarmToken}});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Preluarea a eșuat.');acceptAlarmSnapshot(data);
  }catch(error){$('alarm-status').textContent=error.message+' Alarmele afișate anterior nu au fost actualizate.'}
  finally{button.disabled=false}
 });
 $('show-alarm-olts').addEventListener('click',()=>{
  if(!selectedData||!dpMap){$('alarm-status').textContent='Selectează întâi un site.';return}
  let matched=0;
  for(const olt of selectedData.olts){if(olt.ports.some(p=>alarmsForPort(olt.name,p.port).length)){selectedOlts.add(olt.name);matched++}}
  renderPorts();renderMap(true);
  if(!matched)$('alarm-status').textContent='Nicio alarmă din captura încărcată nu corespunde exact OLT-urilor și porturilor acestui site.';
 });
}
