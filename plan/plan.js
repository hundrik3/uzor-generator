(function () {
  const P = window.PLAN;
  const NS = 'http://www.w3.org/2000/svg';
  const STORE = 'plan3f-v1';
  const CONF = { ok: 'уверенно', chk: 'проверить', unk: 'не разобрано' };
  const PREFIX = { L: 'Л', T1: 'П1·', M: 'С', T2: 'П2·', R: 'Пр' };
  const SEC_NAMES = { L: 'Левый блок', T1: 'Переход 1 (между левым и средним)', M: 'Средний блок', T2: 'Переход 2 (между средним и правым)', R: 'Правый блок' };
  const SEC_KEYS = { all: ['L', 'T1', 'M', 'T2', 'R'], L: ['L'], T1: ['T1'], M: ['M'], T2: ['T2'], R: ['R'] };
  const PAD = 70; // поле вокруг содержимого, px фото

  const svg = document.getElementById('svg');
  const tabsEl = document.getElementById('tabs');
  let section = 'all';
  let selected = null;
  let edits = load();
  let mode = '2d';
  let base = null; // вид «целиком» для текущего участка
  let cur = null;  // текущий вид (после зума и сдвига)

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
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  // Вид участка = рамка вокруг схемы и всех его отметок, так что ничего не выходит за край.
  function computeViews() {
    Object.keys(SEC_KEYS).forEach(k => {
      let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
      const add = (ax, ay, bx, by) => { x1 = Math.min(x1, ax); y1 = Math.min(y1, ay); x2 = Math.max(x2, bx); y2 = Math.max(y2, by); };
      SEC_KEYS[k].forEach(s => {
        (P.rects[s] || []).forEach(r => add(r[1], r[2], r[3], r[4]));
        if (P.outlines[s]) add(P.outlines[s][0], P.outlines[s][1], P.outlines[s][2], P.outlines[s][3]);
      });
      P.pins.forEach(p => { if (SEC_KEYS[k].includes(p[1])) add(p[2] - 8, p[3] - 8, p[2] + 8, p[3] + 8); });
      // справа оставляем место под подсказку, если отметка у края
      P.sections[k].view = [x1 - PAD, y1 - PAD, x2 - x1 + PAD * 2, y2 - y1 + PAD * 2];
      P.sections[k].box = [x1, y1, x2, y2];
    });
  }

  function pins() {
    const cnt = {};
    return P.pins.map(p => {
      const e = edits[p[0]] || {};
      cnt[p[1]] = (cnt[p[1]] || 0) + 1;
      return { id: p[0], n: cnt[p[1]], label: PREFIX[p[1]] + cnt[p[1]], sec: p[1], x: p[2], y: p[3],
        v: e.v !== undefined ? e.v : p[4],
        m: e.m !== undefined ? e.m : p[5],
        c: e.c || p[6], line: p[7] || null };
    });
  }
  const MMPX = 50; // ~мм на пиксель фото (фото снято под углом, значение приблизительное)
  function doors() {
    const cnt = {};
    return P.doors.map(d => {
      const e = edits['door:' + d[0]] || {};
      const t = P.doorTypes[e.t] ? e.t : d[6];
      const ty = P.doorTypes[t];
      const off = Number(e.off) || 0;
      const horiz = d[4] === 'h';
      cnt[d[1]] = (cnt[d[1]] || 0) + 1;
      return { id: d[0], n: cnt[d[1]], label: 'Д' + PREFIX[d[1]] + cnt[d[1]], sec: d[1],
        x: d[2] + (horiz ? off : 0), y: d[3] + (horiz ? 0 : off), o: d[4], s: d[5], t, room: d[7],
        c: e.c || d[8], off, w: ty.w, h: ty.h, leaves: ty.leaves, mark: ty.mark, color: ty.color, tname: ty.name };
    });
  }
  // Геометрия створок в px фото: проём a–b в стене, створки открываются в сторону коридора (s).
  function doorGeom(d) {
    const w = d.w / MMPX;
    const ax = d.o === 'h' ? [1, 0] : [0, 1];
    const nx = d.o === 'h' ? [0, d.s] : [d.s, 0];
    const Pt = (a, n) => [d.x + ax[0] * a + nx[0] * n, d.y + ax[1] * a + nx[1] * n];
    const L = [];
    if (d.leaves === 1) L.push({ hinge: Pt(-w / 2, 0), open: Pt(-w / 2, w), closed: Pt(w / 2, 0), len: w });
    if (d.leaves === 2) {
      L.push({ hinge: Pt(-w / 2, 0), open: Pt(-w / 2, w / 2), closed: Pt(0, 0), len: w / 2 });
      L.push({ hinge: Pt(w / 2, 0), open: Pt(w / 2, w / 2), closed: Pt(0, 0), len: w / 2 });
    }
    return { w, leaves: L, a: Pt(-w / 2, 0), b: Pt(w / 2, 0) };
  }
  window.PlanApp = { pins, doors, doorGeom, SEC_KEYS, get section() { return section; } };

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
  function setView(v) {
    cur = v.slice();
    svg.setAttribute('viewBox', cur.map(n => +n.toFixed(1)).join(' '));
    placePins();
    svg.style.touchAction = cur[2] < base[2] * 0.98 ? 'none' : 'pan-y';
  }

  function drawSvg() {
    svg.innerHTML = '';
    base = P.sections[section].view.slice();
    svg.style.aspectRatio = `${base[2]} / ${base[3]}`;
    svg.style.width = `min(100%, calc(82vh * ${(base[2] / base[3]).toFixed(3)}))`;
    svg.style.margin = '0 auto';

    const photo = el('image', { href: window.PLAN_PHOTO, x: 0, y: 0, width: P.size.w, height: P.size.h, id: 'photo', preserveAspectRatio: 'none' }, svg);
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

    const gdoor = el('g', { id: 'doorlayer' }, svg);
    gdoor.style.display = document.getElementById('showDoors').checked ? '' : 'none';
    doors().forEach(d => {
      if (section !== 'all' && d.sec !== section) return;
      const g = el('g', { class: 'door ' + d.c + ' t-' + d.t, 'data-id': d.id }, gdoor);
      const G = doorGeom(d);
      const ttl = el('title', {}, g); ttl.textContent = `${d.label} · ${d.room} · ${d.tname} ${d.w}×${d.h}`;
      el('line', { class: 'dgap', x1: G.a[0], y1: G.a[1], x2: G.b[0], y2: G.b[1] }, g);
      if (d.leaves === 0) {
        el('line', { class: 'dpanel', x1: G.a[0], y1: G.a[1], x2: G.b[0], y2: G.b[1] }, g);
      }
      G.leaves.forEach(l => {
        el('line', { class: 'dleaf', x1: l.hinge[0], y1: l.hinge[1], x2: l.open[0], y2: l.open[1] }, g);
        const cr = (l.closed[0] - l.hinge[0]) * (l.open[1] - l.hinge[1]) - (l.closed[1] - l.hinge[1]) * (l.open[0] - l.hinge[0]);
        el('path', { class: 'darc', d: `M${l.closed[0]} ${l.closed[1]} A${l.len} ${l.len} 0 0 ${cr > 0 ? 1 : 0} ${l.open[0]} ${l.open[1]}` }, g);
      });
      const tx = el('text', { class: 'dmark', x: d.x, y: d.y }, g); tx.textContent = d.mark;
      tx.dataset.nx = d.o === 'h' ? 0 : d.s; tx.dataset.ny = d.o === 'h' ? d.s : 0;
    });

    const gd = el('g', { id: 'dimlayer' }, svg);
    gd.style.display = document.getElementById('showPins').checked ? '' : 'none';
    pins().forEach(p => {
      if (!p.line || (section !== 'all' && p.sec !== section)) return;
      const g = el('g', { class: 'dim ' + p.c, 'data-id': p.id }, gd);
      g.dataset.l = p.line.join(',');
      el('line', { class: 'dl', x1: p.line[0], y1: p.line[1], x2: p.line[2], y2: p.line[3] }, g);
      el('line', { class: 'dl t1' }, g); el('line', { class: 'dl t2' }, g);
      const t = el('text', { class: 'dt' }, g); t.textContent = p.v;
    });

    const gp = el('g', { id: 'pinlayer' }, svg);
    gp.style.display = document.getElementById('showPins').checked ? '' : 'none';
    pins().forEach(p => {
      if (section !== 'all' && p.sec !== section) return;
      const g = el('g', { class: 'pin ' + p.c + (p.id === selected ? ' sel' : ''), 'data-id': p.id, 'data-x': p.x, 'data-y': p.y }, gp);
      el('circle', { r: 12 }, g);
      const num = el('text', { class: 'n' }, g); num.textContent = p.n;
      const tip = el('g', { class: 'tip' }, g);
      const w = Math.max(60, p.v.length * 10 + 16);
      g.dataset.w = w;
      el('rect', { x: 14, y: -26, width: w, height: 24, rx: 5 }, tip);
      const tt = el('text', { x: 22, y: -9 }, tip); tt.textContent = p.v;
      g.addEventListener('click', () => { if (!moved) select(p.id, true); });
    });
    setView(base);
  }

  // Размер значка постоянный на экране; положение прижато к краям вида, чтобы не выходить за поля.
  function placePins() {
    const layer = document.getElementById('pinlayer');
    if (!layer || !cur) return;
    const s = Math.max(0.35, Math.min(1.6, cur[2] / 1500));
    const m = 14 * s;
    document.querySelectorAll('#doorlayer .dmark').forEach(t => {
      const x = +t.getAttribute('x'), y = +t.getAttribute('y');
      t.setAttribute('font-size', 18 * s);
      t.setAttribute('transform', `translate(${(+t.dataset.nx) * -14 * s} ${(+t.dataset.ny) * -14 * s + 6 * s})`);
    });
    document.querySelectorAll('#dimlayer .dim').forEach(g => {
      const [x1, y1, x2, y2] = g.dataset.l.split(',').map(Number);
      const horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      const L = 8 * s, t1 = g.querySelector('.t1'), t2 = g.querySelector('.t2'), tx = g.querySelector('.dt');
      const tick = (t, x, y) => { t.setAttribute('x1', horiz ? x : x - L); t.setAttribute('x2', horiz ? x : x + L); t.setAttribute('y1', horiz ? y - L : y); t.setAttribute('y2', horiz ? y + L : y); };
      tick(t1, x1, y1); tick(t2, x2, y2);
      tx.setAttribute('font-size', 24 * s);
      if (horiz) { tx.setAttribute('x', (x1 + x2) / 2); tx.setAttribute('y', y1 - 11 * s); tx.setAttribute('text-anchor', 'middle'); }
      else { tx.setAttribute('x', x1 + 10 * s); tx.setAttribute('y', (y1 + y2) / 2 + 5 * s); tx.setAttribute('text-anchor', 'start'); }
    });
    layer.querySelectorAll('.pin').forEach(g => {
      const x0 = +g.dataset.x, y0 = +g.dataset.y;
      const x = Math.min(Math.max(x0, cur[0] + m), cur[0] + cur[2] - m);
      const y = Math.min(Math.max(y0, cur[1] + m), cur[1] + cur[3] - m);
      const tipW = (+g.dataset.w + 16) * s;
      const flip = x + tipW > cur[0] + cur[2];
      const up = y - 30 * s < cur[1];
      g.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
      const tip = g.querySelector('.tip');
      const w = +g.dataset.w;
      tip.setAttribute('transform', `translate(${flip ? -(w + 28) : 0} ${up ? 44 : 0})`);
    });
  }

  function zoomAt(f, cx, cy) {
    if (!cur) return;
    const nw = Math.min(base[2] * 1.0, Math.max(base[2] / 12, cur[2] * f));
    const k = nw / cur[2];
    const nh = cur[3] * k;
    let nx = cx - (cx - cur[0]) * k, ny = cy - (cy - cur[1]) * k;
    nx = Math.min(Math.max(nx, base[0]), base[0] + base[2] - nw);
    ny = Math.min(Math.max(ny, base[1]), base[1] + base[3] - nh);
    setView([nx, ny, nw, nh]);
  }
  function toSvg(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / cur[2], r.height / cur[3]);
    const ox = (r.width - cur[2] * sc) / 2, oy = (r.height - cur[3] * sc) / 2;
    return [cur[0] + (clientX - r.left - ox) / sc, cur[1] + (clientY - r.top - oy) / sc, sc];
  }
  let moved = false;
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const [x, y] = toSvg(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 0.85 : 1 / 0.85, x, y);
  }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    moved = false;
    drag = { x: e.clientX, y: e.clientY, v: cur.slice() };
  });
  svg.addEventListener('pointermove', e => {
    if (!drag || !(e.buttons & 1)) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true;
    const sc = toSvg(0, 0)[2];
    let nx = drag.v[0] - dx / sc, ny = drag.v[1] - dy / sc;
    nx = Math.min(Math.max(nx, base[0]), base[0] + base[2] - drag.v[2]);
    ny = Math.min(Math.max(ny, base[1]), base[1] + base[3] - drag.v[3]);
    setView([nx, ny, drag.v[2], drag.v[3]]);
  });
  window.addEventListener('pointerup', () => { drag = null; setTimeout(() => { moved = false; }, 0); });
  document.getElementById('zoomIn').onclick = () => zoomAt(0.7, cur[0] + cur[2] / 2, cur[1] + cur[3] / 2);
  document.getElementById('zoomOut').onclick = () => zoomAt(1 / 0.7, cur[0] + cur[2] / 2, cur[1] + cur[3] / 2);
  document.getElementById('zoomReset').onclick = () => setView(base);

  // ---------- таблица ----------
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

  function drawDoorTable() {
    const t = document.getElementById('doors');
    const only = document.getElementById('onlyOpen').checked;
    let h = '<tr><th>№</th><th>Помещение</th><th>Тип (ширина × высота, мм)</th><th>Сдвиг, px</th><th>Статус</th></tr>';
    let last = null;
    doors().forEach(d => {
      if (only && d.c === 'ok') return;
      if (d.sec !== last) { h += `<tr class="sec"><td colspan="5">${SEC_NAMES[d.sec]}</td></tr>`; last = d.sec; }
      h += `<tr data-door="${d.id}"><td><span class="dot ${d.c}"></span> ${d.label}</td><td>${esc(d.room)}</td>` +
        `<td><select data-f="t">${Object.keys(P.doorTypes).map(k => { const y = P.doorTypes[k]; return `<option value="${k}"${k === d.t ? ' selected' : ''}>${y.mark} ${y.name} ${y.w}×${y.h}</option>`; }).join('')}</select></td>` +
        `<td><input type="number" step="1" data-f="off" value="${d.off}"></td>` +
        `<td><select data-f="c">${['ok', 'chk', 'unk'].map(k => `<option value="${k}"${k === d.c ? ' selected' : ''}>${CONF[k]}</option>`).join('')}</select></td></tr>`;
    });
    t.innerHTML = h;
  }

  function select(id, scroll) {
    selected = id;
    document.querySelectorAll('.pin.sel').forEach(g => g.classList.remove('sel'));
    const g = svg.querySelector(`.pin[data-id="${id}"]`);
    if (g) g.classList.add('sel');
    document.querySelectorAll('#pins tr.sel').forEach(r => r.classList.remove('sel'));
    const row = document.querySelector(`#pins tr[data-id="${id}"]`);
    if (row) { row.classList.add('sel'); if (scroll) row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  // ---------- вкладки участков и режимов ----------
  function drawTabs() {
    tabsEl.innerHTML = '';
    Object.keys(P.sections).forEach(k => {
      const b = document.createElement('button');
      b.textContent = P.sections[k].name;
      if (k === section) b.className = 'on';
      b.onclick = () => {
        section = k; drawTabs();
        if (mode === '2d') drawSvg(); else window.Plan3D && window.Plan3D.focus(k);
      };
      tabsEl.appendChild(b);
    });
  }
  function setMode(m) {
    mode = m;
    document.getElementById('mode2d').className = m === '2d' ? 'on' : '';
    document.getElementById('mode3d').className = m === '3d' ? 'on' : '';
    document.getElementById('view2d').hidden = m !== '2d';
    document.getElementById('view3d').hidden = m !== '3d';
    if (m === '3d') { if (window.Plan3D) { window.Plan3D.show(); window.Plan3D.focus(section); } }
    else if (window.Plan3D) window.Plan3D.hide();
  }
  document.getElementById('mode2d').onclick = () => setMode('2d');
  document.getElementById('mode3d').onclick = () => setMode('3d');

  // ---------- события ----------
  document.getElementById('pins').addEventListener('input', e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = tr.dataset.id, f = e.target.dataset.f;
    edits[id] = edits[id] || {}; edits[id][f] = e.target.value; save();
    if (f === 'c') drawTable();
    drawSvg();
    if (window.Plan3D) window.Plan3D.refreshPins();
  });
  document.getElementById('pins').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && e.target.tagName !== 'SELECT') {
      const p = pins().find(x => x.id === tr.dataset.id);
      selected = tr.dataset.id;
      if (mode !== '2d') setMode('2d');
      if (p && section !== 'all' && p.sec !== section) { section = p.sec; drawTabs(); }
      drawSvg();
      select(tr.dataset.id, false);
    }
  });
  document.getElementById('photoOpacity').oninput = e => { const p = document.getElementById('photo'); if (p) p.style.opacity = e.target.value / 100; };
  document.getElementById('showSchema').onchange = e => { document.getElementById('schema').style.display = e.target.checked ? '' : 'none'; };
  document.getElementById('showPins').onchange = e => { const v = e.target.checked ? '' : 'none'; document.getElementById('pinlayer').style.display = v; document.getElementById('dimlayer').style.display = v; };
  document.getElementById('showDoors').onchange = e => { document.getElementById('doorlayer').style.display = e.target.checked ? '' : 'none'; };
  document.getElementById('onlyOpen').onchange = () => { drawTable(); drawDoorTable(); };

  let armed = false, armTimer;
  const resetBtn = document.getElementById('resetAll');
  resetBtn.onclick = () => {
    if (!armed) {
      armed = true; resetBtn.textContent = 'Точно сбросить?';
      armTimer = setTimeout(() => { armed = false; resetBtn.textContent = 'Сбросить правки'; }, 4000);
      return;
    }
    clearTimeout(armTimer); armed = false; resetBtn.textContent = 'Сбросить правки';
    edits = {}; save(); drawTable(); drawDoorTable(); drawSvg();
    if (window.Plan3D) { window.Plan3D.refreshPins(); window.Plan3D.refreshDoors(); }
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
    copyOut(JSON.stringify({ legend: P.legend, other: P.other, doors: doors().map(d => ({ id: d.label, room: d.room, type: d.t, w: d.w, h: d.h, x: d.x, y: d.y, status: CONF[d.c] })), pins: pins() }, null, 2));
  };

  document.getElementById('doors').addEventListener('input', e => {
    const tr = e.target.closest('tr[data-door]'); if (!tr) return;
    const id = 'door:' + tr.dataset.door, f = e.target.dataset.f;
    edits[id] = edits[id] || {}; edits[id][f] = e.target.value; save();
    if (f === 'c') drawDoorTable();
    drawSvg();
    if (window.Plan3D) window.Plan3D.refreshDoors();
  });
  document.getElementById('doors').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-door]');
    if (tr && !['SELECT', 'INPUT'].includes(e.target.tagName)) {
      const d = doors().find(x => x.id === tr.dataset.door);
      if (mode !== '2d') setMode('2d');
      if (d && section !== 'all' && d.sec !== section) { section = d.sec; drawTabs(); }
      drawSvg();
      document.querySelectorAll('.door.sel').forEach(g => g.classList.remove('sel'));
      const g = svg.querySelector(`.door[data-id="${tr.dataset.door}"]`); if (g) g.classList.add('sel');
      svg.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });

  computeViews();
  drawLegend(); drawTabs(); drawSvg(); drawTable(); drawDoorTable();
})();
