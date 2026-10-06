const status=document.getElementById('status');
async function refresh(){const state=await chrome.runtime.sendMessage({type:'STATE'});status.textContent=state.status||'Agent oprit.'}
for(const [id,type] of [['start','START'],['stop','STOP']])document.getElementById(id).addEventListener('click',async()=>{const result=await chrome.runtime.sendMessage({type});if(result.error)status.textContent=result.error;else refresh()});
refresh();setInterval(refresh,2000);
