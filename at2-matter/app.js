(() => {
 'use strict';
 const DATA=window.MATTERS, KEY='at2-night-matters-v1', names={ruka:'ルカ',cloche:'クローシェ',jakuri:'ジャクリ',sync:'同步话题'};
 const uiNames={ruka:'瑠珈',cloche:'克萝洁',jakuri:'蛇刳',cocona:'可可娜',sync:'同步话题'};
 const uiText=s=>s.replaceAll('クローシェ','克萝洁').replaceAll('ジャクリ','蛇刳').replaceAll('クロア','克罗亚').replaceAll('ルカ','瑠珈').replaceAll('ココナ','可可娜');
 const fields=['route','partner','status','kind','search','limited'];
 const allowed={route:['','ruka','cloche'],partner:['','ruka','cloche','jakuri','cocona'],status:['','todo','done'],kind:['','talk','rest','bath']};
 const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ids=new Set(DATA.map(r=>r.id));
 let state={version:1,checked:{},filters:{}}, storageOK=true;
 function validate(raw){
  if(!raw||raw.version!==1||!raw.checked||typeof raw.checked!=='object'||Array.isArray(raw.checked))throw Error('记录格式不正确。');
  const checked={};for(const [id,v] of Object.entries(raw.checked)){if(!ids.has(id)||typeof v!=='boolean')throw Error('存在未知话题或无效勾选值。');if(v)checked[id]=true;}
  const filters={};for(const [k,opts] of Object.entries(allowed)){const v=raw.filters?.[k]??'';if(!opts.includes(v))throw Error('筛选设置不正确。');filters[k]=v;}
  filters.search=typeof raw.filters?.search==='string'?raw.filters.search.slice(0,500):'';filters.limited=raw.filters?.limited===true;
  if(filters.partner==='ruka'||filters.partner==='cloche')filters.route=filters.partner;
  return {version:1,checked,filters};
 }
 try{const raw=localStorage.getItem(KEY);if(raw)state=validate(JSON.parse(raw));}catch(e){storageOK=false;$('save-state').textContent='无法读取保存记录，请导出备份。';}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;$('save-state').textContent='已保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}catch{storageOK=false;$('save-state').textContent='无法自动保存，请导出记录。';}}
 function loadControls(){for(const id of fields){if(id==='limited')$(id).checked=!!state.filters[id];else $(id).value=state.filters[id]||'';}}
 function currentFilters(){return Object.fromEntries(fields.map(id=>[id,id==='limited'?$(id).checked:$(id).value]));}
 const normalize=s=>s.normalize('NFKC').toLocaleLowerCase();
 function eligible(r,f){
  if(f.route&&r.route&&f.route!==r.route)return false;
  if(f.partner&&r.partner&&f.partner!==r.partner)return false;
  if(f.partner==='cocona'&&Object.values(r.requiredCS||{}).some(level=>level>=5))return false;
  return true;
 }
 function matches(r,f){
  if(!eligible(r,f))return false;
  if(f.status==='todo'&&state.checked[r.id]||f.status==='done'&&!state.checked[r.id])return false;
  if(f.kind==='talk'&&r.group==='sync'||f.kind==='rest'&&(r.group!=='sync'||r.location!=='やすむ')||f.kind==='bath'&&(r.group!=='sync'||r.location==='やすむ'))return false;
  if(f.limited&&!r.limited)return false;
  const hay=normalize([uiNames[r.group],names[r.group],r.title,r.condition,r.note,r.guideNote,r.level,r.pair,r.location].join(' '));
  return normalize(f.search||'').trim().split(/\s+/).every(word=>hay.includes(word));
 }
 function tags(r){return [r.route?`${names[r.route]}ルート`:'',r.partner?`パートナー：${names[r.partner]}`:'',''].filter(Boolean).map(t=>`<span class="tag">${esc(t)}</span>`).join('')+(r.limited?'<span class="tag limit">期限注意</span>':'');}
 function rowHTML(r){return `<tr id="${r.id}" class="${state.checked[r.id]?'done':''}"><td class="number">${String(r.no).padStart(2,'0')}</td><td><span class="title">${esc(r.title)}</span><div class="tags">${tags(r)}</div>${r.group==='sync'?`<div class="notes">${esc(r.location)}</div>`:''}</td><td><div class="condition">${esc(r.condition||'Wikiに条件の記載なし')}</div>${r.note?`<div class="notes">${esc(r.note)}</div>`:''}${r.guideNote?`<div class="supplement">${esc(r.guideNote)}</div>`:''}</td><td class="check-cell"><label><input type="checkbox" data-id="${r.id}" aria-label="${esc(names[r.group]+' '+r.no+' '+r.title+' 勾选')}" ${state.checked[r.id]?'checked':''}></label></td></tr>`;}
 function sections(){
  let nav='',html='';
  for(const group of Object.keys(names)){
   const all=DATA.filter(r=>r.group===group),keys=[...new Set(all.map(r=>r.level||r.pair))];
   nav+=`<details open><summary><a class="${group}" href="#section-${group}">${esc(uiNames[group])}</a><small class="count" id="count-${group}"></small></summary><ul>`;
   html+=`<section class="matter-section" id="section-${group}"><div class="section-heading"><h2 class="${group}">${esc(uiNames[group])}</h2><small>${group==='sync'?'同步话题':'对话话题'} · <span id="section-count-${group}">81</span> 条</small></div>`;
   keys.forEach((key,i)=>{
    const anchor=`${group}-level-${i}`;nav+=`<li><a href="#${anchor}">${esc(uiText(key))}</a></li>`;
    html+=`<div class="level" id="${anchor}" data-group="${group}" data-level="${esc(key)}"><h3>${esc(key)}<span></span></h3><div class="table-wrap"><table><thead><tr><th class="col-no" scope="col">No.</th><th class="col-title" scope="col">題名${group==='sync'?' / 場所':''}</th><th scope="col">出現条件・備考</th><th class="col-check" scope="col">確認</th></tr></thead><tbody></tbody></table></div></div>`;
   });nav+='</ul></details>';html+='</section>';
  }$('nav').innerHTML=nav;$('tables').innerHTML=html;
 }
 function render(){
  const f=currentFilters(),available=DATA.filter(r=>eligible(r,f)),visible=available.filter(r=>matches(r,f));
  for(const block of document.querySelectorAll('.level')){
   const rows=visible.filter(r=>r.group===block.dataset.group&&(r.level||r.pair)===block.dataset.level);
   block.hidden=!rows.length;block.querySelector('tbody').innerHTML=rows.map(rowHTML).join('');block.querySelector('h3 span').textContent=`${rows.filter(r=>state.checked[r.id]).length} / ${rows.length} 已勾选`;
  }
  for(const group of Object.keys(names)){
   const groupRows=available.filter(r=>r.group===group);
   $('section-'+group).hidden=!visible.some(r=>r.group===group);
   $('count-'+group).textContent=groupRows.filter(r=>state.checked[r.id]).length+' / '+groupRows.length;
   $('section-count-'+group).textContent=groupRows.length;
  }
  const done=available.filter(r=>state.checked[r.id]).length;
  $('total').textContent=done+' / '+available.length;
  $('progress').max=available.length||1;$('progress').value=done;
  $('results').textContent=`当前路线 ${available.length} 条 · 显示 ${visible.length} 条 · 其中未勾选 ${visible.filter(r=>!state.checked[r.id]).length} 条`;
  $('empty').hidden=visible.length>0;
 }
 loadControls();sections();render();
 for(const id of fields)$(id).addEventListener(id==='search'?'input':'change',()=>{
  if(id==='partner'&&['ruka','cloche'].includes($('partner').value))$('route').value=$('partner').value;
  if(id==='route'&&['ruka','cloche'].includes($('partner').value)&&$('route').value!==$('partner').value)$('partner').value='';
  state.filters=currentFilters();save();render();
 });
 $('tables').addEventListener('change',e=>{const id=e.target.dataset.id;if(!id)return;if(e.target.checked)state.checked[id]=true;else delete state.checked[id];save();render();const next=document.querySelector(`input[data-id="${id}"]`);if(next)next.focus({preventScroll:true});});
 $('clear-filters').addEventListener('click',()=>{state.filters={};loadControls();save();render();});
 $('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ar-tonelico2-checklist-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 $('import').addEventListener('click',()=>$('import-file').click());
 $('import-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('文件过大。');const imported=validate(JSON.parse(await file.text()));if(!confirm(`导入记录？这将替换当前勾选和筛选设置。\n导入：${Object.keys(imported.checked).length}条已勾选`))return;state=imported;loadControls();save();render();}catch(err){alert('导入失败：'+err.message);}finally{e.target.value='';}});
 $('reset').addEventListener('click',()=>{if(confirm('清空全部324条的勾选？请先导出需要保留的记录。')){state.checked={};save();render();}});
 window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{state=validate(JSON.parse(e.newValue));loadControls();render();$('save-state').textContent='已同步其他标签页的记录。';}catch{}});
})();
