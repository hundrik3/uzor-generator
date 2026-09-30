(function () {
  const P = window.PLAN;
  const NS = 'http://www.w3.org/2000/svg';
  const STORE = 'plan3f-v1';
  const CONF = { ok: 'уверенно', chk: 'проверить', unk: 'не разобрано' };

  const svg = document.getElementById('svg');
  const tabsEl = document.getElementById('tabs');
  let section = 'all';
  let selected = null;
  let edits = load();

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(edits)); } catch (e) { /* без хранилища тоже работает */ }
  }
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // pins: [id, section, x, y, value, meaning, conf] + правки пользователя
  const PREFIX = { L: 'Л', T1: 'П1·', M: 'С', T2: 'П2·', R: 'Пр' };
  function pins() {
    const cnt = {};
    return P.pins.map(p => {
      const e = edits[p[0]] || {};
      cnt[p[1]] = (cnt[p[1]] || 0) + 1;
      return { id: p[0], n: cnt[p[1]], label: PREFIX[p[1]] + cnt[p[1]], sec: p[1], x: p[2], y: p[3],
        v: e.v !== undefined ? e.v : p[4],
        m: e.m !== undefined ? e.m : p[5],
        c: e.c || p[6] };
    });
  }

  // ---------- легенда ----------
  function drawLegend() {
    const t = document.getElementById('legend');
    let h = '<tr><th>Обозн.</th><th>Что</th><th>Ширина</th><th>Высота</th><th>Статус</th></tr>';
    P.legend.forEach(d => {
      h += `<tr><td><span class="mark">${d.mark}</span></td><td>${d.name}${d.note ? `<br><small class="hint">${d.note}</small>` : ''}</td>` +
        `<td class="num">${d.w}</td><td class="num">${d.h}</td><td><span class="dot ${d.conf}"></span> ${CONF[d.conf]}</td></tr>`;
    });
    P.other.forEach(o => {
      h += `<tr><td></td><td>${o.name}</td><td class="num" colspan="2">${o.v}</td><td><span class="dot ${o.conf}"></span> ${CONF[o.conf]}</td></tr>`;
    });
    t.innerHTML = h;
  }

  // ---------- схема ----------
  function drawSvg() {
    svg.innerHTML = '';
    const v = P.sections[section].view;
    svg.setAttribute('viewBox', v.join(' '));
    svg.style.aspectRatio = `${v[2]} / ${v[3]}`;

    const photo = el('image', { href: 'photo.jpg', x: 0, y: 0, width: P.size.w, height: P.size.h, id: 'photo', preserveAspectRatio: 'none' }, svg);
    photo.style.opacity = document.getElementById('photoOpacity').value / 100;

    const gs = el('g', { id: 'schema' }, svg);
    gs.style.display = document.getElementById('showSchema').checked ? '' : 'none';
    gs.style.opacity = 0.82;
    Object.keys(P.rects).forEach(k => {
      P.rects[k].forEach(r => {
        el('rect', { x: r[1], y: r[2], width: r[3] - r[1], height: r[4] - r[2], class: 'r ' + r[5] }, gs);
        const w = r[3] - r[1], h = r[4] - r[2];
        const t = el('text', { x: (r[1] + r[3]) / 2, y: (r[2] + r[4]) / 2, class: 'rl' }, gs);
        if (h > w * 1.6) t.setAttribute('transform', `rotate(-90 ${(r[1] + r[3]) / 2} ${(r[2] + r[4]) / 2})`);
        t.textContent = r[0];
      });
    });
    Object.values(P.outlines).forEach(o => el('rect', { x: o[0], y: o[1], width: o[2] - o[0], height: o[3] - o[1], class: 'wall' }, gs));

    const gp = el('g', { id: 'pinlayer' }, svg);
    gp.style.display = document.getElementById('showPins').checked ? '' : 'none';
    pins().forEach(p => {
      if (section !== 'all' && p.sec !== section) return;
      const g = el('g', { class: 'pin ' + p.c + (p.id === selected ? ' sel' : ''), 'data-id': p.id }, gp);
      const s = Math.max(0.55, Math.min(1.3, v[2] / 1500));
      g.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${s})`);
      el('circle', { r: 12 }, g);
      const num = el('text', { class: 'n' }, g); num.textContent = p.n;
      const tip = el('g', { class: 'tip' }, g);
      const label = p.v;
      const w = Math.max(60, label.length * 10 + 16);
      el('rect', { x: 14, y: -26, width: w, height: 24, rx: 5 }, tip);
      const tt = el('text', { x: 22, y: -9 }, tip); tt.textContent = label;
      g.addEventListener('click', () => select(p.id, true));
    });
  }

  // ---------- таблица ----------
  const SEC_NAMES = { L: 'Левый блок', T1: 'Переход 1 (между левым и средним)', M: 'Средний блок', T2: 'Переход 2 (между средним и правым)', R: 'Правый блок' };
  function drawTable() {
    const t = document.getElementById('pins');
    const only = document.getElementById('onlyOpen').checked;
    let h = '<tr><th>№</th><th>Значение, мм</th><th>Как я понял</th><th>Статус</th></tr>';
    let last = null;
    pins().forEach(p => {
      if (only && p.c === 'ok') return;
      if (p.sec !== last) { h += `<tr class="sec"><td colspan="4">${SEC_NAMES[p.sec]}</td></tr>`; last = p.sec; }
      h += `<tr data-id="${p.id}" class="${p.id === selected ? 'sel' : ''}">` +
        `<td><span class="dot ${p.c}"></span> ${p.label}</td>` +
        `<td><input type="text" data-f="v" value="${esc(p.v)}"></td>` +
        `<td><input type="text" data-f="m" value="${esc(p.m)}"></td>` +
        `<td><select data-f="c">${['ok', 'chk', 'unk'].map(k => `<option value="${k}"${k === p.c ? ' selected' : ''}>${CONF[k]}</option>`).join('')}</select></td></tr>`;
    });
    t.innerHTML = h;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function select(id, scroll) {
    selected = id;
    drawSvg();
    document.querySelectorAll('#pins tr.sel').forEach(r => r.classList.remove('sel'));
    const row = document.querySelector(`#pins tr[data-id="${id}"]`);
    if (row) { row.classList.add('sel'); if (scroll) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  // ---------- вкладки ----------
  function drawTabs() {
    tabsEl.innerHTML = '';
    Object.keys(P.sections).forEach(k => {
      const b = document.createElement('button');
      b.textContent = P.sections[k].name;
      if (k === section) b.className = 'on';
      b.onclick = () => { section = k; drawTabs(); drawSvg(); };
      tabsEl.appendChild(b);
    });
  }

  // ---------- события ----------
  document.getElementById('pins').addEventListener('input', e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = tr.dataset.id, f = e.target.dataset.f;
    edits[id] = edits[id] || {}; edits[id][f] = e.target.value; save();
    if (f === 'c') { drawTable(); }
    drawSvg();
  });
  document.getElementById('pins').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && e.target.tagName !== 'SELECT') {
      const p = pins().find(x => x.id === tr.dataset.id);
      if (p && section !== 'all' && p.sec !== section) section = p.sec, drawTabs();
      select(tr.dataset.id, false);
    }
  });
  document.getElementById('photoOpacity').oninput = e => { const p = document.getElementById('photo'); if (p) p.style.opacity = e.target.value / 100; };
  document.getElementById('showSchema').onchange = e => { document.getElementById('schema').style.display = e.target.checked ? '' : 'none'; };
  document.getElementById('showPins').onchange = e => { document.getElementById('pinlayer').style.display = e.target.checked ? '' : 'none'; };
  document.getElementById('onlyOpen').onchange = drawTable;
  let armed = false, armTimer;
  const resetBtn = document.getElementById('resetAll');
  resetBtn.onclick = () => {
    if (!armed) {
      armed = true; resetBtn.textContent = 'Точно сбросить?';
      armTimer = setTimeout(() => { armed = false; resetBtn.textContent = 'Сбросить правки'; }, 4000);
      return;
    }
    clearTimeout(armTimer); armed = false; resetBtn.textContent = 'Сбросить правки';
    edits = {}; save(); drawTable(); drawSvg();
  };

  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
  }
  function copyOut(text) {
    const done = () => toast('Скопировано');
    const fallback = () => {
      let ta = document.getElementById('out');
      if (!ta) { ta = document.createElement('textarea'); ta.id = 'out'; ta.readOnly = true; document.getElementById('exportBox').appendChild(ta); }
      ta.value = text; ta.focus(); ta.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  document.getElementById('exportCsv').onclick = () => {
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    let out = 'id;участок;значение_мм;как_понял;статус\n';
    pins().forEach(p => { out += [p.label, SEC_NAMES[p.sec], p.v, p.m, CONF[p.c]].map(q).join(';') + '\n'; });
    copyOut(out);
  };
  document.getElementById('exportJson').onclick = () => {
    copyOut(JSON.stringify({ legend: P.legend, other: P.other, pins: pins() }, null, 2));
  };

  drawLegend(); drawTabs(); drawSvg(); drawTable();
})();
