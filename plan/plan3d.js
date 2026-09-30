// 3D-модель этажа: те же прямоугольники, что и на схеме, вытянутые в стены.
// Масштаб ≈ 48 мм на пиксель фото (сверено с карандашными размерами).
(function () {
  const P = window.PLAN;
  const K = 0.048;               // метров на пиксель
  const WALL_T = 0.16;           // толщина стены, м
  const COLORS = { room: 0xdde5f2, corr: 0xc9e6d4, stair: 0xecdcb8, lift: 0xd3c7ea, porch: 0xd6d6d6 };
  const PIN_COLORS = { ok: 0x1a9c5b, chk: 0xe08a00, unk: 0xd23b3b };
  const CONF = { ok: 'уверенно', chk: 'проверить', unk: 'не разобрано' };

  let inited = false, running = false, failed = false;
  let renderer, scene, camera, controls, stage, hud;
  let wallsG, floorsG, labelsG, pinsG, photoPlane, pickables = [];
  let wallMats = [];
  let center = new THREE.Vector3();
  let last = { c: null, d: 60 };
  const ray = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
  const mouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;

  const $ = id => document.getElementById(id);
  const X = px => px * K, Z = py => py * K;

  function cssColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function label(text, size, color) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const fs = 64;
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + 24;
    c.width = w; c.height = fs + 24;
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, w / 2, c.height / 2);
    ctx.fillStyle = color || '#28324a';
    ctx.fillText(text, w / 2, c.height / 2);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.set(size * c.width / c.height, size, 1);
    s.renderOrder = 10;
    return s;
  }

  function build() {
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a8, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(-40, 80, 60);
    scene.add(sun);

    floorsG = new THREE.Group(); wallsG = new THREE.Group(); labelsG = new THREE.Group(); pinsG = new THREE.Group();
    scene.add(floorsG, wallsG, labelsG, pinsG);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f8, roughness: 0.95, metalness: 0 });
    const liftMat = new THREE.MeshStandardMaterial({ color: 0xb9a7e0, roughness: 0.9 });
    const stairMat = new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.9 });
    wallMats = [wallMat, liftMat, stairMat];
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x445068, transparent: true, opacity: 0.55 });

    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    const segs = new Set();

    function addWall(ax, ay, bx, by) {
      const horiz = Math.abs(ay - by) < Math.abs(ax - bx);
      let key, len, cx, cz;
      if (horiz) {
        const a = Math.min(ax, bx), b = Math.max(ax, bx), y = (ay + by) / 2;
        key = `h${Math.round(y / 3)}:${Math.round(a / 4)}:${Math.round(b / 4)}`;
        len = X(b - a) + WALL_T; cx = X((a + b) / 2); cz = Z(y);
      } else {
        const a = Math.min(ay, by), b = Math.max(ay, by), x = (ax + bx) / 2;
        key = `v${Math.round(x / 3)}:${Math.round(a / 4)}:${Math.round(b / 4)}`;
        len = X(b - a) + WALL_T; cx = X(x); cz = Z((a + b) / 2);
      }
      if (segs.has(key)) return;
      segs.add(key);
      const geo = horiz ? new THREE.BoxGeometry(len, 1, WALL_T) : new THREE.BoxGeometry(WALL_T, 1, len);
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(cx, 0.5, cz);
      wallsG.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      e.position.copy(m.position);
      wallsG.add(e);
    }

    Object.keys(P.rects).forEach(k => {
      P.rects[k].forEach(r => {
        const [name, ax, ay, bx, by, type] = r;
        x1 = Math.min(x1, ax); y1 = Math.min(y1, ay); x2 = Math.max(x2, bx); y2 = Math.max(y2, by);
        const w = X(bx - ax), d = Z(by - ay), cx = X((ax + bx) / 2), cz = Z((ay + by) / 2);
        const fl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d),
          new THREE.MeshStandardMaterial({ color: COLORS[type] || COLORS.room, roughness: 1 }));
        fl.position.set(cx, -0.04, cz);
        floorsG.add(fl);

        if (type === 'lift') {
          const lm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 1, d * 0.94), liftMat);
          lm.position.set(cx, 0.5, cz); wallsG.add(lm);
        } else if (type === 'stair') {
          if (/лестн/.test(name)) {
            const n = 14, horizontal = w >= d, run = (horizontal ? w : d) / n;
            for (let i = 0; i < n; i++) {
              const hgt = (i + 1) / n * 0.55;
              const st = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? run : w * 0.9, hgt, horizontal ? d * 0.9 : run), stairMat);
              st.position.set(horizontal ? cx - w / 2 + run * (i + 0.5) : cx, hgt / 2, horizontal ? cz : cz - d / 2 + run * (i + 0.5));
              wallsG.add(st);
            }
          }
          addWall(ax, ay, bx, ay); addWall(ax, by, bx, by); addWall(ax, ay, ax, by); addWall(bx, ay, bx, by);
        } else {
          addWall(ax, ay, bx, ay); addWall(ax, by, bx, by); addWall(ax, ay, ax, by); addWall(bx, ay, bx, by);
        }

        if (type !== 'porch' && !/^(лестница|лифты)/.test(name)) {
          const sp = label(name, Math.min(2.2, Math.max(1.0, Math.min(w, d) * 0.35)));
          sp.position.set(cx, 0.35, cz);
          labelsG.add(sp);
        }
      });
    });
    Object.values(P.outlines).forEach(o => {
      addWall(o[0], o[1], o[2], o[1]); addWall(o[0], o[3], o[2], o[3]);
      addWall(o[0], o[1], o[0], o[3]); addWall(o[2], o[1], o[2], o[3]);
    });

    // фото на полу (по желанию)
    photoPlane = new THREE.Mesh(new THREE.PlaneGeometry(X(P.size.w), Z(P.size.h)),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    photoPlane.rotation.x = -Math.PI / 2;
    photoPlane.position.set(X(P.size.w / 2), -0.02, Z(P.size.h / 2));
    photoPlane.visible = false;
    scene.add(photoPlane);

    center.set(X((x1 + x2) / 2), 0, Z((y1 + y2) / 2));
    refreshPins();
    setWallHeight();
  }

  function refreshPins() {
    if (!pinsG) return;
    while (pinsG.children.length) pinsG.remove(pinsG.children[0]);
    pickables = [];
    const geo = new THREE.SphereGeometry(0.5, 16, 12);
    window.PlanApp.pins().forEach(p => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PIN_COLORS[p.c] }));
      m.position.set(X(p.x), 0.55, Z(p.y));
      m.userData = p;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), new THREE.MeshBasicMaterial({ color: PIN_COLORS[p.c] }));
      stem.position.set(X(p.x), 0.27, Z(p.y));
      pinsG.add(stem, m);
      pickables.push(m);
      if (p.line) {
        const a = new THREE.Vector3(X(p.line[0]), 0.15, Z(p.line[1])), b = new THREE.Vector3(X(p.line[2]), 0.15, Z(p.line[3]));
        const lm = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: PIN_COLORS[p.c] }));
        pinsG.add(lm);
        [a, b].forEach(v => {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), new THREE.MeshBasicMaterial({ color: PIN_COLORS[p.c] }));
          t.position.set(v.x, 0.45, v.z); pinsG.add(t);
        });
        const sp = label(p.v, 0.9, '#1d2330');
        sp.position.set(X(p.x), 1.3, Z(p.y));
        pinsG.add(sp);
      }
    });
    $('pin3d') && (pinsG.visible = $('pin3d').checked);
  }

  function wallHeight() { return $('wallH').value / 10; }
  function setWallHeight() {
    const h = wallHeight();
    wallsG.scale.y = h;
    $('wallHv').textContent = h.toFixed(2).replace('.', ',') + ' м';
  }
  function setGlass() {
    const g = $('wallGlass').checked;
    wallMats.forEach(m => { m.transparent = g; m.opacity = g ? 0.28 : 1; m.depthWrite = !g; m.needsUpdate = true; });
  }

  function init() {
    inited = true;
    if (typeof THREE === 'undefined' || !THREE.OrbitControls) {
      failed = true;
      $('stage3d').innerHTML = '<p style="padding:16px">3D-библиотека не загрузилась. Нужен доступ к интернету (cdn.jsdelivr.net).</p>';
      return;
    }
    stage = $('stage3d'); hud = $('hud');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      failed = true;
      stage.innerHTML = '<p style="padding:16px">Браузер не даёт запустить WebGL, 3D недоступно.</p>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.insertBefore(renderer.domElement, hud);
    camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 6; controls.maxDistance = 260;
    controls.screenSpacePanning = true;
    build();
    resize();
    window.addEventListener('resize', resize);

    $('wallH').oninput = setWallHeight;
    $('wallGlass').onchange = setGlass;
    $('wallOn').onchange = e => { wallsG.visible = e.target.checked; };
    $('photoFloor').onchange = e => {
      if (e.target.checked && !photoPlane.material.map) {
        photoPlane.material.map = new THREE.TextureLoader().load(window.PLAN_PHOTO);
        photoPlane.material.needsUpdate = true;
      }
      photoPlane.visible = e.target.checked; floorsG.visible = !e.target.checked;
    };
    $('pin3d').onchange = e => { pinsG.visible = e.target.checked; };
    $('lab3d').onchange = e => { labelsG.visible = e.target.checked; };
    $('camTop').onclick = () => cameraTo(last.c, 'top', last.d * 1.15);
    $('camIso').onclick = () => cameraTo(last.c, 'iso', last.d);

    const cv = renderer.domElement;
    let downAt = null;
    cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !(e.buttons)) pick(e); });
    cv.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', e => {
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5) pick(e);
      downAt = null;
    });
    focus('all');
  }

  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = pinsG.visible ? ray.intersectObjects(pickables)[0] : null;
    if (hit) {
      const p = hit.object.userData;
      hud.innerHTML = `<b>${p.label}</b> · ${p.v} мм<br><small>${p.m} · ${CONF[p.c]}</small>`;
    }
  }

  function cameraTo(target, kind, dist) {
    const d = dist;
    last = { c: target.clone(), d: kind === 'top' ? dist / 1.15 : dist };
    controls.target.copy(target);
    if (kind === 'top') camera.position.set(target.x, d, target.z + 0.001);
    else camera.position.set(target.x, d * 0.62, target.z + d * 0.85);
    controls.update();
  }

  function focus(k) {
    if (!inited || failed) return;
    const b = P.sections[k].box;
    const c = new THREE.Vector3(X((b[0] + b[2]) / 2), 0, Z((b[1] + b[3]) / 2));
    const size = Math.max(X(b[2] - b[0]), Z(b[3] - b[1]));
    cameraTo(c, 'iso', Math.max(22, size * 0.82));
  }

  function resize() {
    if (!renderer || !stage) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }

  window.Plan3D = {
    show() {
      if (!inited) init();
      if (failed) return;
      running = true; resize(); loop();
    },
    hide() { running = false; },
    focus,
    refreshPins
  };
})();
