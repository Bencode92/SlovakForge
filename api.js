// SlovakForge API Layer v4 — Sprint 2: expanded types (pronoun, preposition, adverb, number)
const PROXY='https://studyforge-proxy.benoit-comas.workers.dev';
const GH={token:'',owner:'Bencode92',repo:'SlovakForge'};
const RAW_BASE='https://raw.githubusercontent.com/Bencode92/SlovakForge/main/';
const ALL_TYPES=['verb','noun','adjective','conjunction','pronoun','preposition','adverb','number','expression'];

function hasToken(){return !!GH.token}
function loadToken(){const s=sessionStorage.getItem('sf_sk_token');if(s){GH.token=s;return true}return false}
function saveToken(t){GH.token=t;sessionStorage.setItem('sf_sk_token',t)}
function requireToken(action){if(hasToken()){action();return}if(loadToken()){updateGhTag();action();return}window._pendingAction=action;document.getElementById('token-modal').classList.remove('hidden');document.getElementById('modal-token').focus()}
function confirmToken(){const t=document.getElementById('modal-token').value.trim();if(!t)return;saveToken(t);document.getElementById('token-modal').classList.add('hidden');document.getElementById('modal-token').value='';updateGhTag();if(window._pendingAction){const a=window._pendingAction;window._pendingAction=null;a()}}
function cancelToken(){document.getElementById('token-modal').classList.add('hidden');window._pendingAction=null}
function updateGhTag(){const el=document.getElementById('gh-tag');if(!el)return;el.className='tag '+(hasToken()?'tag-grn':'tag-acc');el.textContent=hasToken()?'\u2713 GitHub':'\ud83d\udcd6 Lecture'}

async function ghGetRaw(path){const r=await fetch(RAW_BASE+path+'?t='+Date.now());if(!r.ok)throw new Error(r.statusText);return r.json()}
async function ghGetSha(path){try{const r=await fetch('https://api.github.com/repos/'+GH.owner+'/'+GH.repo+'/contents/'+path,{headers:{'Accept':'application/vnd.github.v3+json'}});if(!r.ok)return null;return(await r.json()).sha}catch{return null}}
async function ghPut(path,content,msg,sha){if(!GH.token)throw new Error('Token requis');const jsonStr=typeof content==='string'?content:JSON.stringify(content,null,2);const bytes=new TextEncoder().encode(jsonStr);let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));const body={message:msg,content:btoa(binary)};if(sha)body.sha=sha;const r=await fetch('https://api.github.com/repos/'+GH.owner+'/'+GH.repo+'/contents/'+path,{method:'PUT',headers:{'Authorization':'token '+GH.token,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||r.statusText)}return r.json()}

let _saveRunning=false,_savePending=false;
async function saveVocabToGH(vocabData){
  localStorage.setItem('sf_vocab',JSON.stringify(vocabData));
  if(!hasToken())return;
  if(_saveRunning){_savePending=true;return}
  _saveRunning=true;
  try{const sha=await ghGetSha('data/vocab.json');const data={version:3,lastUpdated:new Date().toISOString().split('T')[0],words:vocabData};await ghPut('data/vocab.json',data,'Update vocab',sha)}catch(e){console.error('Save:',e)}
  _saveRunning=false;
  if(_savePending){_savePending=false;await saveVocabToGH(vocabData)}
}

async function callClaude(system,userMsg){const body={model:'claude-sonnet-4-20250514',max_tokens:4000,system:system};body.messages=Array.isArray(userMsg)?userMsg:[{role:'user',content:userMsg}];const r=await fetch(PROXY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok){if(r.status===429)throw new Error('API surchargee, reessaie dans 30s');throw new Error('Erreur proxy: '+r.status)}const d=await r.json();return d.content?.[0]?.text||''}
function parseJSON(text){try{const m=text.match(/```json\s*([\s\S]*?)```/)||text.match(/([\[\{][\s\S]*[\]\}])/);return JSON.parse(m?m[1].trim():text.trim())}catch{return null}}

