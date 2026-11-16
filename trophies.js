// Configurable trophies. Everything is driven by data/config.json -> "trophies"; see TROPHIES.md for the full reference.
// Needs lib.js (derive, periodList, fmtDate, evName, CFG, CONFIG_ERROR) and, at call time, the page globals D (data) and SA (all-time derive).
// Public API used by index.html: calcPT() once after the data loads, then trophies(id) -> [{id, d, t, desc, svg}] (newest first).
// trophyPreviews(config.trophies) is used by trophy-gallery.html.

const T_ESC=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const T_tpl=(s,v)=>String(s).replace(/\{(\w+)\}/g,(_,k)=>v&&v[k]!=null?v[k]:'');   // "{value}" style templates
const T_COL=v=>{v=String(v==null?'':v).trim();return/^(#[0-9a-f]{3,8}|[a-z]{3,24}|(rgb|hsl)a?\([\d\s.,%/-]+\))$/i.test(v)?v:null};
const T_PATH=/^[\dMmLlHhVvCcSsQqTtAaZz\s,.eE+-]+$/;
const T_list=o=>Object.keys(o).join(', ');

// ---------- built-in palettes and ribbon colours (config.json can add to or override these) ----------
const T_PALETTES={
 gold:{highlight:'#fff1a8',base:'#e0b13a',shadow:'#8a6410',ink:'#4a3200'},
 silver:{highlight:'#ffffff',base:'#b9c0cf',shadow:'#6b7388',ink:'#2e3546'},
 bronze:{highlight:'#f6c9a0',base:'#c07a48',shadow:'#6b3a1a',ink:'#3a1e0a'},
 platinum:{highlight:'#f4fbff',base:'#9fd3e6',shadow:'#456f80',ink:'#173540'},
 ruby:{highlight:'#ffc2cb',base:'#d1324e',shadow:'#6e1226',ink:'#3a0612'}};
const T_RIBS={
 rank:{left:'#4aa3cf',right:'#2f7ea8'},most:{left:'#d9556a',right:'#a8364a'},match:{left:'#4cbf86',right:'#2f8f62'},
 event:{left:'#9b6bd6',right:'#6e43a8'},mostmatch:{left:'#f08a3c',right:'#c4621c'},elo:{left:'#2fb8b0',right:'#1f8a84'},beat:{left:'#792dc1',right:'#5a1f94'}};
const T_RIBDEF={design:'split',left:'#8a94a6',right:'#5f6878'};

function T_palObj(p){
 if(!p||typeof p!=='object')throw Error('a palette must be an object like {"base":"#e0b13a",...}');
 const b=T_COL(p.base);if(!b)throw Error('a palette needs a valid "base" colour');
 return{base:b,highlight:T_COL(p.highlight)||b,shadow:T_COL(p.shadow)||b,ink:T_COL(p.ink)||T_COL(p.shadow)||b}}

// Strips anything executable from SVG that comes from config.json (custom icons)
function T_clean(s){
 s=String(s).replace(/<\s*(script|foreignObject|iframe|object|embed|style)\b[\s\S]*?(<\/\s*\1\s*>|$)/gi,'').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/javascript:/gi,'');
 if(typeof document==='undefined')return s;
 const t=document.createElement('template');t.innerHTML='<svg>'+s+'</svg>';
 t.content.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{const n=a.name.toLowerCase();
  if(n.startsWith('on')||((n==='href'||n==='xlink:href')&&!/^#/.test(a.value.trim())))el.removeAttribute(a.name)}));
 return t.content.firstChild.innerHTML}

// ---------- shapes: c -> {svg, face:{cx,cy,r} (where an inner image goes), bare?} ----------
const T_oct=r=>[...Array(8)].map((_,i)=>{const a=(i*45+22.5)*Math.PI/180;return(50+r*Math.cos(a)).toFixed(1)+','+(86+r*Math.sin(a)).toFixed(1)}).join(' ');
const T_seal=[...Array(32)].map((_,i)=>{const a=i*Math.PI/16,r=i%2?39:45;return(50+r*Math.cos(a)).toFixed(1)+','+(86+r*Math.sin(a)).toFixed(1)}).join(' ');
const T_two=(o,i)=>c=>({svg:`<path d="${o}" ${c.fo}/><path d="${i}" ${c.fi}/>`});
const T_SHAPES={
 circle:c=>({svg:`<circle cx="50" cy="86" r="44" ${c.fo}/><circle cx="50" cy="86" r="38.5" fill="none" stroke="${c.d}" stroke-width="3" stroke-dasharray="2 3.6" opacity=".7"/><circle cx="50" cy="86" r="32" ${c.fi}/>`,face:{cx:50,cy:86,r:29}}),
 ring:c=>({svg:`<circle cx="50" cy="86" r="44" ${c.fo}/>`,face:{cx:50,cy:86,r:31},bare:true}),
 shield:c=>({svg:`<path d="M50 42L88 53V88C88 111 70 123 50 131 30 123 12 111 12 88V53Z" ${c.fo}/><path d="M50 50L81 59V88C81 106 66 116 50 123 34 116 19 106 19 88V59Z" ${c.fi}/>`,face:{cx:50,cy:90,r:25}}),
 hexagon:c=>({svg:`<path d="M50 41L88 63V107L50 129 12 107V63Z" ${c.fo}/><path d="M50 49L81 67V103L50 121 19 103V67Z" ${c.fi}/>`,face:{cx:50,cy:85,r:27}}),
 octagon:c=>({svg:`<polygon points="${T_oct(46)}" ${c.fo} stroke-linejoin="round"/><polygon points="${T_oct(37)}" ${c.fi}/>`,face:{cx:50,cy:86,r:31}}),
 seal:c=>({svg:`<polygon points="${T_seal}" ${c.fo} stroke-linejoin="round"/><circle cx="50" cy="86" r="31" ${c.fi}/>`,face:{cx:50,cy:86,r:28}})};
// a custom shape from config: {"outer":"<svg path>","inner":"<svg path>","face":{"cx":50,"cy":86,"r":28}}
function T_customShape(o){
 if(!o||typeof o.outer!=='string'||!T_PATH.test(o.outer))throw Error('a custom shape needs "outer" as an SVG path string');
 if(o.inner!=null&&(typeof o.inner!=='string'||!T_PATH.test(o.inner)))throw Error('shape "inner" must be an SVG path string');
 const f={cx:50,cy:86,r:28,...(o.face||{})};
 return c=>({svg:`<path d="${o.outer}" ${c.fo}/>`+(o.inner?`<path d="${o.inner}" ${c.fi}/>`:''),face:f})}

// ---------- icons (drawn in the palette's "ink" colour, in a 100x134 box, centred around 50,86) ----------
const T_leaf=(c,f,sg)=>{const x=(50+sg*27*Math.sin(f*Math.PI/180)).toFixed(1),y=(86-27*Math.cos(f*Math.PI/180)).toFixed(1);
 return`<ellipse cx="${x}" cy="${y}" rx="6.5" ry="2.8" fill="${c.t}" opacity=".8" transform="rotate(${sg*f} ${x} ${y})"/>`};
const T_card=(c,a)=>`<g transform="rotate(${a} 50 100)"><rect x="40" y="66" width="20" height="28" rx="3" fill="${c.l}" stroke="${c.t}" stroke-width="2"/><ellipse cx="50" cy="78" rx="5" ry="6.5" fill="${c.t}" opacity=".55"/></g>`;
const T_star=[...Array(10)].map((_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?9:21;return(50+r*Math.cos(a)).toFixed(1)+','+(82+r*Math.sin(a)).toFixed(1)}).join(' ');
const T_ICONS={
 laurel:c=>[0,1,2,3,4,5].map(i=>T_leaf(c,32+i*27,-1)+T_leaf(c,32+i*27,1)).join(''),
 star:c=>`<polygon points="${T_star}" fill="${c.t}"/>`,
 arrow:c=>`<polyline points="30,98 44,82 54,90 70,66" fill="none" stroke="${c.t}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polygon points="77,55 75.8,69.9 64.2,62.1" fill="${c.t}"/>`,
 swords:c=>`<g stroke="${c.t}" stroke-linecap="round" fill="none"><path d="M36 64L64 98M64 64L36 98" stroke-width="5"/><path d="M51.6 94.5L62.4 85.5M48.4 94.5L37.6 85.5" stroke-width="4"/></g><circle cx="64" cy="98" r="3.5" fill="${c.t}"/><circle cx="36" cy="98" r="3.5" fill="${c.t}"/>`,
 arrowdown:c=>`<polyline points="30,66 44,82 54,74 70,98" fill="none" stroke="${c.t}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><polygon points="77,109 75.8,94.1 64.2,101.9" fill="${c.t}"/>`,
 cards:c=>T_card(c,-24)+T_card(c,0)+T_card(c,24),
 cup:c=>`<path d="M37 60h26v12c0 9-5.5 15-13 15s-13-6-13-15z" fill="${c.t}"/><path d="M37 64c-8 0-9 10 0 12M63 64c8 0 9 10 0 12" fill="none" stroke="${c.t}" stroke-width="3"/><rect x="47" y="87" width="6" height="7" fill="${c.t}"/><rect x="40" y="94" width="20" height="5" rx="2" fill="${c.t}"/>`,
 crown:c=>`<path d="M32 92L30 64L42 76L50 60L58 76L70 64L68 92Z" fill="${c.t}"/><rect x="32" y="94" width="36" height="5" rx="2" fill="${c.t}"/>`,
 bolt:c=>`<polygon points="55,56 38,84 49,84 45,102 63,72 52,72" fill="${c.t}"/>`,
 heart:c=>`<path d="M50 98C28 82 32 62 44 64C48 65 50 69 50 72C50 69 52 65 56 64C68 62 72 82 50 98Z" fill="${c.t}"/>`};

// ---------- ribbons ----------
const T_SHINE='<path d="M33 0l10 52M67 0L57 52" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none"/>';
const T_split=r=>`<path d="M27 0h18l11 52H38z" fill="${r.left}"/><path d="M73 0H55L44 52h18z" fill="${r.right}"/>`;
const T_RIB={
 split:r=>T_split(r)+(r.shine===false?'':T_SHINE),
 solid:r=>{const a=r.color||r.left,b=r.color||r.right;return`<path d="M27 0h18l11 52H38z" fill="${a}"/><path d="M73 0H55L44 52h18z" fill="${b}"${r.color?' opacity=".8"':''}/>`+(r.shine===false?'':T_SHINE)},
 striped:r=>T_split(r)+`<path d="M36 0L47 52M64 0L53 52" stroke="${r.accent||'#fff'}" stroke-width="3" fill="none"/>`+(r.shine===false?'':T_SHINE),
 none:()=>''};

// ---------- layers: what is drawn on the medal face ----------
const T_txt=(y,sz,col,v)=>`<text x="50" y="${y}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${sz}" fill="${col}">${T_ESC(v)}</text>`;
const T_plate=(c,v)=>`<rect x="27" y="104" width="46" height="18" rx="5" fill="${c.d}" stroke="${c.l}" stroke-width="1.5"/>`+T_txt(117,v.length>3?10:13,c.l,v);
const T_src=(L,c)=>{const s=L.card!=null?CFG.avatar(L.card):c.tpl(L.src||'');return s&&!/^\s*(javascript|vbscript|data:(?!image\/))/i.test(s)?s:''};
const T_LAYER={
 icon:(L,c)=>L.fn(c),
 text:(L,c)=>{const v=c.tpl(L.text==null?'{value}':L.text);return T_txt(L.y??96,L.size||(v.length>2?22:30),c.col(L.color),v)},
 image:(L,c,sh)=>{const f=sh.face,r=L.r||f.r,src=T_src(L,c);if(!src)return'';const id=c.id+'c';
  return`<circle cx="${f.cx}" cy="${f.cy}" r="${r+3}" fill="${c.d}"/><clipPath id="${id}"><circle cx="${f.cx}" cy="${f.cy}" r="${r}"/></clipPath><image href="${T_ESC(src)}" x="${f.cx-r}" y="${f.cy-r}" width="${2*r}" height="${2*r}" preserveAspectRatio="xMidYMid ${L.fit==='contain'?'meet':'slice'}" clip-path="url(#${id})"/>`},
 svg:(L,c)=>`<g transform="translate(${+L.x||0} ${+L.y||0}) scale(${+L.scale||1})">${L.markup.replace(/\{(ink|highlight|base|shadow)\}/g,(_,k)=>c.pc[k])}</g>`};

// ---------- looks ----------
// Resolves everything a look needs once, at load time, so mistakes in config.json are reported (and the trophy skipped) up front.
function T_chkPal(p,TR){if(typeof p==='string'){if(!TR.pal[p])throw Error(`unknown palette "${p}" (available: ${T_list(TR.pal)})`)}else T_palObj(p)}
function T_prepLook(def,TR){
 let lk={...(def.look||{})};
 if(lk.style!=null){const s=TR.sty[lk.style];if(!s)throw Error(`unknown style "${lk.style}"`);
  const rb=s.ribbon&&typeof s.ribbon==='object'&&lk.ribbon&&typeof lk.ribbon==='object'?{...s.ribbon,...lk.ribbon}:null;lk={...s,...lk};if(rb)lk.ribbon=rb}
 const sh=lk.shape==null?'circle':lk.shape;let shapeFn;
 if(typeof sh==='string'){shapeFn=T_SHAPES[sh]||(TR.shp[sh]&&T_customShape(TR.shp[sh]));if(!shapeFn)throw Error(`unknown shape "${sh}" (available: ${T_list({...T_SHAPES,...TR.shp})})`)}
 else shapeFn=T_customShape(sh);
 const layers=[].concat(lk.inner==null?[]:lk.inner).map(L=>{
  if(typeof L==='string')L={type:'icon',name:L};
  if(!L||!T_LAYER[L.type])throw Error(`inner layers need a "type" of ${T_list(T_LAYER)}`);L={...L};
  if(L.type==='icon'){L.fn=T_ICONS[L.name]||(TR.ico[L.name]!=null&&(m=>{const s=T_clean(TR.ico[L.name]);return s.replace(/\{(ink|highlight|base|shadow)\}/g,(_,k)=>m.pc[k])}));
   if(!L.fn)throw Error(`unknown icon "${L.name}" (available: ${T_list({...T_ICONS,...TR.ico})})`)}
  if(L.type==='image'&&L.src==null&&L.card==null)throw Error('an image layer needs "src" or "card"');
  if(L.type==='svg'){if(typeof L.svg!=='string')throw Error('an svg layer needs "svg"');L.markup=T_clean(L.svg)}
  if(L.type==='text'&&L.color!=null&&!['ink','highlight','base','shadow'].includes(L.color)&&!T_COL(L.color))throw Error(`bad text colour "${L.color}"`);
  return L});
 let rb=lk.ribbon;if(typeof rb==='string'){if(TR.rib[rb])rb=TR.rib[rb];else if(T_RIB[rb])rb={design:rb};   // a name from "ribbons", or just a design name such as "none"
  else throw Error(`unknown ribbon "${rb}" (available: ${T_list({...TR.rib,...T_RIB})})`)}
 rb={...T_RIBDEF,...(rb||{})};
 if(!T_RIB[rb.design])throw Error(`unknown ribbon design "${rb.design}" (available: ${T_list(T_RIB)})`);
 ['left','right','color','accent'].forEach(k=>{if(rb[k]!=null){if(!T_COL(rb[k]))throw Error(`bad ribbon colour "${rb[k]}"`);rb[k]=T_COL(rb[k])}});
 let tiers=lk.tiers;
 if(tiers!=null){if(!Array.isArray(tiers)||!tiers.length)throw Error('"tiers" must be a non-empty list');
  if(typeof tiers[0]==='object'){tiers=tiers.map(x=>{if(!x||!Number.isFinite(x.at))throw Error('each tier needs "at" and "palette"');return x}).sort((a,b)=>a.at-b.at)}}
 [].concat(lk.palette==null?[]:lk.palette).concat((tiers||[]).map(x=>typeof x==='object'&&x&&'palette' in x?x.palette:x)).forEach(p=>T_chkPal(p,TR));
 return{shapeFn,layers,rb,tiers,palette:lk.palette,plate:lk.plate===true?'{value}':lk.plate||null,gloss:lk.gloss!==false,size:+lk.size>0?+lk.size:100}}

function T_pick(look,TR,hit){
 const P=x=>typeof x==='string'?TR.pal[x]:T_palObj(x);
 if(hit.palette!=null)return P(hit.palette);
 const t=look.tiers;
 if(t){if(typeof t[0]==='object'){let s=t[0];t.forEach(x=>{if(hit.num>=x.at)s=x});return P(s.palette)}
  return P(t[Math.min(t.length-1,Math.floor(hit.idx*t.length/hit.n))])}
 const pa=look.palette;
 return P(Array.isArray(pa)?pa[Math.min(hit.idx,pa.length-1)]:pa==null?'gold':pa)}

let T_UID=0;
function T_medal(look,TR,hit){
 const pc=T_pick(look,TR,hit),l=pc.highlight,m=pc.base,d=pc.shadow,t=pc.ink,id='tg'+(++T_UID),
  grad=(n,a,b)=>`<linearGradient id="${id}${n}" x1="${a}" y1="${a}" x2="${b}" y2="${b}"><stop offset="0" stop-color="${l}"/><stop offset=".5" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></linearGradient>`,
  c={id,l,m,d,t,pc,fo:`fill="url(#${id})" stroke="${d}" stroke-width="1.5"`,fi:`fill="url(#${id}r)" stroke="${d}" stroke-width="1"`,
   tpl:s=>T_tpl(s,hit.vars),col:k=>({ink:t,highlight:l,base:m,shadow:d})[k]||T_COL(k)||t},
  sh=look.shapeFn(c),w=look.size,
  bare=sh.bare&&!look.layers.some(L=>L.type==='image')?`<circle cx="50" cy="86" r="34" ${c.fi}/>`:'';
 return`<svg viewBox="0 0 100 134" width="${w}" height="${Math.round(w*1.34)}" aria-hidden="true"><defs>${grad('',0,1)}${grad('r',1,0)}</defs>`+
  T_RIB[look.rb.design](look.rb)+sh.svg+bare+look.layers.map(L=>T_LAYER[L.type](L,c,sh)).join('')+
  (look.plate?T_plate(c,c.tpl(look.plate)):'')+
  (look.gloss?'<ellipse cx="36" cy="62" rx="15" ry="7" fill="#fff" opacity=".2" transform="rotate(-30 36 62)"/>':'')+'</svg>'}

// ---------- stats ----------
const T_LABEL={matchWins:'Match wins',matches:'Matches played',byes:'Byes',events:'Events played',eventWins:'Event wins',podiums:'Podium finishes',winStreak:'Win streak',loseStreak:'Loss streak',eventWinStreak:'Event win streak',eloGain:'Elo gained in one event',eloLoss:'Elo lost in one event',elo:'Elo'};
// Net Elo change per event for one player, oldest first: [{id, d, delta}] (events that were not rated are left out)
const T_evElo=(id,X)=>X.once('evElo|'+id,()=>{const m=new Map();
 X.EP.forEach(L=>L.forEach(x=>{const c=x.p1===id?x.d1:x.p2===id?x.d2:undefined;if(c==null)return;const e=m.get(x.event)||{id:x.event,d:x.date,delta:0};e.delta+=c;m.set(x.event,e)}));
 return[...m.values()].map(e=>({...e,delta:Math.round(e.delta)})).sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0)});
const T_cnt=a=>a.map((d,i)=>({d,v:i+1}));
const T_won=(m,id)=>(m.result==='p1'&&m.p1===id)||(m.result==='p2'&&m.p2===id);
// Series stats: a chronological list of {d: date, v: value reached}. A milestone level is reached on the first date v >= level.
const T_STAT={
 matchWins:(id,X)=>T_cnt(X.SA.matches.filter(m=>T_won(m,id)).map(m=>m.date)),
 matches:(id,X)=>T_cnt(X.SA.matches.filter(m=>m.result!=='bye'&&(m.p1===id||m.p2===id)).map(m=>m.date)),
 byes:(id,X)=>T_cnt(X.SA.matches.filter(m=>m.result==='bye'&&m.p1===id).map(m=>m.date)),
 events:(id,X)=>T_cnt(X.SA.events.filter(e=>e.standings.some(s=>s.p===id)).map(e=>e.date)),
 eventWins:(id,X)=>T_cnt(X.SA.events.filter(e=>e.standings.some(s=>s.p===id&&s.r===1)).map(e=>e.date)),
 podiums:(id,X)=>T_cnt(X.SA.events.filter(e=>e.standings.some(s=>s.p===id&&s.r<=3)).map(e=>e.date)),
 winStreak:(id,X)=>{let s=0;const o=[];X.SA.matches.forEach(m=>{if(m.result==='bye'||(m.p1!==id&&m.p2!==id))return;if(T_won(m,id)){s++;o.push({d:m.date,v:s})}else s=0});return o},
 // consecutive match losses; byes are ignored (they neither add to nor break it). A double loss counts as a loss for both players.
 loseStreak:(id,X)=>{let s=0;const o=[];X.SA.matches.forEach(m=>{if(m.result==='bye'||(m.p1!==id&&m.p2!==id))return;if(T_won(m,id))s=0;else{s++;o.push({d:m.date,v:s})}});return o},
 // consecutive events won, counting only events the player took part in (missing an event does not break it; any other placing does)
 eventWinStreak:(id,X)=>{let s=0;const o=[];X.SA.events.forEach(e=>{const st=e.standings.find(x=>x.p===id);if(!st)return;if(st.r===1){s++;o.push({d:e.date,v:s})}else s=0});return o},
 // biggest Elo gained / lost across the matches of ONE event (Elo as calculated within its format)
 eloGain:(id,X)=>T_evElo(id,X).map(e=>({d:e.d,v:e.delta})),
 eloLoss:(id,X)=>T_evElo(id,X).map(e=>({d:e.d,v:-e.delta})),
 // highest rating reached in any single format (the rating after each match)
 elo:(id,X)=>X.EP.flatMap(L=>L.flatMap(m=>{const r=m.p1===id?m.r1:m.p2===id?m.r2:null;return r==null?[]:[{d:m.date,v:Math.round(r)}]})).sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0)};
// Per-format stats, for "most X in a format" trophies
const T_LSTAT={eventWins:p=>p.firsts,matchWins:p=>p.w,events:p=>p.events,matches:p=>p.w+p.l+p.dl,byes:p=>p.byes,elo:p=>Math.round(p.elo)};

// ---------- earn types: prep(earn) validates, run(earn, playerId, X) -> hits [{d, idx, n, value, vars, num?, palette?, title?}] ----------
const T_EARN={
 periodRank:{   // finished in the top places of a finished format (ranking period)
  prep:e=>{const r=e.ranks||(e.top?Array.from({length:e.top},(_,i)=>i+1):[1,2,3]);
   if(!Array.isArray(r)||!r.every(n=>Number.isInteger(n)&&n>0))throw Error('earn.ranks must be a list of whole numbers, e.g. [1,2,3] (or use "top": 3)');return{...e,ranks:r}},
  run:(e,id,X)=>X.PT.flatMap(({p,rk})=>{const r=rk[id];if(!e.ranks.includes(r))return[];const v={rank:r,format:pname(p)};
   return[{d:p.end,idx:r-1,n:e.ranks.length,value:T_tpl(e.value||'#{rank}',v),vars:v}]})},
 periodLeader:{   // had the most of a stat in a finished format (ties share it)
  prep:e=>{if(!T_LSTAT[e.stat])throw Error(`earn.stat must be one of: ${T_list(T_LSTAT)}`);return{...e,min:Math.max(1,+e.min||1)}},
  run:(e,id,X)=>X.PT.flatMap(({p,L})=>{const f=T_LSTAT[e.stat],q=L.find(x=>x.id===id);if(!q)return[];const mx=Math.max(0,...L.map(f));
   if(mx<e.min||f(q)!==mx)return[];const v={format:pname(p),amount:mx,stat:T_LABEL[e.stat]};return[{d:p.end,idx:0,n:1,value:T_tpl(e.value||'#1',v),vars:v}]})},
 milestone:{   // reached a level of a stat, all time
  prep:e=>{if(!T_STAT[e.stat])throw Error(`earn.stat must be one of: ${T_list(T_STAT)}`);
   if(!Array.isArray(e.levels)||!e.levels.length)throw Error('earn.levels must be a non-empty list, e.g. [1,10,50]');
   const lv=e.levels.map(x=>typeof x==='number'?{at:x}:x);if(!lv.every(x=>x&&Number.isFinite(x.at)))throw Error('each level must be a number or {"at":number,...}');
   return{...e,levels:lv.sort((a,b)=>a.at-b.at),show:e.show==='all'?'all':'best'}},
  run:(e,id,X)=>{const s=X.series(e.stat,id),hits=[];
   e.levels.forEach((L,i)=>{const x=s.find(x=>x.v>=L.at);if(!x)return;const val=String(L.value??L.at);
    hits.push({d:x.d,idx:i,n:e.levels.length,num:L.at,value:val,palette:L.palette,title:L.title,vars:{stat:T_LABEL[e.stat],level:i+1}})});
   return e.show==='all'?hits:hits.slice(-1)}},
 beat:{   // beat a specific player at least once
  prep:e=>{const ps=e.players||(e.player!=null?[e.player]:null);if(!ps||!ps.length)throw Error('earn needs "player" (or "players")');return{...e,players:ps.map(String)}},
  run:(e,id,X)=>e.players.flatMap((bp,i)=>{if(bp===id)return[];
   const w=X.SA.matches.find(m=>(m.result==='p1'&&m.p1===id&&m.p2===bp)||(m.result==='p2'&&m.p2===id&&m.p1===bp));if(!w)return[];
   const o=X.SA.P[bp],v={player:o?o.name:'#'+bp,avatar:o&&o.avatar!=null?CFG.avatar(o.avatar):''};
   return[{d:w.date,idx:i,n:e.players.length,value:T_tpl(e.value||'',v),vars:v}]})},
 eventResult:{   // a result at a single event: placing, unbeaten, minimum wins, minimum field size
  prep:e=>{['rank','maxRank','minPlayers','minWins','minEloGain','minEloLoss'].forEach(k=>{if(e[k]!=null&&!Number.isFinite(e[k]))throw Error(`earn.${k} must be a number`)});
   if(e.rank==null&&e.maxRank==null&&e.minPlayers==null&&e.minWins==null&&e.minEloGain==null&&e.minEloLoss==null&&!e.unbeaten)throw Error('eventResult needs at least one of: rank, maxRank, minPlayers, minWins, unbeaten, minEloGain, minEloLoss');
   return{...e,show:e.show==='all'?'all':'first'}},
  run:(e,id,X)=>{const ok=[];
   X.SA.events.forEach(ev=>{const s=ev.standings.find(s=>s.p===id);if(!s)return;
    if(e.rank!=null&&s.r!==e.rank)return;if(e.maxRank!=null&&s.r>e.maxRank)return;if(e.minPlayers!=null&&ev.standings.length<e.minPlayers)return;
    const ch=(X.evElo(id).find(x=>x.id===ev.id)||{}).delta;
    if(e.minEloGain!=null&&!(ch>=e.minEloGain))return;if(e.minEloLoss!=null&&!(-ch>=e.minEloLoss))return;
    if(e.unbeaten||e.minWins!=null){const ms=X.SA.matches.filter(m=>m.event===ev.id&&m.result!=='bye'&&(m.p1===id||m.p2===id)),w=ms.filter(m=>T_won(m,id)).length;
     if(e.unbeaten&&w<ms.length)return;if(w<(e.minWins??1))return}
    ok.push({ev,ch})});
   const mk=({ev,ch})=>({d:ev.date,idx:0,n:1,value:T_tpl(e.value||'',{}),vars:{event:evName(ev),count:ok.length,change:ch==null?'':(ch>0?'+':'')+ch}});
   return e.show==='all'?ok.map(mk):ok.slice(0,1).map(mk)}}};

// ---------- loading config ----------
// Trophies written with the old keys (matchWinMilestones, eventWinMilestones, eloMilestones, beatMedals, medalColors, ribbonColors)
// are turned into definitions here, so an older config.json keeps working and looks the same.
function T_legacy(T){
 const L=(a,d)=>Array.isArray(a)&&a.length?a:d,
  ms=(id,title,stat,lv,shape,icon,rib)=>({id,title,earn:{type:'milestone',stat,levels:lv},look:{shape,tiers:['bronze','silver','gold'],inner:{type:'icon',name:icon},plate:'{value}',ribbon:rib}}),out=[];
 out.push({id:'format-rank',title:'#{rank} {format}',earn:{type:'periodRank',ranks:[1,2,3]},look:{shape:'circle',palette:['gold','silver','bronze'],inner:[{type:'icon',name:'laurel'},{type:'text',text:'{value}'}],ribbon:'rank'}});
 out.push({id:'format-event-wins',title:'Most event wins {format}',earn:{type:'periodLeader',stat:'eventWins'},look:{shape:'shield',palette:'gold',inner:{type:'icon',name:'star'},plate:'{value}',ribbon:'most'}});
 out.push({id:'format-match-wins',title:'Most match wins {format}',earn:{type:'periodLeader',stat:'matchWins'},look:{shape:'seal',palette:'gold',inner:{type:'icon',name:'swords'},plate:'{value}',ribbon:'mostmatch'}});
 out.push(ms('match-wins','Match wins [{value}]','matchWins',L(T.matchWinMilestones,[1,10,50,100,250,500]),'circle','cards','match'));
 out.push(ms('event-wins','Event wins [{value}]','eventWins',L(T.eventWinMilestones,[1,5,10,25,50,100]),'hexagon','cup','event'));
 (T.beatMedals||[]).forEach(b=>out.push({id:'beat-'+b.player,title:'Beat {player}',earn:{type:'beat',player:b.player},look:{shape:'ring',palette:'gold',inner:{type:'image',src:b.image||'{avatar}'},ribbon:'beat'}}));
 if(Array.isArray(T.eloMilestones)&&T.eloMilestones.length)out.push(ms('elo','Reached {value} Elo','elo',T.eloMilestones,'octagon','arrow','elo'));
 return out}

function T_norm(T){
 const errs=[],pal={};
 Object.entries({...T_PALETTES,...(T.medalColors||{}),...(T.palettes||{})}).forEach(([k,v])=>{try{pal[k]=T_palObj(v)}catch(e){errs.push(`palette "${k}": ${e.message}`)}});
 const TR={pal,rib:{...T_RIBS,...(T.ribbonColors||{}),...(T.ribbons||{})},sty:T.styles||{},shp:T.shapes||{},ico:T.icons||{},defs:[]},
  raw=Array.isArray(T.defs)?T.defs:T_legacy(T),ids=new Set();
 raw.forEach((d,i)=>{const name=`defs[${i}]${d&&d.id!=null?` "${d.id}"`:''}`;
  try{if(!d||typeof d!=='object')throw Error('must be an object');if(d.enabled===false)return;
   const id=String(d.id??'trophy'+(i+1));if(ids.has(id))throw Error('duplicate id');ids.add(id);
   const E=T_EARN[d.earn&&d.earn.type];if(!E)throw Error(`earn.type must be one of: ${T_list(T_EARN)}`);
   const earn=E.prep(d.earn),look=T_prepLook(d,TR);
   (earn.levels||[]).forEach(L=>{if(L.palette!=null)T_chkPal(L.palette,TR)});
   TR.defs.push({id,title:d.title??id,description:d.description,earn,look})}
  catch(e){errs.push(`${name}: ${e.message}`)}});
 if(errs.length){const m='config.json trophies: '+errs.join('; ')+'. Those items were skipped.';console.error(m);CONFIG_ERROR+=(CONFIG_ERROR?' ':'')+m}
 return TR}

// ---------- runtime ----------
// Trophies are all-time achievements, independent of the selected period
let TR=null,PT=[],EP=[];
const pname=p=>p.name||new Date(p.end+'T12:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
function calcPT(){
 TR=D.trophies?T_norm(D.trophies):null;
 const per=periodList(D),today=new Date().toISOString().slice(0,10);
 EP=per.length?per.map(p=>derive(D,p).matches):[SA.matches];
 PT=per.filter(p=>p.end&&p.end<today).map(p=>{const L=derive(D,p).list;
  return{p,L,rk:Object.fromEntries(L.map(x=>[x.id,1+L.filter(y=>Math.round(y.elo)>Math.round(x.elo)).length]))}})}
function trophies(id){
 if(!TR)return[];
 const memo={},X={SA,EP,PT,once:(k,f)=>memo[k]??=f(),evElo:i=>T_evElo(i,X),series:(s,i)=>X.once(s+'|'+i,()=>T_STAT[s](i,X))},out=[];
 TR.defs.forEach(def=>{let hits;
  try{hits=T_EARN[def.earn.type].run(def.earn,id,X)}catch(e){console.error('trophy '+def.id,e);return}
  hits.forEach(h=>{const v={...h.vars,value:h.value,date:fmtDate(h.d)};
   try{out.push({id:def.id,d:h.d,t:T_tpl(h.title||def.title,v),desc:T_tpl(def.description||'',v),svg:T_medal(def.look,TR,{...h,vars:v})})}
   catch(e){console.error('trophy '+def.id,e)}})});
 return out.sort((a,b)=>b.d.localeCompare(a.d))}

// For trophy-gallery.html: every definition drawn at each of its levels, without needing any match data
function trophyPreviews(cfg){
 const TR=T_norm(cfg||{}),ph='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 62"><rect width="62" height="62" fill="#46506a"/><circle cx="31" cy="24" r="10" fill="#8e9ab8"/><path d="M10 62c2-16 12-22 21-22s19 6 21 22z" fill="#8e9ab8"/></svg>'),
  mk=(def,h)=>{const v={player:'Player',avatar:ph,format:'Season 1',event:'Friday Night Locals',stat:'',...h.vars,value:h.value||'',date:'1 Jan 26'};
  return{title:T_tpl(h.title||def.title,v),svg:T_medal(def.look,TR,{...h,vars:v})}};
 return TR.defs.map(def=>{const e=def.earn,H=[];
  if(e.type==='periodRank')e.ranks.forEach(r=>H.push({idx:r-1,n:e.ranks.length,value:T_tpl(e.value||'#{rank}',{rank:r}),vars:{rank:r}}));
  else if(e.type==='milestone')e.levels.forEach((L,i)=>H.push({idx:i,n:e.levels.length,num:L.at,value:String(L.value??L.at),palette:L.palette,title:L.title,vars:{level:i+1}}));
  else if(e.type==='beat')e.players.forEach((p,i)=>H.push({idx:i,n:e.players.length,value:e.value||'',vars:{player:'#'+p}}));
  else H.push({idx:0,n:1,value:e.type==='periodLeader'?T_tpl(e.value||'#1',{}):e.value||'',vars:{}});
  return{def,items:H.map(h=>mk(def,h))}})}
