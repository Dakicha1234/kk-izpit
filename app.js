/* КК Изпит – офлайн приложение за учене. Без външни зависимости. */
(function () {
'use strict';

const TOPICS = window.TOPICS.slice().sort((a, b) => a.id - b.id);
const NAMES = window.NAMES || [];
const CARDS = window.CARDS || [];
const QUIZ = window.QUIZ || [];
const TF = window.TF || [];
const CLOZE = window.CLOZE || [];
const CASES = window.CASES || [];
const SEQ = window.SEQUENCES || [];
const LINKS = window.LINKS || [];
const EXAM = new Date(2026, 10, 28, 9, 0, 0); // 28 ноември 2026
const STATUS = ['Не съм почнал', 'Уча я', 'Научена'];
const STATUS_SHORT = ['нова', 'уча', 'научена ✓'];
const topicById = id => TOPICS.find(t => t.id === id);

// ---------- състояние ----------
const KEY = 'kk_izpit_v1';
const defaults = () => ({ topics: {}, cards: {}, wrong: {}, cases: {}, oral: {}, stats: { answered: 0, correct: 0, days: {} }, settings: { theme: 'auto', scope: 'smart', picked: [] } });
let S;
try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = defaults(); }
S.settings = Object.assign(defaults().settings, S.settings || {});
S.stats = Object.assign(defaults().stats, S.stats || {});
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const T = id => (S.topics[id] = S.topics[id] || { status: 0, qc: 0, qt: 0, recent: [] });
const today = () => new Date().toISOString().slice(0, 10);
function markDay(n = 1) { const d = today(); S.stats.days[d] = (S.stats.days[d] || 0) + n; }

// ---------- помощни ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (a, n) => shuffle(a).slice(0, n);
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const app = $('#app');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }
function setTitle(title, back) { $('#pageTitle').textContent = title; $('#backBtn').hidden = !back; }
function view(html) { app.innerHTML = html; window.scrollTo(0, 0); }
const norm = s => String(s).toLowerCase().replace(/[„“"'«»().,!?;:–—-]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
function close(given, want) { const g = norm(given), w = norm(want); if (!g) return false; if (g === w) return true; const tol = w.length > 8 ? 2 : w.length > 4 ? 1 : 0; return lev(g, w) <= tol; }
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
function plural(n, one, many) { return n === 1 ? one : many; }

// ---------- обхват (кои теми) ----------
const learned = () => TOPICS.filter(t => T(t.id).status === 2).map(t => t.id);
const notLearned = () => TOPICS.filter(t => T(t.id).status !== 2).map(t => t.id);
function scopeIds(scope) {
  scope = scope || S.settings.scope;
  if (scope === 'new') return notLearned();
  if (scope === 'learned') return learned();
  if (scope === 'pick') return (S.settings.picked || []).slice();
  if (typeof scope === 'number') return [scope];
  return TOPICS.map(t => t.id);
}
// тегло: ненаучените теми излизат по-често (умен режим)
function weightOf(tid) { if (tid === 0) return 1.5; const st = T(tid).status; return st === 2 ? 1 : st === 1 ? 3 : 2.5; }
function weightedPick(items, n, getT, extra) {
  const pool = items.map(it => ({ it, w: (S.settings.scope === 'smart' ? weightOf(getT(it)) : 1) * (extra ? extra(it) : 1) * (0.6 + Math.random()) }));
  pool.sort((a, b) => b.w - a.w);
  return shuffle(pool.slice(0, n).map(p => p.it));
}
function scopeLabel(scope) {
  scope = scope || S.settings.scope;
  return { smart: 'Умно (според прогреса)', new: 'Ненаучени теми', learned: 'Научени – преговор', all: 'Всички теми', pick: 'Избрани теми' }[scope] || 'Тема ' + scope;
}
function scopePicker(onChange) {
  const sc = S.settings.scope;
  const opts = [['smart', 'Умно'], ['new', 'Ненаучени'], ['learned', 'Научени (преговор)'], ['all', 'Всички'], ['pick', 'Избери теми']];
  const html = `<div class="card"><h3>Кои теми?</h3><div class="chips" id="scopeChips">${opts.map(([k, l]) => `<button class="chip ${sc === k ? 'on' : ''}" data-sc="${k}">${l}</button>`).join('')}</div>
  <div id="pickBox" ${sc === 'pick' ? '' : 'hidden'} style="margin-top:10px"><div class="chips">${TOPICS.map(t => `<button class="chip ${(S.settings.picked || []).includes(t.id) ? 'on' : ''}" data-pk="${t.id}">${t.id}</button>`).join('')}</div></div>
  <p class="small muted" id="scopeInfo" style="margin:8px 0 0"></p></div>`;
  setTimeout(() => {
    const info = () => { const ids = scopeIds(); $('#scopeInfo').textContent = S.settings.scope === 'smart' ? 'Всички теми, но ненаучените излизат по-често.' : ids.length ? 'Теми: ' + ids.join(', ') : 'Няма теми в този избор.'; };
    info();
    $$('#scopeChips .chip').forEach(b => b.onclick = () => { S.settings.scope = b.dataset.sc; save(); $$('#scopeChips .chip').forEach(x => x.classList.toggle('on', x === b)); $('#pickBox').hidden = S.settings.scope !== 'pick'; info(); onChange && onChange(); });
    $$('#pickBox .chip').forEach(b => b.onclick = () => { const id = +b.dataset.pk; const p = S.settings.picked || []; const i = p.indexOf(id); if (i >= 0) p.splice(i, 1); else p.push(id); S.settings.picked = p; save(); b.classList.toggle('on'); info(); onChange && onChange(); });
  });
  return html;
}

// ---------- генерирани въпроси ----------
function allQuestions() {
  const qs = [];
  QUIZ.forEach(([t, q, opts, why]) => qs.push({ type: 'mcq', t, q, correct: opts[0], opts, why, key: 'q' + hash(q) }));
  TF.forEach(([t, q, val, why]) => qs.push({ type: 'tf', t, q, val, why, key: 'tf' + hash(q) }));
  CLOZE.forEach(([t, text]) => qs.push({ type: 'cloze', t, text, key: 'cl' + hash(text) }));
  // имена → какво
  const withWhat = NAMES;
  withWhat.forEach(n => {
    const others = sample(withWhat.filter(x => x.who !== n.who && x.what !== n.what), 3).map(x => x.who);
    qs.push({ type: 'mcq', t: n.t, q: `Кой е свързан с: „${n.what}“?`, correct: n.who, opts: [n.who, ...others], why: `${n.who} (${n.year}) – ${n.what}.`, key: 'nw' + hash(n.who + n.what) });
  });
  const withYear = NAMES.filter(n => /\d{4}/.test(n.year));
  withYear.forEach(n => {
    const years = Array.from(new Set(withYear.map(x => x.year).filter(y => y !== n.year)));
    qs.push({ type: 'mcq', t: n.t, q: `Коя година? ${n.who} – ${n.what}`, correct: n.year, opts: [n.year, ...sample(years, 3)], why: `${n.who}: ${n.year}.`, key: 'ny' + hash(n.who + n.year) });
  });
  // коя тема? (асоциации)
  TOPICS.forEach(tp => {
    const clues = [tp.picture, ...(tp.hooks || [])];
    clues.forEach(c => {
      const others = sample(TOPICS.filter(x => x.id !== tp.id), 3).map(x => x.id + '. ' + x.title);
      qs.push({ type: 'mcq', t: tp.id, q: `Коя тема е това? „${c}“`, correct: tp.id + '. ' + tp.title, opts: [tp.id + '. ' + tp.title, ...others], why: `Тема ${tp.id}: ${tp.title}.`, key: 'tp' + hash(c), assoc: true });
    });
  });
  return qs;
}
let _QS;
const QS = () => (_QS = _QS || allQuestions());
const allCards = () => CARDS.map(([t, q, a]) => ({ t, q, a, key: 'c' + hash(q) }));

// ---------- маршрути ----------
const routes = {};
function go(h) { location.hash = h; }
function router() {
  stopTimers();
  const h = location.hash.slice(1) || 'home';
  const [name, arg] = h.split('/');
  $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === ({ topic: 'topics', names: 'more', cases: 'more', oral: 'more', match: 'more', order: 'more', links: 'more', cram: 'more', settings: 'more', flash: 'cards', run: 'quiz' }[name] || name)));
  (routes[name] || routes.home)(arg);
  updateCountdown();
}
window.addEventListener('hashchange', router);
$('#backBtn').onclick = () => history.length > 1 ? history.back() : go('home');
let timers = [];
function stopTimers() { timers.forEach(clearInterval); timers = []; document.onkeydown = null; }