let _skVoiceAvailable=null;
function checkSkVoice(){if(!('speechSynthesis' in window)){_skVoiceAvailable=false;return}const check=()=>{const voices=speechSynthesis.getVoices();_skVoiceAvailable=voices.some(v=>v.lang&&v.lang.startsWith('sk'))};check();if(speechSynthesis.onvoiceschanged!==undefined)speechSynthesis.onvoiceschanged=check}
function speak(text,lang){if(!('speechSynthesis' in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=lang||'sk-SK';u.rate=0.85;u.pitch=1;const voices=speechSynthesis.getVoices();const skVoice=voices.find(v=>v.lang&&v.lang.startsWith('sk'));if(skVoice)u.voice=skVoice;speechSynthesis.speak(u)}
function isSkVoiceOk(){return _skVoiceAvailable!==false}
if(typeof window!=='undefined')setTimeout(checkSkVoice,500);

async function aiGenerateText(theme,level){
  const n={easy:6,medium:10,hard:15}[level]||8;
  const desc={easy:'Niveau FACILE (A1): phrases courtes (5-7 mots), present uniquement, mots tres courants.',medium:'Niveau MOYEN (A2-B1): phrases moyennes, present+passe, conjonctions simples.',hard:'Niveau DIFFICILE (B1-B2): phrases complexes, tous temps, subordonnees, idiomes.'}[level];
  const sys='Tu generes des textes slovaques pour un francophone. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"title":"titre en francais","sentences":[{"sk":"phrase slovaque","fr":"traduction francaise"}]}\nGenere exactement '+n+' phrases. Melange dialogue et narration. '+desc+'\nChaque phrase doit etre naturelle et idiomatique.';
  return parseJSON(await callClaude(sys,'Theme: "'+theme+'"'));
}

async function aiAnalyzeWords(words,context){
  const sys='Tu analyses des mots slovaques pour un francophone. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"words":[{"original":"mot","lemma":"forme dictionnaire","type":"verb|noun|adjective|conjunction|pronoun|preposition|adverb|number|expression","fr":"traduction","gender":"M|F|N ou null","plural":"pluriel ou null","conjugation":"ja X, ty X, on/ona X, my X, vy X, oni X (present, verbes, sinon null)","example":"SK = FR","tip":"astuce mnemo","grammar_note":"si forme declinee: explique pourquoi. Sinon null."}]}\nTypes: verb=verbe, noun=nom, adjective=adjectif, conjunction=conjonction/liaison, pronoun=pronom (ja,ty,on,ten,moj...), preposition=preposition (v,na,do,z,s,od,pri,pre,bez,k,za...), adverb=adverbe (tu,tam,teraz,dnes,velmi...), number=nombre, expression=expression/phrase figee.\nDetecte le type precis.';
  return parseJSON(await callClaude(sys,'Contexte: "'+context+'"\nMots: '+JSON.stringify(words)));
}

async function aiGenerateFill(words){
  const sys='Cree des exercices slovaques phrase a trous. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"exercises":[{"sentence_sk":"phrase avec ___","sentence_fr":"traduction FR","answer":"mot correct","options":["4 options"]}]}\nCree exactement 5 exercices naturels.';
  return parseJSON(await callClaude(sys,'Mots: '+JSON.stringify(words.slice(0,15).map(w=>({sk:w.lemma,fr:w.fr,type:w.type})))));
}

async function aiTranslateWord(frenchWord){
  const sys='Tu traduis un mot francais en slovaque. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"original":"mot FR","lemma":"mot SK","type":"verb|noun|adjective|conjunction|pronoun|preposition|adverb|number|expression","fr":"mot FR","gender":"M|F|N ou null","plural":"pluriel ou null","conjugation":"conjugaison present ou null","example":"SK = FR","tip":"astuce","grammar_note":null}';
  return parseJSON(await callClaude(sys,'Traduis en slovaque: "'+frenchWord+'"'));
}
