// Shared by the public site and /admin. All stats are derived from the data; nothing is stored.
const CFG={
 start:1500,pts:3, // points per win (a bye counts as a win, a loss or double loss is 0)
 K:32,kNew:48,newN:10, // players with <= newN rated games use the higher kNew
 dl:'draw', // double loss in Elo: 'skip' (no change) or 'draw' (counts as 0.5 each)
 avatar:a=>`https://images.ygoprodeck.com/images/cards_cropped/${encodeURIComponent(a)}.jpg` // avatar = YGOPRODeck card id
};
const RESULTS=['p1','p2','dl','bye'];
async function loadData(base=''){const r=await fetch(base+'data/bundle.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
// one line per user/event so git diffs stay readable
const fmt=(u,e,p=[])=>'{"periods":[\n'+p.map(x=>JSON.stringify(x)).join(',\n')+'\n],\n"users":[\n'+u.map(x=>JSON.stringify(x)).join(',\n')+'\n],\n"events":[\n'+e.map(x=>JSON.stringify(x)).join(',\n')+'\n]}\n';

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
 const pts={},events=d.events.filter(e=>inPeriod(per,e.date)).sort((a,b)=>a.date.localeCompare(b.date)),P={},matches=[];
 d.users.forEach(u=>P[u.id]={...u,elo:CFG.start,n:0,w:0,l:0,dl:0,byes:0,events:0,firsts:0,h2h:{}});
 const K=p=>p.n<CFG.newN?CFG.kNew:CFG.K;
 const upd=(a,b,sa)=>{const ex=1/(1+10**((b.elo-a.elo)/400)),ka=K(a),kb=K(b);a.elo+=ka*(sa-ex);b.elo-=kb*(sa-ex);a.n++;b.n++};
 events.forEach(e=>{
  const pt=pts[e.id]={};
  e.standings.forEach(s=>{const p=P[s.p];p.events++;pt[s.p]=0;if(s.r===1)p.firsts++});
  e.rounds.forEach((rd,i)=>rd.matches.forEach(m=>{
   const a=P[m.p1],b=P[m.p2];
   matches.push({...m,event:e.id,date:e.date,round:i+1,phase:rd.phase});
   if(m.result==='bye'){a.byes++;pt[a.id]+=CFG.pts;return}
   const h=(p,o)=>p.h2h[o]??={w:0,l:0,dl:0},ha=h(a,b.id),hb=h(b,a.id),rated=e.rated!==false;
   if(m.result==='dl'){a.dl++;b.dl++;ha.dl++;hb.dl++;if(rated&&CFG.dl==='draw')upd(a,b,.5);return}
   const[w,l,hw,hl]=m.result==='p1'?[a,b,ha,hb]:[b,a,hb,ha];
   w.w++;l.l++;hw.w++;hl.l++;pt[w.id]+=CFG.pts;
   if(rated)upd(w,l,1);
  }))});
 return{P,pts,matches,events,list:Object.values(P).filter(p=>p.events).sort((a,b)=>b.elo-a.elo)};
}
function download(txt){const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));l.download='bundle.json';l.click()}
// Ranking periods: {start, end?, name?}; no end = ongoing. per=null means all time.
const inPeriod=(p,date)=>!p||(date>=p.start&&(!p.end||date<=p.end));
const periodLabel=p=>p.name||`${p.start} to ${p.end||'present'}`;
const periodList=d=>[...(d.periods||[])].sort((a,b)=>b.start.localeCompare(a.start));
const periodFor=(d,date)=>periodList(d).find(p=>inPeriod(p,date))||null;
// Default event name from the date, e.g. "Friday Night Locals"
const dayName=date=>new Date(date+'T12:00').toLocaleDateString('en-GB',{weekday:'long'})+' Night Locals';
const evName=e=>e.name||dayName(e.date);