function updateCountdown() {
  const ms = EXAM - new Date();
  const el = $('#countdown');
  if (ms <= 0) { el.textContent = 'Успех на изпита!'; return; }
  const d = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5);
  el.textContent = d > 0 ? `изпит след ${d} ${plural(d, 'ден', 'дни')} ${hh} ч` : `изпит след ${hh} ч`;
}

// ---------- НАЧАЛО ----------
routes.home = () => {
  setTitle('КК Изпит', false);
  const L = learned().length, N = TOPICS.length;
  const cards = allCards(); const mastered = cards.filter(c => (S.cards[c.key] || {}).box >= 3).length;
  const acc = pct(S.stats.correct, S.stats.answered);
  const todayN = S.stats.days[today()] || 0;
  const steps = nextSteps();
  view(`
  <div class="card"><div class="row" style="gap:16px;flex-wrap:nowrap">
    <div class="ring" style="--p:${pct(L, N)}"><span>${L}/${N}</span></div>
    <div><h3 style="margin:0">Научени теми</h3>
    <div class="small muted">Маркирай темите, които знаеш – упражненията се нагласят спрямо това.</div>
    <div class="small" style="margin-top:6px">Днес: <b>${todayN}</b> ${plural(todayN, 'упражнение', 'упражнения')}</div></div></div>
    <div class="spacer"></div>
    <div class="stats">
      <div class="stat"><b>${mastered}</b><span class="small muted">от ${cards.length} карти усвоени</span></div>
      <div class="stat"><b>${acc}%</b><span class="small muted">верни отговори (${S.stats.answered})</span></div>
      <div class="stat"><b>${QS().length + CASES.length}</b><span class="small muted">въпроса и казуса</span></div>
    </div></div>
  <div class="card"><h3>Следваща стъпка</h3>${steps.map(s => `<a class="next-step" href="${s.href}"><span class="big">${s.ic}</span><span><b>${esc(s.title)}</b><br><span class="small muted">${esc(s.sub)}</span></span></a>`).join('')}</div>
  <div class="grid">
    ${tile('#topics', '📖', 'Теми', '13 теми от учебника')}
    ${tile('#cards', '🃏', 'Флаш карти', cards.length + ' карти')}
    ${tile('#quiz', '✅', 'Тест', 'избор, вярно/грешно, попълни')}
    ${tile('#match', '🔗', 'Свържи имена', 'автор ↔ теория / година')}
    ${tile('#order', '🔢', 'Подреди', 'хронология, етапи, устен план')}
    ${tile('#cases', '💡', 'Казуси – мисли', CASES.length + ' въпроса с отговор')}
    ${tile('#oral', '🎤', 'Устен изпит', 'теглиш тема, 3 минути')}
    ${tile('#links', '🧠', 'Асоциации и връзки', 'мнемоники и мостове')}
    ${tile('#names', '📅', 'Имена и години', NAMES.length + ' реда')}
    ${tile('#cram', '⚡', 'Последна минута', 'всичко най-важно на 1 страница')}
  </div>`);
};
function tile(href, ic, title, sub) { return `<a class="tile" href="${href}"><span class="big">${ic}</span><b>${title}</b><span class="small">${sub}</span></a>`; }
function nextSteps() {
  const out = [];
  const learning = TOPICS.filter(t => T(t.id).status === 1);
  const fresh = TOPICS.filter(t => T(t.id).status === 0);
  if (learning.length) {
    const t = learning[0];
    out.push({ href: '#flash/' + t.id, ic: '🃏', title: `Карти за тема ${t.id}`, sub: t.title });
    out.push({ href: '#run/' + t.id, ic: '✅', title: `Тест по тема ${t.id}`, sub: 'Ако минеш с 85%+, маркирай я като научена' });
  }
  if (fresh.length) out.push({ href: '#topic/' + fresh[0].id, ic: '📖', title: `Прочети тема ${fresh[0].id}`, sub: fresh[0].title });
  if (learned().length) out.push({ href: '#oral', ic: '🎤', title: 'Преговор: устен изпит по научена тема', sub: learned().length + ' научени теми' });
  const wrongN = Object.keys(S.wrong).length;
  if (wrongN) out.push({ href: '#run/wrong', ic: '🔁', title: 'Повтори грешките', sub: wrongN + ' въпроса, на които си грешил' });
  if (!out.length) out.push({ href: '#oral', ic: '🏆', title: 'Всички теми са научени!', sub: 'Направи пробен устен изпит' });
  return out.slice(0, 4);
}

