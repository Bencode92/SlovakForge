// SlovakForge App v9 — Error tracking + stats
const CATS={verb:{label:'Verbes',icon:'\u26a1',color:'#E85D3A'},noun:{label:'Noms',icon:'\ud83d\udce6',color:'#2D7DD2'},conjunction:{label:'Conjonctions',icon:'\ud83d\udd17',color:'#9C27B0'},adjective:{label:'Adjectifs',icon:'\ud83c\udfa8',color:'#4CAF50'},pronoun:{label:'Pronoms',icon:'\ud83d\udc64',color:'#00BCD4'},preposition:{label:'Pr\u00e9positions',icon:'\ud83d\udccd',color:'#795548'},adverb:{label:'Adverbes',icon:'\u23f1',color:'#607D8B'},number:{label:'Nombres',icon:'\ud83d\udd22',color:'#FF5722'},expression:{label:'Expressions',icon:'\ud83d\udcac',color:'#FF9800'}};
const THEMES=['Au restaurant','Premier rendez-vous','Chez le m\u00e9decin','Faire les courses','Au travail','Week-end en famille','Dans le bus','Vacances en Slovaquie','Cuisine slovaque','Discussion avec belle-m\u00e8re','\u00c0 la boulangerie','Sport et loisirs'];
const ALL_TYPES=Object.keys(CATS);
const LEITNER_DAYS=[0,1,3,7,14,30];
const FR_PERSONS=['je','tu','il/elle','nous','vous','ils/elles'];
function isDue(w){const b=w.box||0;if(b>=5)return false;if(!w.lastReview)return true;return(Date.now()-w.lastReview)/(864e5)>=LEITNER_DAYS[b]}
function getDueWords(ws){return ws.filter(isDue)}
function getAllDueCount(){return Object.values(vocab).flat().filter(isDue).length}
function parseConj(conj){if(!conj)return[];return conj.split(',').map((f,i)=>{const p=f.trim().split(/\s+/);const person=p.length>1?p[0]:'';const sk=p.length>1?p.slice(1).join(' '):p[0];return{sk,person,frPerson:FR_PERSONS[i]||'',full:f.trim()}})}
function randomConjForm(w){const f=parseConj(w.conjugation);return f.length?f[Math.floor(Math.random()*f.length)]:null}
function parsePast(past){if(!past)return[];return past.split(',').map((f,i)=>({sk:f.trim(),frPerson:FR_PERSONS[i]||'',full:f.trim()}))}
function randomPastForm(w){const f=parsePast(w.past);return f.length?f[Math.floor(Math.random()*f.length)]:null}

// === STATS HELPERS ===
function getWordErrorRate(w){const r=w.reviews||0;if(r===0)return 0;return(w.errors||0)/r}
function getHardestWords(n){return allFlat().filter(w=>(w.reviews||0)>=2).sort((a,b)=>getWordErrorRate(b)-getWordErrorRate(a)).slice(0,n||10)}
function getGlobalStats(){
  const all=Object.values(vocab).flat();
  let totalReviews=0,totalErrors=0,mastered=0,learning=0,newW=0;
  all.forEach(w=>{totalReviews+=w.reviews||0;totalErrors+=w.errors||0;const b=w.box||0;if(b>=3)mastered++;else if(w.reviews>0)learning++;else newW++});
  return{total:all.length,totalReviews,totalErrors,successRate:totalReviews?Math.round(((totalReviews-totalErrors)/totalReviews)*100):0,mastered,learning,new:newW}
}
// Track a review on a word (call after answer)
function trackReview(cat,lemma,ok){
  if(!cat||!vocab[cat])return;
  const i=vocab[cat].findIndex(x=>(x.lemma||x.original)===lemma);
  if(i===-1)return;
  vocab[cat][i].reviews=(vocab[cat][i].reviews||0)+1;
  if(!ok)vocab[cat][i].errors=(vocab[cat][i].errors||0)+1;
}

let vocab={verb:[],noun:[],conjunction:[],adjective:[],pronoun:[],preposition:[],adverb:[],number:[],expression:[]},currentTab='read',vocabCatTab='verb';
let readTheme='',readLevel='easy',readText=null,readRevealed=new Set(),readSelected=new Set();
let readLoading=false,readAnalyzing=false,readAddedCount=0,readError='';
let learnMode=null,learnCat=null,learnIdx=0,learnFlip=false,learnDir='sk',learnDueOnly=false;
let learnScore={ok:0,total:0},learnStreak=0,quizOpts=[],quizAns=null;
let fillExs=[],fillIdx=0,fillAns=null,fillLoading=false,searchTerm='',conjSearch='';
let addingWord=false,addWordInput='';
let dailyQcm=null,dailyIdx=0,dailyAns=null,dailyScore={ok:0,total:0},dailyOpts=[],dailyActive=false,listenMode=false;
let showStats=false;

