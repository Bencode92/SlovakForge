// SlovakForge App v9 — Error tracking + Listen mode + Export + Past tense
const CATS={verb:{label:'Verbes',icon:'\u26a1',color:'#E85D3A'},noun:{label:'Noms',icon:'\ud83d\udce6',color:'#2D7DD2'},conjunction:{label:'Conjonctions',icon:'\ud83d\udd17',color:'#9C27B0'},adjective:{label:'Adjectifs',icon:'\ud83c\udfa8',color:'#4CAF50'},pronoun:{label:'Pronoms',icon:'\ud83d\udc64',color:'#00BCD4'},preposition:{label:'Pr\u00e9positions',icon:'\ud83d\udccd',color:'#795548'},adverb:{label:'Adverbes',icon:'\u23f1',color:'#607D8B'},number:{label:'Nombres',icon:'\ud83d\udd22',color:'#FF5722'},expression:{label:'Expressions',icon:'\ud83d\udcac',color:'#FF9800'}};
const THEMES=['Au restaurant','Premier rendez-vous','Chez le m\u00e9decin','Faire les courses','Au travail','Week-end en famille','Dans le bus','Vacances en Slovaquie','Cuisine slovaque','Discussion avec belle-m\u00e8re','\u00c0 la boulangerie','Sport et loisirs'];
const ALL_TYPES=Object.keys(CATS);
const LEITNER_DAYS=[0,1,3,7,14,30];
const FR_PERSONS=['je','tu','il/elle','nous','vous','ils/elles'];
function isDue(w){const b=w.box||0;if(b>=5)return false;if(!w.lastReview)return true;return(Date.now()-w.lastReview)/864e5>=LEITNER_DAYS[b]}
function getDueWords(ws){return ws.filter(isDue)}
function getAllDueCount(){return Object.values(vocab).flat().filter(isDue).length}
function parseConj(c){if(!c)return[];return c.split(',').map((f,i)=>{const p=f.trim().split(/\s+/);return{sk:p.length>1?p.slice(1).join(' '):p[0],person:p.length>1?p[0]:'',frPerson:FR_PERSONS[i]||'',full:f.trim()}})}
function randomConjForm(w){const f=parseConj(w.conjugation);return f.length?f[Math.floor(Math.random()*f.length)]:null}
function parsePast(p){if(!p)return[];return p.split(',').map((f,i)=>({sk:f.trim(),frPerson:FR_PERSONS[i]||'',full:f.trim()}))}
function randomPastForm(w){const f=parsePast(w.past);return f.length?f[Math.floor(Math.random()*f.length)]:null}

// === Error tracking helpers ===
function trackReview(cat,lemma,ok){
  if(!cat||!vocab[cat])return;
  const i=vocab[cat].findIndex(x=>(x.lemma||x.original)===lemma);
  if(i===-1)return;
  const w=vocab[cat][i];
  w.reviews=(w.reviews||0)+1;
  if(!ok)w.errors=(w.errors||0)+1;
  w.box=ok?Math.min((w.box||0)+1,5):Math.max((w.box||0)-1,0);
  w.lastReview=Date.now();
  saveVocab();
}
function getHardestWords(n){
  return allFlat().filter(w=>(w.reviews||0)>=2).sort((a,b)=>{
    const ra=(a.errors||0)/(a.reviews||1);const rb=(b.errors||0)/(b.reviews||1);return rb-ra;
  }).slice(0,n||10);
}
function getGlobalStats(){
  const all=allFlat();const total=all.length;const learned=all.filter(w=>(w.box||0)>=3).length;
  const totalReviews=all.reduce((s,w)=>s+(w.reviews||0),0);const totalErrors=all.reduce((s,w)=>s+(w.errors||0),0);
  const rate=totalReviews?Math.round((1-totalErrors/totalReviews)*100):0;
  return{total,learned,due:getAllDueCount(),totalReviews,totalErrors,rate};
}

let vocab={verb:[],noun:[],conjunction:[],adjective:[],pronoun:[],preposition:[],adverb:[],number:[],expression:[]},currentTab='read',vocabCatTab='verb';
let readTheme='',readLevel='easy',readText=null,readRevealed=new Set(),readSelected=new Set();
let readLoading=false,readAnalyzing=false,readAddedCount=0,readError='';
let learnMode=null,learnCat=null,learnIdx=0,learnFlip=false,learnDir='sk',learnDueOnly=false;
let learnScore={ok:0,total:0},learnStreak=0,quizOpts=[],quizAns=null;
let fillExs=[],fillIdx=0,fillAns=null,fillLoading=false,searchTerm='',conjSearch='';
let addingWord=false,addWordInput='';
let dailyQcm=null,dailyIdx=0,dailyAns=null,dailyScore={ok:0,total:0},dailyOpts=[],dailyActive=false,listenMode=false;

const $=id=>document.getElementById(id);
const esc=s=>(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function setStatus(t,show=true){$('status-bar').classList.toggle('hidden',!show);$('status-text').textContent=t}
function allFlat(){return Object.entries(vocab).flatMap(([c,ws])=>ws.map(w=>({...w,_cat:c})))}
function totalWords(){return Object.values(vocab).flat().length}
function learnedWords(){return Object.values(vocab).flat().filter(w=>(w.box||0)>=3).length}
function getKnownLemmas(){const s=new Set();Object.values(vocab).flat().forEach(w=>{if(w.lemma)s.add(w.lemma.toLowerCase());if(w.original)s.add(w.original.toLowerCase())});return s}

async function loadVocab(){setStatus('Chargement...');try{const data=await ghGetRaw('data/vocab.json');if(data&&data.words){vocab=data.words;ALL_TYPES.forEach(t=>{if(!vocab[t])vocab[t]=[]})}}catch(e){console.error('Load:',e);const ls=localStorage.getItem('sf_vocab');if(ls)try{vocab=JSON.parse(ls)}catch{}}setStatus('',false);render()}
async function saveVocab(){await saveVocabToGH(vocab)}
function exportVocab(){const data={version:4,exported:new Date().toISOString(),words:vocab};const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='slovakforge-'+new Date().toISOString().split('T')[0]+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u)}

