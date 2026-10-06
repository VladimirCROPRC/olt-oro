'use strict';
const localAlarms=location.hostname==='127.0.0.1';
const alarmPanel=document.createElement('section');alarmPanel.className='alarm-panel';
alarmPanel.innerHTML=localAlarms?'<button id="sync-alarms" class="secondary" type="button">Preia alarme fibra</button><button id="show-alarm-olts" class="secondary" type="button">Arată OLT cu alarme</button><p id="alarm-status" role="status">Se citește captura locală…</p>':'<a class="secondary" href="http://127.0.0.1:8765/" target="_blank" rel="noopener">Alarme prin serviciul local ↗</a>';
document.querySelector('.sidebar').insertBefore(alarmPanel,$('port-panel'));
let localAlarmToken=null;
function acceptAlarmSnapshot(data){
 fiberAlarms=data.alarms||[];
 const los=fiberAlarms.filter(a=>a.kind==='LOS').length,ont=fiberAlarms.length-los;
 $('alarm-status').textContent=`${data.source}: ${los} LOS · ${ont} ONT · ${data.read}/${data.total} înregistrări${data.complete?'':' · LISTĂ PARȚIALĂ'}${data.updated?' · '+new Date(data.updated).toLocaleString('ro'):''}${data.unverifiedNce?' · Excepție certificat NCE activă':''}`;
 if(selectedData&&dpMap){selectAlarmOlts();renderPorts();renderMap(true)}
}
if(localAlarms){
 fetch('/api/alarms',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{localAlarmToken=data.token;acceptAlarmSnapshot(data)}).catch(()=>$('alarm-status').textContent='Serviciul local nu este disponibil.');
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