const $=id=>document.getElementById(id);
const esc=s=>(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function setStatus(t,show=true){$('status-bar').classList.toggle('hidden',!show);$('status-text').textContent=t}
function allFlat(){return Object.entries(vocab).flatMap(([c,ws])=>ws.map(w=>({...w,_cat:c})))}
function totalWords(){return Object.values(vocab).flat().length}
function learnedWords(){return Object.values(vocab).flat().filter(w=>(w.box||0)>=3).length}
function getKnownLemmas(){const s=new Set();Object.values(vocab).flat().forEach(w=>{if(w.lemma)s.add(w.lemma.toLowerCase());if(w.original)s.add(w.original.toLowerCase())});return s}

async function loadVocab(){setStatus('Chargement...');try{const data=await ghGetRaw('data/vocab.json');if(data&&data.words){vocab=data.words;ALL_TYPES.forEach(t=>{if(!vocab[t])vocab[t]=[]})}}catch(e){console.error('Load:',e);const ls=localStorage.getItem('sf_vocab');if(ls)try{vocab=JSON.parse(ls)}catch{}}setStatus('',false);render()}
async function saveVocab(){await saveVocabToGH(vocab)}
function exportVocab(){const data={version:3,lastUpdated:new Date().toISOString().split('T')[0],words:vocab};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='slovakforge-vocab-'+new Date().toISOString().split('T')[0]+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}

async function doGenerate(){if(!readTheme.trim())return;readLoading=true;readText=null;readRevealed=new Set();readSelected=new Set();readAddedCount=0;readError='';render();try{const r=await aiGenerateText(readTheme.trim(),readLevel);readText=r?.sentences?r:{title:'Erreur',sentences:[{sk:'Chyba.',fr:'Erreur.'}]}}catch(e){readError=e.message||'Erreur API'}readLoading=false;render()}
function toggleWord(w){const c=w.replace(/[.,!?;:"""'\u2019\u201e\u201c\u2014\u2013\-()[\]]/g,'').trim().toLowerCase();if(!c||c.length<2)return;readSelected.has(c)?readSelected.delete(c):readSelected.add(c);render()}
async function doAddWords(){if(!readSelected.size)return;readAnalyzing=true;readError='';render();const ctx=readText?.sentences?.map(s=>s.sk).join(' ')||'';try{const r=await aiAnalyzeWords([...readSelected],ctx);if(r?.words){let count=0;r.words.forEach(w=>{const k=ALL_TYPES.includes(w.type)?w.type:'expression';if(!vocab[k])vocab[k]=[];if(!vocab[k].some(e=>(e.lemma||e.original)===(w.lemma||w.original))){vocab[k].push({...w,box:0,lastReview:null,addedAt:Date.now(),reviews:0,errors:0});count++}});readAddedCount=count;readSelected=new Set();await saveVocab()}}catch(e){readError=e.message}readAnalyzing=false;render()}
function deleteWord(cat,idx){vocab[cat].splice(idx,1);saveVocab();render()}
async function doAddManualWord(){const input=$('manual-word-input');const word=input?.value?.trim();if(!word)return;addingWord=true;render();try{const r=await aiTranslateWord(word);if(r){const k=ALL_TYPES.includes(r.type)?r.type:'expression';if(!vocab[k])vocab[k]=[];if(!vocab[k].some(e=>(e.lemma||e.original)===(r.lemma||r.original))){vocab[k].push({...r,box:0,lastReview:null,addedAt:Date.now(),reviews:0,errors:0});await saveVocab();addWordInput=''}}}catch(e){console.error(e)}addingWord=false;render()}

// === DAILY QCM ===
function generateDailyPool(){
  const due=Object.values(vocab).flat().filter(isDue).sort(()=>Math.random()-.5).slice(0,8);
  // Add hardest words (high error rate) as priority
  const hard=Object.values(vocab).flat().filter(w=>(w.reviews||0)>=2&&getWordErrorRate(w)>0.4).sort((a,b)=>getWordErrorRate(b)-getWordErrorRate(a)).slice(0,4);
  const poolL=new Set([...due,...hard].map(w=>w.lemma||w.original));
  const merged=[...due,...hard.filter(w=>!new Set(due.map(d=>d.lemma||d.original)).has(w.lemma||w.original))];
  const all=allFlat();
  const extras=all.filter(w=>!poolL.has(w.lemma||w.original)).sort(()=>Math.random()-.5).slice(0,15-merged.length);
  return[...merged,...extras].sort(()=>Math.random()-.5);
}
function startDailyQcm(){const pool=generateDailyPool();if(pool.length<4){readError='Pas assez de mots (min 4).';render();setTimeout(()=>{readError='';render()},3000);return}dailyQcm=pool;dailyIdx=0;dailyAns=null;dailyScore={ok:0,total:0};dailyActive=true;makeDailyOpts(0);render()}
function stopDaily(){dailyActive=false;dailyQcm=null;render()}

function makeDailyOpts(idx){
  if(!dailyQcm||!dailyQcm[idx])return;
  const cor=dailyQcm[idx];const all=allFlat();
  const dir=Math.random()>0.5?'sk':'fr';
  const isVerb=(cor._cat==='verb'||cor.type==='verb')&&cor.conjugation;
  const hasPast=isVerb&&cor.past;
  let mode='plain';
  if(isVerb){const r=Math.random();if(hasPast&&r<0.3)mode='past';else mode='conj'}
  let dist=all.filter(w=>(w.lemma||w.original)!==(cor.lemma||cor.original)).sort(()=>Math.random()-.5);
  const same=dist.filter(w=>(w.type||w._cat)===(cor.type||cor._cat));
  const other=dist.filter(w=>(w.type||w._cat)!==(cor.type||cor._cat));
  dist=[...same,...other].slice(0,3);

  if(mode==='conj'){const form=randomConjForm(cor);if(!form){mode='plain'}else if(dir==='sk'){const corA=cor.fr+' ('+form.frPerson+')';const distA=dist.map(w=>{const v=(w._cat==='verb'||w.type==='verb')&&w.conjugation;if(v){const f=randomConjForm(w);return f?w.fr+' ('+f.frPerson+')':w.fr}return w.fr});dailyOpts=[...distA,corA].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='sk';dailyQcm[idx]._prompt=form.full;dailyQcm[idx]._correct=corA;dailyQcm[idx]._mode='conj';dailyAns=null;return}else{const corA=form.full;const distA=dist.map(w=>{const v=(w._cat==='verb'||w.type==='verb')&&w.conjugation;if(v){const f=randomConjForm(w);return f?f.full:(w.lemma||w.original)}return w.lemma||w.original});dailyOpts=[...distA,corA].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='fr';dailyQcm[idx]._prompt=cor.fr+' ('+form.frPerson+')';dailyQcm[idx]._correct=corA;dailyQcm[idx]._mode='conj';dailyAns=null;return}}
  if(mode==='past'){const form=randomPastForm(cor);if(!form){mode='plain'}else if(dir==='sk'){const corA=cor.fr+' pass\u00e9 ('+form.frPerson+')';const distA=dist.map(w=>{const hp=(w._cat==='verb'||w.type==='verb')&&w.past;if(hp){const f=randomPastForm(w);return f?w.fr+' pass\u00e9 ('+f.frPerson+')':w.fr}return w.fr});dailyOpts=[...distA,corA].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='sk';dailyQcm[idx]._prompt=form.full;dailyQcm[idx]._correct=corA;dailyQcm[idx]._mode='past';dailyAns=null;return}else{const corA=form.full;const distA=dist.map(w=>{const hp=(w._cat==='verb'||w.type==='verb')&&w.past;if(hp){const f=randomPastForm(w);return f?f.full:(w.lemma||w.original)}return w.lemma||w.original});dailyOpts=[...distA,corA].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='fr';dailyQcm[idx]._prompt=cor.fr+' pass\u00e9 ('+form.frPerson+')';dailyQcm[idx]._correct=corA;dailyQcm[idx]._mode='past';dailyAns=null;return}}
  if(dir==='sk'){dailyOpts=[...dist.map(w=>w.fr),cor.fr].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='sk';dailyQcm[idx]._prompt=cor.lemma||cor.original;dailyQcm[idx]._correct=cor.fr;dailyQcm[idx]._mode='plain'}else{dailyOpts=[...dist.map(w=>w.lemma||w.original),cor.lemma||cor.original].sort(()=>Math.random()-.5);dailyQcm[idx]._dir='fr';dailyQcm[idx]._prompt=cor.fr;dailyQcm[idx]._correct=cor.lemma||cor.original;dailyQcm[idx]._mode='plain'}dailyAns=null;
}

function handleDailyAnswer(selected){
  const w=dailyQcm[dailyIdx];const correct=w._correct;const ok=selected===correct;
  dailyAns=selected;dailyScore.ok+=ok?1:0;dailyScore.total+=1;
  const cat=w._cat||w.type;const lemma=w.lemma||w.original;
  // Leitner
  if(cat&&vocab[cat]){const i=vocab[cat].findIndex(x=>(x.lemma||x.original)===lemma);if(i!==-1){vocab[cat][i].box=ok?Math.min((vocab[cat][i].box||0)+1,5):Math.max((vocab[cat][i].box||0)-1,0);vocab[cat][i].lastReview=Date.now()}}
  // Error tracking
  trackReview(cat,lemma,ok);
  saveVocab();render();
  setTimeout(()=>{if(dailyIdx+1<dailyQcm.length){dailyIdx++;makeDailyOpts(dailyIdx)}else{dailyActive='results'}render()},900);
}
function playDailyAudio(){if(!dailyQcm||!dailyQcm[dailyIdx])return;const w=dailyQcm[dailyIdx];if(w._dir==='sk')speak(w._prompt,'sk-SK');else speak(w._prompt,'fr-FR')}

// === Learning ===
function getLearnWords(){const ws=learnCat==='all'?allFlat():(vocab[learnCat]||[]);return learnDueOnly?getDueWords(ws):ws}
function startLearn(cat,mode,dueOnly){const base=cat==='all'?allFlat():(vocab[cat]||[]);const ws=dueOnly?getDueWords(base):base;if(ws.length<2){readError='Pas assez de mots (min 2).';render();setTimeout(()=>{readError='';render()},3000);return}learnCat=cat;learnMode=mode;learnIdx=0;learnFlip=false;learnDueOnly=!!dueOnly;learnScore={ok:0,total:0};learnStreak=0;quizAns=null;fillAns=null;if(mode==='quiz')makeQuizOpts(0,ws);if(mode==='fill'){fillLoading=true;fillIdx=0;render();aiGenerateFill(ws).then(r=>{fillExs=r?.exercises||[];fillLoading=false;render()}).catch(()=>{fillExs=[];fillLoading=false;render()})}render()}
function makeQuizOpts(idx,ws){const cor=ws[idx];if(!cor)return;const oth=ws.filter((_,i)=>i!==idx).sort(()=>Math.random()-.5).slice(0,3);quizOpts=learnDir==='fr'?[...oth.map(w=>w.lemma||w.original),cor.lemma||cor.original].sort(()=>Math.random()-.5):[...oth.map(w=>w.fr),cor.fr].sort(()=>Math.random()-.5);quizAns=null}
function handleAnswer(ok){
  learnScore.ok+=ok?1:0;learnScore.total+=1;learnStreak=ok?learnStreak+1:0;
  const ws=getLearnWords(),w=ws[learnIdx];
  const updateWord=(catWs,cat)=>{const i=catWs.findIndex(x=>(x.lemma||x.original)===(w.lemma||w.original));if(i!==-1){catWs[i].box=ok?Math.min((catWs[i].box||0)+1,5):Math.max((catWs[i].box||0)-1,0);catWs[i].lastReview=Date.now();trackReview(cat,w.lemma||w.original,ok);saveVocab()}};
  if(w&&learnCat!=='all')updateWord(vocab[learnCat],learnCat);
  else if(w&&learnCat==='all'&&w._cat&&vocab[w._cat])updateWord(vocab[w._cat],w._cat);
  setTimeout(()=>{const ws2=getLearnWords();if(learnIdx+1<ws2.length){learnIdx++;learnFlip=false;quizAns=null;if(learnMode==='quiz')makeQuizOpts(learnIdx,ws2)}else{learnMode='results'}render()},700);
}

function conjHTML(conj){if(!conj)return'';const p=['ja','ty','on/ona','my','vy','oni'];const f=conj.split(',').map(x=>x.trim());let h='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 12px;margin-top:6px">';f.forEach((x,j)=>{h+='<div style="padding:2px 0"><span style="font-size:9px;color:var(--txD)">'+(p[j]||'')+'</span><br><span class="mono" style="font-size:12px;color:var(--txt)">'+esc(x)+'</span></div>'});return h+'</div>'}
function audioBtn(text,size){return'<button onclick="event.stopPropagation();speak(\''+esc(text.replace(/'/g,"\\'"))+'\',\'sk-SK\')" style="background:none;border:1px solid var(--brd);border-radius:6px;color:var(--blu);cursor:pointer;padding:'+(size||'3px 6px')+';font-size:'+(size?'14px':'12px')+'">\ud83d\udd0a</button>'}
function grammarBadge(note){if(!note||note==='null')return'';return'<p style="font-size:10px;color:#ff9800;margin-top:3px;background:#ff980015;padding:3px 7px;border-radius:3px;border-left:2px solid #ff9800;display:inline-block">\ud83d\udcdd '+esc(note)+'</p>'}
function errorBadge(w){const r=w.reviews||0;if(r<1)return'';const e=w.errors||0;const pct=Math.round((1-e/r)*100);const col=pct>=80?'var(--grn)':pct>=50?'#ff9800':'var(--red)';return'<span class="tag" style="background:'+col+'22;color:'+col+';font-size:9px">'+pct+'% ('+r+'x)</span>'}

// === STATS HTML ===
function renderStatsPanel(){
  const st=getGlobalStats();const hard=getHardestWords(8);
  let h='<div class="card" style="border-left:4px solid var(--blu);margin-bottom:16px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="showStats=!showStats;render()"><div><span style="font-size:16px">\ud83d\udcca</span> <strong style="color:var(--blu)">Statistiques</strong></div><span style="color:var(--txD);font-size:14px">'+(showStats?'\u25b4':'\u25be')+'</span></div>';
  if(showStats){
    h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:14px;text-align:center">';
    h+='<div><span style="font-size:22px;font-weight:700;color:var(--txt)">'+st.total+'</span><br><span class="muted">mots</span></div>';
    h+='<div><span style="font-size:22px;font-weight:700;color:var(--grn)">'+st.mastered+'</span><br><span class="muted">ma\u00eetris\u00e9s</span></div>';
    h+='<div><span style="font-size:22px;font-weight:700;color:var(--blu)">'+st.totalReviews+'</span><br><span class="muted">r\u00e9visions</span></div>';
    h+='<div><span style="font-size:22px;font-weight:700;color:'+(st.successRate>=70?'var(--grn)':st.successRate>=50?'#ff9800':'var(--red)')+'">'+st.successRate+'%</span><br><span class="muted">r\u00e9ussite</span></div>';
    h+='</div>';
    if(hard.length>0){
      h+='<p style="font-size:11px;color:var(--txD);margin-top:14px;margin-bottom:6px">\ud83d\udd34 Mots les plus difficiles :</p>';
      h+='<div style="display:flex;flex-wrap:wrap;gap:6px">';
      hard.forEach(w=>{const pct=Math.round((1-(w.errors||0)/(w.reviews||1))*100);const col=pct>=50?'#ff9800':'var(--red)';h+='<div style="background:var(--sf);border:1px solid var(--brd);border-radius:8px;padding:5px 10px;display:flex;align-items:center;gap:6px"><span class="mono" style="font-size:12px;color:var(--txt)">'+esc(w.lemma||w.original)+'</span><span style="font-size:10px;color:'+col+'">'+pct+'%</span>'+audioBtn(w.lemma||w.original)+'</div>'});
      h+='</div>';
    }
  }
  h+='</div>';return h;
}

// ==================== RENDER ====================
function render(){
const C=$('content');if(!C)return;
const statsEl=$('header-stats');if(statsEl){const due=getAllDueCount();statsEl.textContent=totalWords()+' mots \u00b7 '+learnedWords()+' appris'+(due>0?' \u00b7 '+due+' \u00e0 r\u00e9viser':'')}
const knownSet=getKnownLemmas();

if(currentTab==='read'){
let h='<div style="max-width:700px;margin:0 auto">';

// DAILY ACTIVE
if(dailyActive===true&&dailyQcm&&dailyQcm[dailyIdx]){
  const w=dailyQcm[dailyIdx],dir=w._dir||'sk',prompt=w._prompt||'',correct=w._correct||'';
  const ci=CATS[w._cat||w.type]||{color:'#aaa',label:'?',icon:'?'};const md=w._mode||'plain';
  const modeLabel=md==='conj'?'conjugu\u00e9':md==='past'?'pass\u00e9':'';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="stopDaily()">\u2190</button><div style="display:flex;align-items:center;gap:8px"><button class="btn '+(listenMode?'btn-pri':'btn-sec')+'" style="font-size:11px;padding:5px 10px" onclick="listenMode=!listenMode;render()">\ud83d\udc42 '+(listenMode?'ON':'OFF')+'</button><span class="mono" style="font-size:12px;color:var(--purp);font-weight:700">'+(dailyIdx+1)+'/'+dailyQcm.length+'</span></div></div>';
  h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((dailyIdx+1)/dailyQcm.length)*100)+'%;background:var(--purp)"></div></div>';
  h+='<div class="card" style="text-align:center;border-top:3px solid '+(md==='past'?'#FF5722':'var(--purp)')+';margin-top:12px">';
  h+='<div style="display:flex;justify-content:center;gap:6px;margin-bottom:10px"><span class="tag" style="background:'+ci.color+'22;color:'+ci.color+'">'+ci.icon+' '+ci.label+'</span><span class="tag" style="background:var(--brd);color:var(--txD)">'+(dir==='sk'?'SK\u2192FR':'FR\u2192SK')+'</span>'+(modeLabel?'<span class="tag" style="background:'+(md==='past'?'#FF572222':'#E85D3A22')+';color:'+(md==='past'?'#FF5722':'#E85D3A')+'">'+modeLabel+'</span>':'')+'</div>';
  if(listenMode&&dir==='sk'){h+='<div style="font-size:48px;margin:20px 0">\ud83d\udc42</div><p class="muted" style="margin-bottom:10px">\u00c9coute et trouve</p><button class="btn btn-sec" onclick="playDailyAudio()">\ud83d\udd04 R\u00e9\u00e9couter</button>';if(dailyAns!==null)h+='<h2 class="mono-b" style="font-size:22px;margin:8px 0;color:var(--acc)">'+esc(prompt)+'</h2>'}
  else{h+='<h2 class="mono-b" style="font-size:28px;margin:10px 0">'+esc(prompt)+'</h2>'+audioBtn(prompt,'6px 12px')}
  h+='</div>';
  dailyOpts.forEach(function(o){var cls='qcm-opt';if(dailyAns!==null){if(o===correct)cls+=' correct';else if(o===dailyAns&&o!==correct)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(dailyAns===null)handleDailyAnswer(\''+esc(o.replace(/'/g,"\\'"))+'\')">'+esc(o)+'</div>'});
  h+='</div>';C.innerHTML=h;if(listenMode&&dir==='sk'&&dailyAns===null)setTimeout(playDailyAudio,300);return;
}
// DAILY RESULTS
if(dailyActive==='results'){
  const pct=dailyScore.total?Math.round(dailyScore.ok/dailyScore.total*100):0;
  h+='<div class="card" style="text-align:center;padding:36px;border-top:3px solid var(--purp)"><div style="font-size:48px;margin-bottom:12px">'+(pct>=80?'\ud83c\udfc6':pct>=50?'\ud83d\udcaa':'\ud83d\udcd6')+'</div>';
  h+='<h2 class="mono-b" style="font-size:22px;margin-bottom:6px">Daily QCM termin\u00e9 !</h2>';
  h+='<p class="muted" style="margin-bottom:20px">'+dailyQcm.length+' questions</p>';
  h+='<div style="display:flex;justify-content:center;gap:28px"><div><span style="font-size:30px;font-weight:700;color:var(--grn)">'+dailyScore.ok+'</span><br><span class="muted">OK</span></div><div><span style="font-size:30px;font-weight:700;color:var(--red)">'+(dailyScore.total-dailyScore.ok)+'</span><br><span class="muted">Rat\u00e9s</span></div><div><span style="font-size:30px;font-weight:700;color:var(--purp)">'+pct+'%</span></div></div>';
  h+='<div style="display:flex;gap:10px;justify-content:center;margin-top:22px"><button class="btn" style="background:var(--purp);color:#fff" onclick="startDailyQcm()">\ud83c\udfb2 Relancer</button><button class="btn btn-sec" onclick="stopDaily()">\u2190</button></div></div>';
  h+='</div>';C.innerHTML=h;return;
}

// DAILY BANNER
if(allFlat().length>=4){const dN=getAllDueCount();h+='<div class="card" style="border-left:4px solid var(--purp);display:flex;justify-content:space-between;align-items:center;padding:16px 18px;margin-bottom:16px;background:linear-gradient(135deg,var(--card),#1a1028)"><div><span style="font-size:22px">\ud83e\udde0</span> <strong style="color:var(--purp);font-size:15px">Daily QCM</strong><br><span class="muted">Conjugu\u00e9s + pass\u00e9 + mots difficiles'+(dN>0?' \u00b7 <span style="color:#ff9800">'+dN+' dus</span>':'')+'</span></div><button class="btn" style="background:var(--purp);color:#fff;padding:12px 20px;font-size:13px" onclick="startDailyQcm()">\ud83c\udfb2 Lancer</button></div>'}

// STATS PANEL
if(allFlat().length>0)h+=renderStatsPanel();

if(readError)h+='<div class="card" style="border-color:var(--red);color:var(--red)">'+esc(readError)+'</div>';
h+='<div class="card"><h2 style="font-size:17px;font-weight:800;margin-bottom:4px">\ud83d\udcd6 G\u00e9n\u00e8re un texte</h2><p class="muted" style="margin-bottom:14px">Th\u00e8me \u2192 lis \u2192 capture</p>';
h+='<input id="read-theme" placeholder="Ex: au restaurant..." value="'+esc(readTheme)+'" onkeydown="if(event.key===\'Enter\')doGenerate()" style="width:100%;padding:11px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:14px;margin-bottom:10px" oninput="readTheme=this.value">';
h+='<div style="display:flex;gap:7px;margin-bottom:14px">';[['easy','\ud83d\udfe2 Facile'],['medium','\ud83d\udfe1 Moyen'],['hard','\ud83d\udd34 Difficile']].forEach(([k,l])=>{h+='<button class="btn '+(readLevel===k?'btn-pri':'btn-sec')+'" style="flex:1" onclick="readLevel=\''+k+'\';render()">'+l+'</button>'});h+='</div>';
h+='<button class="btn btn-pri" style="width:100%;padding:13px;font-size:14px" onclick="doGenerate()" '+(readLoading?'disabled':'')+'>'+(readLoading?'\u23f3':'\ud83d\ude80 G\u00e9n\u00e9rer')+'</button></div>';
if(readLoading)h+='<div class="card" style="text-align:center;padding:30px"><div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div></div>';
if(readAddedCount>0&&!readAnalyzing)h+='<div class="card" style="border-color:var(--grn);color:var(--grn);text-align:center">\u2705 '+readAddedCount+' ajout\u00e9'+(readAddedCount>1?'s':'')+'</div>';
if(readText&&!readLoading){
  h+='<h3 style="font-size:15px;font-weight:700;margin-bottom:4px">'+esc(readText.title||'')+'</h3><p class="muted" style="margin-bottom:12px">\ud83d\udca1 <b style="color:var(--blu)">phrase</b>=trad \u00b7 <b style="color:var(--acc)">mot</b>=capturer \u00b7 <span style="color:var(--grn)">\u2588</span>=connu</p>';
  h+='<div style="display:flex;flex-direction:column;gap:2px">';
  readText.sentences.forEach((s,i)=>{const rev=readRevealed.has(i);h+='<div style="border-radius:6px;overflow:hidden"><div class="sentence-row" style="border-left-color:'+(rev?'var(--blu)':'var(--brd)')+'" onclick="readRevealed.has('+i+')?readRevealed.delete('+i+'):readRevealed.add('+i+');render()"><span class="s-num">'+(i+1)+'</span><div style="flex:1;display:flex;flex-wrap:wrap;gap:3px">';s.sk.split(/(\s+)/).forEach(w=>{if(!w.trim()){h+='<span>&nbsp;</span>';return}const c=w.replace(/[.,!?;:\'\u2019\u201e\u201c\u2014\u2013\-()[\]]/g,'').toLowerCase();const sel=readSelected.has(c);const known=knownSet.has(c);let st='';if(sel)st='background:rgba(232,93,58,.25);color:var(--acc);';else if(known)st='border-bottom:2px solid var(--grn);color:var(--grn);';h+='<span class="word-token" style="'+st+'" onclick="event.stopPropagation();toggleWord(\''+esc(w.replace(/'/g,"\\'"))+'\')">'+esc(w)+'</span>'});h+='</div>'+audioBtn(s.sk,'4px 8px')+'<span style="color:#444;font-size:13px;margin-left:4px">'+(rev?'\u25be':'\u25b8')+'</span></div>';if(rev)h+='<div class="fr-translation">'+esc(s.fr)+'</div>';h+='</div>'});h+='</div>';
  if(readSelected.size>0){h+='<div class="sel-bar"><div style="display:flex;flex-wrap:wrap;gap:5px;flex:1">';readSelected.forEach(w=>{h+='<span class="sel-tag" onclick="toggleWord(\''+esc(w)+'\')">'+esc(w)+' \u2715</span>'});h+='</div><button class="btn btn-grn" onclick="doAddWords()" '+(readAnalyzing?'disabled':'')+'>\u271a '+readSelected.size+'</button></div>'}
  if(readAnalyzing)h+='<div style="text-align:center;padding:20px"><div class="spinner"></div></div>';
}
if(!readText&&!readLoading){h+='<p class="muted" style="margin-top:16px;margin-bottom:10px">\ud83d\udca1 Id\u00e9es :</p><div style="display:flex;flex-wrap:wrap;gap:7px">';THEMES.forEach(t=>{h+='<button class="btn btn-sec" style="font-size:11px;padding:6px 12px" onclick="readTheme=\''+t+'\';render()">'+t+'</button>'});h+='</div>'}
h+='</div>';C.innerHTML=h;return;
}

// === VOCAB ===
if(currentTab==='vocab'){
let h='<div style="max-width:700px;margin:0 auto">';
h+='<div class="card" style="display:flex;gap:8px;align-items:center;padding:12px 16px"><input id="manual-word-input" placeholder="\u270f\ufe0f Mot FR \u2192 IA traduit" value="'+esc(addWordInput)+'" oninput="addWordInput=this.value" onkeydown="if(event.key===\'Enter\')doAddManualWord()" style="flex:1;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px"><button class="btn btn-pri" onclick="doAddManualWord()" '+(addingWord?'disabled':'')+'>'+(addingWord?'\u23f3':'\u271a')+'</button></div>';
h+='<div style="display:flex;gap:8px;margin-bottom:12px"><input placeholder="\ud83d\udd0d Chercher..." value="'+esc(searchTerm)+'" oninput="searchTerm=this.value;render()" style="flex:1;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px"><button class="btn btn-sec" onclick="exportVocab()">\ud83d\udcbe</button></div>';
if(searchTerm.length>1){const res=allFlat().filter(w=>(w.lemma||w.original||'').toLowerCase().includes(searchTerm.toLowerCase())||(w.fr||'').toLowerCase().includes(searchTerm.toLowerCase())).slice(0,15);if(!res.length)h+='<p class="muted" style="text-align:center;padding:20px">Aucun r\u00e9sultat</p>';else res.forEach(w=>{const cat=CATS[w._cat]||{};h+='<div class="card" style="border-left:4px solid '+(cat.color||'#666')+';padding:10px 14px;margin-bottom:6px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="mono-b">'+esc(w.lemma||w.original)+'</span>'+audioBtn(w.lemma||w.original)+'<span class="muted">'+esc(w.fr)+'</span>'+errorBadge(w)+'</div></div>'})}
else{h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px">';Object.entries(CATS).forEach(([k,c])=>{const count=(vocab[k]||[]).length;if(!count&&vocabCatTab!==k)return;h+='<button class="btn '+(vocabCatTab===k?'btn-pri':'btn-sec')+'" style="font-size:10px;padding:6px 10px;'+(vocabCatTab===k?'background:'+c.color:'')+'" onclick="vocabCatTab=\''+k+'\';render()">'+c.icon+' '+c.label+' '+count+'</button>'});h+='</div>';
const words=vocab[vocabCatTab]||[];
if(!words.length)h+='<div class="card" style="text-align:center;padding:40px"><p class="muted">Aucun mot.</p></div>';
else words.forEach((w,i)=>{const catC=CATS[vocabCatTab]?.color||'#666';const due=isDue(w);h+='<div class="card" style="border-left:4px solid '+catC+';padding:12px 14px;margin-bottom:6px;'+(due?'border-right:3px solid #ff9800;':'')+'">';h+='<div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="flex:1"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px"><span class="mono-b" style="font-size:16px">'+esc(w.lemma||w.original)+'</span>'+audioBtn(w.lemma||w.original)+'<span style="color:var(--txM);font-size:14px">'+esc(w.fr)+'</span>'+errorBadge(w);if(w.gender)h+='<span class="tag" style="background:'+(w.gender==='M'?'#2196F333':w.gender==='F'?'#E91E6333':'#9E9E9E33')+';color:'+(w.gender==='M'?'#2196F3':w.gender==='F'?'#E91E63':'#9E9E9E')+'">'+w.gender+'</span>';h+='</div>';if(w.conjugation)h+=conjHTML(w.conjugation);if(w.past){h+='<p style="font-size:9px;color:#FF5722;margin-top:6px">Pass\u00e9 :</p>'+conjHTML(w.past)}if(w.example)h+='<p style="font-size:11px;color:var(--txM);margin-top:6px;font-style:italic">\ud83d\udcac '+esc(w.example)+'</p>';if(w.tip)h+='<p style="font-size:10px;color:var(--txD);margin-top:3px;background:var(--sf);padding:3px 7px;border-radius:3px;display:inline-block">\ud83d\udca1 '+esc(w.tip)+'</p>';if(w.grammar_note)h+=grammarBadge(w.grammar_note);h+='</div><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div class="box-indicator" style="background:hsl('+(w.box||0)*24+',70%,42%)">'+(w.box||0)+'</div><button style="background:none;border:none;color:#444;font-size:14px;cursor:pointer" onclick="deleteWord(\''+vocabCatTab+'\','+i+')">\u2715</button></div></div></div>'})}
h+='</div>';C.innerHTML=h;return;
}

// === LEARN ===
if(currentTab==='learn'){
let h='<div style="max-width:540px;margin:0 auto">';const lw=getLearnWords();
if(!learnMode){const dueAll=getAllDueCount();if(dueAll>0)h+='<div class="card" style="border-color:#ff9800;border-left:4px solid #ff9800;display:flex;justify-content:space-between;align-items:center"><div><strong style="color:#ff9800">\ud83d\udd25 '+dueAll+' \u00e0 r\u00e9viser</strong></div><button class="btn" style="background:#ff9800;color:#000;padding:10px 18px" onclick="startLearn(\'all\',\'flash\',true)">\ud83c\udfaf</button></div>';else h+='<div class="card" style="border-color:var(--grn);text-align:center;padding:20px">\u2705 <strong style="color:var(--grn)">Tout \u00e0 jour</strong></div>';h+='<h2 style="font-size:18px;font-weight:800;margin:16px 0 4px">Sessions libres</h2><p class="muted" style="margin-bottom:10px">Direction :</p><div style="display:flex;gap:8px;margin-bottom:18px">';[['sk','SK\u2192FR','#E85D3A'],['fr','FR\u2192SK','#2D7DD2'],['mix','Mix','#9C27B0']].forEach(([k,l,c])=>{h+='<button class="btn '+(learnDir===k?'btn-pri':'btn-sec')+'" style="flex:1;'+(learnDir===k?'background:'+c:'')+'" onclick="learnDir=\''+k+'\';render()">'+l+'</button>'});h+='</div>';[...Object.entries(CATS),['all',{label:'Tous',icon:'\ud83c\udf0d',color:'#aaa'}]].forEach(([k,c])=>{const base=k==='all'?allFlat():(vocab[k]||[]);const n=base.length;const due=getDueWords(base).length;if(n<2)return;h+='<div class="card" style="border-left:4px solid '+c.color+'"><div style="display:flex;justify-content:space-between;align-items:center"><span class="mono-b">'+c.icon+' '+c.label+' ('+n+')</span>'+(due>0?'<span class="tag" style="background:#ff980033;color:#ff9800">'+due+'</span>':'')+'</div><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'flash\',false)">\ud83d\udcda</button>';if(due>=2)h+='<button class="btn btn-sec" style="border-color:#ff9800;color:#ff9800" onclick="startLearn(\''+k+'\',\'flash\',true)">\ud83d\udd25'+due+'</button>';h+='<button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'quiz\',false)">\ud83c\udfaf</button>';if(n>=3)h+='<button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'fill\',false)">\u270f\ufe0f</button>';h+='</div></div>'})}
else if(learnMode==='flash'&&lw[learnIdx]){const w=lw[learnIdx],d=learnDir==='mix'?(learnIdx%2===0?'sk':'fr'):learnDir;const front=d==='sk'?(w.lemma||w.original):w.fr,back=d==='sk'?w.fr:(w.lemma||w.original);h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button><span class="mono" style="font-size:11px;color:var(--txD)">'+(learnIdx+1)+'/'+lw.length+'</span></div>';h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((learnIdx+1)/lw.length)*100)+'%;background:'+(learnDueOnly?'#ff9800':'#E85D3A')+'"></div></div>';if(learnStreak>=3)h+='<div style="text-align:center;margin:8px 0"><span class="streak-badge">\ud83d\udd25 '+learnStreak+'</span></div>';h+='<div class="flash-card '+(learnFlip?'flipped':'')+'" onclick="learnFlip=!learnFlip;render()" style="min-height:280px;margin-top:12px">';if(!learnFlip){h+='<span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--txD)">'+(d==='sk'?'Slovaque':'Fran\u00e7ais')+'</span><h2 class="mono-b" style="font-size:28px;margin:20px 0">'+esc(front)+'</h2><div style="margin:8px 0">'+audioBtn(front,'6px 12px')+'</div><p class="muted" style="font-size:12px">Touche pour retourner</p>'}else{h+='<span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--acc)">'+(d==='sk'?'Fran\u00e7ais':'Slovaque')+'</span><h2 class="mono-b" style="font-size:24px;margin:14px 0">'+esc(back)+'</h2>';if(w.conjugation)h+=conjHTML(w.conjugation);if(w.past){h+='<p style="font-size:9px;color:#FF5722;margin-top:6px">Pass\u00e9:</p>'+conjHTML(w.past)}if(w.example)h+='<p style="font-size:11px;color:var(--txM);font-style:italic;margin-top:8px">\ud83d\udcac '+esc(w.example)+'</p>';if(w.tip)h+='<p style="font-size:10px;color:var(--txD);margin-top:6px;background:var(--sf);padding:4px 8px;border-radius:4px">\ud83d\udca1 '+esc(w.tip)+'</p>';if(w.grammar_note)h+=grammarBadge(w.grammar_note)}h+='</div>';if(learnFlip)h+='<div style="display:flex;gap:14px;justify-content:center;margin-top:18px"><button class="btn" style="background:var(--red);color:#fff;padding:12px 24px;min-width:130px" onclick="handleAnswer(false)">\u2717</button><button class="btn" style="background:var(--grn);color:#000;padding:12px 24px;min-width:130px" onclick="handleAnswer(true)">\u2713</button></div>'}
else if(learnMode==='quiz'&&lw[learnIdx]){const w=lw[learnIdx],d=learnDir==='mix'?(learnIdx%2===0?'sk':'fr'):learnDir;const prompt=d==='sk'?(w.lemma||w.original):w.fr,correct=d==='sk'?w.fr:(w.lemma||w.original);h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button><span class="mono" style="font-size:11px;color:var(--txD)">'+(learnIdx+1)+'/'+lw.length+'</span></div>';h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((learnIdx+1)/lw.length)*100)+'%;background:var(--blu)"></div></div>';h+='<div class="card" style="text-align:center;border-top:3px solid var(--blu);margin-top:12px"><h2 class="mono-b" style="font-size:26px;margin:14px 0">'+esc(prompt)+'</h2>'+audioBtn(prompt,'6px 12px')+'</div>';quizOpts.forEach(o=>{let cls='qcm-opt';if(quizAns!==null){if(o===correct)cls+=' correct';else if(o===quizAns&&o!==correct)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(quizAns===null){quizAns=\''+esc(o.replace(/'/g,"\\'"))+'\';handleAnswer(\''+esc(o.replace(/'/g,"\\'"))+'\'===\''+esc(correct.replace(/'/g,"\\'"))+'\');render()}">'+esc(o)+'</div>'})}
else if(learnMode==='fill'){h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button></div>';if(fillLoading)h+='<div class="card" style="text-align:center;padding:30px"><div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div></div>';else if(!fillExs.length)h+='<div class="card" style="text-align:center;padding:30px"><button class="btn btn-pri" onclick="startLearn(learnCat,\'fill\',false)">\ud83d\udd04</button></div>';else if(fillExs[fillIdx]){h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((fillIdx+1)/fillExs.length)*100)+'%;background:#9C27B0"></div></div>';const ex=fillExs[fillIdx];h+='<div class="card" style="text-align:center;border-top:3px solid #9C27B0;margin-top:12px"><h2 class="mono-b" style="font-size:20px;line-height:1.6">'+esc(ex.sentence_sk)+'</h2><p style="font-size:12px;color:var(--txM);margin-top:10px;font-style:italic">= '+esc(ex.sentence_fr)+'</p></div>';(ex.options||[]).forEach(o=>{const cor=ex.answer;let cls='qcm-opt';if(fillAns!==null){if(o===cor)cls+=' correct';else if(o===fillAns&&o!==cor)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(fillAns===null){fillAns=\''+esc(o.replace(/'/g,"\\'"))+'\';learnScore.ok+='+(o===cor?1:0)+';learnScore.total++;render();setTimeout(()=>{if(fillIdx+1<fillExs.length){fillIdx++;fillAns=null}else{learnMode=\'results\'}render()},800)}">'+esc(o)+'</div>'})}}
else if(learnMode==='results'){const pct=learnScore.total?Math.round(learnScore.ok/learnScore.total*100):0;h+='<div class="card" style="text-align:center;padding:36px"><div style="font-size:48px;margin-bottom:12px">'+(pct>=80?'\ud83c\udfc6':pct>=50?'\ud83d\udcaa':'\ud83d\udcd6')+'</div><h2 class="mono-b" style="font-size:22px;margin-bottom:20px">Termin\u00e9 !</h2><div style="display:flex;justify-content:center;gap:28px"><div><span style="font-size:30px;font-weight:700;color:var(--grn)">'+learnScore.ok+'</span><br><span class="muted">OK</span></div><div><span style="font-size:30px;font-weight:700;color:var(--red)">'+(learnScore.total-learnScore.ok)+'</span><br><span class="muted">Rat\u00e9s</span></div><div><span style="font-size:30px;font-weight:700;color:var(--blu)">'+pct+'%</span></div></div><div style="display:flex;gap:10px;justify-content:center;margin-top:22px"><button class="btn btn-pri" onclick="startLearn(learnCat,\'flash\',false)">\ud83d\udcda</button><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190</button></div></div>'}
h+='</div>';C.innerHTML=h;return;
}

// === CONJ ===
if(currentTab==='conj'){
const verbs=(vocab.verb||[]).filter(v=>v.conjugation);const fv=conjSearch?verbs.filter(v=>(v.lemma||'').toLowerCase().includes(conjSearch.toLowerCase())||(v.fr||'').toLowerCase().includes(conjSearch.toLowerCase())):verbs;
let h='<div style="max-width:700px;margin:0 auto"><h2 style="font-size:18px;font-weight:800;margin-bottom:14px">\ud83d\udcd0 Conjugaison</h2>';
h+='<input placeholder="\ud83d\udd0d Verbe..." value="'+esc(conjSearch)+'" oninput="conjSearch=this.value;render()" style="width:100%;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px;margin-bottom:14px">';
if(!fv.length)h+='<div class="card" style="text-align:center;padding:30px"><p class="muted">Aucun verbe.</p></div>';
else fv.forEach(v=>{h+='<div class="card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span class="mono-b" style="font-size:17px">'+esc(v.lemma)+'</span>'+audioBtn(v.lemma,'4px 10px')+'<span class="muted" style="font-size:14px">= '+esc(v.fr)+'</span>'+errorBadge(v)+'</div><p style="font-size:9px;color:var(--txD)">Pr\u00e9sent</p>'+conjHTML(v.conjugation);if(v.past){h+='<p style="font-size:9px;color:#FF5722;margin-top:8px">Pass\u00e9</p>'+conjHTML(v.past)}if(v.example)h+='<p style="font-size:11px;color:var(--txM);font-style:italic;margin-top:10px">\ud83d\udcac '+esc(v.example)+'</p>';if(v.grammar_note)h+=grammarBadge(v.grammar_note);h+='</div>'});
h+='</div>';C.innerHTML=h;return;
}
}

function switchTab(t){currentTab=t;learnMode=null;dailyActive=false;render();renderNav()}
function renderNav(){$('nav-tabs').innerHTML=[['read','\ud83d\udcd6 Lire'],['vocab','\ud83d\udcda Vocab'],['learn','\ud83c\udfaf Apprendre'],['conj','\ud83d\udcd0 Conjugaison']].map(([k,l])=>'<button class="nav-btn'+(currentTab===k?' active':'')+'" onclick="switchTab(\''+k+'\')">'+(k==='learn'&&getAllDueCount()>0?'<span style="background:#ff9800;color:#000;border-radius:8px;padding:0 5px;font-size:9px;margin-right:3px">'+getAllDueCount()+'</span>':'')+l+'</button>').join('')}
async function init(){loadToken();updateGhTag();renderNav();await loadVocab()}
init();
