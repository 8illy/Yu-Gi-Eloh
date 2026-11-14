// Shared by the public site and /admin. All stats are derived from the data; nothing is stored.
// Built-in fallbacks only. The real values live in data/config.json -> settings (see applySettings).
const CFG={start:1500,pts:3,K:32,kNew:48,newN:10,dl:'draw',byeAvatar:'39526584',newPlayerAvatar:'38723936',guestPrefix:'9900',avatar:a=>`https://images.ygoprodeck.com/images/cards_cropped/${encodeURIComponent(a)}.jpg`};
// Copies config.json settings into CFG
function applySettings(s={}){
 const m={startRating:'start',winPoints:'pts',kFactor:'K',kFactorProvisional:'kNew',provisionalMatches:'newN',doubleLoss:'dl',byeAvatar:'byeAvatar',newPlayerAvatar:'newPlayerAvatar',guestIdPrefix:'guestPrefix'};
 if(s.dataUrl)DATA_URL=s.dataUrl;
 for(const k in m)if(s[k]!=null)CFG[m[k]]=s[k];
 if(s.avatarUrl)CFG.avatar=a=>s.avatarUrl.replace('{id}',encodeURIComponent(a));
}
const RESULTS=['p1','p2','dl','bye'];
// Where the files live. Point DATA_URL at another host (a full https URL) to move the data elsewhere.
let DATA_URL='data/data.json';const CONFIG_URL='data/config.json';   // DATA_URL is overridden by config.json -> settings.dataUrl
const fetchText=async(base,url)=>{const r=await fetch((/^https?:/.test(url)?'':base)+url+(url.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(url+': HTTP '+r.status);return r.text()};
let CONFIG_ERROR='';   // set when config.json can't be loaded or parsed, so the pages can say so instead of silently using defaults
const loadConfig=async base=>{let c={};CONFIG_ERROR='';
 try{c=JSON.parse(await fetchText(base,CONFIG_URL))}
 catch(e){CONFIG_ERROR=`${CONFIG_URL} could not be used (${e.message}). The built-in defaults are being used instead.`;console.error(CONFIG_ERROR)}
 applySettings(c.settings);return c};
// config.json is read first because it says where the data file lives (settings.dataUrl)
async function loadData(base=''){const c=await loadConfig(base),d=await fetchText(base,DATA_URL);return resolveView(normIds({...JSON.parse(d),settings:c.settings,trophies:c.trophies}))}
// one line per user/event so git diffs stay readable
// Serialises ONLY the data file (periods, users, events); config.json is never written by the admin pages.
const fmt=(d,e=d.events)=>{const L=a=>(a||[]).map(x=>JSON.stringify(x)).join(',\n');
 return '{"periods":[\n'+L(d.periods)+'\n],\n"users":[\n'+L(d.users)+'\n],\n"events":[\n'+L(e)+'\n]'+(d.aliases&&Object.keys(d.aliases).length?',\n"aliases":{\n'+Object.entries(d.aliases).map(([k,v])=>JSON.stringify(k)+':'+JSON.stringify(v)).join(',\n')+'\n}':'')+'}\n'};

function validate(d,ev){
 const e=[],ids=new Set(d.users.map(u=>u.id)),inSt=new Set(ev.standings.map(s=>s.p));
 if(!ev.id)e.push('missing event id');
 if(d.events.some(x=>x!==ev&&x.id===ev.id))e.push('duplicate event id '+ev.id);
 if(!/^\d{4}-\d\d-\d\d$/.test(ev.date||''))e.push('pick a date');
 if(!ev.standings.length)e.push('add at least one standings line');
 ev.standings.forEach(s=>{
  if(!ids.has(s.p))e.push(s.p==null?'standings: choose a player':'standings: unknown player '+s.p);
  if(typeof s.r!=='number')e.push('standings: rank missing')});
 if(inSt.size!==ev.standings.length)e.push('a player is listed twice in standings');
 ev.rounds.forEach((rd,i)=>{const seen=new Set(),t=`Round ${i+1}: `;rd.matches.forEach(m=>{
  if(m.p1==null||(m.result==='bye')!==(m.p2==null))e.push(t+'incomplete match');
  if(m.p1!=null&&m.p1===m.p2)e.push(t+'a player is paired with themselves');
  if(!RESULTS.includes(m.result))e.push(t+'bad result');
  [m.p1,m.p2].forEach(p=>{if(p==null)return;
   if(!inSt.has(p))e.push(t+'player '+p+' is not in the standings');
   if(seen.has(p))e.push(t+'player '+p+' is paired twice');seen.add(p)})})});
 return e;
}

function derive(d,per=null){
 const pts={},mx={},events=d.events.filter(e=>inPeriod(per,e.date)).sort((a,b)=>a.date.localeCompare(b.date)),P={},matches=[];
 d.users.forEach(u=>P[u.id]={...u,elo:CFG.start,n:0,w:0,l:0,dl:0,byes:0,events:0,firsts:0,h2h:{}});
 const K=p=>p.n<CFG.newN?CFG.kNew:CFG.K;
 const upd=(a,b,sa)=>{const ex=1/(1+10**((b.elo-a.elo)/400)),da=K(a)*(sa-ex),db=-K(b)*(sa-ex);a.elo+=da;b.elo+=db;a.n++;b.n++;return[da,db]};
 events.forEach(e=>{
  const pt=pts[e.id]={};
  e.standings.forEach(s=>{const p=P[s.p];p.events++;pt[s.p]=0;if(s.r===1)p.firsts++});
  e.rounds.forEach((rd,i)=>rd.matches.forEach((m,j)=>{
   const a=P[m.p1],b=P[m.p2];
   const mo={...m,event:e.id,date:e.date,round:i+1,phase:rd.phase,j};matches.push(mo);mx[`${e.id}:${i}:${j}`]=mo;
   if(m.result==='bye'){a.byes++;pt[a.id]+=CFG.pts;return}
   const h=(p,o)=>a.guest||b.guest?{w:0,l:0,dl:0}:(p.h2h[o]??={w:0,l:0,dl:0}),ha=h(a,b.id),hb=h(b,a.id),rated=e.rated!==false;
   if(m.result==='dl'){a.dl++;b.dl++;ha.dl++;hb.dl++;if(rated&&CFG.dl==='draw')[mo.d1,mo.d2]=upd(a,b,.5);mo.r1=a.elo;mo.r2=b.elo;return}
   const[w,l,hw,hl]=m.result==='p1'?[a,b,ha,hb]:[b,a,hb,ha];
   w.w++;l.l++;hw.w++;hl.l++;pt[w.id]+=CFG.pts;
   if(rated){const[x,y]=upd(w,l,1);if(w===a){mo.d1=x;mo.d2=y}else{mo.d1=y;mo.d2=x}}mo.r1=a.elo;mo.r2=b.elo;
  }))});
 return{P,pts,matches,mx,events,list:Object.values(P).filter(p=>p.events&&!p.guest).sort((a,b)=>b.elo-a.elo)};
}
function download(txt,name='data.json'){const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));l.download=name;l.click()}
// Ranking periods: {start, end?, name?}; no end = ongoing. per=null means all time.
const inPeriod=(p,date)=>!p||(date>=p.start&&(!p.end||date<=p.end));
const periodLabel=p=>p.name||`${fmtDate(p.start)} to ${p.end?fmtDate(p.end):'present'}`;
const periodList=d=>[...(d.periods||[])].sort((a,b)=>b.start.localeCompare(a.start));
const periodFor=(d,date)=>periodList(d).find(p=>inPeriod(p,date))||null;
// Default event name from the date, e.g. "Friday Night Locals"
const dayName=date=>new Date(date+'T12:00').toLocaleDateString('en-GB',{weekday:'long'})+' Night Locals';
const evName=e=>e.name||dayName(e.date);

