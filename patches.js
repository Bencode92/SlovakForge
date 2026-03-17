// SlovakForge patches.js — Sprint 2: extend categories + fix type resolution
// Loaded AFTER app.js, extends CATS and patches type checks

// === Add 4 new categories ===
CATS.pronoun={label:'Pronoms',icon:'\ud83d\udc64',color:'#00BCD4'};
CATS.preposition={label:'Pr\u00e9positions',icon:'\u2194\ufe0f',color:'#795548'};
CATS.adverb={label:'Adverbes',icon:'\u23e9',color:'#009688'};
CATS.number={label:'Nombres',icon:'\ud83d\udd22',color:'#607D8B'};

// Ensure vocab has all category keys
Object.keys(CATS).forEach(function(k){if(!vocab[k])vocab[k]=[]});

// === Patch doAddWords to support new types ===
var _allTypes=Object.keys(CATS);

doAddWords=async function(){
  if(!readSelected.size)return;readAnalyzing=true;readError='';render();
  var ctx=readText&&readText.sentences?readText.sentences.map(function(s){return s.sk}).join(' '):'';
  try{
    var r=await aiAnalyzeWords(Array.from(readSelected),ctx);
    if(r&&r.words){var count=0;r.words.forEach(function(w){
      var k=_allTypes.indexOf(w.type)>=0?w.type:'expression';
      if(!vocab[k])vocab[k]=[];
      if(!vocab[k].some(function(e){return(e.lemma||e.original)===(w.lemma||w.original)})){
        vocab[k].push(Object.assign({},w,{box:0,lastReview:null,addedAt:Date.now()}));count++;
      }
    });readAddedCount=count;readSelected=new Set();await saveVocab();}
  }catch(e){readError=e.message}
  readAnalyzing=false;render();
};

doAddManualWord=async function(){
  var input=document.getElementById('manual-word-input');var word=input&&input.value?input.value.trim():'';
  if(!word)return;addingWord=true;render();
  try{
    var r=await aiTranslateWord(word);
    if(r){var k=_allTypes.indexOf(r.type)>=0?r.type:'expression';
      if(!vocab[k])vocab[k]=[];
      if(!vocab[k].some(function(e){return(e.lemma||e.original)===(r.lemma||r.original)})){
        vocab[k].push(Object.assign({},r,{box:0,lastReview:null,addedAt:Date.now()}));await saveVocab();addWordInput='';
      }
    }
  }catch(e){console.error(e)}
  addingWord=false;render();
};

// Re-render with new categories
render();renderNav();
console.log('SlovakForge patches.js loaded: '+_allTypes.length+' categories');