// ---------- ТЕМИ ----------
routes.topics = () => {
  setTitle('Теми', false);
  const item = t => { const st = T(t.id); const qa = st.qt ? pct(st.qc, st.qt) + '% в тестовете' : 'без тест'; const cs = allCards().filter(c => c.t === t.id); const m = cs.filter(c => (S.cards[c.key] || {}).box >= 3).length;
    return `<a class="topic-item" href="#topic/${t.id}"><span class="topic-num s${st.status}">${t.id}</span><span class="t"><b>${esc(t.title)}</b><span class="small muted">${STATUS_SHORT[st.status]} · ${qa} · карти ${m}/${cs.length}</span></span></a>`; };
  view(`<p class="muted small">Лекции 1–3 са теорията (теми 1–9), лекции 4–6 – практиката (теми 10–13).</p>
  <h3>Теория</h3><div class="list"><div class="card">${TOPICS.filter(t => t.id <= 9).map(item).join('')}</div></div>
  <h3>Практика</h3><div class="list"><div class="card">${TOPICS.filter(t => t.id > 9).map(item).join('')}</div></div>
  <a class="btn secondary block" href="#names">📅 Имена и години на един поглед</a>`);
};

routes.topic = (arg) => {
  const t = topicById(+arg); if (!t) return go('topics');
  setTitle('Тема ' + t.id, true);
  const st = T(t.id);
  const cards = allCards().filter(c => c.t === t.id).length;
  const qn = QS().filter(q => q.t === t.id).length;
  const cn = CASES.filter(c => c[0] === t.id).length;
  const links = LINKS.filter(l => l[0] === t.id || l[1] === t.id);
  const recent = st.recent || [];
  const recAcc = recent.length >= 10 ? pct(recent.filter(Boolean).length, recent.length) : null;
  view(`
  <h2 style="margin:4px 0 10px;font-size:21px">${t.id}. ${esc(t.title)}</h2>
  <div class="seg" id="seg">${STATUS.map((s, i) => `<button data-s="${i}" class="${st.status === i ? 'on s' + i : ''}">${i === 2 ? '✓ ' : ''}${s}</button>`).join('')}</div>
  ${recAcc !== null && recAcc >= 85 && st.status !== 2 ? `<div class="feedback ok" style="margin-top:10px">Последните ти ${recent.length} отговора по темата са ${recAcc}% верни – изглежда я знаеш. Маркирай я като научена!</div>` : ''}
  <div class="card content" style="margin-top:12px">
    <div class="box short"><span class="lbl">НАКРАТКО</span>${esc(t.short)}</div>
    <div class="box star"><span class="lbl">★ ЗАПОМНИ</span>${esc(t.remember)}</div>
    <div class="box pic"><span class="lbl">● КАРТИНАТА</span>${esc(t.picture)}</div>
    <details class="sec" open><summary>Основното</summary>${t.body}</details>
    <details class="sec"><summary>◆ Подробно (ако разпитват)</summary>${t.detail}</details>
    <details class="sec" open><summary>● Пример</summary>${t.example}</details>
    <details class="sec" open><summary>▶ На устния – редът</summary><ol>${t.oral.map(o => `<li>${esc(o)}</li>`).join('')}</ol></details>
    <details class="sec"><summary>🧠 Асоциации за запомняне</summary><ul>${t.hooks.map(o => `<li>${esc(o)}</li>`).join('')}</ul></details>
    ${links.length ? `<details class="sec"><summary>🔗 Връзки с други теми</summary><ul>${links.map(l => { const o = l[0] === t.id ? l[1] : l[0]; return `<li><a href="#topic/${o}">Тема ${o}</a>: ${esc(l[2])}</li>`; }).join('')}</ul></details>` : ''}
  </div>
  <div class="card"><h3>Упражнявай тази тема</h3><div class="grid">
    ${tile('#flash/' + t.id, '🃏', 'Карти', cards + ' карти')}
    ${tile('#run/' + t.id, '✅', 'Тест', qn + ' въпроса')}
    ${tile('#cases/' + t.id, '💡', 'Казуси', cn + ' въпроса')}
    ${tile('#oral/' + t.id, '🎤', 'Устен', 'разкажи за 3 мин')}
    ${tile('#order/' + t.id, '🔢', 'Подреди', 'плана на отговора')}
  </div></div>
  <div class="btns equal">${t.id > 1 ? `<a class="btn ghost" href="#topic/${t.id - 1}">‹ Тема ${t.id - 1}</a>` : ''}${t.id < TOPICS.length ? `<a class="btn ghost" href="#topic/${t.id + 1}">Тема ${t.id + 1} ›</a>` : ''}</div>`);
  $$('#seg button').forEach(b => b.onclick = () => {
    st.status = +b.dataset.s; save();
    $$('#seg button').forEach(x => x.className = (+x.dataset.s === st.status ? 'on s' + st.status : ''));
    toast(st.status === 2 ? 'Браво! Темата е маркирана като научена ✓' : st.status === 1 ? 'Темата е в „Уча я“' : 'Темата е нулирана');
  });
  if (st.status === 0) { st.status = 1; save(); $$('#seg button').forEach(x => x.className = (+x.dataset.s === 1 ? 'on s1' : '')); }
};