async function doGenerate(){if(!readTheme.trim())return;readLoading=true;readText=null;readRevealed=new Set();readSelected=new Set();readAddedCount=0;readError='';render();try{const r=await aiGenerateText(readTheme.trim(),readLevel);readText=r?.sentences?r:{title:'Erreur',sentences:[{sk:'Chyba.',fr:'Erreur.'}]}}catch(e){readError=e.message||'Erreur API'}readLoading=false;render()}
function toggleWord(w){const c=w.replace(/[.,!?;:"""'\u2019\u201e\u201c\u2014\u2013\-()[\]]/g,'').trim().toLowerCase();if(!c||c.length<2)return;readSelected.has(c)?readSelected.delete(c):readSelected.add(c);render()}
async function doAddWords(){if(!readSelected.size)return;readAnalyzing=true;readError='';render();const ctx=readText?.sentences?.map(s=>s.sk).join(' ')||'';try{const r=await aiAnalyzeWords([...readSelected],ctx);if(r?.words){let count=0;r.words.forEach(w=>{const k=ALL_TYPES.includes(w.type)?w.type:'expression';if(!vocab[k])vocab[k]=[];if(!vocab[k].some(e=>(e.lemma||e.original)===(w.lemma||w.original))){vocab[k].push({...w,box:0,lastReview:null,addedAt:Date.now(),reviews:0,errors:0});count++}});readAddedCount=count;readSelected=new Set();await saveVocab()}}catch(e){readError=e.message}readAnalyzing=false;render()}
function deleteWord(cat,idx){vocab[cat].splice(idx,1);saveVocab();render()}
async function doAddManualWord(){const input=$('manual-word-input');const word=input?.value?.trim();if(!word)return;addingWord=true;render();try{const r=await aiTranslateWord(word);if(r){const k=ALL_TYPES.includes(r.type)?r.type:'expression';if(!vocab[k])vocab[k]=[];if(!vocab[k].some(e=>(e.lemma||e.original)===(r.lemma||r.original))){vocab[k].push({...r,box:0,lastReview:null,addedAt:Date.now(),reviews:0,errors:0});await saveVocab();addWordInput=''}}}catch(e){console.error(e)}addingWord=false;render()}

// === DAILY QCM ===
function generateDailyPool(){
  // Priority: hardest words first, then due, then random
  const hard=getHardestWords(5).filter(w=>(w.errors||0)>0);
  const due=Object.values(vocab).flat().filter(isDue).sort(()=>Math.random()-.5);
  const all=allFlat();
  const pool=[];const seen=new Set();
  [hard,due].forEach(list=>{list.forEach(w=>{const k=w.lemma||w.original;if(!seen.has(k)&&pool.length<10){seen.add(k);pool.push(w)}})});
  all.filter(w=>!seen.has(w.lemma||w.original)).sort(()=>Math.random()-.5).forEach(w=>{if(pool.length<15)pool.push(w)});
  return pool.sort(()=>Math.random()-.5);
}
function startDailyQcm(){const pool=generateDailyPool();if(pool.length<4){readError='Min 4 mots.';render();setTimeout(()=>{readError='';render()},3000);return}dailyQcm=pool;dailyIdx=0;dailyAns=null;dailyScore={ok:0,total:0};dailyActive=true;makeDailyOpts(0);render()}
function stopDaily(){dailyActive=false;dailyQcm=null;render()}
function makeDailyOpts(idx){
  if(!dailyQcm||!dailyQcm[idx])return;const cor=dailyQcm[idx];const all=allFlat();
  const dir=Math.random()>0.5?'sk':'fr';const isVerb=(cor._cat==='verb'||cor.type==='verb')&&cor.conjugation;const hasPast=isVerb&&cor.past;
  let mode='plain';if(isVerb){const r=Math.random();mode=hasPast&&r<0.3?'past':'conj'}
  let dist=all.filter(w=>(w.lemma||w.original)!==(cor.lemma||cor.original)).sort(()=>Math.random()-.5);
  const same=dist.filter(w=>(w.type||w._cat)===(cor.type||cor._cat));dist=[...same,...dist.filter(w=>(w.type||w._cat)!==(cor.type||cor._cat))].slice(0,3);
  if(mode==='conj'){const form=randomConjForm(cor);if(form){if(dir==='sk'){const ca=cor.fr+' ('+form.frPerson+')';dailyOpts=[...dist.map(w=>{const v=(w._cat==='verb')&&w.conjugation;if(v){const f=randomConjForm(w);return f?w.fr+' ('+f.frPerson+')':w.fr}return w.fr}),ca].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='sk';dailyQcm[idx]._prompt=form.full;dailyQcm[idx]._correct=ca;dailyQcm[idx]._mode='conj';dailyAns=null;return}else{const ca=form.full;dailyOpts=[...dist.map(w=>{const v=(w._cat==='verb')&&w.conjugation;if(v){const f=randomConjForm(w);return f?f.full:(w.lemma||w.original)}return w.lemma||w.original}),ca].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='fr';dailyQcm[idx]._prompt=cor.fr+' ('+form.frPerson+')';dailyQcm[idx]._correct=ca;dailyQcm[idx]._mode='conj';dailyAns=null;return}}else mode='plain'}
  if(mode==='past'){const form=randomPastForm(cor);if(form){if(dir==='sk'){const ca=cor.fr+' pass\u00e9 ('+form.frPerson+')';dailyOpts=[...dist.map(w=>{const hp=(w._cat==='verb')&&w.past;if(hp){const f=randomPastForm(w);return f?w.fr+' pass\u00e9 ('+f.frPerson+')':w.fr}return w.fr}),ca].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='sk';dailyQcm[idx]._prompt=form.full;dailyQcm[idx]._correct=ca;dailyQcm[idx]._mode='past';dailyAns=null;return}else{const ca=form.full;dailyOpts=[...dist.map(w=>{const hp=(w._cat==='verb')&&w.past;if(hp){const f=randomPastForm(w);return f?f.full:(w.lemma||w.original)}return w.lemma||w.original}),ca].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='fr';dailyQcm[idx]._prompt=cor.fr+' pass\u00e9 ('+form.frPerson+')';dailyQcm[idx]._correct=ca;dailyQcm[idx]._mode='past';dailyAns=null;return}}else mode='plain'}
  if(dir==='sk'){dailyOpts=[...dist.map(w=>w.fr),cor.fr].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='sk';dailyQcm[idx]._prompt=cor.lemma||cor.original;dailyQcm[idx]._correct=cor.fr}else{dailyOpts=[...dist.map(w=>w.lemma||w.original),cor.lemma||cor.original].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='fr';dailyQcm[idx]._prompt=cor.fr;dailyQcm[idx]._correct=cor.lemma||cor.original}
  dailyQcm[idx]._mode=dailyQcm[idx]._mode||'plain';dailyAns=null;
}
function handleDailyAnswer(sel){
  const w=dailyQcm[dailyIdx];const ok=sel===w._correct;dailyAns=sel;dailyScore.ok+=ok?1:0;dailyScore.total+=1;
  trackReview(w._cat||w.type,w.lemma||w.original,ok);
  render();setTimeout(()=>{if(dailyIdx+1<dailyQcm.length){dailyIdx++;makeDailyOpts(dailyIdx)}else{dailyActive='results'}render()},900);
}
function playDailyAudio(){if(!dailyQcm||!dailyQcm[dailyIdx])return;speak(dailyQcm[dailyIdx]._prompt,dailyQcm[dailyIdx]._dir==='sk'?'sk-SK':'fr-FR')}

// === Learning ===
function getLearnWords(){const ws=learnCat==='all'?allFlat():(vocab[learnCat]||[]);return learnDueOnly?getDueWords(ws):ws}
function startLearn(cat,mode,dueOnly){const base=cat==='all'?allFlat():(vocab[cat]||[]);const ws=dueOnly?getDueWords(base):base;if(ws.length<2){readError='Min 2 mots.';render();setTimeout(()=>{readError='';render()},3000);return}learnCat=cat;learnMode=mode;learnIdx=0;learnFlip=false;learnDueOnly=!!dueOnly;learnScore={ok:0,total:0};learnStreak=0;quizAns=null;fillAns=null;if(mode==='quiz')makeQuizOpts(0,ws);if(mode==='fill'){fillLoading=true;fillIdx=0;render();aiGenerateFill(ws).then(r=>{fillExs=r?.exercises||[];fillLoading=false;render()}).catch(()=>{fillExs=[];fillLoading=false;render()})}render()}
function makeQuizOpts(idx,ws){const cor=ws[idx];if(!cor)return;const oth=ws.filter((_,i)=>i!==idx).sort(()=>Math.random()-.5).slice(0,3);quizOpts=learnDir==='fr'?[...oth.map(w=>w.lemma||w.original),cor.lemma||cor.original].sort(()=>Math.random()-.5):[...oth.map(w=>w.fr),cor.fr].sort(()=>Math.random()-.5);quizAns=null}
function handleAnswer(ok){
  learnScore.ok+=ok?1:0;learnScore.total+=1;learnStreak=ok?learnStreak+1:0;
  const ws=getLearnWords(),w=ws[learnIdx];
  const cat=w?(learnCat!=='all'?learnCat:w._cat):null;
  if(w&&cat)trackReview(cat,w.lemma||w.original,ok);
  setTimeout(()=>{const ws2=getLearnWords();if(learnIdx+1<ws2.length){learnIdx++;learnFlip=false;quizAns=null;if(learnMode==='quiz')makeQuizOpts(learnIdx,ws2)}else{learnMode='results'}render()},700);
}

function conjHTML(c){if(!c)return'';const p=['ja','ty','on/ona','my','vy','oni'];const f=c.split(',').map(x=>x.trim());let h='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 12px;margin-top:6px">';f.forEach((x,j)=>{h+='<div style="padding:2px 0"><span style="font-size:9px;color:var(--txD)">'+(p[j]||'')+'</span><br><span class="mono" style="font-size:12px;color:var(--txt)">'+esc(x)+'</span></div>'});return h+'</div>'}
function audioBtn(t,sz){return'<button onclick="event.stopPropagation();speak(\''+esc(t.replace(/'/g,"\\'"))+'\',\'sk-SK\')" style="background:none;border:1px solid var(--brd);border-radius:6px;color:var(--blu);cursor:pointer;padding:'+(sz||'3px 6px')+';font-size:'+(sz?'14px':'12px')+'">\ud83d\udd0a</button>'}
function grammarBadge(n){if(!n||n==='null')return'';return'<p style="font-size:10px;color:#ff9800;margin-top:3px;background:#ff980015;padding:3px 7px;border-radius:3px;border-left:2px solid #ff9800;display:inline-block">\ud83d\udcdd '+esc(n)+'</p>'}
function errorRate(w){const r=w.reviews||0;if(r<2)return'';const e=w.errors||0;const pct=Math.round(e/r*100);if(pct<20)return'';return'<span class="tag" style="background:'+(pct>=50?'#E85D3A33':'#ff980033')+';color:'+(pct>=50?'#E85D3A':'#ff9800')+';font-size:9px">'+pct+'% err ('+e+'/'+r+')</span>'}

// ==================== RENDER ====================
function render(){
const C=$('content');if(!C)return;
const statsEl=$('header-stats');if(statsEl){const s=getGlobalStats();statsEl.textContent=s.total+' mots \u00b7 '+s.learned+' appris'+(s.due>0?' \u00b7 '+s.due+' dus':'')+(s.totalReviews>0?' \u00b7 '+s.rate+'% r\u00e9ussite':'')}
const knownSet=getKnownLemmas();

// === HOME ===
if(currentTab==='read'){
let h='<div style="max-width:700px;margin:0 auto">';

// DAILY ACTIVE
if(dailyActive===true&&dailyQcm&&dailyQcm[dailyIdx]){
  const w=dailyQcm[dailyIdx],dir=w._dir||'sk',prompt=w._prompt||'',correct=w._correct||'';
  const ci=CATS[w._cat||w.type]||{color:'#aaa',label:'?',icon:'?'};const md=w._mode||'plain';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="stopDaily()">\u2190</button><div style="display:flex;align-items:center;gap:8px"><button class="btn '+(listenMode?'btn-pri':'btn-sec')+'" style="font-size:11px;padding:5px 10px" onclick="listenMode=!listenMode;render()">\ud83d\udc42 '+(listenMode?'ON':'OFF')+'</button><span class="mono" style="font-size:12px;color:var(--purp);font-weight:700">'+(dailyIdx+1)+'/'+dailyQcm.length+'</span></div></div>';
  h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((dailyIdx+1)/dailyQcm.length)*100)+'%;background:var(--purp)"></div></div>';
  h+='<div class="card" style="text-align:center;border-top:3px solid '+(md==='past'?'#FF5722':'var(--purp)')+';margin-top:12px">';
  h+='<div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px"><span class="tag" style="background:'+ci.color+'22;color:'+ci.color+'">'+ci.icon+' '+ci.label+'</span><span class="tag" style="background:var(--brd);color:var(--txD)">'+(dir==='sk'?'SK\u2192FR':'FR\u2192SK')+'</span>'+(md!=='plain'?'<span class="tag" style="background:'+(md==='past'?'#FF572222':'#E85D3A22')+';color:'+(md==='past'?'#FF5722':'#E85D3A')+'">'+(md==='past'?'pass\u00e9':'conjugu\u00e9')+'</span>':'')+'</div>';
  if(listenMode&&dir==='sk'){h+='<div style="font-size:48px;margin:20px 0">\ud83d\udc42</div><p class="muted" style="margin-bottom:10px">\u00c9coute et trouve</p><button class="btn btn-sec" onclick="playDailyAudio()" style="margin-bottom:8px">\ud83d\udd04 R\u00e9\u00e9couter</button>';if(dailyAns!==null)h+='<h2 class="mono-b" style="font-size:22px;margin:8px 0;color:var(--acc)">'+esc(prompt)+'</h2>'}
  else{h+='<h2 class="mono-b" style="font-size:28px;margin:10px 0">'+esc(prompt)+'</h2>'+audioBtn(prompt,'6px 12px')}
  h+='</div>';
  dailyOpts.forEach(function(o){var cls='qcm-opt';if(dailyAns!==null){if(o===correct)cls+=' correct';else if(o===dailyAns&&o!==correct)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(dailyAns===null)handleDailyAnswer(\''+esc(o.replace(/'/g,"\\'"))+'\')">'+esc(o)+'</div>'});
  h+='</div>';C.innerHTML=h;if(listenMode&&dir==='sk'&&dailyAns===null)setTimeout(playDailyAudio,300);return;
}

// DAILY RESULTS
if(dailyActive==='results'){
  const pct=dailyScore.total?Math.round(dailyScore.ok/dailyScore.total*100):0;
  const hardest=getHardestWords(5).filter(w=>(w.errors||0)>0);
  h+='<div class="card" style="text-align:center;padding:36px;border-top:3px solid var(--purp)">';
  h+='<div style="font-size:48px;margin-bottom:12px">'+(pct>=80?'\ud83c\udfc6':pct>=50?'\ud83d\udcaa':'\ud83d\udcd6')+'</div>';
  h+='<h2 class="mono-b" style="font-size:22px;margin-bottom:6px">Daily termin\u00e9 !</h2>';
  h+='<div style="display:flex;justify-content:center;gap:28px;margin:16px 0"><div><span style="font-size:30px;font-weight:700;color:var(--grn)">'+dailyScore.ok+'</span><br><span class="muted">OK</span></div><div><span style="font-size:30px;font-weight:700;color:var(--red)">'+(dailyScore.total-dailyScore.ok)+'</span><br><span class="muted">Rat\u00e9s</span></div><div><span style="font-size:30px;font-weight:700;color:var(--purp)">'+pct+'%</span></div></div>';
  if(hardest.length>0){h+='<div style="text-align:left;margin-top:16px;padding-top:16px;border-top:1px solid var(--brd)"><p style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:8px">\ud83d\udea9 Tes mots les plus difficiles :</p>';hardest.forEach(w=>{const r=w.reviews||1;const e=w.errors||0;h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0"><span class="mono" style="font-size:12px">'+esc(w.lemma||w.original)+' <span class="muted">= '+esc(w.fr)+'</span></span><span style="font-size:10px;color:var(--red)">'+Math.round(e/r*100)+'% err ('+e+'/'+r+')</span></div>'});h+='</div>'}
  h+='<div style="display:flex;gap:10px;justify-content:center;margin-top:22px"><button class="btn" style="background:var(--purp);color:#fff" onclick="startDailyQcm()">\ud83c\udfb2 Relancer</button><button class="btn btn-sec" onclick="stopDaily()">\u2190</button></div></div>';
  h+='</div>';C.innerHTML=h;return;
}

// DAILY BANNER
if(allFlat().length>=4){const s=getGlobalStats();h+='<div class="card" style="border-left:4px solid var(--purp);display:flex;justify-content:space-between;align-items:center;padding:16px 18px;margin-bottom:16px;background:linear-gradient(135deg,var(--card),#1a1028)"><div><span style="font-size:22px">\ud83e\udde0</span> <strong style="color:var(--purp);font-size:15px">Daily QCM</strong><br><span class="muted">Conjugu\u00e9s + pass\u00e9 \u00b7 toutes cat\u00e9gories'+(s.due>0?' \u00b7 <span style="color:#ff9800">'+s.due+' dus</span>':'')+'</span></div><button class="btn" style="background:var(--purp);color:#fff;padding:12px 20px;font-size:13px" onclick="startDailyQcm()">\ud83c\udfb2 Lancer</button></div>'}

if(readError)h+='<div class="card" style="border-color:var(--red);color:var(--red)">'+esc(readError)+'</div>';
h+='<div class="card"><h2 style="font-size:17px;font-weight:800;margin-bottom:4px">\ud83d\udcd6 G\u00e9n\u00e8re un texte en slovaque</h2><p class="muted" style="margin-bottom:14px">Th\u00e8me \u2192 lis \u2192 capture</p>';
h+='<input id="read-theme" placeholder="Ex: au restaurant..." value="'+esc(readTheme)+'" onkeydown="if(event.key===\'Enter\')doGenerate()" style="width:100%;padding:11px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:14px;margin-bottom:10px" oninput="readTheme=this.value">';
h+='<div style="display:flex;gap:7px;margin-bottom:14px">';[['easy','\ud83d\udfe2 Facile'],['medium','\ud83d\udfe1 Moyen'],['hard','\ud83d\udd34 Difficile']].forEach(([k,l])=>{h+='<button class="btn '+(readLevel===k?'btn-pri':'btn-sec')+'" style="flex:1" onclick="readLevel=\''+k+'\';render()">'+l+'</button>'});h+='</div>';
h+='<button class="btn btn-pri" style="width:100%;padding:13px;font-size:14px" onclick="doGenerate()" '+(readLoading?'disabled':'')+'>'+( readLoading?'\u23f3':'\ud83d\ude80 G\u00e9n\u00e9rer')+'</button></div>';
if(readLoading)h+='<div class="card" style="text-align:center;padding:30px"><div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div></div>';
if(readAddedCount>0&&!readAnalyzing)h+='<div class="card" style="border-color:var(--grn);color:var(--grn);text-align:center">\u2705 '+readAddedCount+' ajout\u00e9'+(readAddedCount>1?'s':'')+'</div>';
if(readText&&!readLoading){
  h+='<h3 style="font-size:15px;font-weight:700;margin-bottom:4px">'+esc(readText.title||'')+'</h3><p class="muted" style="margin-bottom:12px"><b style="color:var(--blu)">phrase</b>=trad \u00b7 <b style="color:var(--acc)">mot</b>=capturer \u00b7 <span style="color:var(--grn)">\u2588</span>=connu</p>';
  h+='<div style="display:flex;flex-direction:column;gap:2px">';
  readText.sentences.forEach((s,i)=>{const rev=readRevealed.has(i);h+='<div style="border-radius:6px;overflow:hidden"><div class="sentence-row" style="border-left-color:'+(rev?'var(--blu)':'var(--brd)')+'" onclick="readRevealed.has('+i+')?readRevealed.delete('+i+'):readRevealed.add('+i+');render()"><span class="s-num">'+(i+1)+'</span><div style="flex:1;display:flex;flex-wrap:wrap;gap:3px">';s.sk.split(/(\s+)/).forEach(w=>{if(!w.trim()){h+='<span>&nbsp;</span>';return}const c=w.replace(/[.,!?;:\'\u2019\u201e\u201c\u2014\u2013\-()[\]]/g,'').toLowerCase();const sel=readSelected.has(c);const known=knownSet.has(c);let st='';if(sel)st='background:rgba(232,93,58,.25);color:var(--acc);';else if(known)st='border-bottom:2px solid var(--grn);color:var(--grn);';h+='<span class="word-token" style="'+st+'" onclick="event.stopPropagation();toggleWord(\''+esc(w.replace(/'/g,"\\'"))+'\')">'+esc(w)+'</span>'});h+='</div>'+audioBtn(s.sk,'4px 8px')+'<span style="color:#444;font-size:13px;margin-left:4px">'+(rev?'\u25be':'\u25b8')+'</span></div>';if(rev)h+='<div class="fr-translation">'+esc(s.fr)+'</div>';h+='</div>'});h+='</div>';
  if(readSelected.size>0){h+='<div class="sel-bar"><div style="display:flex;flex-wrap:wrap;gap:5px;flex:1">';readSelected.forEach(w=>{h+='<span class="sel-tag" onclick="toggleWord(\''+esc(w)+'\')">'+esc(w)+' \u2715</span>'});h+='</div><button class="btn btn-grn" onclick="doAddWords()" '+(readAnalyzing?'disabled':'')+'>'+( readAnalyzing?'\u23f3':'\u271a '+readSelected.size)+'</button></div>'}
  if(readAnalyzing)h+='<div style="text-align:center;padding:20px"><div class="spinner"></div></div>';
}
if(!readText&&!readLoading){h+='<p class="muted" style="margin-top:16px;margin-bottom:10px">\ud83d\udca1 Id\u00e9es :</p><div style="display:flex;flex-wrap:wrap;gap:7px">';THEMES.forEach(t=>{h+='<button class="btn btn-sec" style="font-size:11px;padding:6px 12px" onclick="readTheme=\''+t+'\';render()">'+t+'</button>'});h+='</div>'}
h+='</div>';C.innerHTML=h;return;
}

// === VOCAB ===
if(currentTab==='vocab'){
let h='<div style="max-width:700px;margin:0 auto">';
h+='<div class="card" style="display:flex;gap:8px;align-items:center;padding:12px 16px"><input id="manual-word-input" placeholder="\u270f\ufe0f Mot fran\u00e7ais \u2192 IA traduit" value="'+esc(addWordInput)+'" oninput="addWordInput=this.value" onkeydown="if(event.key===\'Enter\')doAddManualWord()" style="flex:1;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px"><button class="btn btn-pri" onclick="doAddManualWord()" '+(addingWord?'disabled':'')+'>'+( addingWord?'\u23f3':'\u271a')+'</button></div>';
h+='<div style="display:flex;gap:8px;margin-bottom:12px"><input placeholder="\ud83d\udd0d Chercher..." value="'+esc(searchTerm)+'" oninput="searchTerm=this.value;render()" style="flex:1;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px"><button class="btn btn-sec" onclick="exportVocab()">\ud83d\udcbe</button></div>';
if(searchTerm.length>1){const res=allFlat().filter(w=>(w.lemma||w.original||'').toLowerCase().includes(searchTerm.toLowerCase())||(w.fr||'').toLowerCase().includes(searchTerm.toLowerCase())).slice(0,15);if(!res.length)h+='<p class="muted" style="text-align:center;padding:20px">Rien</p>';else res.forEach(w=>{const cat=CATS[w._cat]||{};h+='<div class="card" style="border-left:4px solid '+(cat.color||'#666')+';padding:10px 14px;margin-bottom:6px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="mono-b">'+esc(w.lemma||w.original)+'</span>'+audioBtn(w.lemma||w.original)+'<span class="muted">'+esc(w.fr)+'</span><span class="tag" style="background:'+(cat.color||'#666')+'22;color:'+(cat.color||'#666')+';font-size:9px">'+cat.label+'</span>'+errorRate(w)+'</div></div>'})}
else{h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px">';Object.entries(CATS).forEach(([k,c])=>{const n=(vocab[k]||[]).length;if(!n&&vocabCatTab!==k)return;const d=getDueWords(vocab[k]||[]).length;h+='<button class="btn '+(vocabCatTab===k?'btn-pri':'btn-sec')+'" style="font-size:10px;padding:6px 10px;'+(vocabCatTab===k?'background:'+c.color:'')+'" onclick="vocabCatTab=\''+k+'\';render()">'+c.icon+' '+c.label+' '+n+(d>0?'<span style="background:#ff9800;color:#000;border-radius:8px;padding:0 5px;font-size:9px;margin-left:3px">'+d+'</span>':'')+'</button>'});h+='</div>';
const words=vocab[vocabCatTab]||[];
if(!words.length)h+='<div class="card" style="text-align:center;padding:40px"><p class="muted">Aucun mot.</p></div>';
else words.forEach((w,i)=>{const catC=CATS[vocabCatTab]?.color||'#666';const due=isDue(w);h+='<div class="card" style="border-left:4px solid '+catC+';padding:12px 14px;margin-bottom:6px;'+(due?'border-right:3px solid #ff9800;':'')+'"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="flex:1"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px"><span class="mono-b" style="font-size:16px">'+esc(w.lemma||w.original)+'</span>'+audioBtn(w.lemma||w.original)+'<span style="color:var(--txM);font-size:14px">'+esc(w.fr)+'</span>';if(w.gender)h+='<span class="tag" style="background:'+(w.gender==='M'?'#2196F333':w.gender==='F'?'#E91E6333':'#9E9E9E33')+';color:'+(w.gender==='M'?'#2196F3':w.gender==='F'?'#E91E63':'#9E9E9E')+'">'+w.gender+'</span>';if(due)h+='<span class="tag" style="background:#ff980033;color:#ff9800;font-size:9px">dus</span>';h+=errorRate(w)+'</div>';if(w.conjugation){h+='<p style="font-size:9px;color:var(--txD)">Pr\u00e9sent</p>'+conjHTML(w.conjugation)}if(w.past){h+='<p style="font-size:9px;color:#FF5722;margin-top:4px">Pass\u00e9</p>'+conjHTML(w.past)}if(w.example)h+='<p style="font-size:11px;color:var(--txM);margin-top:6px;font-style:italic">\ud83d\udcac '+esc(w.example)+'</p>';if(w.tip)h+='<p style="font-size:10px;color:var(--txD);margin-top:3px;background:var(--sf);padding:3px 7px;border-radius:3px;display:inline-block">\ud83d\udca1 '+esc(w.tip)+'</p>';if(w.grammar_note)h+=grammarBadge(w.grammar_note);h+='</div><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div class="box-indicator" style="background:hsl('+(w.box||0)*24+',70%,42%)">'+(w.box||0)+'</div><button style="background:none;border:none;color:#444;font-size:14px;cursor:pointer" onclick="deleteWord(\''+vocabCatTab+'\','+i+')">\u2715</button></div></div></div>'})}
h+='</div>';C.innerHTML=h;return;
}

// === LEARN ===
if(currentTab==='learn'){
let h='<div style="max-width:540px;margin:0 auto">';const lw=getLearnWords();
if(!learnMode){const da=getAllDueCount();if(da>0)h+='<div class="card" style="border-color:#ff9800;border-left:4px solid #ff9800;display:flex;justify-content:space-between;align-items:center"><div><strong style="color:#ff9800">\ud83d\udd25 '+da+' \u00e0 r\u00e9viser</strong></div><button class="btn" style="background:#ff9800;color:#000;padding:10px 18px" onclick="startLearn(\'all\',\'flash\',true)">\ud83c\udfaf</button></div>';else h+='<div class="card" style="border-color:var(--grn);text-align:center;padding:16px"><strong style="color:var(--grn)">\u2705 Tout \u00e0 jour</strong></div>';
// Hardest words
const hard=getHardestWords(5).filter(w=>(w.errors||0)>0);
if(hard.length){h+='<div class="card" style="border-left:4px solid var(--red)"><p style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:8px">\ud83d\udea9 Mots les plus difficiles</p>';hard.forEach(w=>{const r=w.reviews||1;const e=w.errors||0;h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0"><span class="mono" style="font-size:12px">'+esc(w.lemma||w.original)+' <span class="muted">'+esc(w.fr)+'</span></span><span style="font-size:10px;color:var(--red)">'+Math.round(e/r*100)+'% ('+e+'/'+r+')</span></div>'});h+='</div>'}
h+='<h2 style="font-size:18px;font-weight:800;margin:16px 0 4px">Sessions libres</h2><div style="display:flex;gap:8px;margin-bottom:18px">';[['sk','SK\u2192FR','#E85D3A'],['fr','FR\u2192SK','#2D7DD2'],['mix','Mix','#9C27B0']].forEach(([k,l,c])=>{h+='<button class="btn '+(learnDir===k?'btn-pri':'btn-sec')+'" style="flex:1;'+(learnDir===k?'background:'+c:'')+'" onclick="learnDir=\''+k+'\';render()">'+l+'</button>'});h+='</div>';
[...Object.entries(CATS),['all',{label:'Tous',icon:'\ud83c\udf0d',color:'#aaa'}]].forEach(([k,c])=>{const base=k==='all'?allFlat():(vocab[k]||[]);const n=base.length;const due=getDueWords(base).length;if(n<2)return;h+='<div class="card" style="border-left:4px solid '+c.color+'"><div style="display:flex;justify-content:space-between"><span class="mono-b">'+c.icon+' '+c.label+' ('+n+')</span>'+(due>0?'<span class="tag" style="background:#ff980033;color:#ff9800">'+due+'</span>':'')+'</div><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'flash\',false)">\ud83d\udcda</button>';if(due>=2)h+='<button class="btn btn-sec" style="border-color:#ff9800;color:#ff9800" onclick="startLearn(\''+k+'\',\'flash\',true)">\ud83d\udd25 '+due+'</button>';h+='<button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'quiz\',false)">\ud83c\udfaf</button>';if(n>=3)h+='<button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'fill\',false)">\u270f\ufe0f</button>';h+='</div></div>'})}
else if(learnMode==='flash'&&lw[learnIdx]){const w=lw[learnIdx],d=learnDir==='mix'?(learnIdx%2===0?'sk':'fr'):learnDir;const front=d==='sk'?(w.lemma||w.original):w.fr,back=d==='sk'?w.fr:(w.lemma||w.original);h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button><span class="mono" style="font-size:11px;color:var(--txD)">'+(learnIdx+1)+'/'+lw.length+'</span></div><div class="progress-bar"><div class="progress-fill" style="width:'+(((learnIdx+1)/lw.length)*100)+'%;background:#E85D3A"></div></div>';if(learnStreak>=3)h+='<div style="text-align:center;margin:8px 0"><span class="streak-badge">\ud83d\udd25 '+learnStreak+'</span></div>';h+='<div class="flash-card '+(learnFlip?'flipped':'')+'" onclick="learnFlip=!learnFlip;render()" style="min-height:280px;margin-top:12px">';if(!learnFlip)h+='<span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--txD)">'+(d==='sk'?'SK':'FR')+'</span><h2 class="mono-b" style="font-size:28px;margin:20px 0">'+esc(front)+'</h2>'+audioBtn(front,'6px 12px')+'<p class="muted" style="font-size:12px;margin-top:12px">Touche pour retourner</p>';else{h+='<h2 class="mono-b" style="font-size:24px;margin:14px 0">'+esc(back)+'</h2>';if(w.conjugation)h+=conjHTML(w.conjugation);if(w.past){h+='<p style="font-size:9px;color:#FF5722;margin-top:4px">Pass\u00e9</p>'+conjHTML(w.past)}if(w.example)h+='<p style="font-size:11px;color:var(--txM);font-style:italic;margin-top:8px">\ud83d\udcac '+esc(w.example)+'</p>'}h+='</div>';if(learnFlip)h+='<div style="display:flex;gap:14px;justify-content:center;margin-top:18px"><button class="btn" style="background:var(--red);color:#fff;padding:12px 24px;min-width:120px" onclick="handleAnswer(false)">\u2717</button><button class="btn" style="background:var(--grn);color:#000;padding:12px 24px;min-width:120px" onclick="handleAnswer(true)">\u2713</button></div>'}
else if(learnMode==='quiz'&&lw[learnIdx]){const w=lw[learnIdx],d=learnDir==='mix'?(learnIdx%2===0?'sk':'fr'):learnDir;const prompt=d==='sk'?(w.lemma||w.original):w.fr,correct=d==='sk'?w.fr:(w.lemma||w.original);h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button><span class="mono" style="font-size:11px;color:var(--txD)">'+(learnIdx+1)+'/'+lw.length+'</span></div><div class="progress-bar"><div class="progress-fill" style="width:'+(((learnIdx+1)/lw.length)*100)+'%;background:var(--blu)"></div></div><div class="card" style="text-align:center;border-top:3px solid var(--blu);margin-top:12px"><h2 class="mono-b" style="font-size:26px;margin:14px 0">'+esc(prompt)+'</h2>'+audioBtn(prompt,'6px 12px')+'</div>';quizOpts.forEach(o=>{let cls='qcm-opt';if(quizAns!==null){if(o===correct)cls+=' correct';else if(o===quizAns&&o!==correct)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(quizAns===null){quizAns=\''+esc(o.replace(/'/g,"\\'"))+'\';handleAnswer(\''+esc(o.replace(/'/g,"\\'"))+'\'===\''+esc(correct.replace(/'/g,"\\'"))+'\');render()}">'+esc(o)+'</div>'})}
else if(learnMode==='fill'){h+='<button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button>';if(fillLoading)h+='<div class="card" style="text-align:center;padding:30px"><div class="spinner" style="width:24px;height:24px;margin:0 auto"></div></div>';else if(fillExs[fillIdx]){h+='<div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:'+(((fillIdx+1)/fillExs.length)*100)+'%;background:#9C27B0"></div></div>';const ex=fillExs[fillIdx];h+='<div class="card" style="text-align:center;border-top:3px solid #9C27B0;margin-top:12px"><h2 class="mono-b" style="font-size:20px;line-height:1.6">'+esc(ex.sentence_sk)+'</h2><p style="font-size:12px;color:var(--txM);margin-top:10px;font-style:italic">= '+esc(ex.sentence_fr)+'</p></div>';(ex.options||[]).forEach(o=>{const cor=ex.answer;let cls='qcm-opt';if(fillAns!==null){if(o===cor)cls+=' correct';else if(o===fillAns&&o!==cor)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(fillAns===null){fillAns=\''+esc(o.replace(/'/g,"\\'"))+'\';learnScore.ok+='+(o===cor?1:0)+';learnScore.total++;render();setTimeout(()=>{if(fillIdx+1<fillExs.length){fillIdx++;fillAns=null}else{learnMode=\'results\'}render()},800)}">'+esc(o)+'</div>'})}}
else if(learnMode==='results'){const pct=learnScore.total?Math.round(learnScore.ok/learnScore.total*100):0;h+='<div class="card" style="text-align:center;padding:36px"><div style="font-size:48px;margin-bottom:12px">'+(pct>=80?'\ud83c\udfc6':pct>=50?'\ud83d\udcaa':'\ud83d\udcd6')+'</div><h2 class="mono-b" style="font-size:22px">'+pct+'%</h2><p class="muted" style="margin:8px 0">'+learnScore.ok+'/'+learnScore.total+'</p><div style="display:flex;gap:10px;justify-content:center;margin-top:16px"><button class="btn btn-pri" onclick="startLearn(learnCat,\'flash\',false)">\ud83d\udcda</button><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button></div></div>'}
h+='</div>';C.innerHTML=h;return;
}

// === CONJ ===
if(currentTab==='conj'){
const verbs=(vocab.verb||[]).filter(v=>v.conjugation);const fv=conjSearch?verbs.filter(v=>(v.lemma||'').toLowerCase().includes(conjSearch.toLowerCase())||(v.fr||'').toLowerCase().includes(conjSearch.toLowerCase())):verbs;
let h='<div style="max-width:700px;margin:0 auto"><h2 style="font-size:18px;font-weight:800;margin-bottom:14px">\ud83d\udcd0 Conjugaison</h2>';
h+='<input placeholder="\ud83d\udd0d Verbe..." value="'+esc(conjSearch)+'" oninput="conjSearch=this.value;render()" style="width:100%;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px;margin-bottom:14px">';
if(!fv.length)h+='<p class="muted" style="text-align:center;padding:30px">Aucun verbe.</p>';
else fv.forEach(v=>{h+='<div class="card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span class="mono-b" style="font-size:17px">'+esc(v.lemma)+'</span>'+audioBtn(v.lemma,'4px 10px')+'<span class="muted" style="font-size:14px">'+esc(v.fr)+'</span>'+errorRate(v)+'</div><p style="font-size:9px;color:var(--txD)">Pr\u00e9sent</p>'+conjHTML(v.conjugation);if(v.past){h+='<p style="font-size:9px;color:#FF5722;margin-top:8px">Pass\u00e9</p>'+conjHTML(v.past)}if(v.example)h+='<p style="font-size:11px;color:var(--txM);font-style:italic;margin-top:10px">\ud83d\udcac '+esc(v.example)+'</p>';if(v.grammar_note)h+=grammarBadge(v.grammar_note);h+='</div>'});
h+='</div>';C.innerHTML=h;return;
}
}

function switchTab(t){currentTab=t;learnMode=null;dailyActive=false;render();renderNav()}
function renderNav(){$('nav-tabs').innerHTML=[['read','\ud83d\udcd6 Lire'],['vocab','\ud83d\udcda Vocab'],['learn','\ud83c\udfaf Apprendre'],['conj','\ud83d\udcd0 Conjugaison']].map(([k,l])=>'<button class="nav-btn'+(currentTab===k?' active':'')+'" onclick="switchTab(\''+k+'\')">'+(k==='learn'&&getAllDueCount()>0?'<span style="background:#ff9800;color:#000;border-radius:8px;padding:0 5px;font-size:9px;margin-right:3px">'+getAllDueCount()+'</span>':'')+l+'</button>').join('')}
async function init(){loadToken();updateGhTag();renderNav();await loadVocab()}
init();
