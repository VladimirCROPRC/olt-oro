const local='http://127.0.0.1:8765';
const nce='https://nce-fan-bi0514.infra.orange.intra:31943/';
async function handle(message,sender){
 const state=await chrome.storage.local.get(['enabledTab','status']);
 if(message.type==='STATE')return state;
 if(message.type==='START'||message.type==='STOP'){
  if(sender.tab)throw Error('Control is available only in the extension popup.');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const tabId=message.type==='START'?tab?.id:state.enabledTab;
  if(message.type==='START'&&!tab?.url?.startsWith(nce))throw Error('Selectează întâi tabul NCE.');
  const enabled=message.type==='START';
  if(enabled&&state.enabledTab&&state.enabledTab!==tabId)await chrome.tabs.sendMessage(state.enabledTab,{type:'CONTROL',enabled:false}).catch(()=>{});
  await chrome.storage.local.set({enabledTab:enabled?tabId:null,status:enabled?'Agent pornit. Așteaptă filtrul Current Alarms.':'Agent oprit.'});
  if(tabId)await chrome.tabs.sendMessage(tabId,{type:'CONTROL',enabled}).catch(()=>{throw Error('Reîncarcă tabul NCE după instalarea extensiei.')});
  return {ok:true};
 }
 if(!sender.tab?.url?.startsWith(nce))return {};
 if(message.type==='HELLO')return {enabled:state.enabledTab===sender.tab.id};
 if(state.enabledTab!==sender.tab.id)return {};
 if(message.type==='EXPIRED'){
  await chrome.storage.local.set({enabledTab:null,status:message.data.message});
  await chrome.tabs.sendMessage(sender.tab.id,{type:'CONTROL',enabled:false}).catch(()=>{});return {};
 }
 if(message.type==='STATUS'){await chrome.storage.local.set({status:String(message.data?.message||'').slice(0,300)});return {}}
 if(message.type==='SNAPSHOT'){
  const data=message.data;if(!Array.isArray(data?.records)||data.records.length>20000)throw Error('Date agent invalide.');
  const sessionResponse=await fetch(local+'/api/alarms',{cache:'no-store'});if(!sessionResponse.ok)throw Error('Pornește serviciul local OLT ORO.');
  const session=await sessionResponse.json();
  const response=await fetch(local+'/api/alarms/browser',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':session.token,'X-Browser-Agent':'OLT-ORO'},body:JSON.stringify(data)});
  if(!response.ok)throw Error('Serviciul local nu a acceptat datele.');
  const result=await response.json();
  await chrome.storage.local.set({status:`Transmise ${result.alarms} alarme de fibră · ${data.read}/${data.total}${data.complete?'':' · listă parțială'} · ${new Date().toLocaleTimeString()}`});return {ok:true};
 }
 return {};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{handle(message,sender).then(respond).catch(async error=>{await chrome.storage.local.set({status:error.message});respond({error:error.message})});return true});