// ---------- ФЛАШ КАРТИ ----------
routes.cards = () => {
  setTitle('Флаш карти', false);
  const draw = () => {
    const ids = scopeIds(); const cs = allCards().filter(c => ids.includes(c.t));
    const weak = cs.filter(c => ((S.cards[c.key] || {}).box || 0) < 2).length;
    $('#cinfo').innerHTML = `<b>${cs.length}</b> карти в избора · <b>${weak}</b> слаби/нови`;
  };
  view(`${scopePicker(draw)}
  <div class="card"><p id="cinfo" style="margin-top:0"></p>
  <div class="btns"><a class="btn" href="#flash/s20">20 карти</a><a class="btn secondary" href="#flash/s50">50 карти</a><a class="btn secondary" href="#flash/weak">Само слабите</a><a class="btn ghost" href="#flash/sall">Всички</a></div>
  <p class="small muted">Натисни картата, за да я обърнеш. „Знам“ я праща по-рядко, „Не знам“ я връща след малко. На компютър: Space – обръщане, 1/2/3 – оценка.</p></div>`);
  draw();
};
routes.flash = (arg) => {
  let ids, size = 20, weakOnly = false;
  if (/^\d+$/.test(arg)) { ids = [+arg]; size = 999; } else { ids = scopeIds(); if (arg === 's50') size = 50; if (arg === 'sall') size = 999; if (arg === 'weak') { weakOnly = true; size = 40; } }
  let pool = allCards().filter(c => ids.includes(c.t));
  if (weakOnly) pool = pool.filter(c => ((S.cards[c.key] || {}).box || 0) < 2);
  if (!pool.length) { setTitle('Флаш карти', true); return view(`<div class="card">Няма карти за този избор. ${S.settings.scope === 'learned' ? 'Още нямаш научени теми.' : ''}<div class="spacer"></div><a class="btn" href="#cards">Назад</a></div>`); }
  const boxOf = c => (S.cards[c.key] || {}).box || 0;
  let deck = weightedPick(pool, Math.min(size, pool.length), c => c.t, c => 1 + (4 - Math.min(boxOf(c), 4)) * 0.5);
  deck.sort((a, b) => boxOf(a) - boxOf(b) + (Math.random() - 0.5) * 2);
  let i = 0, known = 0, total = deck.length, seen = 0;
  setTitle(/^\d+$/.test(arg) ? 'Карти – тема ' + arg : 'Флаш карти', true);
  const render = () => {
    if (i >= deck.length) {
      markDay(seen); save();
      return view(`<div class="card center"><div style="font-size:46px">🎉</div><h3>Готово!</h3><p>Прегледа ${seen} ${plural(seen, 'карта', 'карти')}, от тях <b>${known}</b> с „Знам“.</p>
      <div class="btns equal"><button class="btn" id="again">Още карти</button><a class="btn secondary" href="#quiz">Към теста</a></div></div>`), ($('#again').onclick = () => routes.flash(arg));
    }
    const c = deck[i]; const tp = topicById(c.t);
    view(`<div class="row small muted" style="justify-content:space-between"><span>${i + 1} / ${deck.length}</span><span>кутия ${boxOf(c)}/5</span></div>
    <div class="progress" style="margin:6px 0 12px"><i style="width:${pct(i, deck.length)}%"></i></div>
    <div class="flash" id="fl"><div class="flash-inner">
      <div class="face"><span class="tag">Тема ${c.t} · ${esc(tp.title.slice(0, 40))}${tp.title.length > 40 ? '…' : ''}</span><div class="q">${esc(c.q)}</div><span class="hint">натисни, за да видиш отговора</span></div>
      <div class="face back"><span class="tag">Отговор</span><div class="a">${esc(c.a)}</div></div>
    </div></div>
    <div class="btns equal" id="rate" style="visibility:hidden"><button class="btn bad" data-r="0">Не знам</button><button class="btn warn" data-r="1">Почти</button><button class="btn ok" data-r="2">Знам</button></div>
    <div class="center" style="margin-top:10px"><a class="small" href="#topic/${c.t}">отвори темата</a></div>`);
    const fl = $('#fl');
    const flip = () => { fl.classList.toggle('flipped'); $('#rate').style.visibility = 'visible'; };
    fl.onclick = flip;
    const rate = r => {
      const rec = S.cards[c.key] = S.cards[c.key] || { box: 0 };
      seen++;
      if (r === 2) { rec.box = Math.min(5, (rec.box || 0) + 1); known++; }
      else if (r === 1) { rec.box = Math.max(1, rec.box || 0); deck.splice(Math.min(deck.length, i + 6), 0, c); }
      else { rec.box = 0; deck.splice(Math.min(deck.length, i + 3), 0, c); }
      rec.last = Date.now(); save(); i++; render();
    };
    $$('#rate button').forEach(b => b.onclick = e => { e.stopPropagation(); rate(+b.dataset.r); });
    document.onkeydown = e => { if (e.key === ' ') { e.preventDefault(); flip(); } else if (['1', '2', '3'].includes(e.key) && $('#rate').style.visibility === 'visible') rate(+e.key - 1); };
  };
  render();
};

