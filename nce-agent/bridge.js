(() => {
 const channel='OLT_ORO_NCE_V1';
 function control(enabled){window.postMessage({channel,type:'CONTROL',data:{enabled}},location.origin)}
 chrome.runtime.onMessage.addListener(message=>{if(message.type==='CONTROL')control(message.enabled);if(message.type==='POLL')window.postMessage({channel,type:'POLL'},location.origin)});
 chrome.runtime.sendMessage({type:'HELLO'}).then(answer=>control(answer?.enabled===true)).catch(()=>{});
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.channel!==channel||!['SNAPSHOT','STATUS','EXPIRED'].includes(event.data.type))return;
  chrome.runtime.sendMessage({type:event.data.type,data:event.data.data}).catch(()=>{});
 });
})();
