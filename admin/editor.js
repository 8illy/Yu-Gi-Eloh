// Shared by admin/index.html (add event) and admin/events.html (edit existing event)
const MODE=document.body.dataset.mode,EDIT=MODE==='edit';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const KEY='locals-admin-draft',PH=['swiss','top16','top8','top4','finals'],RL={p1:'P1 wins',p2:'P2 wins',bye:'Bye',dl:'Double loss'};
const blank=()=>{const date=new Date().toISOString().slice(0,10);return{date,name:dayName(date),rated:true,standings:[],rounds:[]}};
let D,E=null,max0;
const lab=id=>{const u=D.users.find(u=>u.id===id);return u?`${u.name} (#${u.id})`:''};
const pid=v=>{const m=v.match(/\(#(\d+)\)\s*$/);if(m)return+m[1];const f=D.users.filter(u=>u.name.toLowerCase()===v.trim().toLowerCase());return f.length===1?f[0].id:null};
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const ev=()=>({id:E.id||`${E.date}-${slug(E.name)||'event'}`,date:E.date,name:E.name,rated:E.rated,rounds:E.rounds,standings:E.standings.map(({r,p})=>({r,p}))});
const rest=()=>EDIT?D.events.filter(e=>e.id!==E.id):D.events;
const save=()=>{if(!EDIT)localStorage.setItem(KEY,JSON.stringify({E,extra:D.users.filter(u=>u.id>max0)}))};
const set=(path,val)=>{const k=path.split('.');let o=E;for(const x of k.slice(0,-1))o=o[x];o[k.at(-1)]=val};
const load=id=>{const e=D.events.find(x=>x.id===id);return e?{rated:true,name:dayName(e.date),...structuredClone(e)}:null};

function pickInit(){const p=$('#pick');if(!p)return;
 p.innerHTML='<option value="">Choose an event</option>'+[...D.events].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<option value="${esc(e.id)}">${esc(fmtDate(e.date))} ${esc(evName(e))}</option>`).join('');
 p.onchange=()=>{E=load(p.value);render()}}

function render(){
 if(!E){$('#app').innerHTML='';return}
 $('#app').innerHTML=`<div class=card><div class=row><input type=date data-k=date value="${E.date}"><input data-k=name placeholder="Event name" value="${esc(E.name)}"><label><input type=checkbox data-k=rated ${E.rated?'checked':''}> counts towards Elo</label></div></div>
 <div class=card><h3>Final standings</h3>${E.standings.map((s,i)=>`<div class=row><input class=n type=number data-t=n data-k="standings.${i}.r" value="${s.r??''}" title=Rank><input data-t=p autocomplete=off data-k="standings.${i}.p" value="${esc(lab(s.p))}" placeholder=Player><button data-a="ds${i}">Remove</button></div>`).join('')}<button data-a=as>Add line</button></div>
 ${E.rounds.map((rd,i)=>`<div class=card><h3>Round ${i+1} <select data-k="rounds.${i}.phase">${PH.map(p=>`<option ${p==rd.phase?'selected':''}>${p}</option>`).join('')}</select> <button data-a="dr${i}">Delete round</button></h3>${rd.matches.map((m,j)=>{const k=`rounds.${i}.matches.${j}`;return`<div class=row><input data-t=p data-pool=ev autocomplete=off data-k="${k}.p1" value="${esc(lab(m.p1))}" placeholder="Player 1"><select data-k="${k}.result">${Object.entries(RL).map(([v,t])=>`<option value=${v} ${v==m.result?'selected':''}>${t}</option>`).join('')}</select>${m.result==='bye'?'':`<input data-t=p data-pool=ev autocomplete=off data-k="${k}.p2" value="${esc(lab(m.p2))}" placeholder="Player 2">`}<button data-a="dm${i}.${j}">Remove</button></div>`}).join('')}<button data-a="am${i}">Add match</button></div>`).join('')}
 <p><button data-a=ar>Add round</button></p><div class=card id=status></div>`;
 status();
}
function status(){const x=ev(),errs=validate({users:D.users,events:rest()},x);let pv='';
 if(!errs.length){const per=periodFor(D,x.date),b=derive(D,per).P,a=derive({users:D.users,events:[...rest(),x]},per).P;
  pv=`<h3>Elo after this ${EDIT?'change':'event'}</h3>`+x.standings.map(s=>`<div>${esc(a[s.p].name)}: ${Math.round(b[s.p].elo)} → <b>${Math.round(a[s.p].elo)}</b></div>`).join('')}
 $('#status').innerHTML=(errs.length?errs.map(e=>`<div class=err>${esc(e)}</div>`).join(''):'<div class=win>Ready to export</div>')+pv+`<div class=row><button data-a=sv ${errs.length?'disabled':''}>Save event</button><button data-a=ex ${errs.length?'disabled':''}>Export data.json</button><button data-a=rs>${EDIT?'Discard changes':'Reset draft'}</button></div>`}

document.addEventListener('change',e=>{const t=e.target,k=t.dataset.k;if(!k||!E)return;
 let v=t.type==='checkbox'?t.checked:t.value;
 if(t.dataset.t==='p')v=pid(v);else if(t.dataset.t==='n')v=v===''?null:+v;
 const auto=k==='date'&&(!E.name||E.name===dayName(E.date));
 set(k,v);if(auto){E.name=dayName(v);render()}
 else if(k.endsWith('.result')){if(v==='bye')set(k.replace('result','p2'),null);render()}else status();
 save()});

document.addEventListener('click',e=>{const a=e.target.dataset.a;if(!a||(!E&&a!='np'))return;
 const n=a.slice(2).split('.').map(Number),m0=()=>({p1:null,p2:null,result:'p1'});
 if(a=='as')E.standings.push({r:E.standings.length+1,p:null});
 else if(a=='ar'){const prev=E.rounds.at(-1),n=prev?prev.matches.length:Math.ceil(E.standings.length/2);E.rounds.push({phase:prev?prev.phase:'swiss',matches:Array.from({length:Math.max(1,n)},m0)})}
 else if(a.startsWith('ds'))E.standings.splice(n[0],1);
 else if(a.startsWith('dr'))E.rounds.splice(n[0],1);
 else if(a.startsWith('am'))E.rounds[n[0]].matches.push(m0());
 else if(a.startsWith('dm'))E.rounds[n[0]].matches.splice(n[1],1);
 else if(a=='np'){const name=$('#npn').value.trim();if(!name)return;const id=Math.max(0,...D.users.map(u=>u.id))+1;D.users.push({id,name,avatar:CFG.newPlayerAvatar});$('#npn').value='';saveWork(D)}
 else if(a=='rs'){E=EDIT?load(E.id):blank();if(!EDIT)localStorage.removeItem(KEY)}
 else if(a=='ex'||a=='sv'){const x=structuredClone(ev());
  D.events=EDIT?D.events.map(o=>o.id===x.id?x:o):[...D.events,x];
  if(EDIT){E=load(x.id);pickInit();$('#pick').value=x.id}else{max0=Math.max(...D.users.map(u=>u.id));E=blank();localStorage.removeItem(KEY)}
  saveWork(D);if(a=='ex')download(fmt(D))}
 render();save()});

// Autocomplete: matches name or nickname, shows only "Name (#id)"
const ac=document.createElement('div');ac.id='ac';ac.hidden=true;document.body.append(ac);
let acIn,acI=0,acL=[];
function acShow(inp){acIn=inp;const q=inp.value.toLowerCase().replace(/\s*\(#\d+\)$/,'');
 const pool=inp.dataset.pool==='ev'?D.users.filter(u=>E.standings.some(s=>s.p===u.id)):D.users;
 acL=pool.filter(u=>(u.name+' '+(u.nickname||'')).toLowerCase().includes(q)).slice(0,8);acI=0;
 const r=inp.getBoundingClientRect();ac.style.cssText=`left:${r.left+scrollX}px;top:${r.bottom+scrollY}px;min-width:${r.width}px`;
 ac.innerHTML=acL.map((u,i)=>`<div data-i=${i} class="${i?'':'on'}">${esc(lab(u.id))}</div>`).join('');ac.hidden=!acL.length}
function acPick(i){const u=acL[i];if(!u)return;acIn.value=lab(u.id);ac.hidden=true;acIn.dispatchEvent(new Event('change',{bubbles:true}))}
document.addEventListener('input',e=>e.target.dataset.t==='p'&&acShow(e.target));
document.addEventListener('focusin',e=>e.target.dataset.t==='p'&&acShow(e.target));
document.addEventListener('focusout',e=>{if(e.target.dataset.t==='p')setTimeout(()=>ac.hidden=true,150)});
ac.addEventListener('mousedown',e=>{e.preventDefault();const i=e.target.dataset.i;if(i!=null)acPick(+i)});
document.addEventListener('keydown',e=>{if(ac.hidden||e.target!==acIn)return;
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();acI=(acI+(e.key==='ArrowDown'?1:-1)+acL.length)%acL.length;[...ac.children].forEach((c,i)=>c.classList.toggle('on',i==acI))}
 else if(e.key==='Enter'){e.preventDefault();acPick(acI)}else if(e.key==='Escape')ac.hidden=true});

loadWork().then(d=>{D=d;max0=Math.max(0,...d.users.map(u=>u.id));
 if(EDIT)pickInit();else{E=blank();
  try{const s=JSON.parse(localStorage.getItem(KEY));if(s){E=s.E;s.extra.forEach(u=>D.users.some(x=>x.id===u.id)||D.users.push(u))}}catch{}}
 render()}).catch(e=>$('#app').textContent='Could not load ../data/data.json ('+e.message+'). Serve the folder over HTTP.');