// ---------- ТЕСТ ----------
routes.quiz = () => {
  setTitle('Тест', false);
  const wrongN = Object.keys(S.wrong).length;
  view(`${scopePicker()}
  <div class="card"><h3>Какъв тест?</h3>
  <div class="grid">
    <a class="tile" href="#run/mix"><span class="big">🎲</span><b>Смесен</b><span class="small">от всичко по малко</span></a>
    <a class="tile" href="#run/mcq"><span class="big">🔘</span><b>Избор от 4</b><span class="small">класически тест</span></a>
    <a class="tile" href="#run/tf"><span class="big">⚖️</span><b>Вярно / Грешно</b><span class="small">бързи твърдения</span></a>
    <a class="tile" href="#run/cloze"><span class="big">✍️</span><b>Попълни</b><span class="small">напиши липсващото</span></a>
    <a class="tile" href="#run/names"><span class="big">📅</span><b>Имена и години</b><span class="small">кой, кога, какво</span></a>
    <a class="tile" href="#run/assoc"><span class="big">🧠</span><b>Коя тема е?</b><span class="small">по асоциация</span></a>
    <a class="tile" href="#run/wrong"><span class="big">🔁</span><b>Грешките ми</b><span class="small">${wrongN} въпроса</span></a>
    <a class="tile" href="#run/marathon"><span class="big">🏃</span><b>Маратон</b><span class="small">40 въпроса</span></a>
  </div></div>`);
};
routes.run = (arg) => {
  let ids = scopeIds(), n = 15, filter = () => true, title = 'Тест';
  if (/^\d+$/.test(arg)) { ids = [+arg]; n = 20; title = 'Тест – тема ' + arg; }
  const kinds = { mcq: q => q.type === 'mcq' && !q.assoc && !/^n[wy]/.test(q.key), tf: q => q.type === 'tf', cloze: q => q.type === 'cloze', names: q => /^n[wy]/.test(q.key), assoc: q => q.assoc };
  if (kinds[arg]) filter = kinds[arg];
  if (arg === 'marathon') n = 40;
  let pool = QS().filter(q => ids.includes(q.t) && filter(q));
  if (arg === 'wrong') { pool = QS().filter(q => S.wrong[q.key]); n = 25; title = 'Грешките ми'; }
  setTitle(title, true);
  if (!pool.length) return view(`<div class="card">Няма въпроси за този избор. ${arg === 'wrong' ? 'Нямаш запазени грешки – браво!' : S.settings.scope === 'learned' ? 'Още нямаш научени теми.' : ''}<div class="spacer"></div><a class="btn" href="#quiz">Назад</a></div>`);
  // смесен режим: ограничи асоциациите и имената да не доминират
  let qs;
  if (arg === 'mix' || arg === 'marathon' || /^\d+$/.test(arg)) {
    const core = pool.filter(q => !q.assoc && !/^n[wy]/.test(q.key)), side = pool.filter(q => q.assoc || /^n[wy]/.test(q.key));
    qs = shuffle([...weightedPick(core, Math.ceil(n * 0.75), q => q.t, q => 1 + (S.wrong[q.key] || 0)), ...weightedPick(side, Math.floor(n * 0.25), q => q.t)]);
  } else qs = weightedPick(pool, Math.min(n, pool.length), q => q.t, q => 1 + (S.wrong[q.key] || 0));
  let i = 0, score = 0; const log = [];
  const record = (q, ok) => {
    const st = T(q.t); if (q.t) { st.qt++; if (ok) st.qc++; st.recent = (st.recent || []).concat(ok ? 1 : 0).slice(-20); }
    S.stats.answered++; if (ok) { S.stats.correct++; score++; if (S.wrong[q.key]) { S.wrong[q.key]--; if (S.wrong[q.key] <= 0) delete S.wrong[q.key]; } } else S.wrong[q.key] = (S.wrong[q.key] || 0) + 1;
    markDay(); save(); log.push({ q, ok });
  };
  const nextBtn = () => `<button class="btn block" id="next" style="margin-top:8px">${i + 1 < qs.length ? 'Следващ ›' : 'Резултат'}</button>`;
  const bindNext = () => { const b = $('#next'); b.onclick = () => { i++; render(); }; b.focus(); document.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); b.click(); } }; };
  const header = q => `<div class="row small muted" style="justify-content:space-between"><span>${i + 1} / ${qs.length} · точки ${score}</span><a href="#topic/${q.t}">тема ${q.t}</a></div><div class="progress" style="margin:6px 0 12px"><i style="width:${pct(i, qs.length)}%"></i></div>`;
  const render = () => {
    document.onkeydown = null;
    if (i >= qs.length) return finish();
    const q = qs[i];
    if (q.type === 'mcq') {
      const opts = shuffle(Array.from(new Set(q.opts)));
      view(`${header(q)}<div class="card"><h3 style="font-size:18px">${esc(q.q)}</h3>${opts.map((o, k) => `<button class="opt" data-o="${esc(o)}"><span class="kbd">${k + 1}</span> ${esc(o)}</button>`).join('')}<div id="fb"></div></div>`);
      const pick = btn => {
        const ok = btn.dataset.o === q.correct; record(q, ok);
        $$('.opt').forEach(b => { b.disabled = true; if (b.dataset.o === q.correct) b.classList.add('correct'); });
        if (!ok) btn.classList.add('wrong');
        $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Вярно!' : 'Грешно.'}</b> ${ok ? '' : 'Верният отговор: ' + esc(q.correct)}<span class="why">${esc(q.why || '')}</span></div>${nextBtn()}`; bindNext();
      };
      $$('.opt').forEach(b => b.onclick = () => pick(b));
      document.onkeydown = e => { const k = +e.key; if (k >= 1 && k <= opts.length) pick($$('.opt')[k - 1]); };
    } else if (q.type === 'tf') {
      view(`${header(q)}<div class="card"><p class="small muted" style="margin:0">Вярно или грешно?</p><h3 style="font-size:18px">${esc(q.q)}</h3><div class="btns equal"><button class="btn ok" data-v="1">Вярно</button><button class="btn bad" data-v="0">Грешно</button></div><div id="fb"></div></div>`);
      const pick = v => { const ok = v === q.val; record(q, ok); $$('.btns button').forEach(b => b.disabled = true);
        $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Точно така!' : 'Не.'}</b> Твърдението е <b>${q.val ? 'вярно' : 'грешно'}</b>.<span class="why">${esc(q.why)}</span></div>${nextBtn()}`; bindNext(); };
      $$('.btns button').forEach(b => b.onclick = () => pick(b.dataset.v === '1'));
      document.onkeydown = e => { if (e.key === '1' || e.key.toLowerCase() === 'v') pick(true); if (e.key === '2' || e.key.toLowerCase() === 'g') pick(false); };
    } else {
      const answers = []; const shown = q.text.replace(/\[\[(.+?)\]\]/g, (_, a) => { answers.push(a); return `<span class="cloze-blank">${answers.length}</span>`; });
      view(`${header(q)}<div class="card"><p class="small muted" style="margin:0">Попълни липсващото</p><h3 style="font-size:18px;line-height:1.6">${shown}</h3>
      ${answers.map((a, k) => `<input type="text" class="cl" data-k="${k}" placeholder="${answers.length > 1 ? 'Празно ' + (k + 1) : 'Отговор'}" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-bottom:8px">`).join('')}
      <div class="btns equal"><button class="btn" id="chk">Провери</button><button class="btn ghost" id="show">Не знам</button></div><div id="fb"></div></div>`);
      const ins = $$('.cl'); ins[0].focus();
      const check = giveUp => {
        const res = answers.map((a, k) => !giveUp && close(ins[k].value, a)); const ok = res.every(Boolean); record(q, ok);
        ins.forEach((inp, k) => { inp.disabled = true; inp.style.borderColor = res[k] ? 'var(--ok)' : 'var(--bad)'; });
        $('#chk').disabled = $('#show').disabled = true;
        $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Вярно!' : 'Отговорът:'}</b> ${esc(q.text.replace(/\[\[(.+?)\]\]/g, '«$1»'))}</div>${nextBtn()}`; bindNext();
      };
      $('#chk').onclick = () => check(false); $('#show').onclick = () => check(true);
      ins.forEach(inp => inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); check(false); } });
    }
  };
  const finish = () => {
    const p = pct(score, qs.length); const byT = {};
    log.forEach(({ q, ok }) => { byT[q.t] = byT[q.t] || [0, 0]; byT[q.t][1]++; if (ok) byT[q.t][0]++; });
    const tips = Object.entries(byT).filter(([t, [c, n]]) => +t && c / n < 0.7).map(([t]) => +t);
    view(`<div class="card center"><div style="font-size:46px">${p >= 85 ? '🏆' : p >= 60 ? '👍' : '📚'}</div><h3>${score} от ${qs.length} (${p}%)</h3>
    <p class="muted">${p >= 85 ? 'Отлично! Готов си за тези теми.' : p >= 60 ? 'Добре, но има какво да се дообере.' : 'Прочети пак темите и пробвай картите.'}</p></div>
    ${tips.length ? `<div class="card"><h3>Слаби места</h3>${tips.map(t => `<a class="next-step" href="#topic/${t}"><span class="big">📖</span><span><b>Тема ${t}</b><br><span class="small muted">${esc(topicById(t).title)}</span></span></a>`).join('')}</div>` : ''}
    <div class="card"><h3>Преглед</h3>${log.map(({ q, ok }) => `<p class="small" style="margin:6px 0">${ok ? '✅' : '❌'} ${esc(q.q || q.text.replace(/\[\[(.+?)\]\]/g, '«$1»'))}${!ok && q.correct ? ' → <b>' + esc(q.correct) + '</b>' : ''}${!ok && q.type === 'tf' ? ' → <b>' + (q.val ? 'вярно' : 'грешно') + '</b>' : ''}</p>`).join('')}</div>
    <div class="btns equal"><button class="btn" id="again">Нов тест</button><a class="btn secondary" href="#quiz">Други тестове</a></div>`);
    $('#again').onclick = () => routes.run(arg);
  };
  render();
};

