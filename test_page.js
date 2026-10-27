// Проверка страницы ссылки клиенту (index.html) без браузера: скрипт страницы гоняется в vm с поддельными
// document / location / fetch / setTimeout. node test_page.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const APP = 'https://script.google.com/macros/s/AKfycbyJiYGklrArpXxk0Lu0LaZ9CRagowS6wNKKE7d-HL_-Yf8wkLViWQM5-JCvNwL4vtw82w/exec';
const D = '1pPGQCfaB8uVhYC8SXHzx_UVJeqy5M8pBq775gI1rFyM', K = 'c4d607819d8ee1f4fdf53e72';

function run(hash, answers) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, hidden: id !== 'msg', textContent: '', attrs: {}, onclick: null,
    getAttribute(n) { return this.attrs[n] || null; }, set href(v) { this.attrs.href = v; }, get href() { return this.attrs.href; } });
  const st = { replaced: null, fetched: [], timers: [], opts: [] };
  let i = 0;
  const ctx = {
    document: { getElementById: el },
    location: { hash, search: '', replace(u) { st.replaced = u; } },
    fetch(u, o) { st.fetched.push(u); st.opts.push(o); const a = answers[Math.min(i++, answers.length - 1)];
      return a === 'reject' ? Promise.reject(new Error('net')) : Promise.resolve({ json: () => (a === 'badjson' ? Promise.reject(new Error('json')) : Promise.resolve(a)) }); },
    setTimeout(fn, ms) { st.timers.push(ms); st.next = fn; },
    Date, encodeURIComponent, decodeURIComponent, Promise
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { st, els, flush: () => new Promise((r) => setImmediate(r)) };
}

(async () => {
  const res = [];
  const ok = (name, cond, detail) => res.push({ name, ok: !!cond, detail });
  const H = '#d=' + D + '&k=' + K;

  let t = run('', [{}]); await t.flush();
  ok('без #d/#k — «ссылка неполная», запроса нет', /incomplete/.test(t.els.msg.textContent) && t.st.fetched.length === 0, t.els.msg.textContent);

  t = run('#d=../x&k=' + K, [{}]); await t.flush();
  ok('кривой id документа — запроса нет', t.st.fetched.length === 0, t.st.fetched.length);

  t = run(H, [{ url: 'https://app.boldsign.com/document/sign/?documentId=x' }]); await t.flush(); await t.flush();
  ok('ответ со ссылкой BoldSign — переход на неё', t.st.replaced === 'https://app.boldsign.com/document/sign/?documentId=x', t.st.replaced);
  ok('запрос: op=open, d, k, без куки', /\?a=api&op=open&d=1pPGQ.*&k=c4d607819d8ee1f4fdf53e72/.test(t.st.fetched[0]) && t.st.fetched[0].indexOf(APP) === 0 &&
    t.st.opts[0].credentials === 'omit', t.st.fetched[0]);

  t = run(H, [{ url: 'https://evil.example/phish' }]); await t.flush(); await t.flush();
  ok('ссылка не BoldSign — перехода нет, «сотрудник поможет»', t.st.replaced === null && /staff already know/.test(t.els.msg.textContent), t.els.msg.textContent);
  ok('запасная ссылка — прежняя a=sign того же договора', t.els.alt.attrs.href === APP + '?a=sign&d=' + D + '&k=' + K + '&who=client' && t.els.alt.hidden === false, t.els.alt.attrs.href);

  for (const [k, re] of [['done', /already signed/], ['signed', /signature is recorded/], ['cancelled', /no longer valid.*недействителен/]]) {
    t = run(H, [{ [k]: true }]); await t.flush(); await t.flush();
    ok('ответ ' + k + ' — свой текст, без перехода и без кнопок', re.test(t.els.msg.textContent) && t.st.replaced === null && t.els.again.hidden, t.els.msg.textContent);
  }

  // TB e-Sign 0.2.6: заменён новым договором на тот же байк — {cancelled, replaced}: «заменён», а не «недействителен».
  t = run(H, [{ cancelled: true, replaced: true }]); await t.flush(); await t.flush();
  ok('ответ {cancelled, replaced} — «заменён, откройте последнюю ссылку», без перехода и без кнопок', /replaced by a newer one.*заменён/.test(t.els.msg.textContent) &&
    t.st.replaced === null && t.els.again.hidden, t.els.msg.textContent);

  t = run(H, [{ bad: true }]); await t.flush(); await t.flush();
  ok('ключ не подошёл (TB e-Sign 0.2.4: {bad:true}) — «ссылка неполная», без кнопок', /incomplete/.test(t.els.msg.textContent) && t.els.again.hidden && t.st.replaced === null, t.els.msg.textContent);

  t = run(H, [{ busy: true }]); await t.flush(); await t.flush();
  ok('busy — «обновляется», повтор через 20 с', /being updated/.test(t.els.msg.textContent) && t.st.timers[0] === 20000, t.st.timers.join(','));
  for (let n = 0; n < 9; n++) { t.st.next(); await t.flush(); await t.flush(); }
  ok('после 9 повторов — «откройте позже» и кнопки', /a bit later/.test(t.els.msg.textContent) && !t.els.again.hidden && t.st.fetched.length === 10, t.st.fetched.length);

  t = run(H, ['reject']); await t.flush(); await t.flush();
  ok('сеть упала — «не получилось», кнопки повтора и запасной ссылки', /went wrong/.test(t.els.msg.textContent) && !t.els.again.hidden && !t.els.alt.hidden, t.els.msg.textContent);

  t = run(H, ['badjson']); await t.flush(); await t.flush();
  ok('ответ не JSON (страница ошибки Apps Script) — «не получилось»', /went wrong/.test(t.els.msg.textContent), t.els.msg.textContent);

  const failed = res.filter((r) => !r.ok);
  res.forEach((r) => console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' | ' + r.detail)));
  console.log('ИТОГ ' + (res.length - failed.length) + '/' + res.length);
  process.exit(failed.length ? 1 : 0);
})();