// Date display. Pattern comes from bundle.json settings.dateFormat (default "D MMM YY" -> 6 Nov 26).
// Tokens: YYYY YY MMMM MMM MM M DD D
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function fmtDate(iso,pat){
 const f=pat||(typeof D!=='undefined'&&D&&D.settings&&D.settings.dateFormat)||'D MMM YY';
 const[y,m,d]=iso.split('-').map(Number),M=MONTHS[m-1];
 const t={YYYY:y,YY:String(y).slice(2),MMMM:M,MMM:M.slice(0,3),MM:String(m).padStart(2,'0'),M:m,DD:String(d).padStart(2,'0'),D:d};
 return f.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g,k=>t[k]);
}

// Player ids are strings (they can have leading zeros, e.g. "0002345"). Older numeric ids are converted on load.
function normIds(d){
 const S=v=>v==null?v:String(v);
 (d.users||[]).forEach(u=>u.id=S(u.id));
 (d.events||[]).forEach(e=>{(e.standings||[]).forEach(s=>s.p=S(s.p));
  (e.rounds||[]).forEach(r=>r.matches.forEach(m=>{m.p1=S(m.p1);if(m.p2!=null)m.p2=S(m.p2)}))});
 return d;
}
// Id for a player added by hand in the admin pages: m1, m2, ... (can't clash with imported ids)
function newId(D){let n=0;D.users.forEach(u=>{const m=/^m(\d+)$/.exec(u.id);if(m)n=Math.max(n,+m[1])});return 'm'+(n+1)}

// Public view of the data. Alias accounts (data.json "aliases": {aliasId: mainId}) are merged into their main
// account. Guest accounts (id starts with settings.guestIdPrefix) become a brand-new, unranked "Guest" in every
// event they appear in, so the same guest id used on two nights is two separate players.
function canonId(d,id){const A=d.aliases||{};id=String(id);for(let n=0;A[id]!=null&&n<10;n++)id=String(A[id]);return id}
function resolveView(d){
 const A=d.aliases||{},pre=String(CFG.guestPrefix||''),isG=id=>pre&&String(id).startsWith(pre),guests=[];
 const events=d.events.map(e=>{
  const gm={};let gi=0;
  const map=id=>{if(id==null)return id;id=String(id);
   if(isG(id))return gm[id]??=(()=>{const g=`${pre}g${++gi}@${e.id}`;guests.push({id:g,name:'Guest',avatar:CFG.newPlayerAvatar,guest:true});return g})();
   return canonId(d,id)};
  const best=new Map();   // one account of the same person per event: keep the better rank
  (e.standings||[]).forEach(s=>{const p=map(s.p),o=best.get(p);if(!o||s.r<o.r)best.set(p,{...s,p})});
  const rounds=(e.rounds||[]).map(r=>({...r,matches:r.matches.map(m=>({...m,p1:map(m.p1),p2:m.p2==null?null:map(m.p2)})).filter(m=>m.p1!==m.p2)}));
  return{...e,standings:[...best.values()],rounds}});
 return{...d,users:[...d.users.filter(u=>!isG(u.id)&&A[u.id]==null),...guests],events};
}
