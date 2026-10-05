'use strict';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let index=[],mode='sites',selected=null,selectedData=null,request=0;
const natural=(a,b)=>a.localeCompare(b,'ro',{numeric:true,sensitivity:'base'});
function renderResults(){
 const q=$('search').value.trim().toUpperCase();
 const matches=index.filter(s=>(mode==='sites'?!!s.code:!s.code)&&(!q||(s.code+' '+s.name).toUpperCase().includes(q))).sort((a,b)=>Number(b.code===q)-Number(a.code===q)||Number(!!b.olts)-Number(!!a.olts)||natural(a.code||a.name,b.code||b.name));
 $('search-count').textContent=matches.length.toLocaleString('ro')+' rezultate'+(matches.length>100?' · primele 100 afișate':'');
 $('results').innerHTML=matches.slice(0,100).map(s=>`<button class="result ${selected?.id===s.id?'selected':''}" type="button" data-id="${s.id}" ${selected?.id===s.id?'aria-current="true"':''}><strong>${esc(s.code||s.name)}</strong>${s.code?`<span class="name">${esc(s.name||'Denumire absentă din lista de site-uri')}</span>`:''}<span class="counts">${s.olts?s.olts+' OLT · '+s.ports.toLocaleString('ro')+' porturi':'Fără OLT în fișierul Excel'}</span></button>`).join('')||'<p class="no-results">Niciun rezultat. Încearcă alt cod sau nume.</p>';
}
async function selectSite(s){
 const run=++request;selected=s;selectedData=null;renderResults();location.hash=encodeURIComponent(s.code||s.name);
 $('detail').innerHTML='<p class="muted">Se încarcă porturile…</p>';
 try{
  const data=s.file?await fetch(s.file).then(r=>{if(!r.ok)throw Error();return r.json()}):{code:s.code,name:s.name,olts:[]};
  if(run!==request)return;selectedData=data;renderDetail();
 }catch{if(run===request)$('detail').innerHTML='<p class="error">Porturile nu au putut fi încărcate. Selectează din nou site-ul.</p>'}
}
function renderDetail(){
 const d=selectedData,ports=d.olts.reduce((n,o)=>n+o.ports.length,0);
 $('detail').innerHTML=`<span class="eyebrow">${d.code?'Site selectat':'OLT fără cod de site'}</span><h1 class="site-title">${esc(d.code||d.name)}</h1>${d.code?`<p class="site-name">${esc(d.name||'Denumire absentă din lista de site-uri')}</p>`:'<p class="site-name">Codul site-ului nu este identificabil din denumirea OLT-ului.</p>'}<div class="metrics"><div class="metric"><strong>${d.olts.length}</strong><span>OLT-uri</span></div><div class="metric"><strong>${ports.toLocaleString('ro')}</strong><span>Porturi înregistrate</span></div></div>${ports?'<div class="port-tools"><input id="port-filter" type="search" aria-label="Filtrează porturile" placeholder="Filtrează OLT / placă / port"></div><div id="olt-list"></div><p class="note">„Referințe” reprezintă numărul înregistrărilor din Excel asociate portului, nu numărul de clienți. Porturile libere nu pot fi deduse din aceste date.</p>':'<p class="note">Acest site există în lista HTML, dar nu are conexiuni OLT asociate în coloana Q a Excelului.</p>'}`;
 if(ports){renderPorts();$('port-filter').addEventListener('input',renderPorts)}
}
function renderPorts(){
 const q=$('port-filter').value.trim().toUpperCase();
 $('olt-list').innerHTML=selectedData.olts.map(o=>{
  const ports=o.ports.filter(p=>(o.name+' '+p.port+' '+p.speeds.join(' ')).toUpperCase().includes(q));
  if(!ports.length)return '';
  return `<details class="olt" open><summary><strong>${esc(o.name)}</strong><span>${ports.length} porturi</span></summary><div class="table-wrap"><table><thead><tr><th>Placă / port</th><th>Viteză</th><th>Referințe</th><th>Tip splitter</th></tr></thead><tbody>${ports.map(p=>`<tr><td>${esc(p.port.replace(/unset/gi,'nespecificat'))}</td><td>${p.speeds.length?p.speeds.map(s=>'<span class="speed">'+esc(s)+'</span>').join(' '):'—'}</td><td class="reference">${p.references}</td><td>${Object.keys(p.functions).sort(natural).map(esc).join(', ')||'—'}</td></tr>`).join('')}</tbody></table></div></details>`;
 }).join('')||'<p class="no-results">Niciun port corespunde filtrului.</p>';
}
$('search').addEventListener('input',renderResults);
$('results').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b)selectSite(index.find(s=>s.id===b.dataset.id))});
function changeMode(value){mode=value;$('sites-tab').classList.toggle('selected',mode==='sites');$('unknown-tab').classList.toggle('selected',mode==='unknown');renderResults()}
$('sites-tab').addEventListener('click',()=>changeMode('sites'));
$('unknown-tab').addEventListener('click',()=>changeMode('unknown'));
$('example').addEventListener('click',()=>{const s=index.find(s=>s.code==='CL0400');if(s){$('search').value='CL0400';changeMode('sites');selectSite(s)}});
fetch('index.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{
 index=data.sites;renderResults();$('example').disabled=false;const hash=decodeURIComponent(location.hash.slice(1));const s=hash?index.find(s=>s.code===hash||s.name===hash):null;
 if(s){$('search').value=s.code||s.name;changeMode(s.code?'sites':'unknown');selectSite(s)}
}).catch(()=>$('search-count').textContent='Datele nu au putut fi încărcate. Reîncarcă pagina.');
