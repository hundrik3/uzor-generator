const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const symmetryInput = document.getElementById('symmetry');
const symmetryValue = document.getElementById('symmetryValue');
const brushInput = document.getElementById('brush');
const brushValue = document.getElementById('brushValue');
const swatchesEl = document.getElementById('swatches');
const customColorInput = document.getElementById('customColor');
const rainbowInput = document.getElementById('rainbow');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');

const PALETTE = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#a78bfa', '#f2eef7'];

let symmetry = Number(symmetryInput.value);
let brushSize = Number(brushInput.value);
let currentColor = PALETTE[0];
let rainbow = false;
let hue = 0;

let drawing = false;
let lastPoint = null;
let undoStack = [];

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const prev = document.createElement('canvas');
  prev.width = canvas.width;
  prev.height = canvas.height;
  const prevCtx = prev.getContext('2d');
  if (canvas.width && canvas.height) prevCtx.drawImage(canvas, 0, 0);

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (prev.width) {
    ctx.drawImage(prev, 0, 0, prev.width / dpr, prev.height / dpr);
  }
}

function center() {
  const rect = canvas.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function getPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function drawSegment(p0, p1) {
  const c = center();
  const color = rainbow ? `hsl(${hue}, 85%, 60%)` : currentColor;
  ctx.lineCap = 'round';
  ctx.lineWidth = brushSize;
  ctx.strokeStyle = color;

  const dx0 = p0.x - c.x, dy0 = p0.y - c.y;
  const dx1 = p1.x - c.x, dy1 = p1.y - c.y;
  const step = (Math.PI * 2) / symmetry;

  for (let i = 0; i < symmetry; i++) {
    const angle = step * i;
    const cos = Math.cos(angle), sin = Math.sin(angle);

    const ax0 = dx0 * cos - dy0 * sin, ay0 = dx0 * sin + dy0 * cos;
    const ax1 = dx1 * cos - dy1 * sin, ay1 = dx1 * sin + dy1 * cos;
    strokeLine(c.x + ax0, c.y + ay0, c.x + ax1, c.y + ay1);

    // mirrored reflection for extra richness
    const mx0 = -dx0 * cos - dy0 * sin, my0 = dx0 * sin - dy0 * cos;
    const mx1 = -dx1 * cos - dy1 * sin, my1 = dx1 * sin - dy1 * cos;
    strokeLine(c.x + mx0, c.y + my0, c.x + mx1, c.y + my1);
  }
}

function strokeLine(x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function pushUndoSnapshot() {
  try {
    undoStack.push(canvas.toDataURL());
    if (undoStack.length > 20) undoStack.shift();
  } catch (e) { /* ignore */ }
}

function startDraw(e) {
  e.preventDefault();
  pushUndoSnapshot();
  drawing = true;
  lastPoint = getPoint(e);
}

function moveDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = getPoint(e);
  drawSegment(lastPoint, p);
  lastPoint = p;
  if (rainbow) hue = (hue + 2) % 360;
}

function endDraw() {
  drawing = false;
  lastPoint = null;
}

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);

canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', moveDraw, { passive: false });
canvas.addEventListener('touchend', endDraw);

symmetryInput.addEventListener('input', () => {
  symmetry = Number(symmetryInput.value);
  symmetryValue.textContent = symmetry;
});

brushInput.addEventListener('input', () => {
  brushSize = Number(brushInput.value);
  brushValue.textContent = brushSize;
});

rainbowInput.addEventListener('change', () => {
  rainbow = rainbowInput.checked;
});

customColorInput.addEventListener('input', () => {
  currentColor = customColorInput.value;
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
});

PALETTE.forEach((color, i) => {
  const btn = document.createElement('button');
  btn.className = 'swatch' + (i === 0 ? ' active' : '');
  btn.style.background = color;
  btn.title = color;
  btn.addEventListener('click', () => {
    currentColor = color;
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
  });
  swatchesEl.appendChild(btn);
});

undoBtn.addEventListener('click', () => {
  const last = undoStack.pop();
  if (!last) return;
  const img = new Image();
  img.onload = () => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const dpr = window.devicePixelRatio || 1;
    ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
  };
  img.src = last;
});

clearBtn.addEventListener('click', () => {
  pushUndoSnapshot();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
});

saveBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `uzor-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
