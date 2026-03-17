// SlovakForge API Layer
// Claude via Cloudflare proxy (same as StudyForge) + GitHub API for vocab persistence

const PROXY = 'https://studyforge-proxy.benoit-comas.workers.dev';
const GH = { token: '', owner: 'Bencode92', repo: 'SlovakForge' };

function hasToken() { return !!GH.token; }
function loadToken() {
  const s = sessionStorage.getItem('sf_sk_token');
  if (s) { GH.token = s; return true; }
  return false;
}
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
function cancelToken() {
  document.getElementById('token-modal').classList.add('hidden');
  window._pendingAction = null;
}
function updateGhTag() {
  const el = document.getElementById('gh-tag');
  if (!el) return;
  el.className = 'tag ' + (hasToken() ? 'tag-grn' : 'tag-acc');
  el.textContent = hasToken() ? '\u2713 GitHub' : '\ud83d\udcd6 Lecture';
}

// GitHub API
async function ghRead(path) {
  const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path,
    { headers: { 'Accept': 'application/vnd.github.v3+json' } });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

async function ghGet(path) {
  try {
    const d = await ghRead(path);
    return { content: JSON.parse(atob(d.content)), sha: d.sha };
  } catch { return null; }
}

async function ghPut(path, content, msg, sha) {
  if (!GH.token) throw new Error('Token requis');
  const b = {
    message: msg,
    content: btoa(unescape(encodeURIComponent(typeof content === 'string' ? content : JSON.stringify(content, null, 2))))
  };
  if (sha) b.sha = sha;
  const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path, {
    method: 'PUT',
    headers: {
      'Authorization': 'token ' + GH.token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(b)
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.statusText); }
  return r.json();
}

// Claude Proxy
async function callClaude(system, userMsg) {
  const body = { model: 'claude-sonnet-4-20250514', max_tokens: 4000, system: system };
  body.messages = Array.isArray(userMsg) ? userMsg : [{ role: 'user', content: userMsg }];
  const r = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Proxy error: ' + r.status);
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

function parseJSON(text) {
  try {
    const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/([\[\{][\s\S]*[\]\}])/);
    return JSON.parse(m ? m[1].trim() : text.trim());
  } catch { return null; }
}

// AI Functions
async function aiGenerateText(theme, level) {
  const n = { easy: 6, medium: 10, hard: 15 }[level] || 8;
  const desc = {
    easy: 'Niveau FACILE (A1): phrases courtes (5-7 mots), pr\u00e9sent uniquement, mots tr\u00e8s courants.',
    medium: 'Niveau MOYEN (A2-B1): phrases moyennes, pr\u00e9sent+pass\u00e9, conjonctions simples (ale, preto\u017ee, ke\u010f).',
    hard: 'Niveau DIFFICILE (B1-B2): phrases complexes, tous temps, subordonn\u00e9es, expressions idiomatiques.'
  }[level];
  const sys = 'Tu g\u00e9n\u00e8res des textes slovaques pour un francophone. R\u00e9ponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"title":"titre en fran\u00e7ais","sentences":[{"sk":"phrase slovaque","fr":"traduction fran\u00e7aise"}]}\nG\u00e9n\u00e8re exactement ' + n + ' phrases. M\u00e9lange dialogue et narration selon le th\u00e8me. ' + desc + '\nChaque phrase doit \u00eatre naturelle, idiomatique et utile au quotidien.';
  const raw = await callClaude(sys, 'Th\u00e8me: "' + theme + '"');
  return parseJSON(raw);
}

async function aiAnalyzeWords(words, context) {
  const sys = 'Tu analyses des mots slovaques pour un francophone. R\u00e9ponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"words":[{"original":"mot s\u00e9lectionn\u00e9","lemma":"forme dictionnaire/infinitif","type":"verb|noun|adjective|conjunction|expression","fr":"traduction fran\u00e7aise","gender":"M|F|N ou null (noms uniquement)","plural":"forme plurielle ou null (noms uniquement)","conjugation":"ja X, ty X, on/ona X, my X, vy X, oni X (pr\u00e9sent, verbes uniquement, sinon null)","example":"phrase exemple courte SK = FR","tip":"astuce mn\u00e9motechnique en fran\u00e7ais (1 phrase max)"}]}\nD\u00e9tecte le type grammatical. Conjonctions: ale, preto\u017ee, preto, teda, tak, ak, keby, v\u0161ak, aj ke\u010f, alebo, ani, ke\u010f, \u017ee, aby, hoci, tak\u017ee...';
  const raw = await callClaude(sys, 'Contexte: "' + context + '"\nMots: ' + JSON.stringify(words));
  return parseJSON(raw);
}

async function aiGenerateFill(words) {
  const sys = 'Cr\u00e9e des exercices slovaques "phrase \u00e0 trous". R\u00e9ponds UNIQUEMENT en JSON valide sans markdown sans backticks.\nFormat: {"exercises":[{"sentence_sk":"phrase avec ___ pour le trou","sentence_fr":"traduction FR compl\u00e8te","answer":"mot correct","options":["4 options plausibles m\u00e9lang\u00e9es dont la bonne"]}]}\nCr\u00e9e exactement 5 exercices avec des phrases naturelles du quotidien.';
  const raw = await callClaude(sys, 'Mots: ' + JSON.stringify(words.slice(0, 15).map(w => ({ sk: w.lemma, fr: w.fr, type: w.type }))));
  return parseJSON(raw);
}