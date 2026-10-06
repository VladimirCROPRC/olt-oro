'use strict';
const DATA_VERSION='20261006-3';
let fiberAlarms=[];
function selectAlarmOlts(){if(!selectedData)return;for(const olt of selectedData.olts){if(olt.ports.some(p=>alarmsForPort(olt.name,p.port).length))selectedOlts.add(olt.name)}}
function alarmsForPort(olt,port){const bits=port.replace(/^Sl\.\s*/i,'').split('/').map(x=>/^\d+$/.test(x)?String(Number(x)):x);return fiberAlarms.filter(a=>a.olt.trim().toUpperCase()===olt.trim().toUpperCase()&&(bits.length===2?a.frame==='0'&&bits[0]===a.slot&&bits[1]===a.port:bits.length===3&&bits[0]===a.frame&&bits[1]===a.slot&&bits[2]===a.port))}
function portIsDown(olt,port){return downPorts.has(portKey(olt,port))||alarmsForPort(olt,port).some(a=>a.kind==='LOS')}

const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let index=[],mode='sites',selected=null,selectedData=null,request=0;
let selectedOlts=new Set(),downPorts=new Set(),dpMap=null,dpMarkers=null,blinkTimer=null,blinkEnabled=true,redMarkers=[],onlyDown=false;
let siteMarker=null,cableGroups=null,cableVisible=new Map(),cableRun=0,cableTimer=null,cableManifestPromise=null;
let measuring=false,measurePoints=[],measureLayer=null;
const CABLE_SOURCE='https://oro.proconect.online/';
const dpNumbers=aliases=>Array.from(new Set(aliases.flatMap(alias=>Array.from(alias.matchAll(/DP[\s_-]*(\d+)/gi),m=>'DP'+m[1])))).sort(natural);
const natural=(a,b)=>a.localeCompare(b,'ro',{numeric:true,sensitivity:'base'});
const portKey=(olt,port)=>JSON.stringify([olt,port]);
const coordinateKey=point=>JSON.stringify([point.lat,point.lng]);
function locationLinks(lat,lng){
 const point=encodeURIComponent(lat+','+lng);
 return '<div class="location-links"><a href="https://www.google.com/maps/search/?api=1&query='+point+'" target="_blank" rel="noopener noreferrer">Google Maps ↗</a><a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+point+'" target="_blank" rel="noopener noreferrer">Street View ↗</a></div>';
}
function disposeMap(){measuring=false;measurePoints=[];measureLayer=null;$('port-panel').innerHTML='';clearInterval(blinkTimer);clearTimeout(cableTimer);cableRun++;blinkTimer=null;redMarkers=[];if(dpMap)dpMap.remove();dpMap=null;dpMarkers=null;siteMarker=null;cableGroups=null;cableVisible.clear()}
function renderResults(){
 const q=$('search').value.trim().toUpperCase();
 const matches=index.filter(s=>(mode==='sites'?!!s.code:!s.code)&&(!q||(s.code+' '+s.name).toUpperCase().includes(q))).sort((a,b)=>Number(b.code===q)-Number(a.code===q)||Number(!!b.olts)-Number(!!a.olts)||natural(a.code||a.name,b.code||b.name));
 $('search-count').textContent=matches.length.toLocaleString('ro')+' rezultate'+(matches.length>100?' · primele 100 afișate':'');
 $('results').innerHTML=matches.slice(0,100).map(s=>`<button class="result ${selected?.id===s.id?'selected':''}" type="button" data-id="${s.id}" ${selected?.id===s.id?'aria-current="true"':''}><strong>${esc(s.code||s.name)}</strong>${s.code?`<span class="name">${esc(s.name||'Denumire absentă din lista de site-uri')}</span>`:''}<span class="counts">${s.olts?s.olts+' OLT · '+s.ports.toLocaleString('ro')+' porturi':'Fără OLT în fișierul Excel'}</span></button>`).join('')||'<p class="no-results">Niciun rezultat. Încearcă alt cod sau nume.</p>';
}
async function selectSite(s){
 const run=++request;disposeMap();selectedOlts.clear();downPorts.clear();blinkEnabled=true;onlyDown=false;selected=s;selectedData=null;renderResults();location.hash=encodeURIComponent(s.code||s.name);
 $('detail').innerHTML='<p class="muted">Se încarcă porturile…</p>';
 try{
  const data=s.file?await fetch(s.file+'?v='+DATA_VERSION,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}):{code:s.code,name:s.name,location:s.location,olts:[]};
  if(run!==request)return;data.location=data.location||s.location||null;selectedData=data;renderDetail();
 }catch{if(run===request)$('detail').innerHTML='<p class="error">Porturile nu au putut fi încărcate. Selectează din nou site-ul.</p>'}
}
function renderDetail(){
 const d=selectedData,ports=d.olts.reduce((n,o)=>n+o.ports.length,0);
 $('detail').innerHTML=`<span class="eyebrow">${d.code?'Site selectat':'OLT fără cod de site'}</span><h1 class="site-title">${esc(d.code||d.name)}</h1>${d.code?`<p class="site-name">${esc(d.name||'Denumire absentă din lista de site-uri')}</p>`:'<p class="site-name">Codul site-ului nu este identificabil din denumirea OLT-ului.</p>'}${d.code&&!d.location?'<p class="note">Coordonatele site-ului lipsesc din lista HTML.</p>':''}<div class="metrics"><div class="metric"><strong>${d.olts.length}</strong><span>OLT-uri</span></div><div class="metric"><strong>${ports.toLocaleString('ro')}</strong><span>Porturi înregistrate</span></div></div>${ports||d.location?'<div class="map-toolbar"><button id="measure" class="secondary" type="button" aria-pressed="false">Liniar</button><button id="undo-measure" class="secondary" type="button" disabled>Înapoi</button><button id="clear-measure" class="secondary" type="button">Șterge liniarul</button><button id="finish-measure" class="secondary" type="button" disabled>Sfârșit măsurătoare</button><a id="measure-maps" class="secondary measure-maps" target="_blank" rel="noopener noreferrer" hidden>Google Maps ↗</a><span id="measure-result" class="measure-result" role="status"></span></div><div class="map-toolbar"><button id="all-olts" class="secondary" type="button">Toate OLT-urile</button><button id="no-olts" class="secondary" type="button">Niciun OLT</button><button id="clear-down" class="secondary" type="button">Resetează DOWN</button><button id="only-down" class="secondary" type="button" aria-pressed="false">Show only DOWN</button><button id="blink-toggle" class="secondary" type="button" disabled>Stop blink</button></div><div class="map-legend"><span class="map-blue">Site</span><span class="map-green">DP normal</span><span class="map-red">DP cu port DOWN</span><span>DOWN manual / LOS NCE</span></div><div id="dp-map" aria-label="Harta DP-urilor OLT selectate"></div><span id="map-count" hidden></span><span id="cable-status" hidden></span><div class="port-tools"><input id="port-filter" type="search" aria-label="Filtrează porturile" placeholder="Filtrează OLT / placă / port"></div><div id="olt-list"></div>':'<p class="note">Acest site există în lista HTML, dar nu are conexiuni OLT asociate în coloana Q a Excelului.</p>'}`;
 if(ports||d.location){
  const portPanel=$('port-panel');portPanel.append($('detail').querySelector('.port-tools'),$('olt-list'));document.querySelector('.sidebar').classList.add('has-site');
  initMap();selectAlarmOlts();renderPorts();renderMap(true);$('port-filter').addEventListener('input',renderPorts);
  $('measure').addEventListener('click',()=>setMeasuring(!measuring));
  $('finish-measure').addEventListener('click',()=>setMeasuring(false));
  $('clear-measure').addEventListener('click',()=>{measurePoints=[];renderMeasure()});
  $('undo-measure').addEventListener('click',()=>{measurePoints.pop();renderMeasure()});
  $('all-olts').addEventListener('click',()=>{selectedData.olts.forEach(o=>selectedOlts.add(o.name));renderPorts();renderMap(true)});
  $('no-olts').addEventListener('click',()=>{selectedOlts.clear();downPorts.clear();renderPorts();renderMap(false)});
  $('clear-down').addEventListener('click',()=>{downPorts.clear();renderPorts();renderMap(false)});
  $('blink-toggle').addEventListener('click',()=>{blinkEnabled=!blinkEnabled;updateBlink()});
  $('only-down').addEventListener('click',()=>{onlyDown=!onlyDown;$('only-down').setAttribute('aria-pressed',String(onlyDown));$('only-down').classList.toggle('active',onlyDown);renderMap(false)});
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
   const down=portIsDown(o.name,p.port),pi=o.ports.indexOf(p),count=new Set((p.dps||[]).map(coordinateKey)).size;
   return `<tr class="${down?'down-row':''}"><td><label class="down-choice"><input type="checkbox" data-port-check="${pi}" data-olt-index="${oi}" aria-label="DOWN ${esc(o.name)} / ${esc(p.port)}" ${down?'checked':''} ${checked?'':'disabled'}><span>${down?'DOWN':'—'}</span>${alarmsForPort(o.name,p.port).filter(a=>a.kind==='ONT').length?'<small class="ont-alarm">'+alarmsForPort(o.name,p.port).filter(a=>a.kind==='ONT').length+' ONT</small>':''}</label></td><td class="port-name">${esc(p.port.replace(/unset/gi,'nespecificat'))}</td><td>${p.speeds.length?p.speeds.map(s=>'<span class="speed">'+esc(s)+'</span>').join(' '):'—'}</td><td>${count||'<span class="muted">Fără SPL-1</span>'}</td><td class="reference">${p.references}</td></tr>`;
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
 cableGroups=new Map([['fo-orange',L.layerGroup().addTo(dpMap)],['fo-oroc',L.layerGroup()]]);
 const layerControl=L.control.layers({'OpenStreetMap':streets,'ESRI Satellite':satellite},{'FO Orange':cableGroups.get('fo-orange'),'FO OROC':cableGroups.get('fo-oroc')},{collapsed:false}).addTo(dpMap);
 const selector=document.createElement('section');selector.className='map-layer-panel';selector.setAttribute('aria-label','Map style and cable layers');
 selector.innerHTML='<h2>Stil hartă și cabluri</h2>';selector.append(layerControl.getContainer());$('port-panel').prepend(selector);
 L.control.scale({imperial:false}).addTo(dpMap);dpMarkers=L.layerGroup().addTo(dpMap);
 if(selectedData.location){
  siteMarker=L.circleMarker(selectedData.location,{radius:9,color:'#f4faff',weight:2,fillColor:'#2388ff',fillOpacity:1}).addTo(dpMap);
  siteMarker.bindPopup('<strong>'+esc(selectedData.code)+'</strong><br>'+esc(selectedData.name)+locationLinks(...selectedData.location));
  siteMarker.bindTooltip(esc(selectedData.code),{permanent:true,direction:'top',className:'site-code-label'});
  dpMap.setView(selectedData.location,14);
 }
 measureLayer=L.layerGroup().addTo(dpMap);
 dpMap.on('click',e=>{if(measuring){measurePoints.push(e.latlng);renderMeasure()}});
 dpMap.on('popupopen',()=>{if(measuring)dpMap.closePopup()});
 dpMap.on('moveend overlayadd overlayremove',()=>{clearTimeout(cableTimer);cableTimer=setTimeout(refreshCables,250)});
 refreshCables();
 requestAnimationFrame(()=>dpMap?.invalidateSize());
}
function renderMap(fit){
 clearInterval(blinkTimer);blinkTimer=null;redMarkers=[];dpMarkers.clearLayers();const points=new Map();let missing=0,downMissing=0;
 for(const o of selectedData.olts){
  if(!selectedOlts.has(o.name))continue;
  for(const p of o.ports){
   const down=portIsDown(o.name,p.port);
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
  if(onlyDown&&!point.down)continue;
  const color=point.down?'#ef4444':'#22c55e';
  const marker=L.circleMarker([point.lat,point.lng],{radius:7,weight:2,color:'#07151e',fillColor:color,fillOpacity:.95,down:point.down}).addTo(dpMarkers);
  marker.bindPopup('<strong>DP / splitter nivel 1</strong><div class="dp-popup">'+Array.from(point.connections.values()).map(c=>`<div><strong>${esc(c.alias||'Alias lipsă')}</strong><br>${esc(c.olt)} / ${esc(c.port)}${c.down?' <b class="down-label">DOWN</b>':''}</div>`).join('')+'</div>'+locationLinks(point.lat,point.lng),{maxWidth:360});
  const numbers=dpNumbers(Array.from(point.connections.values()).map(c=>c.alias));
  if(numbers.length)marker.bindTooltip(esc(numbers.join(', ')),{permanent:true,direction:'right',offset:[8,0],className:'dp-number-label'+(point.down?' dp-number-down':'')});
  if(point.down)redMarkers.push(marker);
 }
 if(fit&&points.size){const extent=Array.from(points.values()).map(p=>[p.lat,p.lng]);if(selectedData.location)extent.push(selectedData.location);dpMap.fitBounds(L.latLngBounds(extent),{padding:[30,30],maxZoom:16})}
 siteMarker?.bringToFront();
 $('map-count').textContent=selectedOlts.size?`${onlyDown?redMarkers.length:points.size} DP pe hartă · ${redMarkers.length} DOWN${missing?' · '+missing+' porturi fără DP SPL-1 cu coordonate':''}${downMissing?' ('+downMissing+' marcate DOWN)':''}`:'Bifează un OLT pentru a afișa DP-urile pe hartă.';
 updateBlink();
}
async function refreshCables(){
 const map=dpMap,groups=cableGroups,run=++cableRun;if(!map||!groups)return;
 const status=$('cable-status');
 try{
  if(!cableManifestPromise)cableManifestPromise=fetch(CABLE_SOURCE+'layers.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('manifest');return r.json()}).catch(e=>{cableManifestPromise=null;throw e});
  const manifest=await cableManifestPromise;if(run!==cableRun||map!==dpMap)return;
  const bounds=map.getBounds(),hits=b=>b[0]<=bounds.getEast()&&b[2]>=bounds.getWest()&&b[1]<=bounds.getNorth()&&b[3]>=bounds.getSouth();
  const wanted=[];
  if(map.getZoom()>=11){for(const layer of manifest.layers){const group=groups.get(layer.id);if(group&&map.hasLayer(group))for(const shard of layer.shards||[])if(hits(shard.bounds))wanted.push({layer,shard,key:layer.id+'/'+shard.file})}}
  const keys=new Set(wanted.map(s=>s.key));for(const [key,item] of cableVisible){if(!keys.has(key)){item.group.removeLayer(item.geo);cableVisible.delete(key)}}
  if(map.getZoom()<11){if(status)status.textContent='Mărește harta pentru a vedea cablurile FO.';return}
  if(status)status.textContent='Se încarcă cablurile din ORO…';
  let i=0;
  async function worker(){while(i<wanted.length&&run===cableRun){const item=wanted[i++];if(cableVisible.has(item.key))continue;
   const response=await fetch(CABLE_SOURCE+item.shard.file);if(!response.ok)throw Error('shard');
   const data=item.shard.file.endsWith('.gz')?JSON.parse(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text()):await response.json();
   if(run!==cableRun||map!==dpMap)return;
   const features=data.c?data.c.map((c,j)=>({type:'Feature',id:String(j),properties:c[0],geometry:{type:c[2]?'MultiLineString':'LineString',coordinates:c[1]}})):data.features;
   const geo=L.geoJSON({type:'FeatureCollection',features},{onEachFeature:(f,l)=>{l._clickTolerance=function(){return L.Polyline.prototype._clickTolerance.call(this)+(L.Browser.touch?14:6)};l.on("click",e=>{l._cableClickedAt=e.latlng});l.bindPopup(()=>cablePopup(f)+(l._cableClickedAt?locationLinks(l._cableClickedAt.lat,l._cableClickedAt.lng):""),{className:"cable-popup",maxWidth:430})},style:f=>({color:f.properties._color||({b:'#0000ff',g:'#00ff00',r:'#ff0000',c:'#35d6ff'})[f.properties._c]||item.layer.color,weight:2.5,opacity:f.properties._opacity??.9})});
   const group=groups.get(item.layer.id);geo.addTo(group);geo.eachLayer(l=>l.bringToBack());cableVisible.set(item.key,{group,geo});
  }}
  await Promise.all(Array.from({length:Math.min(4,wanted.length)},worker));
  if(run===cableRun&&map===dpMap){siteMarker?.bringToFront();if(status)status.textContent='Cabluri FO din oro.proconect.online · culori originale'}
 }catch{if(run===cableRun&&map===dpMap&&status)status.textContent='Cablurile ORO nu au putut fi încărcate. Mută harta pentru a reîncerca.'}
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
fetch('index.json?v='+DATA_VERSION,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{
 index=data.sites;renderResults();const hash=decodeURIComponent(location.hash.slice(1));const s=hash?index.find(s=>s.code===hash||s.name===hash):null;
 if(s){$('search').value=s.code||s.name;changeMode(s.code?'sites':'unknown');selectSite(s)}
}).catch(()=>$('search-count').textContent='Datele nu au putut fi încărcate. Reîncarcă pagina.');

function setMeasuring(active){
 measuring=active;$('measure').classList.toggle('active',active);$('measure').setAttribute('aria-pressed',String(active));
 dpMap.getContainer().classList.toggle('measuring',active);if(active)dpMap.closePopup();renderMeasure();
}
function renderMeasure(){
 measureLayer.clearLayers();let distance=0;
 for(let i=1;i<measurePoints.length;i++)distance+=measurePoints[i-1].distanceTo(measurePoints[i]);
 const label=distance<1000?Math.round(distance).toLocaleString('ro')+' m':(distance/1000).toLocaleString('ro',{maximumFractionDigits:2})+' km';
 if(measurePoints.length>1)L.polyline(measurePoints,{color:'#ffbd45',weight:3,dashArray:'7 5',interactive:false}).addTo(measureLayer);
 measurePoints.forEach((point,i)=>{const marker=L.circleMarker(point,{radius:5,color:'#09151e',weight:2,fillColor:'#ffbd45',fillOpacity:1,interactive:false}).addTo(measureLayer);if(i===measurePoints.length-1)marker.bindTooltip(label,{permanent:true,direction:'top',className:'ruler-label'})});
 $('undo-measure').disabled=!measurePoints.length;
 $('finish-measure').disabled=!measuring||!measurePoints.length;
 const maps=$('measure-maps');maps.hidden=!measurePoints.length;
 if(measurePoints.length){
  const coordinates=measurePoints.map(p=>p.lat+','+p.lng);
  maps.href=coordinates.length===1?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(coordinates[0]):'https://www.google.com/maps/dir/'+coordinates.map(encodeURIComponent).join('/')+'/';
 }

 $('measure-result').textContent=measurePoints.length?'Distanță totală: '+label+(measuring?' · adaugă puncte pe hartă':''):measuring?'Atinge harta pentru a selecta punctele.':'';
}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&measuring)setMeasuring(false)});
