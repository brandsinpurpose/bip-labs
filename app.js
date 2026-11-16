/* Labs - one web app with two sections: the Cognitive Lab and the Reasoning Lab.
   All content comes from the JSON files in data/ beside this page:
     data/core-bank.json     (schema cognitive-core-bank-v1) - Cognitive Lab questions and lexicons
     data/lexicon-bank.json  (schema lexicon-bank-v1)        - the shared word bank (Reasoning Lab, plus metacognition terms)
   Adding a term or a question means editing those files only, never this code.
   Practice progress stays in this browser on this device (localStorage). Nothing syncs and nothing is sent anywhere. */
(function(){
"use strict";

/* ===== constants (labels for the data's own keys; content lives in data/) ===== */
const MIX = 'prompts';
const DOMAIN_LABELS = {
  operations:{title:'Cognitive Operations', desc:'What mental transformation is being performed?', ask:'Which is the primary move?', unit:'move'},
  objects:{title:'Conceptual Objects', desc:'What is the thinking directed toward?', ask:'Which conceptual object is this?', unit:'object'},
  outputs:{title:'Output Literacy', desc:'What representation best serves the goal?', ask:'Which output fits best?', unit:'output'},
  lenses:{title:'Lenses & Modifiers', desc:'Which perspective, level, or control shapes the inquiry?', ask:'Which modifier fits?', unit:'modifier'},
  prompts:{title:'Prompt Composition', desc:'Combine operation, object, optional lens, and output deliberately.', ask:'Which prompt captures it?', unit:'prompt'},
  metacognition:{title:'Metacognition', desc:'Words for thinking about your own thinking.', ask:'', unit:'term'}
};
const KNOWN_ORDER = ['operations','objects','outputs','lenses','prompts'];
const ROUND = 10;
const SECTIONS = [['cognitive','Cognitive Lab'],['reasoning','Reasoning Lab']];
const VIEWS = {
  cognitive:[['practice','Practice'],['lexicon','Lexicon'],['progress','Progress']],
  reasoning:[['lexicon','Lexicon'],['practice','Practice'],['progress','Progress']]
};
const ICON = {
  practice:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  lexicon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M9 9h6M9 13h4"/></svg>',
  progress:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  chev:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  check:'<svg viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:3"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cross:'<svg viewBox="0 0 24 24" aria-hidden="true" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:3"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};

/* ===== helpers ===== */
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids){
  const n = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'icon') n.insertAdjacentHTML('beforeend', ICON[v]);
    else if (k.slice(0,2) === 'on') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()){ if (c == null || c === false) continue; n.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return n;
}
const shuffle = a => { a = [...a]; for (let i = a.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; };
const str = t => (typeof t === 'string' ? t : '').trim();
const lowerFirst = s => s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const article = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const dl = d => DOMAIN_LABELS[d] || {title:cap(d), desc:'', ask:'Which answer fits best?', unit:'answer'};
let toastT;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function announce(msg){ const a = $('announce'); a.textContent = ''; setTimeout(() => { a.textContent = msg; }, 60); }
function validQ(q){ return q && typeof q.id === 'string' && typeof q.scenario === 'string' && q.scenario.trim() && Array.isArray(q.options) && q.options.length === 3 && q.options.every(x => typeof x === 'string' && x.trim()) && [0,1,2].includes(Number(q.correct)) && typeof q.explain === 'string'; }

/* ===== storage: this browser only. Every call is guarded - the app keeps working if storage throws. ===== */
const LS = 'labs_';
let storageOK = true;
function lsGet(k){ try { const v = window.localStorage.getItem(LS + k); return v == null ? null : JSON.parse(v); } catch(e){ storageOK = false; return null; } }
function lsSet(k, v){ try { window.localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch(e){ storageOK = false; return false; } }
const blankStat = () => ({attempts:0, correct:0, byId:{}});
function cleanStat(x){ x = x && typeof x === 'object' ? x : {}; return {attempts:+x.attempts||0, correct:+x.correct||0, byId:(x.byId && typeof x.byId === 'object') ? x.byId : {}}; }
const S = {progress:null, settings:null};
function loadState(){
  const p = lsGet('progress') || {};
  const cog = {}; if (p.cognitive && typeof p.cognitive === 'object') for (const [d,x] of Object.entries(p.cognitive)) cog[d] = cleanStat(x);
  S.progress = {cognitive:cog, reasoning:cleanStat(p.reasoning)};
  const s = lsGet('settings') || {};
  S.settings = {theme:['system','light','dark'].includes(s.theme) ? s.theme : 'system', cogDomain:typeof s.cogDomain === 'string' ? s.cogDomain : 'operations', lexDomain:typeof s.lexDomain === 'string' ? s.lexDomain : 'operations', reasonCat:typeof s.reasonCat === 'string' ? s.reasonCat : ''};
}
const save = name => lsSet(name, S[name]);
function cogStat(d){ return S.progress.cognitive[d] || (S.progress.cognitive[d] = blankStat()); }

/* ===== data ===== */
const DATA = {core:null, coreErr:null, lex:null, lexErr:null};
let ORDER = [], LEXD = [], BANK = {}, BYID = {}, LEX = {}, LEXMAP = {}, ALLLEX = new Map();
let TERMS = [], CATS = [], CATMAP = new Map();

async function getJSON(url){
  const r = await fetch(url, {cache:'no-cache'});
  if (!r.ok) throw Error('the server answered ' + r.status);
  return r.json();
}
function buildCore(core){
  const qs = (core && core.questions && typeof core.questions === 'object') ? core.questions : {};
  ORDER = [...KNOWN_ORDER.filter(d => Array.isArray(qs[d])), ...Object.keys(qs).filter(d => !KNOWN_ORDER.includes(d) && Array.isArray(qs[d]))];
  ORDER.forEach(d => {
    const seen = new Set();
    BANK[d] = qs[d].filter(q => { if (!validQ(q) || seen.has(q.id)) return false; seen.add(q.id); return true; }).map(q => ({...q, correct:Number(q.correct)}));
    BYID[d] = new Map(BANK[d].map(q => [q.id, q]));
  });
  const lx = (core && core.lexicons && typeof core.lexicons === 'object') ? core.lexicons : {};
  LEXD = Object.keys(lx).filter(d => Array.isArray(lx[d]));
  LEXD.sort((a,b) => (KNOWN_ORDER.indexOf(a) + 1 || 99) - (KNOWN_ORDER.indexOf(b) + 1 || 99));
  ALLLEX = new Map();
  LEXD.forEach(d => {
    LEX[d] = lx[d].filter(e => e && str(e.name) && str(e.definition));
    LEXMAP[d] = new Map(LEX[d].map(e => [e.name, e]));
    LEX[d].forEach(e => { const k = e.name.toLowerCase(); if (!ALLLEX.has(k)) ALLLEX.set(k, e); });
  });
}
function buildLex(lex){
  CATS = Array.isArray(lex && lex.categories) ? lex.categories.filter(c => c && str(c.id) && str(c.name)) : [];
  CATMAP = new Map(CATS.map(c => [c.id, c]));
  TERMS = Array.isArray(lex && lex.terms) ? lex.terms.filter(t => t && str(t.name)).map(t => ({...t, tags:Array.isArray(t.tags) ? t.tags : [], variants:Array.isArray(t.variants) ? t.variants.filter(v => typeof v === 'string') : []})) : [];
}
function lexFor(d, name){ return (LEXMAP[d] && LEXMAP[d].get(name)) || ALLLEX.get(String(name).toLowerCase()) || null; }

/* A word-bank term, resolved: stub = coming soon; see-home = the definition from its home bank. */
function resolveTerm(t){
  const st = str(t.status) || 'stub';
  if (st === 'see-home'){
    const e = ALLLEX.get(t.name.toLowerCase());
    if (e && str(e.definition)) return {ready:true, status:'see-home', definition:str(e.definition), distinction:str(e.distinction), trigger:str(e.trigger), say_it:str(t.say_it), fromHome:true};
    return {ready:false, status:'see-home'};
  }
  if (st === 'stub' || !str(t.definition)) return {ready:false, status:'stub'};
  return {ready:true, status:st, definition:str(t.definition), distinction:str(t.distinction), trigger:str(t.trigger), say_it:str(t.say_it)};
}
const tagged = tag => TERMS.filter(t => t.tags.includes(tag));

/* ===== prompt-composition helpers (unchanged engine behaviour) ===== */
const MIXRE = /^Perform (.+?) on the (.+?)(?:, using an? (.+?) lens)?; present (?:the result as )?an? (.+?)\.$/i;
function parseMix(s){ const m = String(s).match(MIXRE); return m ? {op:m[1], obj:m[2], lens:m[3]||'', out:m[4]} : null; }

/* One line per choice, assembled only from fields that already exist. */
function contrastFor(d, q, idx, used){
  const name = q.options[idx], right = q.options[q.correct];
  if (d === MIX){
    const c = parseMix(right), w = parseMix(name);
    if (idx === q.correct){ return c ? {lbl:'Keeps', txt:'Operation ' + c.op + ', object ' + c.obj + (c.lens ? ', ' + c.lens + ' lens' : '') + ', output ' + c.out + '.'} : null; }
    if (c && w){
      const parts = [];
      if (w.op.toLowerCase() !== c.op.toLowerCase()) parts.push('swaps the operation for ' + w.op);
      if (w.obj.toLowerCase() !== c.obj.toLowerCase()) parts.push('swaps the object for ' + w.obj);
      if (c.lens && !w.lens) parts.push('drops the ' + c.lens + ' lens');
      else if (w.lens && w.lens.toLowerCase() !== c.lens.toLowerCase()) parts.push('uses ' + article(w.lens) + ' lens instead');
      if (w.out.toLowerCase() !== c.out.toLowerCase()) parts.push('swaps the output for ' + article(w.out));
      if (parts.length) return {lbl:'Here', txt:cap(parts.join(', ')) + '.'};
    }
    return q.contrast ? {lbl:'Here', txt:q.contrast} : null;
  }
  const e = lexFor(d, name);
  if (idx === q.correct) return e ? {lbl:'Means', txt:e.definition} : null;
  const has = (t, n) => String(t || '').toLowerCase().includes(n.toLowerCase());
  const cands = [];
  const clauses = String(q.contrast || '').split(/(?<=[.!?;])\s+/).filter(c => has(c, name));
  if (clauses.length) cands.push({lbl:'Here', txt:cap(clauses.join(' ').replace(/;$/, '.'))});
  if (e && has(e.distinction, right)) cands.push({lbl:'Contrast', txt:e.distinction});
  const ce = lexFor(d, right);
  if (ce && has(ce.distinction, name)) cands.push({lbl:'Contrast', txt:ce.distinction});
  if (e) cands.push({lbl:'Means', txt:e.definition});
  if (q.contrast) cands.push({lbl:'Here', txt:q.contrast});
  const pick = cands.find(c => !used || !used.has(c.txt)) || cands[0] || null;
  if (pick && used) used.add(pick.txt);
  return pick;
}
function moveEntry(d, q){
  if (d === MIX){ const c = parseMix(q.options[q.correct]); return c ? lexFor('operations', c.op) : null; }
  return lexFor(d, q.options[q.correct]);
}

/* ===== UI state and routing ===== */
const UI = {section:'cognitive', view:'practice', lexSearch:'', lexSort:'family', rSearch:''};
const PR = {};     // cognitive rounds by domain
let RPR = null;    // reasoning round
function parseHash(){
  const m = String(location.hash || '').replace(/^#\/?/, '').split('/');
  const sec = SECTIONS.some(s => s[0] === m[0]) ? m[0] : 'cognitive';
  const views = VIEWS[sec].map(v => v[0]);
  const view = views.includes(m[1]) ? m[1] : views[0];
  return {sec, view};
}
function go(sec, view){ const target = '#/' + sec + '/' + view; if (location.hash === target) route(true); else location.hash = target; }
let firstRoute = true;
function route(force){
  const {sec, view} = parseHash();
  const changed = force || sec !== UI.section || view !== UI.view;
  UI.section = sec; UI.view = view;
  render();
  if (changed && !firstRoute){
    window.scrollTo(0,0);
    const hd = document.querySelector('#view h2'); if (hd){ hd.setAttribute('tabindex','-1'); hd.focus({preventScroll:true}); }
    announce(SECTIONS.find(s => s[0] === sec)[1] + ', ' + VIEWS[sec].find(v => v[0] === view)[1]);
  }
  firstRoute = false;
}
window.addEventListener('hashchange', () => route(false));

/* ===== theme ===== */
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function resolvedDark(){ const t = S.settings.theme; return t === 'dark' || (t === 'system' && mq && mq.matches); }
function applyTheme(){
  const t = S.settings.theme, r = document.documentElement;
  if (t === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
  const dark = resolvedDark(), b = $('themeBtn');
  if (!b.dataset.ready){ b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="i-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g><g class="i-moon"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></g></svg>'; b.dataset.ready = '1'; }
  b.classList.toggle('is-dark', dark);
  b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

/* ===== chrome ===== */
function domainSet(){
  if (UI.section !== 'cognitive' || !DATA.core) return null;
  if (UI.view === 'lexicon') return {list:[...LEXD, ...(DATA.lex ? ['metacognition'] : [])], key:'lexDomain', count:d => d === 'metacognition' ? tagged('metacognition').length : LEX[d].length, unit:'entries'};
  return {list:ORDER, key:'cogDomain', count:d => BANK[d].length, unit:'questions'};
}
function curDomain(){
  const ds = domainSet(); if (!ds || !ds.list.length) return null;
  const d = S.settings[ds.key]; return ds.list.includes(d) ? d : ds.list[0];
}
function setDomain(d){ const ds = domainSet(); if (!ds) return; S.settings[ds.key] = d; save('settings'); UI.lexSearch = ''; render(); window.scrollTo(0,0); const hd = document.querySelector('#view h2'); if (hd){ hd.setAttribute('tabindex','-1'); hd.focus({preventScroll:true}); } }
function renderChrome(){
  $('sections').replaceChildren(...SECTIONS.map(([k,l]) => h('li', null, h('button', {type:'button', 'aria-current':UI.section === k ? 'page' : null, onclick:() => go(k, VIEWS[k][0][0])}, l))));
  const views = VIEWS[UI.section];
  $('toptabs').replaceChildren(...views.map(([k,l]) => h('button', {type:'button', 'aria-current':UI.view === k ? 'page' : null, onclick:() => go(UI.section, k)}, l)));
  $('tabbar').replaceChildren(...views.map(([k,l]) => { const b = h('button', {type:'button', 'aria-current':UI.view === k ? 'page' : null, onclick:() => go(UI.section, k), icon:k}); b.append(l); return b; }));
  const ds = domainSet(), d = curDomain();
  if (!ds || !d){ $('domains').replaceChildren(); $('domains').hidden = true; $('drow').replaceChildren(); $('drow').hidden = true; return; }
  $('domains').hidden = false; $('drow').hidden = false;
  $('domains').replaceChildren(...ds.list.map(x => h('li', null, h('button', {type:'button', 'aria-current':d === x ? 'true' : null, onclick:() => setDomain(x)}, dl(x).title, ' ', h('small', null, String(ds.count(x)))))));
  const dp = h('button', {type:'button', class:'dpick', 'aria-haspopup':'dialog', 'aria-label':'Domain: ' + dl(d).title + '. Change domain', onclick:openDomains}, h('span', null, dl(d).title));
  dp.insertAdjacentHTML('beforeend', ICON.chev);
  $('drow').replaceChildren(dp, h('p', {class:'dcount'}, ds.count(d) + ' ' + ds.unit));
}
function openDomains(){
  const ds = domainSet(), d = curDomain(); if (!ds) return;
  $('domList').replaceChildren(...ds.list.map(x => h('li', null, h('button', {type:'button', 'aria-current':d === x ? 'true' : null, onclick:() => { $('domDlg').close(); setDomain(x); }}, h('span', null, dl(x).title), h('span', null, ds.count(x) + ' ' + ds.unit)))));
  $('domDlg').showModal();
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dg => dg.addEventListener('click', e => { if (e.target === dg) dg.close(); }));

function render(){
  renderChrome();
  document.body.classList.remove('has-next');
  const secName = SECTIONS.find(s => s[0] === UI.section)[1], viewName = VIEWS[UI.section].find(v => v[0] === UI.view)[1];
  document.title = viewName + ' - ' + secName + ' - Labs';
  const v = $('view'); v.replaceChildren();
  /* wait until both files have settled (loaded or failed), so the page draws once with everything resolved */
  for (const k of ['core','lex']){
    if (!DATA[k] && !DATA[k + 'Err']){ v.append(h('p', {class:'loading', role:'status'}, 'Loading the Labs...')); return; }
  }
  if (UI.section === 'reasoning' && !DATA.lex){ return failBox(v, 'the word bank (data/lexicon-bank.json)', DATA.lexErr); }
  if (UI.section === 'cognitive' && !DATA.core){ return failBox(v, 'the Cognitive Lab bank (data/core-bank.json)', DATA.coreErr); }
  if (UI.section === 'cognitive'){
    if (UI.view === 'practice') renderPractice(v);
    else if (UI.view === 'lexicon') renderCogLexicon(v);
    else renderCogProgress(v);
  } else {
    if (UI.view === 'lexicon') renderReasonLexicon(v);
    else if (UI.view === 'practice') renderReasonPractice(v);
    else renderReasonProgress(v);
  }
}
function failBox(v, what, err){
  const local = location.protocol === 'file:';
  v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Something went wrong'), h('h2', null, 'Could not load ', h('b', null, what + '.')),
    h('p', {class:'lead'}, local ? 'This page was opened straight from a folder. Browsers block the data files that way - open the Labs from their web address instead.' : 'Check your connection and try again. (' + (err && err.message ? err.message : 'no details') + ')')),
    h('div', {class:'tools'}, h('button', {type:'button', class:'pill solid', onclick:() => location.reload()}, 'Reload')));
}

/* ===== shared practice pieces ===== */
function dotsFor(r, withNow){
  const right = r.items.filter(it => it.pick != null && it.ok).length, miss = r.items.filter(it => it.pick != null && !it.ok).length;
  const label = 'This round: ' + right + ' right, ' + miss + ' missed' + (withNow && !r.done ? ', on question ' + (r.i+1) + ' of ' + r.items.length : ' of ' + r.items.length);
  const ol = h('div', {class:'dots', role:'img', 'aria-label':label});
  r.items.forEach((it, j) => { let c = 'up'; if (it.pick != null) c = it.ok ? 'r' : 'w'; else if (withNow && j === r.i) c = 'now'; ol.append(h('span', {class:c})); });
  return ol;
}
function entryBody(e, skipDef, lv){
  const L = 'h' + Math.min(lv || 3, 6);
  const body = h('div', {class:'entry-body'});
  [['Definition', e.definition], ['Understand', e.understanding], ['Word forms', e.morphology], ['When to use it', e.trigger], ['Typical output', e.output], ['Example', e.example], ['Distinguish it from', e.distinction]].forEach(([l, val]) => { if (str(val) && !(l === 'Definition' && skipDef) && !(l === 'Understand' && val === e.definition)) body.append(h(L, {class:'el'}, l), h('p', null, val)); });
  if (Array.isArray(e.prompts) && e.prompts.length){
    body.append(h(L, {class:'el'}, 'Three prompts to try'));
    body.append(h('ul', {class:'prompts'}, e.prompts.slice(0,3).map(p => h('li', null, h('p', null, p), h('button', {type:'button', class:'pill line', 'aria-label':'Copy prompt: ' + String(p).slice(0,60), onclick:() => copy(p)}, 'Copy')))));
  }
  return body;
}
function copy(text){
  const fb = () => { const a = h('textarea'); a.value = text; a.setAttribute('readonly',''); a.style.position = 'fixed'; a.style.opacity = '0'; document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch(e){} a.remove(); toast(ok ? 'Prompt copied' : 'Select and copy the prompt by hand'); };
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Prompt copied'), fb); else fb(); } catch(e){ fb(); }
}
function nextButton(r, onNext){
  const last = r.i === r.items.length - 1;
  const nb = h('button', {type:'button', class:'pill solid', id:'nextBtn', onclick:onNext}, last ? 'See round score' : 'Next question'); nb.insertAdjacentHTML('beforeend', ICON.arrow);
  return h('div', {class:'next'}, nb);
}
function verdictBox(answered, ok, rightName, paras){
  const vd = h('div', {class:'verdict ' + (answered ? (ok ? 'ok' : 'no') : ''), 'aria-live':'polite', id:'verdictBox'});
  if (answered){
    const vi = h('span', {class:'vi', 'aria-hidden':'true', icon:ok ? 'check' : 'cross'});
    vd.append(h('h2', {id:'verdict', tabindex:'-1'}, vi, (ok ? 'Right - it\u2019s ' : 'Not this time - it\u2019s ') + rightName), ...paras);
  } else vd.hidden = true;
  return vd;
}
function optionButton(pos, label, answered, isMove, isPick, onPick){
  const k = h('span', {class:'k', 'aria-hidden':'true'});
  if (answered && isMove) k.insertAdjacentHTML('beforeend', ICON.check); else k.append(String(pos+1));
  const b = h('button', {type:'button', class:'ob', 'data-pos':String(pos), 'aria-disabled':answered ? 'true' : null, 'aria-pressed':answered ? String(isPick) : null}, k, h('span', {class:'nm'}, label));
  if (!answered) b.addEventListener('click', onPick);
  return b;
}
function restartLink(onRestart){
  return h('p', {class:'restart'}, h('button', {type:'button', onclick:() => { if (!confirm('Start a new shuffled round? This round\u2019s score is dropped; your all-time progress stays.')) return; onRestart(); }}, 'New shuffled round'));
}

/* ===== COGNITIVE LAB: PRACTICE ===== */
function curRound(d){ const p = PR[d]; return p && p.round; }
function newRound(d){
  const p = PR[d] || (PR[d] = {deck:[], pos:0, round:null});
  const ids = BANK[d].map(q => q.id), n = Math.min(ROUND, ids.length), items = [];
  let guard = 0;
  while (items.length < n && guard++ < 5000){
    if (p.pos >= p.deck.length){ p.deck = shuffle(ids); p.pos = 0; }
    const id = p.deck[p.pos++];
    if (items.some(x => x.id === id)) continue;
    items.push({id, order:shuffle([0,1,2]), pick:null});
  }
  p.round = {items, i:0, done:false};
  return p.round;
}
function moreFor(d, q, idx, label){
  let body = null;
  if (d === MIX){
    const m = parseMix(q.options[idx]); if (!m) return null;
    body = h('div', {class:'entry-body'});
    [['Operation', 'operations', m.op], ['Object', 'objects', m.obj], ['Lens', 'lenses', m.lens], ['Output', 'outputs', m.out]].forEach(([role, dd, n]) => {
      if (!n) return; const e = lexFor(dd, n); if (!e) return;
      body.append(h('h3', {class:'ename'}, role + ': ' + e.name), h('p', null, e.definition));
      if (e.trigger) body.append(h('p', null, h('b', null, 'Fires when:'), ' ', lowerFirst(e.trigger)));
    });
    if (!body.childNodes.length) return null;
  } else {
    const e = lexFor(d, q.options[idx]); if (!e) return null;
    body = entryBody(e, false, 3);
  }
  const det = h('details', {class:'more'});
  const sum = h('summary', null, 'More on ' + label); sum.insertAdjacentHTML('beforeend', ICON.chev);
  det.append(sum, body);
  return det;
}
function scenarioNode(q, answered){
  const p = h('p', {class:'scen', id:'scen'});
  const s = q.scenario, t = q.tell && answered ? String(q.tell) : '', at = t ? s.indexOf(t) : -1;
  if (at < 0){ p.textContent = s; return p; }
  const mk = h('mark', {class:'tell hl pre'}, t);
  p.append(s.slice(0, at), mk, s.slice(at + t.length));
  requestAnimationFrame(() => requestAnimationFrame(() => mk.classList.remove('pre')));
  return p;
}
function renderPractice(v){
  const d = curDomain();
  if (!d || !BANK[d] || !BANK[d].length){
    v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, d ? dl(d).title : 'Practice'), h('h2', null, 'No questions ', h('b', null, 'in this domain yet.')), h('p', {class:'lead'}, 'Questions come from the Cognitive Lab bank. When it has some for this domain, they show up here.')));
    return;
  }
  const L = dl(d);
  let r = curRound(d); if (!r) r = newRound(d);
  if (r.done) return renderSummary(v, d, r);
  const it = r.items[r.i]; const q = BYID[d].get(it.id);
  if (!q){ r.items.splice(r.i, 1); if (r.i >= r.items.length){ r.done = true; return renderSummary(v, d, r); } return renderPractice(v); }
  const answered = it.pick != null;
  const wrap = h('section', {class:'prac' + (answered ? ' done' : '') + (d === MIX ? ' mixed' : ''), 'aria-labelledby':'sith'});
  const grid = h('div', {class:'pgrid'});
  grid.append(h('div', {class:'round'}, h('p', {class:'t'}, 'Question ' + (r.i+1) + ' of ' + r.items.length), dotsFor(r, true)));
  if (r.i > 0 || answered) grid.append(restartLink(() => { newRound(d); render(); window.scrollTo(0,0); }));
  grid.append(h('div', {class:'sit'}, h('h2', {class:'t', id:'sith'}, 'Read the situation'), scenarioNode(q, answered)));
  const rightName = d === MIX ? 'prompt ' + (it.order.indexOf(q.correct) + 1) : q.options[q.correct];
  const ent = moveEntry(d, q);
  const paras = [h('p', {class:'why'}, q.explain)];
  if (q.contrast) paras.push(h('p', {class:'why2'}, h('b', null, 'Why the others fit less:'), ' ', q.contrast));
  grid.append(verdictBox(answered, it.ok, rightName, paras));
  const side = h('div', {class:'side'});
  const coachTxt = q.tell ? 'One phrase in the situation gives the ' + L.unit + ' away. Find it, then choose.' : 'Read for what the people in the situation do, then choose.';
  if (!answered) side.append(h('div', {class:'pre-coach'}, h('h2', {class:'t'}, q.tell ? 'Find the tell' : 'How to read it'), h('p', {class:'big'}, coachTxt), L.desc ? h('p', null, L.desc) : null, h('p', null, 'Keys 1, 2 and 3 answer. Enter moves on.')));
  if (answered){
    const tb = h('section', {class:'tellbox', 'aria-labelledby':'tellh'});
    tb.append(h('h2', {class:'t', id:'tellh'}, 'The tell'));
    const at = q.tell ? q.scenario.indexOf(q.tell) : -1;
    if (at >= 0){
      tb.append(h('p', {class:'quote', 'aria-hidden':'true'}, '\u201C', h('mark', {class:'hl'}, q.tell), '\u201D'));
      tb.append(h('p', {class:'sr'}, 'Clue: \u201C' + q.tell + '\u201D signals ' + rightName + '.'));
    }
    if (ent && ent.trigger) tb.append(h('p', {class:'via'}, h('b', null, 'Fires when:'), ' ', lowerFirst(ent.trigger)));
    if (tb.childNodes.length > 1) side.append(tb);
    if (ent && d !== MIX){
      const fb = h('div', {class:'entry-body'});
      [['Typical output', ent.output], ['Example', ent.example], ['Distinguish it from', ent.distinction]].forEach(([l, val]) => { if (str(val)) fb.append(h('h3', {class:'el'}, l), h('p', null, val)); });
      if (fb.childNodes.length) side.append(h('div', {class:'full'}, fb));
    } else if (d === MIX){
      const mm = moreFor(d, q, q.correct, 'the parts');
      if (mm){ const full = h('div', {class:'full'}, h('p', {class:'t'}, 'The parts in full')); full.append(mm.querySelector('.entry-body')); side.append(full); }
    }
  }
  grid.append(side);
  grid.append(h('h2', {class:'ask', id:'ask'}, answered ? 'The three choices' : L.ask));
  const ol = h('ol', {class:'opts', id:'opts'}); const used = new Set();
  it.order.forEach((idx, pos) => {
    const isMove = idx === q.correct, isPick = it.pick === pos;
    const li = h('li', {class:'opt' + (answered && isMove ? ' move' : '') + (answered && isPick && !isMove ? ' pick' : '')});
    li.append(optionButton(pos, q.options[idx], answered, isMove, isPick, () => answer(pos)));
    if (answered){
      const note = h('div', {class:'note'});
      note.append(h('p', {class:'tag'}, isMove ? (isPick ? 'The ' + L.unit + ' - your pick' : 'The ' + L.unit) : (isPick ? 'Your pick' : 'Also offered')));
      const c = contrastFor(d, q, idx, used);
      if (c) note.append(h('p', {class:'line'}, h('b', null, c.lbl + ':'), ' ', c.txt));
      const m = moreFor(d, q, idx, d === MIX ? 'prompt ' + (pos+1) : q.options[idx]); if (m) note.append(m);
      li.append(note);
    }
    ol.append(li);
  });
  grid.append(ol);
  grid.append(h('p', {class:'coach'}, coachTxt));
  grid.append(nextButton(r, next));
  wrap.append(grid); v.append(wrap);
  if (answered) document.body.classList.add('has-next');
}
function answer(pos){
  if (UI.section === 'reasoning') return rAnswer(pos);
  const d = curDomain(), r = curRound(d); if (!r || r.done) return;
  const it = r.items[r.i]; if (it.pick != null) return;
  const q = BYID[d].get(it.id); if (!q) return;
  it.pick = pos; it.ok = it.order[pos] === q.correct;
  const s = cogStat(d); s.attempts++; s.correct += it.ok ? 1 : 0;
  const b = s.byId[q.id] || (s.byId[q.id] = {attempts:0, correct:0}); b.attempts++; b.correct += it.ok ? 1 : 0;
  save('progress');
  render();
  const vh = $('verdict'); if (vh) vh.focus({preventScroll:true});
}
function next(){
  if (UI.section === 'reasoning') return rNext();
  const r = curRound(curDomain()); if (!r) return;
  if (r.items[r.i].pick == null) return;
  if (r.i >= r.items.length - 1) r.done = true; else r.i++;
  render(); window.scrollTo(0,0);
  focusAfterNext();
}
function focusAfterNext(){ const s = $('sumh') || $('sith'); if (s){ s.setAttribute('tabindex','-1'); s.focus({preventScroll:true}); } else { const m = $('main'); if (m) m.focus({preventScroll:true}); } }
function renderSummary(v, d, r){
  const right = r.items.filter(x => x.ok).length;
  const missed = r.items.filter(x => x.pick != null && !x.ok).map(x => BYID[d].get(x.id)).filter(Boolean);
  const s = h('section', {class:'summary', 'aria-labelledby':'sumh'});
  s.append(h('p', {class:'lab'}, dl(d).title + ' - round done'));
  s.append(h('h2', {id:'sumh', tabindex:'-1'}, 'You read ', h('b', null, right + ' of ' + r.items.length + ' right.')));
  s.append(dotsFor(r, false));
  if (missed.length){
    s.append(h('h3', {class:'t', style:'margin-top:26px'}, 'Worth another look'));
    s.append(h('ul', {class:'missed'}, missed.map(q => h('li', null, h('b', null, d === MIX ? 'Answer: ' : q.options[q.correct] + ' - '), d === MIX ? q.options[q.correct] : q.scenario.slice(0, 120) + (q.scenario.length > 120 ? '\u2026' : '')))));
  }
  const st = cogStat(d);
  s.append(h('p', null, 'All-time in this domain: ' + st.correct + ' of ' + st.attempts + ' right.'));
  const b = h('button', {type:'button', class:'pill solid', id:'nextRound', onclick:() => { newRound(d); render(); window.scrollTo(0,0); focusAfterNext(); }}, 'Start next round'); b.insertAdjacentHTML('beforeend', ICON.arrow);
  s.append(b);
  v.append(s);
}
document.addEventListener('keydown', e => {
  if (UI.view !== 'practice' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const tg = e.target; if (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) return;
  const r = UI.section === 'reasoning' ? (RPR && RPR.round) : curRound(curDomain()); if (!r || r.done || !r.items.length) return;
  const it = r.items[r.i];
  if (['1','2','3'].includes(e.key) && it.pick == null){ e.preventDefault(); answer(+e.key - 1); }
  else if ((e.key === 'Enter' || e.key === 'n' || e.key === 'ArrowRight') && it.pick != null && !(tg && tg.tagName === 'BUTTON' && e.key === 'Enter') && !(tg && tg.tagName === 'SUMMARY')){ e.preventDefault(); next(); }
});

/* ===== lexicon pieces ===== */
function searchBox(value, label, placeholder, onInput){
  const inp = h('input', {class:'in search', type:'search', placeholder, 'aria-label':label});
  inp.value = value; inp.addEventListener('input', () => onInput(inp.value));
  return inp;
}
function termMatches(t, q){
  if (!q) return true;
  const r = resolveTerm(t);
  return [t.name, ...t.variants, r.definition || ''].join(' ').toLowerCase().includes(q);
}
function termStatusBadge(r){
  if (!r.ready) return h('span', {class:'status'}, 'Coming soon');
  if (r.status === 'draft') return h('span', {class:'status'}, 'Draft');
  return null;
}
function termEntry(t, lv){
  const r = resolveTerm(t);
  const L = 'h' + Math.min(lv, 6), Lb = 'h' + Math.min(lv + 1, 6);
  const det = h('details', {class:'entry' + (r.ready ? '' : ' soon')});
  const sum = h('summary', null, h('span', null, h(L, {class:'en'}, t.name, ' ', termStatusBadge(r)), h('span', {class:'d'}, r.ready ? r.definition : 'Named here. The full entry is coming soon.')));
  sum.insertAdjacentHTML('beforeend', ICON.chev);
  const body = h('div', {class:'entry-body'});
  if (r.ready){
    [['Definition', r.definition], ['Not to be confused with', r.distinction], ['When to reach for it', r.trigger], ['Say it', r.say_it]].forEach(([l, val]) => { if (val) body.append(h(Lb, {class:'el'}, l), h('p', null, val)); });
    if (r.fromHome) body.append(h('p', {class:'savenote'}, 'This entry lives in the Cognitive Lab bank, so it is written once and shown here.'));
    if (r.status === 'draft') body.append(h('p', {class:'savenote'}, 'Draft - written, not yet approved.'));
  } else {
    body.append(h('p', null, 'This term is named in the word bank. Its definition, look-alike, when to reach for it and say-it line are coming soon.'));
  }
  if (t.variants.length) body.append(h(Lb, {class:'el'}, 'Also searched as'), h('p', null, t.variants.join(', ')));
  det.append(sum, body);
  return h('li', null, det);
}
/* Terms grouped under their category headings. */
function drawTermGroups(list, terms, lv){
  const byCat = new Map();
  terms.forEach(t => { const k = CATMAP.has(t.category) ? t.category : ''; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push(t); });
  const order = [...CATS.map(c => c.id).filter(id => byCat.has(id)), ...(byCat.has('') ? [''] : [])];
  order.forEach(id => {
    const c = CATMAP.get(id), arr = byCat.get(id);
    const ready = arr.filter(t => resolveTerm(t).ready).length;
    list.append(h('h' + lv, {class:'t fam'}, c ? c.name : 'Other terms', ' ', h('span', {class:'cat-count'}, '(' + arr.length + (ready ? ', ' + ready + ' written' : '') + ')')));
    if (c && str(c.holds)) list.append(h('p', {class:'catlead'}, c.holds));
    list.append(h('ul', {class:'entries'}, arr.map(t => termEntry(t, lv + 1))));
  });
}

/* ===== COGNITIVE LAB: LEXICON ===== */
function renderCogLexicon(v){
  const d = curDomain();
  if (d === 'metacognition') return renderMetaLexicon(v);
  if (!d || !LEX[d]){ v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Lexicon'), h('h2', null, 'No lexicon ', h('b', null, 'in the bank yet.')))); return; }
  const hasFamily = LEX[d].some(x => str(x.family));
  if (!hasFamily) UI.lexSort = 'az';
  v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Lexicon - ' + dl(d).title), h('h2', null, plural(LEX[d].length, 'entry', 'entries') + ', ', h('b', null, 'each readable on its own.')), h('p', {class:'lead'}, 'Open an entry for what it means, when to use it and what it is not.')));
  const inp = searchBox(UI.lexSearch, 'Search the lexicon', 'Search names and definitions', val => { UI.lexSearch = val; draw(); });
  const tools = h('div', {class:'tools'}, inp);
  if (hasFamily){
    const sel = h('select', {class:'in', 'aria-label':'Sort entries', style:'flex:0 0 auto;width:auto'}, h('option', {value:'family'}, 'By family'), h('option', {value:'az'}, 'A to Z'));
    sel.value = UI.lexSort; sel.addEventListener('change', () => { UI.lexSort = sel.value; draw(); });
    tools.append(sel);
  }
  v.append(tools);
  const list = h('div', {id:'lexList'}); v.append(list);
  const live = h('p', {class:'sr', 'aria-live':'polite'}); v.append(live);
  function draw(){
    list.replaceChildren();
    const term = UI.lexSearch.trim().toLowerCase();
    const byFam = hasFamily && UI.lexSort === 'family';
    const items = LEX[d].filter(x => Object.values(x).join(' ').toLowerCase().includes(term)).sort((a, b) => byFam ? (a.family||'').localeCompare(b.family||'') || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
    let fam = null, ul = null;
    const mk = () => { ul = h('ul', {class:'entries'}); list.append(ul); };
    if (!byFam) mk();
    items.forEach(x => {
      if (byFam && x.family !== fam){ fam = x.family; list.append(h('h3', {class:'t fam'}, fam || 'Other')); mk(); }
      const nl = byFam ? 4 : 3;
      const det = h('details', {class:'entry'});
      const sum = h('summary', null, h('span', null, h('h' + nl, {class:'en'}, x.name), h('span', {class:'d'}, x.definition)));
      sum.insertAdjacentHTML('beforeend', ICON.chev);
      det.append(sum, entryBody(x, true, nl + 1));
      ul.append(h('li', null, det));
    });
    if (!items.length){ list.replaceChildren(h('p', {class:'empty'}, 'No entries match \u201C' + UI.lexSearch + '\u201D. ', h('button', {type:'button', class:'pill line', onclick:() => { UI.lexSearch = ''; inp.value = ''; draw(); inp.focus(); }}, 'Clear search'))); }
    live.textContent = term ? plural(items.length, 'entry', 'entries') + ' found' : '';
  }
  draw();
}
function renderMetaLexicon(v){
  const terms = tagged('metacognition');
  const ready = terms.filter(t => resolveTerm(t).ready).length;
  v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Lexicon - Metacognition'), h('h2', null, plural(terms.length, 'term') + ', ', h('b', null, ready + ' written so far.')), h('p', {class:'lead'}, 'Words for thinking about your own thinking, from the shared word bank. Terms marked coming soon are named and waiting for their entry.')));
  const inp = searchBox(UI.lexSearch, 'Search metacognition terms', 'Search names and other spellings', val => { UI.lexSearch = val; draw(); });
  v.append(h('div', {class:'tools'}, inp));
  const list = h('div', {id:'lexList'}); v.append(list);
  const live = h('p', {class:'sr', 'aria-live':'polite'}); v.append(live);
  function draw(){
    list.replaceChildren();
    const q = UI.lexSearch.trim().toLowerCase();
    const arr = terms.filter(t => termMatches(t, q));
    if (!arr.length){ list.append(h('p', {class:'empty'}, terms.length ? 'No terms match \u201C' + UI.lexSearch + '\u201D.' : 'No metacognition terms in the word bank yet.')); }
    else drawTermGroups(list, arr, 3);
    live.textContent = q ? plural(arr.length, 'term') + ' found' : '';
  }
  draw();
}

/* ===== COGNITIVE LAB: PROGRESS ===== */
function saveNoteText(){ return storageOK ? 'Your progress saves in this browser on this device only. It does not sync to other devices.' : 'This browser is not letting the Labs save, so progress lasts only until you close the page.'; }
function appearanceBlock(){
  const set = h('section', {class:'sec', 'aria-labelledby':'seth'}, h('h3', {class:'t', id:'seth'}, 'Settings'));
  const seg = h('div', {class:'seg', role:'radiogroup', 'aria-label':'Appearance'});
  [['system','System'],['light','Light'],['dark','Dark']].forEach(([val, l]) => { const r = h('input', {type:'radio', name:'theme', value:val}); if (S.settings.theme === val) r.checked = true; r.addEventListener('change', () => { S.settings.theme = val; save('settings'); applyTheme(); }); seg.append(h('label', null, r, h('span', null, l))); });
  set.append(h('p', {class:'savenote'}, 'Appearance'), seg, h('p', {class:'savenote'}, saveNoteText()));
  return set;
}
function renderCogProgress(v){
  const d = curDomain();
  if (!d){ v.append(h('div', {class:'vh'}, h('h2', null, 'Nothing to track ', h('b', null, 'yet.')))); return; }
  const s = cogStat(d);
  const pct = s.attempts ? Math.round(s.correct / s.attempts * 100) + '%' : '-';
  v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Progress - ' + dl(d).title), h('h2', null, s.attempts ? 'You read ' : 'Nothing answered ', h('b', null, s.attempts ? pct + ' of situations right.' : 'here yet.'))));
  const stats = h('div', {class:'stats'});
  [['Answers', s.attempts], ['Accuracy', pct], ['Questions available', BANK[d].length], ['Questions attempted', Object.keys(s.byId).filter(id => BYID[d].has(id)).length]].forEach(([l, val]) => stats.append(h('div', {class:'stat'}, h('strong', null, String(val)), h('span', null, l))));
  v.append(stats);
  if (!s.attempts) v.append(h('div', {class:'tools'}, h('button', {type:'button', class:'pill solid', onclick:() => go('cognitive', 'practice')}, 'Start practising')));
  const grid = h('div', {class:'twocol'});
  const all = h('section', {class:'sec', 'aria-labelledby':'allh'}, h('h3', {class:'t', id:'allh'}, 'All domains'));
  all.append(h('ul', {class:'drows'}, ORDER.map(k => { const x = cogStat(k), p = x.attempts ? Math.round(x.correct / x.attempts * 100) : 0; return h('li', null, h('div', {class:'top'}, h('b', null, dl(k).title), h('span', null, x.attempts ? p + '% of ' + x.attempts : 'Not started')), h('div', {class:'meter', role:'img', 'aria-label':dl(k).title + ': ' + (x.attempts ? p + ' percent right over ' + x.attempts + ' answers' : 'not started')}, h('i', {style:'width:' + p + '%'}))); })));
  all.append(h('div', {class:'tools'}, h('button', {type:'button', class:'pill line', onclick:() => { if (!confirm('Reset progress for ' + dl(d).title + '?')) return; S.progress.cognitive[d] = blankStat(); save('progress'); PR[d] = null; render(); toast('Progress reset'); }}, 'Reset ' + dl(d).title + ' progress')));
  grid.append(all, appearanceBlock());
  v.append(grid);
}

/* ===== REASONING LAB: LEXICON ===== */
function renderReasonLexicon(v){
  const terms = tagged('reasoning');
  const ready = terms.filter(t => resolveTerm(t).ready).length;
  const cats = CATS.filter(c => terms.some(t => t.category === c.id));
  if (UI.rCat == null) UI.rCat = cats.some(c => c.id === S.settings.reasonCat) ? S.settings.reasonCat : '';
  v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Lexicon - Reasoning Lab'), h('h2', null, plural(terms.length, 'term') + ', ', h('b', null, ready + ' written so far.')), h('p', {class:'lead'}, 'Logic, argument, debate, rhetoric and philosophy\u2019s tools. Open a term for what it means, the look-alike it gets confused with, when to reach for it, and a line to say it. Terms marked coming soon are named and waiting for their entry.')));
  const inp = searchBox(UI.rSearch, 'Search terms by name or other spelling', 'Search names and other spellings', val => { UI.rSearch = val; draw(); });
  const sel = h('select', {class:'in', 'aria-label':'Show category', style:'flex:0 1 auto;width:auto;max-width:100%'}, h('option', {value:''}, 'All categories'), cats.map(c => h('option', {value:c.id}, c.name)));
  sel.value = UI.rCat;
  sel.addEventListener('change', () => { UI.rCat = sel.value; S.settings.reasonCat = sel.value; save('settings'); draw(); });
  v.append(h('div', {class:'tools'}, inp, sel));
  const list = h('div', {id:'lexList'}); v.append(list);
  const live = h('p', {class:'sr', 'aria-live':'polite'}); v.append(live);
  function draw(){
    list.replaceChildren();
    const q = UI.rSearch.trim().toLowerCase();
    const arr = terms.filter(t => (!UI.rCat || t.category === UI.rCat) && termMatches(t, q));
    if (!arr.length){ list.append(h('p', {class:'empty'}, 'No terms match that search. ', h('button', {type:'button', class:'pill line', onclick:() => { UI.rSearch = ''; inp.value = ''; UI.rCat = ''; sel.value = ''; draw(); inp.focus(); }}, 'Show all terms'))); }
    else drawTermGroups(list, arr, 3);
    live.textContent = (q || UI.rCat) ? plural(arr.length, 'term') + ' shown' : '';
  }
  draw();
}

/* ===== REASONING LAB: PRACTICE (definition -> pick the term) ===== */
function practiceTerms(){ return tagged('reasoning').map(t => ({t, r:resolveTerm(t)})).filter(x => x.r.ready); }
function rNewRound(){
  const pool = practiceTerms();
  const p = RPR || (RPR = {deck:[], pos:0, round:null});
  const names = pool.map(x => x.t.name), n = Math.min(ROUND, names.length), items = [];
  let guard = 0;
  while (items.length < n && guard++ < 5000){
    if (p.pos >= p.deck.length){ p.deck = shuffle(names); p.pos = 0; }
    const name = p.deck[p.pos++];
    if (items.some(x => x.name === name)) continue;
    const self = pool.find(x => x.t.name === name);
    const same = shuffle(pool.filter(x => x.t.name !== name && x.t.category === self.t.category)).map(x => x.t.name);
    const rest = shuffle(pool.filter(x => x.t.name !== name && x.t.category !== self.t.category)).map(x => x.t.name);
    const others = [...same, ...rest].slice(0, 2);
    if (others.length < 2) break;
    items.push({name, choices:shuffle([name, ...others]), pick:null});
  }
  p.round = {items, i:0, done:false};
  return p.round;
}
function termByName(name){ return TERMS.find(t => t.name === name); }
function renderReasonPractice(v){
  const pool = practiceTerms();
  if (pool.length < 3){
    v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Practice - Reasoning Lab'), h('h2', null, 'Practice is ', h('b', null, 'coming soon.')), h('p', {class:'lead'}, 'Practice needs at least three terms with a written definition. ' + (pool.length ? 'There ' + (pool.length === 1 ? 'is ' : 'are ') + plural(pool.length, 'term') + ' so far.' : 'None are written yet.'))));
    return;
  }
  let r = RPR && RPR.round;
  if (!r || r.items.some(it => !pool.some(x => x.t.name === it.name) || it.choices.some(c => !pool.some(x => x.t.name === c)))) r = rNewRound();
  if (r.done) return rSummary(v, r);
  const it = r.items[r.i], t = termByName(it.name), res = resolveTerm(t);
  const answered = it.pick != null;
  const wrap = h('section', {class:'prac' + (answered ? ' done' : ''), 'aria-labelledby':'sith'});
  const grid = h('div', {class:'pgrid'});
  grid.append(h('div', {class:'round'}, h('p', {class:'t'}, 'Question ' + (r.i+1) + ' of ' + r.items.length), dotsFor(r, true)));
  if (r.i > 0 || answered) grid.append(restartLink(() => { rNewRound(); render(); window.scrollTo(0,0); }));
  grid.append(h('div', {class:'sit'}, h('h2', {class:'t', id:'sith'}, 'Read the definition'), h('p', {class:'scen', id:'scen'}, res.definition)));
  const paras = [];
  if (res.distinction) paras.push(h('p', {class:'why2'}, h('b', null, 'Not to be confused with:'), ' ', res.distinction));
  if (res.status === 'draft') paras.push(h('p', {class:'savenote'}, 'This entry is a draft - written, not yet approved.'));
  grid.append(verdictBox(answered, it.ok, it.name, paras));
  const side = h('div', {class:'side'});
  const coachTxt = 'Match the definition to its term. Look-alike terms are offered on purpose.';
  if (!answered) side.append(h('div', {class:'pre-coach'}, h('h2', {class:'t'}, 'How to read it'), h('p', {class:'big'}, coachTxt), h('p', null, 'Keys 1, 2 and 3 answer. Enter moves on.')));
  if (answered && (res.trigger || res.say_it)){
    const tb = h('section', {class:'tellbox', 'aria-labelledby':'tellh'}, h('h2', {class:'t', id:'tellh'}, 'Using it'));
    if (res.trigger) tb.append(h('p', {class:'via'}, h('b', null, 'Reach for it when:'), ' ', lowerFirst(res.trigger)));
    if (res.say_it) tb.append(h('p', {class:'quote'}, '\u201C' + res.say_it + '\u201D'));
    side.append(tb);
  }
  grid.append(side);
  grid.append(h('h2', {class:'ask', id:'ask'}, answered ? 'The three choices' : 'Which term is this?'));
  const ol = h('ol', {class:'opts', id:'opts'});
  it.choices.forEach((name, pos) => {
    const isMove = name === it.name, isPick = it.pick === pos;
    const li = h('li', {class:'opt' + (answered && isMove ? ' move' : '') + (answered && isPick && !isMove ? ' pick' : '')});
    li.append(optionButton(pos, name, answered, isMove, isPick, () => answer(pos)));
    if (answered){
      const other = resolveTerm(termByName(name));
      const note = h('div', {class:'note'});
      note.append(h('p', {class:'tag'}, isMove ? (isPick ? 'The term - your pick' : 'The term') : (isPick ? 'Your pick' : 'Also offered')));
      if (other.ready) note.append(h('p', {class:'line'}, h('b', null, 'Means:'), ' ', other.definition));
      li.append(note);
    }
    ol.append(li);
  });
  grid.append(ol);
  grid.append(h('p', {class:'coach'}, coachTxt));
  grid.append(nextButton(r, next));
  wrap.append(grid); v.append(wrap);
  if (answered) document.body.classList.add('has-next');
}
function rAnswer(pos){
  const r = RPR && RPR.round; if (!r || r.done) return;
  const it = r.items[r.i]; if (it.pick != null) return;
  it.pick = pos; it.ok = it.choices[pos] === it.name;
  const s = S.progress.reasoning; s.attempts++; s.correct += it.ok ? 1 : 0;
  const b = s.byId[it.name] || (s.byId[it.name] = {attempts:0, correct:0}); b.attempts++; b.correct += it.ok ? 1 : 0;
  save('progress');
  render();
  const vh = $('verdict'); if (vh) vh.focus({preventScroll:true});
}
function rNext(){
  const r = RPR && RPR.round; if (!r) return;
  if (r.items[r.i].pick == null) return;
  if (r.i >= r.items.length - 1) r.done = true; else r.i++;
  render(); window.scrollTo(0,0);
  focusAfterNext();
}
function rSummary(v, r){
  const right = r.items.filter(x => x.ok).length;
  const missed = r.items.filter(x => x.pick != null && !x.ok);
  const s = h('section', {class:'summary', 'aria-labelledby':'sumh'});
  s.append(h('p', {class:'lab'}, 'Reasoning Lab - round done'));
  s.append(h('h2', {id:'sumh', tabindex:'-1'}, 'You matched ', h('b', null, right + ' of ' + r.items.length + ' right.')));
  s.append(dotsFor(r, false));
  if (missed.length){
    s.append(h('h3', {class:'t', style:'margin-top:26px'}, 'Worth another look'));
    s.append(h('ul', {class:'missed'}, missed.map(x => { const res = resolveTerm(termByName(x.name)); return h('li', null, h('b', null, x.name + ' - '), res.definition || ''); })));
  }
  const st = S.progress.reasoning;
  s.append(h('p', null, 'All-time in the Reasoning Lab: ' + st.correct + ' of ' + st.attempts + ' right.'));
  const b = h('button', {type:'button', class:'pill solid', id:'nextRound', onclick:() => { rNewRound(); render(); window.scrollTo(0,0); focusAfterNext(); }}, 'Start next round'); b.insertAdjacentHTML('beforeend', ICON.arrow);
  s.append(b);
  v.append(s);
}

/* ===== REASONING LAB: PROGRESS ===== */
function renderReasonProgress(v){
  const s = S.progress.reasoning, terms = tagged('reasoning');
  const pct = s.attempts ? Math.round(s.correct / s.attempts * 100) + '%' : '-';
  const ready = practiceTerms().length;
  v.append(h('div', {class:'vh'}, h('p', {class:'lab'}, 'Progress - Reasoning Lab'), h('h2', null, s.attempts ? 'You matched ' : 'Nothing answered ', h('b', null, s.attempts ? pct + ' of terms right.' : 'here yet.'))));
  const stats = h('div', {class:'stats'});
  [['Answers', s.attempts], ['Accuracy', pct], ['Terms ready to practise', ready], ['Terms in the lexicon', terms.length]].forEach(([l, val]) => stats.append(h('div', {class:'stat'}, h('strong', null, String(val)), h('span', null, l))));
  v.append(stats);
  if (!s.attempts && ready >= 3) v.append(h('div', {class:'tools'}, h('button', {type:'button', class:'pill solid', onclick:() => go('reasoning', 'practice')}, 'Start practising')));
  const grid = h('div', {class:'twocol'});
  const cats = CATS.filter(c => terms.some(t => t.category === c.id));
  const sec = h('section', {class:'sec', 'aria-labelledby':'cath'}, h('h3', {class:'t', id:'cath'}, 'Written so far, by category'));
  sec.append(h('ul', {class:'drows'}, cats.map(c => { const arr = terms.filter(t => t.category === c.id), w = arr.filter(t => resolveTerm(t).ready).length, p = Math.round(w / arr.length * 100); return h('li', null, h('div', {class:'top'}, h('b', null, c.name), h('span', null, w + ' of ' + arr.length + ' written')), h('div', {class:'meter', role:'img', 'aria-label':c.name + ': ' + w + ' of ' + arr.length + ' terms written'}, h('i', {style:'width:' + p + '%'}))); })));
  sec.append(h('div', {class:'tools'}, h('button', {type:'button', class:'pill line', onclick:() => { if (!confirm('Reset your Reasoning Lab progress?')) return; S.progress.reasoning = blankStat(); save('progress'); RPR = null; render(); toast('Progress reset'); }}, 'Reset Reasoning Lab progress')));
  grid.append(sec, appearanceBlock());
  v.append(grid);
}

/* ===== boot: paint the shell, then load both data files ===== */
$('themeBtn').addEventListener('click', () => { S.settings.theme = resolvedDark() ? 'light' : 'dark'; save('settings'); applyTheme(); if (UI.view === 'progress') render(); });
if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
loadState();
applyTheme();
route(true);
getJSON('data/core-bank.json').then(j => { buildCore(j); DATA.core = j; }, e => { DATA.coreErr = e; }).then(() => render());
getJSON('data/lexicon-bank.json').then(j => { buildLex(j); DATA.lex = j; }, e => { DATA.lexErr = e; }).then(() => render());
})();
