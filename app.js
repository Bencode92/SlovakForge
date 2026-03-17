// SlovakForge App v2 - Audio + Manual Add + UTF-8 fix
const CATS={verb:{label:'Verbes',icon:'\u26a1',color:'#E85D3A'},noun:{label:'Noms',icon:'\ud83d\udce6',color:'#2D7DD2'},conjunction:{label:'Conjonctions',icon:'\ud83d\udd17',color:'#9C27B0'},adjective:{label:'Adjectifs',icon:'\ud83c\udfa8',color:'#4CAF50'},expression:{label:'Expressions',icon:'\ud83d\udcac',color:'#FF9800'}};
const THEMES=['Au restaurant','Premier rendez-vous','Chez le m\u00e9decin','Faire les courses','Au travail','Week-end en famille','Dans le bus','Vacances en Slovaquie','Cuisine slovaque','Discussion avec belle-m\u00e8re','\u00c0 la boulangerie','Sport et loisirs'];
let vocab={verb:[],noun:[],conjunction:[],adjective:[],expression:[]},vocabSha=null,currentTab='read',vocabCatTab='verb';
let readTheme='',readLevel='easy',readText=null,readRevealed=new Set(),readSelected=new Set();
let readLoading=false,readAnalyzing=false,readAddedCount=0,readError='';
let learnMode=null,learnCat=null,learnIdx=0,learnFlip=false,learnDir='sk';
let learnScore={ok:0,total:0},learnStreak=0,quizOpts=[],quizAns=null;
let fillExs=[],fillIdx=0,fillAns=null,fillLoading=false,searchTerm='',conjSearch='';
let addingWord=false,addWordInput='';