// ---------- СВЪРЖИ ИМЕНА ----------
routes.match = () => {
  setTitle('Свържи имена', true);
  let mode = 'what';
  const play = () => {
    const ids = scopeIds();
    let pool = NAMES.filter(n => ids.includes(n.t));
    if (mode === 'year') pool = pool.filter(n => /\d/.test(n.year));
    // уникални отговори
    const seenR = new Set(); pool = shuffle(pool).filter(n => { const r = mode === 'year' ? n.year : n.what; if (seenR.has(r)) return false; seenR.add(r); return true; });
    const set = pool.slice(0, 6);
    if (set.length < 3) { $('#mbox').innerHTML = '<p>Твърде малко имена в този избор – избери повече теми.</p>'; return; }
    const left = shuffle(set), right = shuffle(set);
    let sel = null, done = 0, errs = 0; const t0 = Date.now();
    $('#mbox').innerHTML = `<div class="match"><div>${left.map((n, k) => `<button class="mi L" data-i="${NAMES.indexOf(n)}">${esc(n.who)}</button>`).join('')}</div><div>${right.map(n => `<button class="mi R" data-i="${NAMES.indexOf(n)}">${esc(mode === 'year' ? n.year : n.what)}</button>`).join('')}</div></div><p class="small muted center" id="mst">Избери автор отляво, после съвпадението отдясно.</p>`;
    $$('#mbox .mi').forEach(b => b.style.marginBottom = '8px');
    $$('#mbox .mi').forEach(b => b.style.width = '100%');
    $$('#mbox .L').forEach(b => b.onclick = () => { if (b.classList.contains('done')) return; $$('#mbox .L').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel = b; });
    $$('#mbox .R').forEach(b => b.onclick = () => {
      if (!sel || b.classList.contains('done')) return;
      const a = NAMES[+sel.dataset.i], r = NAMES[+b.dataset.i];
      const ok = mode === 'year' ? a.year === r.year : a.what === r.what;
      if (ok) { sel.classList.remove('sel'); sel.classList.add('done'); b.classList.add('done'); sel = null; done++; S.stats.answered++; S.stats.correct++; markDay(); save();
        if (done === set.length) { const sec = Math.round((Date.now() - t0) / 1000); $('#mst').innerHTML = `<b>Готово за ${sec} сек, ${errs} ${plural(errs, 'грешка', 'грешки')}.</b>`; }
      } else { errs++; S.stats.answered++; save(); b.classList.add('err'); sel.classList.add('err'); const s2 = sel; setTimeout(() => { b.classList.remove('err'); s2.classList.remove('err'); }, 400); }
    });
  };
  view(`${scopePicker(play)}<div class="card"><div class="seg" id="mm"><button class="on" data-m="what">Автор ↔ теория</button><button data-m="year">Автор ↔ година</button></div><div class="spacer"></div><div id="mbox"></div><div class="spacer"></div><button class="btn block" id="newm">Нов рунд</button></div>`);
  $$('#mm button').forEach(b => b.onclick = () => { mode = b.dataset.m; $$('#mm button').forEach(x => x.classList.toggle('on', x === b)); play(); });
  $('#newm').onclick = play; play();
};

// ---------- ПОДРЕДИ ----------
routes.order = (arg) => {
  setTitle('Подреди', true);
  const tasksFor = ids => [
    ...SEQ.filter(s => ids.includes(s.t)),
    ...TOPICS.filter(t => ids.includes(t.id)).map(t => ({ t: t.id, title: `Устният план за тема ${t.id}: ${t.title}`, items: t.oral }))
  ];
  const play = () => {
    const ids = arg && /^\d+$/.test(arg) ? [+arg] : scopeIds();
    const tasks = tasksFor(ids);
    if (!tasks.length) { $('#obox').innerHTML = '<p>Няма задачи за този избор.</p>'; return; }
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    let items = shuffle(task.items.map((x, k) => ({ x, k })));
    if (items.every((it, k) => it.k === k)) items.reverse();
    const picked = [];
    $('#obox').innerHTML = `<h3>${esc(task.title)}</h3><p class="small muted">Натискай в правилния ред (първото първо).</p><div id="olist">${items.map((it, j) => `<button class="ord-item" data-j="${j}"><span class="n"></span><span>${esc(it.x)}</span></button>`).join('')}</div><div class="btns equal"><button class="btn ghost" id="oreset">Изчисти</button><button class="btn" id="ocheck" disabled>Провери</button></div><div id="ofb"></div>`;
    const btns = $$('#olist .ord-item');
    const paint = () => { btns.forEach((b, j) => { const p = picked.indexOf(j); b.classList.toggle('picked', p >= 0); $('.n', b).textContent = p >= 0 ? p + 1 : ''; }); $('#ocheck').disabled = picked.length !== items.length; };
    btns.forEach((b, j) => b.onclick = () => { if ($('#ofb').innerHTML) return; const p = picked.indexOf(j); if (p >= 0) picked.splice(p, 1); else picked.push(j); paint(); });
    $('#oreset').onclick = () => { if ($('#ofb').innerHTML) return; picked.length = 0; paint(); };
    $('#ocheck').onclick = () => {
      let right = 0; picked.forEach((j, pos) => { const ok = items[j].k === pos; if (ok) right++; btns[j].classList.add(ok ? 'right' : 'wrong'); });
      const all = right === items.length; S.stats.answered++; if (all) S.stats.correct++; markDay(); save();
      $('#ofb').innerHTML = `<div class="feedback ${all ? 'ok' : 'bad'}"><b>${all ? 'Перфектно!' : right + ' от ' + items.length + ' на място.'}</b>${all ? '' : '<span class="why">Правилният ред:<br>' + task.items.map((x, k) => (k + 1) + '. ' + esc(x)).join('<br>') + '</span>'}</div><button class="btn block" id="onext">Следваща задача</button>`;
      $('#onext').onclick = play;
    };
  };
  view(`${arg ? '' : scopePicker(play)}<div class="card" id="obox"></div>`);
  play();
};

