// Shared working copy for every admin page. Only unexported CHANGES are stored (localStorage),
// on top of the server's bundle, so storage stays small however big the bundle grows.
const WK='locals-admin-work',J=JSON.stringify;
let SRV,WD,WBASE,STALE=false,WN='';
const hash=s=>{let h=5381;for(let i=0;i<s.length;i++)h=(h*33^s.charCodeAt(i))>>>0;return h.toString(36)+s.length};

async function loadWork(){
 const[txt,cfg]=await Promise.all([fetchText('../',DATA_URL),loadConfig('../')]);
 const h=hash(txt);SRV=JSON.parse(txt);SRV.periods??=[];
 let w=null;try{w=JSON.parse(localStorage.getItem(WK))}catch{}
 WBASE=h;STALE=false;WD={...cfg,...structuredClone(SRV)};
 if(w){let pruned=false;
  // drop saved changes the server already contains (i.e. you uploaded them)
  const same=(m,list)=>{for(const id of Object.keys(m||{}))if(list.some(x=>String(x.id)===id&&J(x)===J(m[id]))){delete m[id];pruned=true}};
  same(w.events,SRV.events);same(w.users,SRV.users);
  if(w.periods&&J(w.periods)===J(SRV.periods)){delete w.periods;pruned=true}
  if(Object.keys(w.events||{}).length||Object.keys(w.users||{}).length||w.periods){
   WBASE=pruned?h:w.base;STALE=WBASE!==h;
   const ev=w.events||{},us=w.users||{};
   WD.events=SRV.events.map(e=>ev[e.id]||e).concat(Object.values(ev).filter(e=>!SRV.events.some(x=>x.id===e.id)));
   WD.users=SRV.users.map(u=>us[u.id]||u).concat(Object.values(us).filter(u=>!SRV.users.some(x=>x.id===u.id))).sort((a,b)=>a.id-b.id);
   if(w.periods)WD.periods=w.periods}}
 saveWork(WD);return WD;
}

// Call after any change to D: diffs D against the server data and stores only the differences.
function saveWork(D){
 const se=new Map(SRV.events.map(e=>[e.id,J(e)])),su=new Map(SRV.users.map(u=>[u.id,J(u)])),w={base:WBASE,events:{},users:{}};
 D.events.forEach(e=>{if(se.get(e.id)!==J(e))w.events[e.id]=e});
 D.users.forEach(u=>{if(su.get(u.id)!==J(u))w.users[u.id]=u});
 if(J(D.periods)!==J(SRV.periods))w.periods=D.periods;
 const n=[Object.keys(w.events).length,Object.keys(w.users).length],any=n[0]||n[1]||w.periods;
 WN='';try{any?localStorage.setItem(WK,J(w)):localStorage.removeItem(WK)}catch{WN='Browser storage is full, so these changes may not survive a reload. Export soon.'}
 banner(any?`${n[0]} event${n[0]==1?'':'s'}, ${n[1]} player${n[1]==1?'':'s'}${w.periods?', periods':''}`:'');
}

function banner(txt){let b=document.getElementById('work');
 if(!b){b=document.createElement('div');b.id='work';b.className='card';document.querySelector('main').prepend(b);
  b.addEventListener('click',e=>{const a=e.target.dataset.w;
   if(a=='ex')download(fmt(WD));
   else if(a=='rs'&&confirm('Discard all unexported changes?')){localStorage.removeItem(WK);location.reload()}})}
 b.hidden=!txt;
 b.innerHTML=txt?`<div class=row><span><b>Unexported changes:</b> ${txt}.</span><button data-w=ex>Export all</button><button data-w=rs>Discard changes</button></div>${STALE?'<div class=err>The server data has changed since you started these changes. Exporting will overwrite those server changes.</div>':''}${WN?`<div class=err>${WN}</div>`:''}`:'';
}
