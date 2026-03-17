// SlovakForge API Layer - v2 (UTF-8 fix + audio + manual add)
const PROXY = 'https://studyforge-proxy.benoit-comas.workers.dev';
const GH = { token: '', owner: 'Bencode92', repo: 'SlovakForge' };
const RAW_BASE = 'https://raw.githubusercontent.com/Bencode92/SlovakForge/main/';

function hasToken() { return !!GH.token; }
function loadToken() { const s = sessionStorage.getItem('sf_sk_token'); if (s) { GH.token = s; return true; } return false; }
function saveToken(t) { GH.token = t; sessionStorage.setItem('sf_sk_token', t); }

function requireToken(action) {
  if (hasToken()) { action(); return; }
  if (loadToken()) { updateGhTag(); action(); return; }
  window._pendingAction = action;
  document.getElementById('token-modal').classList.remove('hidden');
  document.getElementById('modal-token').focus();
}
function confirmToken() {
  const t = document.getElementById('modal-token').value.trim();
  if (!t) return;
  saveToken(t);
  document.getElementById('token-modal').classList.add('hidden');
  document.getElementById('modal-token').value = '';
  updateGhTag();
  if (window._pendingAction) { const a = window._pendingAction; window._pendingAction = null; a(); }
}
function cancelToken() { document.getElementById('token-modal').classList.add('hidden'); window._pendingAction = null; }
function updateGhTag() {
  const el = document.getElementById('gh-tag'); if (!el) return;
  el.className = 'tag ' + (hasToken() ? 'tag-grn' : 'tag-acc');
  el.textContent = hasToken() ? '\u2713 GitHub' : '\ud83d\udcd6 Lecture';
}

// === GitHub: READ via raw URL (UTF-8 safe, no base64) ===
async function ghGetRaw(path) {
  const r = await fetch(RAW_BASE + path + '?t=' + Date.now());
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

// === GitHub: GET SHA only (for updates) ===
async function ghGetSha(path) {
  try {
    const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path,
      { headers: { 'Accept': 'application/vnd.github.v3+json' } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.sha;
  } catch { return null; }
}

// === GitHub: WRITE ===
async function ghPut(path, content, msg, sha) {
  if (!GH.token) throw new Error('Token requis');
  const jsonStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  const b64 = btoa(binary);
  const body = { message: msg, content: b64 };
  if (sha) body.sha = sha;
  const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + GH.token, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
  return r.json();
}

// === Claude Proxy ===
async function callClaude(system, userMsg) {
  const body = { model: 'claude-sonnet-4-20250514', max_tokens: 4000, system: system };
  body.messages = Array.isArray(userMsg) ? userMsg : [{ role: 'user', content: userMsg }];
  const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Proxy error: ' + r.status);
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

function parseJSON(text) {
  try { const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/([\[\{][\s\S]*[\]\}])/); return JSON.parse(m ? m[1].trim() : text.trim()); }
  catch { return null; }
}

// === Audio - Web Speech API (Slovak sk-SK) ===
function speak(text, lang) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || 'sk-SK';
  u.rate = 0.85;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

// === AI Functions ===
async function aiGenerateText(theme, level) {
  const n = { easy: 6, medium: 10, hard: 15 }[level] || 8;
  const desc = { easy: 'Niveau FACILE (A1): phrases courtes, present uniquement, mots courants.', medium: 'Niveau MOYEN (A2-B1): phrases moyennes, present+passe, conjonctions simples.', hard: 'Niveau DIFFICILE (B1-B2): phrases complexes, tous temps, subordonnees, idiomes.' }[level];
  const sys = 'Tu generes des textes slovaques pour un francophone. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"title":"titre en francais","sentences":[{"sk":"phrase slovaque","fr":"traduction francaise"}]}\nGenere exactement ' + n + ' phrases. Melange dialogue et narration. ' + desc + '\nChaque phrase doit etre naturelle et idiomatique.';
  return parseJSON(await callClaude(sys, 'Theme: "' + theme + '"'));
}

async function aiAnalyzeWords(words, context) {
  const sys = 'Tu analyses des mots slovaques pour un francophone. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"words":[{"original":"mot selectionne","lemma":"forme dictionnaire/infinitif","type":"verb|noun|adjective|conjunction|expression","fr":"traduction francaise","gender":"M|F|N ou null","plural":"forme plurielle ou null","conjugation":"ja X, ty X, on/ona X, my X, vy X, oni X (present, verbes uniquement, sinon null)","example":"phrase exemple courte SK = FR","tip":"astuce mnemo en francais"}]}\nDetecte bien le type grammatical.';
  return parseJSON(await callClaude(sys, 'Contexte: "' + context + '"\nMots: ' + JSON.stringify(words)));
}

async function aiGenerateFill(words) {
  const sys = 'Cree des exercices slovaques phrase a trous. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"exercises":[{"sentence_sk":"phrase avec ___ pour le trou","sentence_fr":"traduction FR complete","answer":"mot correct","options":["4 options plausibles melangees dont la bonne"]}]}\nCree exactement 5 exercices naturels.';
  return parseJSON(await callClaude(sys, 'Mots: ' + JSON.stringify(words.slice(0, 15).map(w => ({ sk: w.lemma, fr: w.fr, type: w.type })))));
}

async function aiTranslateWord(frenchWord) {
  const sys = 'Tu traduis un mot francais en slovaque. Reponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"original":"mot francais","lemma":"mot slovaque","type":"verb|noun|adjective|conjunction|expression","fr":"mot francais","gender":"M|F|N ou null","plural":"pluriel ou null","conjugation":"conjugaison present ou null","example":"phrase SK = FR","tip":"astuce mnemo"}';
  return parseJSON(await callClaude(sys, 'Traduis en slovaque: "' + frenchWord + '"'));
}
