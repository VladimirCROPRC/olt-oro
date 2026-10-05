'use strict';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let index=[],mode='sites',selected=null,selectedData=null,request=0;
let selectedOlts=new Set(),downPorts=new Set(),dpMap=null,dpMarkers=null,blinkTimer=null,blinkEnabled=true,redMarkers=[];
const natural=(a,b)=>a.localeCompare(b,'ro',{numeric:true,sensitivity:'base'});
const portKey=(olt,port)=>JSON.stringify([olt,port]);
const coordinateKey=point=>JSON.stringify([point.lat,point.lng]);
function disposeMap(){clearInterval(blinkTimer);blinkTimer=null;redMarkers=[];if(dpMap)dpMap.remove();dpMap=null;dpMarkers=null}
function renderResults(){
 const q=$('search').value.trim().toUpperCase();
 const matches=index.filter(s=>(mode==='sites'?!!s.code:!s.code)&&(!q||(s.code+' '+s.name).toUpperCase().includes(q))).sort((a,b)=>Number(b.code===q)-Number(a.code===q)||Number(!!b.olts)-Number(!!a.olts)||natural(a.code||a.name,b.code||b.name));
 $('search-count').textContent=matches.length.toLocaleString('ro')+' rezultate'+(matches.length>100?' · primele 100 afișate':'');
 $('results').innerHTML=matches.slice(0,100).map(s=>`<button class="result ${selected?.id===s.id?'selected':''}" type="button" data-id="${s.id}" ${selected?.id===s.id?'aria-current="true"':''}><strong>${esc(s.code||s.name)}</strong>${s.code?`<span class="name">${esc(s.name||'Denumire absentă din lista de site-uri')}</span>`:''}<span class="counts">${s.olts?s.olts+' OLT · '+s.ports.toLocaleString('ro')+' porturi':'Fără OLT în fișierul Excel'}</span></button>`).join('')||'<p class="no-results">Niciun rezultat. Încearcă alt cod sau nume.</p>';
}
async function selectSite(s){
 const run=++request;disposeMap();selectedOlts.clear();downPorts.clear();blinkEnabled=true;selected=s;selectedData=null;renderResults();location.hash=encodeURIComponent(s.code||s.name);
 $('detail').innerHTML='<p class="muted">Se încarcă porturile…</p>';
 try{
  const data=s.file?await fetch(s.file).then(r=>{if(!r.ok)throw Error();return r.json()}):{code:s.code,name:s.name,olts:[]};
  if(run!==request)return;selectedData=data;renderDetail();
 }catch{if(run===request)$('detail').innerHTML='<p class="error">Porturile nu au putut fi încărcate. Selectează din nou site-ul.</p>'}
}
function renderDetail(){
 const d=selectedData,ports=d.olts.reduce((n,o)=>n+o.ports.length,0);
 $('detail').innerHTML=`<span class="eyebrow">${d.code?'Site selectat':'OLT fără cod de site'}</span><h1 class="site-title">${esc(d.code||d.name)}</h1>${d.code?`<p class="site-name">${esc(d.name||'Denumire absentă din lista de site-uri')}</p>`:'<p class="site-name">Codul site-ului nu este identificabil din denumirea OLT-ului.</p>'}<div class="metrics"><div class="metric"><strong>${d.olts.length}</strong><span>OLT-uri</span></div><div class="metric"><strong>${ports.toLocaleString('ro')}</strong><span>Porturi înregistrate</span></div></div>${ports?'<div class="map-toolbar"><button id="all-olts" class="secondary" type="button">Toate OLT-urile</button><button id="no-olts" class="secondary" type="button">Niciun OLT</button><button id="clear-down" class="secondary" type="button">Resetează DOWN</button><button id="blink-toggle" class="secondary" type="button" disabled>Stop blink</button></div><div class="map-legend"><span class="map-green">DP normal</span><span class="map-red">DP cu port DOWN</span><span>DOWN marcat manual</span></div><div id="dp-map" aria-label="Harta DP-urilor OLT selectate"></div><p id="map-count" class="note" role="status">Bifează un OLT pentru a afișa DP-urile pe hartă.</p><div class="port-tools"><input id="port-filter" type="search" aria-label="Filtrează porturile" placeholder="Filtrează OLT / placă / port"></div><div id="olt-list"></div><p class="note">DP-urile provin din splitterele SPL-1, cu aliasul din coloana B. „Referințe” reprezintă înregistrările Excel asociate portului. Porturile libere nu pot fi deduse din aceste date.</p>':'<p class="note">Acest site există în lista HTML, dar nu are conexiuni OLT asociate în coloana Q a Excelului.</p>'}`;
 if(ports){
  initMap();renderPorts();$('port-filter').addEventListener('input',renderPorts);
  $('all-olts').addEventListener('click',()=>{selectedData.olts.forEach(o=>selectedOlts.add(o.name));renderPorts();renderMap(true)});
  $('no-olts').addEventListener('click',()=>{selectedOlts.clear();downPorts.clear();renderPorts();renderMap(false)});
  $('clear-down').addEventListener('click',()=>{downPorts.clear();renderPorts();renderMap(false)});
  $('blink-toggle').addEventListener('click',()=>{blinkEnabled=!blinkEnabled;updateBlink()});
  $('olt-list').addEventListener('change',onSelectionChange);
 }
}
function renderPorts(){
 const q=$('port-filter').value.trim().toUpperCase();
 const openOlts=new Map(Array.from($('olt-list').querySelectorAll('details[data-olt]')).map(d=>[d.dataset.olt,d.open]));
 $('olt-list').innerHTML=selectedData.olts.map((o,oi)=>{
  const ports=o.ports.filter(p=>(o.name+' '+p.port+' '+p.speeds.join(' ')).toUpperCase().includes(q));
  if(!ports.length)return '';
  const checked=selectedOlts.has(o.name);
  return `<details class="olt" data-olt="${oi}" ${openOlts.get(String(oi))!==false?'open':''}><summary><strong>${esc(o.name)}</strong><span>${ports.length} porturi</span></summary><label class="olt-select"><input type="checkbox" data-olt-check="${oi}" ${checked?'checked':''}> Afișează ${esc(o.name)} pe hartă</label><div class="table-wrap"><table><thead><tr><th>DOWN</th><th>Placă / port</th><th>Viteză</th><th>DP nivel 1</th><th>Referințe</th></tr></thead><tbody>${ports.map(p=>{
   const down=downPorts.has(portKey(o.name,p.port)),pi=o.ports.indexOf(p),count=new Set((p.dps||[]).map(coordinateKey)).size;
   return `<tr class="${down?'down-row':''}"><td><label class="down-choice"><input type="checkbox" data-port-check="${pi}" data-olt-index="${oi}" aria-label="DOWN ${esc(o.name)} / ${esc(p.port)}" ${down?'checked':''} ${checked?'':'disabled'}><span>${down?'DOWN':'—'}</span></label></td><td class="port-name">${esc(p.port.replace(/unset/gi,'nespecificat'))}</td><td>${p.speeds.length?p.speeds.map(s=>'<span class="speed">'+esc(s)+'</span>').join(' '):'—'}</td><td>${count||'<span class="muted">Fără SPL-1</span>'}</td><td class="reference">${p.references}</td></tr>`;
  }).join('')}</tbody></table></div></details>`;
 }).join('')||'<p class="no-results">Niciun port corespunde filtrului.</p>';
}
function onSelectionChange(event){
 const input=event.target;
 if(input.dataset.oltCheck!==undefined){
  const o=selectedData.olts[Number(input.dataset.oltCheck)];
  if(input.checked)selectedOlts.add(o.name);else{selectedOlts.delete(o.name);o.ports.forEach(p=>downPorts.delete(portKey(o.name,p.port)))}
  renderPorts();renderMap(true);
 }else if(input.dataset.portCheck!==undefined){
  const o=selectedData.olts[Number(input.dataset.oltIndex)],p=o.ports[Number(input.dataset.portCheck)],key=portKey(o.name,p.port);
  input.checked?downPorts.add(key):downPorts.delete(key);renderPorts();renderMap(false);
 }
}
function initMap(){
 dpMap=L.map('dp-map',{preferCanvas:true,renderer:L.canvas({tolerance:L.Browser.touch?10:5})}).setView([45.8,24.9],7);
 const streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:20,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(dpMap);
 const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,attribution:'Imagery © Esri'});
 L.control.layers({'OpenStreetMap':streets,'ESRI Satellite':satellite},{},{collapsed:false}).addTo(dpMap);
 L.control.scale({imperial:false}).addTo(dpMap);dpMarkers=L.layerGroup().addTo(dpMap);
 requestAnimationFrame(()=>dpMap?.invalidateSize());
}
function renderMap(fit){
 clearInterval(blinkTimer);blinkTimer=null;redMarkers=[];dpMarkers.clearLayers();const points=new Map();let missing=0,downMissing=0;
 for(const o of selectedData.olts){
  if(!selectedOlts.has(o.name))continue;
  for(const p of o.ports){
   const down=downPorts.has(portKey(o.name,p.port));
   if(!p.dps?.length){missing++;if(down)downMissing++}
   for(const dp of p.dps||[]){
    const key=coordinateKey(dp);let point=points.get(key);
    if(!point){point={lat:dp.lat,lng:dp.lng,down:false,connections:new Map()};points.set(key,point)}
    point.down=point.down||down;
    point.connections.set(JSON.stringify([o.name,p.port,dp.alias]),{olt:o.name,port:p.port,alias:dp.alias,down});
   }
  }
 }
 for(const point of points.values()){
  const color=point.down?'#ef4444':'#22c55e';
  const marker=L.circleMarker([point.lat,point.lng],{radius:7,weight:2,color:'#07151e',fillColor:color,fillOpacity:.95,down:point.down}).addTo(dpMarkers);
  marker.bindPopup('<strong>DP / splitter nivel 1</strong><div class="dp-popup">'+Array.from(point.connections.values()).map(c=>`<div><strong>${esc(c.alias||'Alias lipsă')}</strong><br>${esc(c.olt)} / ${esc(c.port)}${c.down?' <b class="down-label">DOWN</b>':''}</div>`).join('')+'</div>',{maxWidth:360});
  if(point.down)redMarkers.push(marker);
 }
 if(fit&&points.size)dpMap.fitBounds(L.latLngBounds(Array.from(points.values()).map(p=>[p.lat,p.lng])),{padding:[30,30],maxZoom:16});
 $('map-count').textContent=selectedOlts.size?`${points.size} DP pe hartă · ${redMarkers.length} DOWN${missing?' · '+missing+' porturi fără DP SPL-1 cu coordonate':''}${downMissing?' ('+downMissing+' marcate DOWN)':''}`:'Bifează un OLT pentru a afișa DP-urile pe hartă.';
 updateBlink();
}
function updateBlink(){
 clearInterval(blinkTimer);blinkTimer=null;redMarkers.forEach(m=>m.setStyle({fillOpacity:.95,opacity:1}));
 $('blink-toggle').textContent=blinkEnabled?'Stop blink':'Pornește blink';$('blink-toggle').disabled=!redMarkers.length;
 if(blinkEnabled&&redMarkers.length){let bright=true;blinkTimer=setInterval(()=>{bright=!bright;redMarkers.forEach(m=>m.setStyle({fillOpacity:bright?.95:.2,opacity:bright?1:.35}))},700)}
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