// ---------- КАЗУСИ ----------
routes.cases = (arg) => {
  setTitle('Казуси – мисли', true);
  const start = () => {
    const ids = arg && /^\d+$/.test(arg) ? [+arg] : scopeIds();
    let pool = CASES.map(([t, q, a]) => ({ t, q, a, key: 'k' + hash(q) })).filter(c => ids.includes(c.t) || (c.t === 0 && !arg));
    if (!pool.length) { $('#cbox').innerHTML = '<p>Няма казуси за този избор.</p>'; return; }
    pool = weightedPick(pool, pool.length, c => c.t, c => (S.cases[c.key] === 2 ? 0.4 : S.cases[c.key] === 0 ? 2 : 1));
    let i = 0;
    const show = () => {
      if (i >= pool.length) { $('#cbox').innerHTML = '<p class="center"><b>Мина всички казуси в избора!</b></p><button class="btn block" id="crest">Отначало</button>'; $('#crest').onclick = start; return; }
      const c = pool[i];
      $('#cbox').innerHTML = `<div class="row small muted" style="justify-content:space-between"><span>${i + 1} / ${pool.length}</span><span>${c.t ? `<a href="#topic/${c.t}">тема ${c.t}</a>` : 'връзки между темите'}</span></div>
      <h3 style="font-size:18px;margin-top:8px">${esc(c.q)}</h3>
      <textarea id="myans" placeholder="Напиши или кажи на глас своя отговор (по желание)…"></textarea>
      <div class="spacer"></div><button class="btn block" id="reveal">Покажи примерен отговор</button><div id="cans"></div>`;
      $('#reveal').onclick = () => {
        $('#reveal').remove();
        $('#cans').innerHTML = `<div class="box short" style="margin-top:12px"><span class="lbl">ПРИМЕРЕН ОТГОВОР</span>${esc(c.a)}</div><p class="small muted">Колко добре се справи?</p>
        <div class="btns equal"><button class="btn bad" data-g="0">Не знаех</button><button class="btn warn" data-g="1">Частично</button><button class="btn ok" data-g="2">Знаех го</button></div>`;
        $$('#cans [data-g]').forEach(b => b.onclick = () => { S.cases[c.key] = +b.dataset.g; S.stats.answered++; if (+b.dataset.g === 2) S.stats.correct++; if (c.t) { const st = T(c.t); st.recent = (st.recent || []).concat(+b.dataset.g === 2 ? 1 : 0).slice(-20); } markDay(); save(); i++; show(); });
      };
    };
    show();
  };
  view(`${arg ? '' : scopePicker(start)}<div class="card" id="cbox"></div>`);
  start();
};

// ---------- УСТЕН ИЗПИТ ----------
routes.oral = (arg) => {
  setTitle('Устен изпит', true);
  if (arg) return oralRun(+arg);
  const L = learned();
  view(`<div class="card"><h3>Симулация на устния</h3><p>Теглиш тема, имаш <b>3 минути</b> да я разкажеш на глас (определение и автор → как работи → изследване → пример). После отмяташ кое си казал и виждаш допълнителен въпрос „от Калинов“.</p>
  <div class="btns"><button class="btn" id="o-all">Изтегли от всички</button>${L.length ? `<button class="btn secondary" id="o-l">От научените (${L.length})</button>` : ''}${notLearned().length ? `<button class="btn ghost" id="o-n">От ненаучените</button>` : ''}</div></div>
  <div class="card"><h3>Или избери тема</h3><div class="chips">${TOPICS.map(t => `<a class="chip" href="#oral/${t.id}">${t.id}${S.oral[t.id] != null ? ' · ' + S.oral[t.id] + '%' : ''}</a>`).join('')}</div></div>`);
  const draw = ids => { const id = ids[Math.floor(Math.random() * ids.length)]; go('oral/' + id); };
  $('#o-all').onclick = () => draw(TOPICS.map(t => t.id));
  if ($('#o-l')) $('#o-l').onclick = () => draw(L);
  if ($('#o-n')) $('#o-n').onclick = () => draw(notLearned());
};
function oralRun(id) {
  const t = topicById(id); if (!t) return go('oral');
  let left = 180, running = false;
  view(`<div class="card center"><p class="small muted" style="margin:0">Изтеглена тема</p><h2 style="margin:6px 0 4px;font-size:22px">${t.id}. ${esc(t.title)}</h2>
  <div class="timer" id="tm">3:00</div><div class="btns equal"><button class="btn" id="tgo">▶ Старт</button><button class="btn secondary" id="tdone">Готов съм</button></div>
  <p class="small muted">Кажи го на глас, все едно си пред Калинов.</p></div><div id="obody"></div>`);
  const tick = () => { left--; const el = $('#tm'); if (!el) return; el.textContent = Math.floor(Math.max(left, 0) / 60) + ':' + String(Math.max(left, 0) % 60).padStart(2, '0'); el.classList.toggle('low', left <= 30); if (left <= 0) { stopTimers(); toast('Времето изтече!'); reveal(); } };
  $('#tgo').onclick = () => { if (running) return; running = true; $('#tgo').disabled = true; timers.push(setInterval(tick, 1000)); };
  const reveal = () => {
    stopTimers(); $('#tgo').disabled = true; $('#tdone').disabled = true;
    const extra = sample(CASES.filter(c => c[0] === t.id), 2);
    $('#obody').innerHTML = `<div class="card"><h3>Отметни какво каза</h3>${t.oral.map((o, k) => `<label class="check"><input type="checkbox" data-k="${k}"><span>${esc(o)}</span></label>`).join('')}
    <div class="box star"><span class="lbl">★ ЗАПОМНИ</span>${esc(t.remember)}</div>
    <button class="btn block" id="oscore">Запиши резултата</button><div id="ores"></div></div>
    ${extra.length ? `<div class="card"><h3>🎓 Калинов пита допълнително</h3>${extra.map(c => `<details class="sec"><summary>${esc(c[1])}</summary><p>${esc(c[2])}</p></details>`).join('')}</div>` : ''}`;
    $('#oscore').onclick = () => {
      const ch = $$('#obody input[type=checkbox]'); const p = pct(ch.filter(x => x.checked).length, ch.length);
      S.oral[t.id] = p; const st = T(t.id); st.recent = (st.recent || []).concat(p >= 80 ? 1 : 0).slice(-20); markDay(); save();
      $('#ores').innerHTML = `<div class="feedback ${p >= 80 ? 'ok' : 'bad'}"><b>${p}% от плана.</b> ${p >= 80 ? 'Много добре!' : 'Прегледай темата още веднъж.'}</div>
      <div class="btns equal">${st.status !== 2 && p >= 80 ? '<button class="btn ok" id="mk">Маркирай като научена</button>' : ''}<a class="btn secondary" href="#topic/${t.id}">Към темата</a><a class="btn ghost" href="#oral">Нова тема</a></div>`;
      if ($('#mk')) $('#mk').onclick = () => { st.status = 2; save(); toast('Темата е маркирана като научена ✓'); $('#mk').remove(); };
    };
  };
  $('#tdone').onclick = reveal;
}