const $=id=>document.getElementById(id);
const esc=s=>(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function setStatus(t,show=true){$('status-bar').classList.toggle('hidden',!show);$('status-text').textContent=t}
function allFlat(){return Object.entries(vocab).flatMap(([c,ws])=>ws.map(w=>({...w,_cat:c})))}
function totalWords(){return Object.values(vocab).flat().length}
function learnedWords(){return Object.values(vocab).flat().filter(w=>(w.box||0)>=3).length}

// === Data ===
async function loadVocab(){
  setStatus('Chargement...');
  try{
    const data=await ghGetRaw('data/vocab.json');
    if(data&&data.words)vocab=data.words;
  }catch(e){
    console.error('Load:',e);
    const ls=localStorage.getItem('sf_vocab');
    if(ls)try{vocab=JSON.parse(ls)}catch{}
  }
  setStatus('',false);render();
}
async function saveVocab(){
  localStorage.setItem('sf_vocab',JSON.stringify(vocab));
  if(!hasToken())return;
  try{
    const sha=await ghGetSha('data/vocab.json');
    const data={version:1,lastUpdated:new Date().toISOString().split('T')[0],categories:CATS,words:vocab};
    await ghPut('data/vocab.json',data,'Update vocab',sha);
  }catch(e){console.error('Save:',e)}
}

// === Text Gen ===
async function doGenerate(){
  if(!readTheme.trim())return;
  readLoading=true;readText=null;readRevealed=new Set();readSelected=new Set();readAddedCount=0;readError='';render();
  try{const r=await aiGenerateText(readTheme.trim(),readLevel);readText=r?.sentences?r:{title:'Erreur',sentences:[{sk:'Chyba.',fr:'Erreur. R\u00e9essaie.'}]}}
  catch(e){readError=e.message||'Erreur API'}
  readLoading=false;render();
}
function toggleWord(w){const c=w.replace(/[.,!?;:"""'\u2019\u201e\u201c\u2014\u2013\-()[\]]/g,'').trim().toLowerCase();if(!c||c.length<2)return;readSelected.has(c)?readSelected.delete(c):readSelected.add(c);render()}
async function doAddWords(){
  if(!readSelected.size)return;readAnalyzing=true;readError='';render();
  const ctx=readText?.sentences?.map(s=>s.sk).join(' ')||'';
  try{const r=await aiAnalyzeWords([...readSelected],ctx);if(r?.words){let count=0;r.words.forEach(w=>{const k=['verb','noun','adjective','conjunction','expression'].includes(w.type)?w.type:'expression';if(!vocab[k])vocab[k]=[];if(!vocab[k].some(e=>(e.lemma||e.original)===(w.lemma||w.original))){vocab[k].push({...w,box:0,lastReview:null,addedAt:Date.now()});count++}});readAddedCount=count;readSelected=new Set();await saveVocab()}}
  catch(e){readError=e.message}readAnalyzing=false;render();
}
function deleteWord(cat,idx){vocab[cat].splice(idx,1);saveVocab();render()}

// === Manual Add Word ===
async function doAddManualWord(){
  const input=$('manual-word-input');
  const word=input?.value?.trim();
  if(!word)return;
  addingWord=true;render();
  try{
    const r=await aiTranslateWord(word);
    if(r){
      const k=['verb','noun','adjective','conjunction','expression'].includes(r.type)?r.type:'expression';
      if(!vocab[k])vocab[k]=[];
      if(!vocab[k].some(e=>(e.lemma||e.original)===(r.lemma||r.original))){
        vocab[k].push({...r,box:0,lastReview:null,addedAt:Date.now()});
        await saveVocab();
        addWordInput='';
      }
    }
  }catch(e){console.error(e)}
  addingWord=false;render();
}

// === Learning ===
function getLearnWords(){return learnCat==='all'?allFlat():(vocab[learnCat]||[])}
function startLearn(cat,mode){
  const ws=cat==='all'?allFlat():(vocab[cat]||[]);if(ws.length<2)return;
  learnCat=cat;learnMode=mode;learnIdx=0;learnFlip=false;learnScore={ok:0,total:0};learnStreak=0;quizAns=null;fillAns=null;
  if(mode==='quiz')makeQuizOpts(0,ws);
  if(mode==='fill'){fillLoading=true;fillIdx=0;render();aiGenerateFill(ws).then(r=>{fillExs=r?.exercises||[];fillLoading=false;render()}).catch(()=>{fillExs=[];fillLoading=false;render()})}
  render();
}
function makeQuizOpts(idx,ws){
  const cor=ws[idx];if(!cor)return;
  const oth=ws.filter((_,i)=>i!==idx).sort(()=>Math.random()-.5).slice(0,3);
  quizOpts=learnDir==='fr'?[...oth.map(w=>w.lemma||w.original),cor.lemma||cor.original].sort(()=>Math.random()-.5):[...oth.map(w=>w.fr),cor.fr].sort(()=>Math.random()-.5);
  quizAns=null;
}
function handleAnswer(ok){
  learnScore.ok+=ok?1:0;learnScore.total+=1;learnStreak=ok?learnStreak+1:0;
  const ws=getLearnWords(),w=ws[learnIdx];
  if(w&&learnCat!=='all'){const catWs=vocab[learnCat];const i=catWs.findIndex(x=>(x.lemma||x.original)===(w.lemma||w.original));if(i!==-1){catWs[i].box=ok?Math.min((catWs[i].box||0)+1,5):Math.max((catWs[i].box||0)-1,0);catWs[i].lastReview=Date.now();saveVocab()}}
  setTimeout(()=>{const ws2=getLearnWords();if(learnIdx+1<ws2.length){learnIdx++;learnFlip=false;quizAns=null;if(learnMode==='quiz')makeQuizOpts(learnIdx,ws2)}else{learnMode='results'}render()},700);
}

// === Conjugation HTML helper ===
function conjHTML(conj){
  if(!conj)return '';
  const persons=['ja','ty','on/ona','my','vy','oni'];
  const forms=conj.split(',').map(f=>f.trim());
  let h='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 12px;margin-top:6px">';
  forms.forEach((f,j)=>{h+='<div style="padding:2px 0"><span style="font-size:9px;color:var(--txD)">'+(persons[j]||'')+'</span><br><span class="mono" style="font-size:12px;color:var(--txt)">'+esc(f)+'</span></div>'});
  return h+'</div>';
}

// === Audio button helper ===
function audioBtn(text,size){
  return '<button onclick="event.stopPropagation();speak(\''+esc(text.replace(/'/g,"\\'"))+'\')" style="background:none;border:1px solid var(--brd);border-radius:6px;color:var(--blu);cursor:pointer;padding:'+(size||'3px 6px')+';font-size:'+(size?'14px':'12px')+'" title="Prononcer">\ud83d\udd0a</button>';
}

// ==================== RENDER ====================
function render(){
  const C=$('content');if(!C)return;
  const statsEl=$('header-stats');if(statsEl)statsEl.textContent=totalWords()+' mots \u00b7 '+learnedWords()+' appris';

  // === READ ===
  if(currentTab==='read'){
    let h='<div style="max-width:700px;margin:0 auto"><div class="card"><h2 style="font-size:17px;font-weight:800;margin-bottom:4px">\ud83d\udcd6 G\u00e9n\u00e8re un texte en slovaque</h2><p class="muted" style="margin-bottom:14px">Choisis un th\u00e8me \u2192 lis phrase par phrase \u2192 capture les mots</p>';
    h+='<input id="read-theme" placeholder="Ex: au restaurant, week-end avec copine..." value="'+esc(readTheme)+'" onkeydown="if(event.key===\'Enter\')doGenerate()" style="width:100%;padding:11px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:14px;margin-bottom:10px" oninput="readTheme=this.value">';
    h+='<div style="display:flex;gap:7px;margin-bottom:14px">';
    [['easy','\ud83d\udfe2 Facile'],['medium','\ud83d\udfe1 Moyen'],['hard','\ud83d\udd34 Difficile']].forEach(([k,l])=>{h+='<button class="btn '+(readLevel===k?'btn-pri':'btn-sec')+'" style="flex:1" onclick="readLevel=\''+k+'\';render()">'+l+'</button>'});
    h+='</div><button class="btn btn-pri" style="width:100%;padding:13px;font-size:14px" onclick="doGenerate()" '+(readLoading?'disabled':'')+'>'+( readLoading?'\u23f3 G\u00e9n\u00e9ration...':'\ud83d\ude80 G\u00e9n\u00e9rer le texte')+'</button></div>';
    if(readLoading)h+='<div class="card" style="text-align:center;padding:30px"><div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div><p class="muted">L\'IA \u00e9crit ton texte...</p></div>';
    if(readError)h+='<div class="card" style="border-color:var(--red);color:var(--red)">'+esc(readError)+'</div>';
    if(readAddedCount>0&&!readAnalyzing)h+='<div class="card" style="border-color:var(--grn);color:var(--grn);text-align:center">\u2705 '+readAddedCount+' mot'+(readAddedCount>1?'s':'')+' ajout\u00e9'+(readAddedCount>1?'s':'')+'</div>';
    if(readText&&!readLoading){
      h+='<h3 style="font-size:15px;font-weight:700;margin-bottom:4px">'+esc(readText.title||'Texte')+'</h3><p class="muted" style="margin-bottom:12px">\ud83d\udca1 Clique <b style="color:var(--blu)">phrase</b> = traduction \u00b7 Clique <b style="color:var(--acc)">mot</b> = capturer</p>';
      h+='<div style="display:flex;flex-direction:column;gap:2px">';
      readText.sentences.forEach((s,i)=>{
        const rev=readRevealed.has(i);
        h+='<div style="border-radius:6px;overflow:hidden"><div class="sentence-row" style="border-left-color:'+(rev?'var(--blu)':'var(--brd)')+'" onclick="readRevealed.has('+i+')?readRevealed.delete('+i+'):readRevealed.add('+i+');render()"><span class="s-num">'+(i+1)+'</span><div style="flex:1;display:flex;flex-wrap:wrap;gap:3px">';
        s.sk.split(/(\s+)/).forEach(w=>{if(!w.trim()){h+='<span>&nbsp;</span>';return}const c=w.replace(/[.,!?;:"""\'\\u2019\\u201e\\u201c\\u2014\\u2013\-()[\]]/g,'').toLowerCase();const sel=readSelected.has(c);h+='<span class="word-token'+(sel?' selected':'')+'" onclick="event.stopPropagation();toggleWord(\''+esc(w.replace(/'/g,"\\'"))+'\')">'+esc(w)+'</span>'});
        h+='</div>'+audioBtn(s.sk,'4px 8px')+'<span style="color:#444;font-size:13px;margin-left:4px">'+(rev?'\u25be':'\u25b8')+'</span></div>';
        if(rev)h+='<div class="fr-translation">'+esc(s.fr)+'</div>';
        h+='</div>';
      });
      h+='</div>';
      if(readSelected.size>0){
        h+='<div class="sel-bar"><div style="display:flex;flex-wrap:wrap;gap:5px;flex:1">';
        readSelected.forEach(w=>{h+='<span class="sel-tag" onclick="toggleWord(\''+esc(w)+'\')">'+esc(w)+' \u2715</span>'});
        h+='</div><button class="btn btn-grn" onclick="doAddWords()" '+(readAnalyzing?'disabled':'')+'>'+( readAnalyzing?'\u23f3 Analyse...':'\u271a Ajouter '+readSelected.size+' mot'+(readSelected.size>1?'s':''))+'</button></div>';
      }
      if(readAnalyzing)h+='<div style="text-align:center;padding:20px"><div class="spinner"></div><p class="muted" style="margin-top:8px">L\'IA cat\u00e9gorise tes mots...</p></div>';
    }
    if(!readText&&!readLoading){h+='<p class="muted" style="margin-top:16px;margin-bottom:10px">\ud83d\udca1 Id\u00e9es :</p><div style="display:flex;flex-wrap:wrap;gap:7px">';THEMES.forEach(t=>{h+='<button class="btn btn-sec" style="font-size:11px;padding:6px 12px" onclick="readTheme=\''+t+'\';render()">'+t+'</button>'});h+='</div>'}
    h+='</div>';C.innerHTML=h;return;
  }

  // === VOCAB ===
  if(currentTab==='vocab'){
    let h='<div style="max-width:700px;margin:0 auto">';
    // Manual add
    h+='<div class="card" style="display:flex;gap:8px;align-items:center;padding:12px 16px"><input id="manual-word-input" placeholder="\u270f\ufe0f Tape un mot en fran\u00e7ais \u2192 IA traduit en slovaque" value="'+esc(addWordInput)+'" oninput="addWordInput=this.value" onkeydown="if(event.key===\'Enter\')doAddManualWord()" style="flex:1;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px"><button class="btn btn-pri" onclick="doAddManualWord()" '+(addingWord?'disabled':'')+'>'+( addingWord?'\u23f3':'\u271a Ajouter')+'</button></div>';
    // Search
    h+='<input placeholder="\ud83d\udd0d Chercher un mot (FR ou SK)..." value="'+esc(searchTerm)+'" oninput="searchTerm=this.value;render()" style="width:100%;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px;margin-bottom:12px">';
    if(searchTerm.length>1){
      const res=allFlat().filter(w=>(w.lemma||w.original||'').toLowerCase().includes(searchTerm.toLowerCase())||(w.fr||'').toLowerCase().includes(searchTerm.toLowerCase())).slice(0,15);
      if(!res.length)h+='<p class="muted" style="text-align:center;padding:20px">Aucun r\u00e9sultat</p>';
      else res.forEach(w=>{const cat=CATS[w._cat]||{};h+='<div class="card" style="border-left:4px solid '+(cat.color||'#666')+';padding:10px 14px;margin-bottom:6px"><div style="display:flex;align-items:center;gap:8px"><span class="mono-b">'+esc(w.lemma||w.original)+'</span>'+audioBtn(w.lemma||w.original)+'<span class="muted">'+esc(w.fr)+'</span><span class="tag tag-acc" style="font-size:9px">'+(cat.label||'')+'</span></div></div>'});
    }else{
      h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px">';
      Object.entries(CATS).forEach(([k,c])=>{h+='<button class="btn '+(vocabCatTab===k?'btn-pri':'btn-sec')+'" style="font-size:11px;'+(vocabCatTab===k?'background:'+c.color:'')+'" onclick="vocabCatTab=\''+k+'\';render()">'+c.icon+' '+c.label+' <span style="opacity:.7">'+(vocab[k]||[]).length+'</span></button>'});
      h+='</div>';
      const words=vocab[vocabCatTab]||[];
      if(!words.length){h+='<div class="card" style="text-align:center;padding:40px"><p style="font-size:28px">\ud83d\udced</p><p class="muted" style="margin-top:8px">Aucun mot.</p><p class="muted" style="font-size:11px;margin-top:4px">Va dans "Lire" ou ajoute un mot ci-dessus !</p></div>'}
      else words.forEach((w,i)=>{
        const catC=CATS[vocabCatTab]?.color||'#666';
        h+='<div class="card" style="border-left:4px solid '+catC+';padding:12px 14px;margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="flex:1">';
        h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px"><span class="mono-b" style="font-size:16px">'+esc(w.lemma||w.original)+'</span>'+audioBtn(w.lemma||w.original)+'<span style="color:var(--txM);font-size:14px">'+esc(w.fr)+'</span>';
        if(w.gender)h+='<span class="tag" style="background:'+(w.gender==='M'?'#2196F333':w.gender==='F'?'#E91E6333':'#9E9E9E33')+';color:'+(w.gender==='M'?'#2196F3':w.gender==='F'?'#E91E63':'#9E9E9E')+'">'+w.gender+'</span>';
        if(w.plural)h+='<span class="tag" style="background:var(--bluD);color:var(--blu);font-size:9px">pl: '+esc(w.plural)+'</span>';
        h+='</div>';
        if(w.conjugation)h+=conjHTML(w.conjugation);
        if(w.example)h+='<p style="font-size:11px;color:var(--txM);margin-top:6px;font-style:italic">\ud83d\udcac '+esc(w.example)+'</p>';
        if(w.tip)h+='<p style="font-size:10px;color:var(--txD);margin-top:3px;background:var(--sf);padding:3px 7px;border-radius:3px;display:inline-block">\ud83d\udca1 '+esc(w.tip)+'</p>';
        h+='</div><div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div class="box-indicator" style="background:hsl('+(w.box||0)*24+',70%,42%)">'+(w.box||0)+'</div>';
        h+='<button style="background:none;border:none;color:#444;font-size:14px;cursor:pointer" onclick="deleteWord(\''+vocabCatTab+'\','+i+')">\u2715</button></div></div></div>';
      });
    }
    h+='</div>';C.innerHTML=h;return;
  }

  // === LEARN ===
  if(currentTab==='learn'){
    let h='<div style="max-width:540px;margin:0 auto">';const lw=getLearnWords();
    if(!learnMode){
      h+='<h2 style="font-size:18px;font-weight:800;margin-bottom:4px">Choisis ta session</h2><p class="muted" style="margin-bottom:10px">Direction :</p><div style="display:flex;gap:8px;margin-bottom:18px">';
      [['sk','SK \u2192 FR','#E85D3A'],['fr','FR \u2192 SK','#2D7DD2'],['mix','Al\u00e9atoire','#9C27B0']].forEach(([k,l,c])=>{h+='<button class="btn '+(learnDir===k?'btn-pri':'btn-sec')+'" style="flex:1;'+(learnDir===k?'background:'+c:'')+'" onclick="learnDir=\''+k+'\';render()">'+l+'</button>'});
      h+='</div>';
      [...Object.entries(CATS),['all',{label:'Tous les mots',icon:'\ud83c\udf0d',color:'#aaa'}]].forEach(([k,c])=>{const n=k==='all'?allFlat().length:(vocab[k]||[]).length;if(n<2)return;h+='<div class="card" style="border-left:4px solid '+c.color+'"><span class="mono-b">'+c.icon+' '+c.label+' ('+n+')</span><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'flash\')">\ud83d\udcda Flashcards</button><button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'quiz\')">\ud83c\udfaf Quiz</button>';if(n>=3)h+='<button class="btn btn-sec" onclick="startLearn(\''+k+'\',\'fill\')">\u270f\ufe0f Trous</button>';h+='</div></div>'});
      if(allFlat().length<2)h+='<div class="card" style="text-align:center;padding:36px"><p style="font-size:28px">\ud83d\udced</p><p class="muted" style="margin-top:8px">Ajoute au moins 2 mots !</p></div>';
    }
    else if(learnMode==='flash'&&lw[learnIdx]){
      const w=lw[learnIdx],d=learnDir==='mix'?(learnIdx%2===0?'sk':'fr'):learnDir;
      const front=d==='sk'?(w.lemma||w.original):w.fr,back=d==='sk'?w.fr:(w.lemma||w.original);
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190 Retour</button><span class="mono" style="font-size:11px;color:var(--txD)">'+(learnIdx+1)+'/'+lw.length+'</span></div>';
      h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((learnIdx+1)/lw.length)*100)+'%;background:#E85D3A"></div></div>';
      if(learnStreak>=3)h+='<div style="text-align:center;margin:8px 0"><span class="streak-badge">\ud83d\udd25 '+learnStreak+'</span></div>';
      h+='<div class="flash-card '+(learnFlip?'flipped':'')+'" onclick="learnFlip=!learnFlip;render()" style="min-height:280px;margin-top:12px">';
      if(!learnFlip){h+='<span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--txD)">'+(d==='sk'?'Slovaque':'Fran\u00e7ais')+'</span><h2 class="mono-b" style="font-size:28px;margin:20px 0">'+esc(front)+'</h2><div style="margin:8px 0">'+audioBtn(d==='sk'?(w.lemma||w.original):w.fr, d==='sk'?'6px 12px':'0')+'</div><p class="muted" style="font-size:12px">Touche pour retourner</p>'}
      else{h+='<span style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--acc)">'+(d==='sk'?'Fran\u00e7ais':'Slovaque')+'</span><h2 class="mono-b" style="font-size:24px;margin:14px 0">'+esc(back)+'</h2><div style="margin:6px 0">'+audioBtn(d==='sk'?w.fr:(w.lemma||w.original), '0')+'</div>';
        if(w.conjugation)h+=conjHTML(w.conjugation);
        if(w.gender)h+='<p style="font-size:11px;color:var(--txM);margin-top:4px">Genre: '+w.gender+(w.plural?' \u00b7 Pl: '+esc(w.plural):'')+'</p>';
        if(w.example)h+='<p style="font-size:11px;color:var(--txM);font-style:italic;margin-top:8px">\ud83d\udcac '+esc(w.example)+'</p>';
        if(w.tip)h+='<p style="font-size:10px;color:var(--txD);margin-top:6px;background:var(--sf);padding:4px 8px;border-radius:4px">\ud83d\udca1 '+esc(w.tip)+'</p>'}
      h+='</div>';
      if(learnFlip)h+='<div style="display:flex;gap:14px;justify-content:center;margin-top:18px"><button class="btn" style="background:var(--red);color:#fff;padding:12px 24px;min-width:130px" onclick="handleAnswer(false)">\u2717 Pas encore</button><button class="btn" style="background:var(--grn);color:#000;padding:12px 24px;min-width:130px" onclick="handleAnswer(true)">\u2713 Je sais !</button></div>';
    }
    else if(learnMode==='quiz'&&lw[learnIdx]){
      const w=lw[learnIdx],d=learnDir==='mix'?(learnIdx%2===0?'sk':'fr'):learnDir;
      const prompt=d==='sk'?(w.lemma||w.original):w.fr,correct=d==='sk'?w.fr:(w.lemma||w.original);
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190 Retour</button><span class="mono" style="font-size:11px;color:var(--txD)">'+(learnIdx+1)+'/'+lw.length+'</span></div>';
      h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((learnIdx+1)/lw.length)*100)+'%;background:var(--blu)"></div></div>';
      if(learnStreak>=3)h+='<div style="text-align:center;margin:8px 0"><span class="streak-badge">\ud83d\udd25 '+learnStreak+'</span></div>';
      h+='<div class="card" style="text-align:center;border-top:3px solid var(--blu);margin-top:12px"><p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--txD)">Que signifie...</p><h2 class="mono-b" style="font-size:26px;margin:14px 0">'+esc(prompt)+'</h2>'+audioBtn(prompt,'6px 12px')+'</div>';
      quizOpts.forEach(o=>{let cls='qcm-opt';if(quizAns!==null){if(o===correct)cls+=' correct';else if(o===quizAns&&o!==correct)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(quizAns===null){quizAns=\''+esc(o.replace(/'/g,"\\'"))+'\';handleAnswer(\''+esc(o.replace(/'/g,"\\'"))+'\'===\''+esc(correct.replace(/'/g,"\\'"))+'\');render()}">'+esc(o)+'</div>'});
    }
    else if(learnMode==='fill'){
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190 Retour</button><span class="mono" style="font-size:11px;color:var(--txD)">Phrases \u00e0 trous</span></div>';
      if(fillLoading)h+='<div class="card" style="text-align:center;padding:30px"><div class="spinner" style="width:24px;height:24px;margin:0 auto 12px"></div><p class="muted">L\'IA cr\u00e9e tes exercices...</p></div>';
      else if(!fillExs.length)h+='<div class="card" style="text-align:center;padding:30px"><p class="muted">Erreur.</p><button class="btn btn-pri" onclick="startLearn(learnCat,\'fill\')" style="margin-top:10px">\ud83d\udd04 R\u00e9g\u00e9n\u00e9rer</button></div>';
      else if(fillExs[fillIdx]){h+='<div class="progress-bar"><div class="progress-fill" style="width:'+(((fillIdx+1)/fillExs.length)*100)+'%;background:#9C27B0"></div></div>';const ex=fillExs[fillIdx];h+='<div class="card" style="text-align:center;border-top:3px solid #9C27B0;margin-top:12px"><p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--txD);margin-bottom:10px">Compl\u00e8te</p><h2 class="mono-b" style="font-size:20px;line-height:1.6">'+esc(ex.sentence_sk)+'</h2><p style="font-size:12px;color:var(--txM);margin-top:10px;font-style:italic">= '+esc(ex.sentence_fr)+'</p></div>';(ex.options||[]).forEach(o=>{const cor=ex.answer;let cls='qcm-opt';if(fillAns!==null){if(o===cor)cls+=' correct';else if(o===fillAns&&o!==cor)cls+=' wrong'}h+='<div class="'+cls+'" onclick="if(fillAns===null){fillAns=\''+esc(o.replace(/'/g,"\\'"))+'\';learnScore.ok+='+(o===cor?1:0)+';learnScore.total++;render();setTimeout(()=>{if(fillIdx+1<fillExs.length){fillIdx++;fillAns=null}else{learnMode=\'results\'}render()},800)}">'+esc(o)+'</div>'})}
    }
    else if(learnMode==='results'){
      const pct=learnScore.total?Math.round(learnScore.ok/learnScore.total*100):0;
      h+='<div class="card" style="text-align:center;padding:36px"><div style="font-size:48px;margin-bottom:12px">'+(pct>=80?'\ud83c\udfc6':pct>=50?'\ud83d\udcaa':'\ud83d\udcd6')+'</div><h2 class="mono-b" style="font-size:22px;margin-bottom:20px">Session termin\u00e9e !</h2><div style="display:flex;justify-content:center;gap:28px"><div><span style="font-size:30px;font-weight:700;color:var(--grn)">'+learnScore.ok+'</span><br><span class="muted" style="font-size:11px">Corrects</span></div><div><span style="font-size:30px;font-weight:700;color:var(--red)">'+(learnScore.total-learnScore.ok)+'</span><br><span class="muted" style="font-size:11px">Rat\u00e9s</span></div><div><span style="font-size:30px;font-weight:700;color:var(--blu)">'+pct+'%</span><br><span class="muted" style="font-size:11px">Score</span></div></div><div style="display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap"><button class="btn btn-pri" onclick="startLearn(learnCat,\'flash\')">\ud83d\udcda Flashcards</button><button class="btn btn-sec" onclick="startLearn(learnCat,\'quiz\')">\ud83c\udfaf Quiz</button><button class="btn btn-sec" onclick="learnMode=null;render()">\u2190 Menu</button></div></div>';
    }
    h+='</div>';C.innerHTML=h;return;
  }

  // === CONJ ===
  if(currentTab==='conj'){
    const verbs=(vocab.verb||[]).filter(v=>v.conjugation);
    const fv=conjSearch?verbs.filter(v=>(v.lemma||'').toLowerCase().includes(conjSearch.toLowerCase())||(v.fr||'').toLowerCase().includes(conjSearch.toLowerCase())):verbs;
    let h='<div style="max-width:700px;margin:0 auto"><h2 style="font-size:18px;font-weight:800;margin-bottom:4px">\ud83d\udcd0 Conjugaison \u2014 Pr\u00e9sent</h2><p class="muted" style="margin-bottom:14px">Tes verbes avec conjugaison compl\u00e8te</p>';
    h+='<input placeholder="\ud83d\udd0d Chercher un verbe..." value="'+esc(conjSearch)+'" oninput="conjSearch=this.value;render()" style="width:100%;padding:10px 14px;border-radius:9px;background:var(--sf);border:1px solid var(--brd);color:var(--txt);font-size:13px;margin-bottom:14px">';
    if(!fv.length)h+='<div class="card" style="text-align:center;padding:30px"><p class="muted">Aucun verbe.</p></div>';
    else fv.forEach(v=>{h+='<div class="card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span class="mono-b" style="font-size:17px">'+esc(v.lemma)+'</span>'+audioBtn(v.lemma,'4px 10px')+'<span class="muted" style="font-size:14px">= '+esc(v.fr)+'</span></div>'+conjHTML(v.conjugation);if(v.example)h+='<p style="font-size:11px;color:var(--txM);font-style:italic;margin-top:10px">\ud83d\udcac '+esc(v.example)+'</p>';h+='</div>'});
    h+='</div>';C.innerHTML=h;return;
  }
}

function switchTab(t){currentTab=t;learnMode=null;render();renderNav()}
function renderNav(){$('nav-tabs').innerHTML=[['read','\ud83d\udcd6 Lire'],['vocab','\ud83d\udcda Vocab'],['learn','\ud83c\udfaf Apprendre'],['conj','\ud83d\udcd0 Conjugaison']].map(([k,l])=>'<button class="nav-btn'+(currentTab===k?' active':'')+'" onclick="switchTab(\''+k+'\')">'+l+'</button>').join('')}
async function init(){loadToken();updateGhTag();renderNav();await loadVocab()}
init();