// ---------- АСОЦИАЦИИ И ВРЪЗКИ ----------
routes.links = () => {
  setTitle('Асоциации и връзки', true);
  const ids = scopeIds();
  view(`<div class="card"><p style="margin:0">Мнемоники, „картини“ и мостове между темите. Калинов обича, когато свързваш темите – това показва, че мислиш, а не само зубриш.</p><div class="spacer"></div><a class="btn secondary" href="#run/assoc">🧠 Тест: Коя тема е това?</a></div>
  ${TOPICS.map(t => `<div class="card"><h3><a href="#topic/${t.id}">${t.id}. ${esc(t.title)}</a></h3><div class="box pic"><span class="lbl">● КАРТИНАТА</span>${esc(t.picture)}</div><ul>${t.hooks.map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>`).join('')}
  <div class="card"><h3>🔗 Мостове между темите</h3><ul>${LINKS.map(l => `<li><b><a href="#topic/${l[0]}">${l[0]}</a> ↔ <a href="#topic/${l[1]}">${l[1]}</a>:</b> ${esc(l[2])}</li>`).join('')}</ul></div>`);
};

// ---------- ИМЕНА И ГОДИНИ ----------
routes.names = () => {
  setTitle('Имена и години', true);
  view(`<div class="card"><input type="text" id="nq" placeholder="Търси автор, година или теория…"><div class="spacer"></div><div class="btns"><a class="btn secondary" href="#match">🔗 Игра: свържи</a><a class="btn ghost" href="#run/names">📅 Тест</a></div></div><div class="card content" id="ntab"></div>`);
  const draw = () => { const q = norm($('#nq').value);
    const rows = NAMES.filter(n => !q || norm(n.who + ' ' + n.year + ' ' + n.what).includes(q));
    $('#ntab').innerHTML = `<table class="names"><tr><th>Т.</th><th>Автор</th><th>Година</th><th>За какво е</th></tr>${rows.map(n => `<tr><td><a href="#topic/${n.t}">${n.t}</a></td><td>${esc(n.who)}</td><td>${esc(n.year)}</td><td>${esc(n.what)}</td></tr>`).join('')}</table>`; };
  $('#nq').oninput = draw; draw();
};

// ---------- ПОСЛЕДНА МИНУТА ----------
routes.cram = () => {
  setTitle('Последна минута', true);
  view(`<div class="card"><p style="margin:0">Всичко най-важно на една страница – за сутринта преди изпита. ${window.Android ? '' : '<button class="btn ghost" onclick="window.print()" style="min-height:34px;padding:6px 12px">Печат</button>'}</p></div>
  ${TOPICS.map(t => `<div class="card cram"><h3><a href="#topic/${t.id}">${t.id}. ${esc(t.title)}</a></h3><div class="box star"><span class="lbl">★ ЗАПОМНИ</span>${esc(t.remember)}</div><p class="small"><b>Картината:</b> ${esc(t.picture)}</p><p class="small"><b>На устния:</b> ${t.oral.map((o, k) => (k + 1) + ') ' + esc(o)).join(' ')}</p></div>`).join('')}
  <div class="card content"><h3>Имена и години</h3><table class="names"><tr><th>Т.</th><th>Автор</th><th>Година</th><th>За какво</th></tr>${NAMES.map(n => `<tr><td>${n.t}</td><td>${esc(n.who)}</td><td>${esc(n.year)}</td><td>${esc(n.what)}</td></tr>`).join('')}</table></div>
  <div class="card"><h3>Как да говориш на изпита</h3><p>Почни с <b>определението и автора</b> → обясни <b>как работи теорията</b> → дай <b>изследването</b>, с което е доказана → завърши с <b>пример</b> (реален бизнес, напр. Famous Food). Калинов е практичен – добрият пример казва повече от три дефиниции.</p></div>`);
};

// ---------- ОЩЕ ----------
routes.more = () => {
  setTitle('Още', false);
  view(`<div class="grid">
    ${tile('#oral', '🎤', 'Устен изпит', 'теглиш тема, 3 минути')}
    ${tile('#cases', '💡', 'Казуси – мисли', CASES.length + ' въпроса')}
    ${tile('#match', '🔗', 'Свържи имена', 'игра')}
    ${tile('#order', '🔢', 'Подреди', 'хронология и етапи')}
    ${tile('#links', '🧠', 'Асоциации и връзки', 'мнемоники')}
    ${tile('#names', '📅', 'Имена и години', 'таблица')}
    ${tile('#cram', '⚡', 'Последна минута', 'обобщение')}
    ${tile('#settings', '⚙️', 'Настройки', 'тема, архив, нулиране')}
  </div>`);
};

// ---------- НАСТРОЙКИ ----------
routes.settings = () => {
  setTitle('Настройки', true);
  view(`<div class="card"><h3>Външен вид</h3><div class="seg" id="th">${[['auto', 'Автоматично'], ['light', 'Светла'], ['dark', 'Тъмна']].map(([k, l]) => `<button data-t="${k}" class="${S.settings.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="card"><h3>Прогрес между устройства</h3><p class="small muted">Прогресът се пази само на това устройство. За да го пренесеш (телефон ↔ компютър), свали файл и го зареди на другото устройство.</p>
  <div class="btns"><button class="btn secondary" id="exp">⬇ Свали прогреса</button><label class="btn ghost" style="cursor:pointer">⬆ Зареди прогрес<input type="file" id="imp" accept=".json,application/json" hidden></label></div></div>
  <div class="card"><h3>Нулиране</h3><div class="btns"><button class="btn ghost" id="rw">Изчисти грешките</button><button class="btn bad" id="rs">Нулирай всичко</button></div></div>
  <div class="card small muted">Приложението работи изцяло офлайн. Съдържанието е по учебника за устния изпит при доц. Калин Калинов. ${TOPICS.length} теми · ${CARDS.length} карти · ${QS().length} тестови въпроса · ${CASES.length} казуса · ${SEQ.length + TOPICS.length} задачи за подреждане.</div>`);
  $$('#th button').forEach(b => b.onclick = () => { S.settings.theme = b.dataset.t; save(); applyTheme(); $$('#th button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#exp').onclick = () => { if (window.Android && window.Android.saveFile) return window.Android.saveFile('kk-izpit-progres-' + today() + '.json', JSON.stringify(S)); const blob = new Blob([JSON.stringify(S)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kk-izpit-progres-' + today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.topics) throw 0; S = Object.assign(defaults(), d); save(); toast('Прогресът е зареден'); applyTheme(); routes.settings(); } catch (err) { toast('Невалиден файл'); } }; r.readAsText(f); };
  $('#rw').onclick = () => { if (confirm('Да изчистя ли списъка с грешки?')) { S.wrong = {}; save(); toast('Готово'); } };
  $('#rs').onclick = () => { if (confirm('Сигурен ли си? Ще изтрие целия прогрес на това устройство.')) { S = defaults(); save(); applyTheme(); toast('Прогресът е нулиран'); go('home'); } };
};

function applyTheme() { document.documentElement.setAttribute('data-theme', S.settings.theme || 'auto'); }
applyTheme();
router();
setInterval(updateCountdown, 60000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
})();
