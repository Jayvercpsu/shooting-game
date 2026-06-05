/**
 * ═══════════════════════════════════════════════════════════════
 *  SHOOTING CHALLENGE — script.js
 *  By Jayver Algadipe
 *  Complete production-ready game with leaderboard integration
 * ═══════════════════════════════════════════════════════════════
 *
 *  Leaderboard API Setup:
 *  1. Create a JSONBin with initial content: {"scores":[]}
 *  2. Add JSONBIN_BIN_ID and JSONBIN_API_KEY in Vercel Environment Variables
 *  3. The browser calls /api/leaderboard so the API key stays server-side
 */

/* ─── Server-side Leaderboard Endpoint ─── */
const LEADERBOARD_API = "api/leaderboard";
const GAME_DURATION_SECONDS = 60;
const PLAYER_ID_KEY = "dontCatchThatPlayerId";
const PLAYER_PROFILE_KEY = "dontCatchThatProfile";

/* ─── Game State ─── */
const GameState = {
  playerId:     "",
  playerName:   "",
  selfieData:   "",        // base64 image
  score:        0,
  round:        1,
  targetScore:  30,
  activeGood:   "😂",
  activeBad:    "💩",
  activeGoodList: ["😂"],
  activeBadList:  ["💩"],
  timeLeft:     GAME_DURATION_SECONDS,
  isRunning:    false,
  isPaused:     false,
  isRoundTransition: false,
  gameTimer:    null,
  spawnInterval:null,
  randomEventTimer: null,
  emojis:       [],
  particles:    [],
  animFrameId:  null,
  elapsedSeconds: 0,
  spawnDelay:   1050,
  fallSpeed:    1.4,
  lastRank:     null,
  modalSelfieData: "",
};

const GOOD_EMOJIS = ["😂", "🤣", "😆", "😎", "🤩", "😍", "🥳", "🤪", "😺", "😋", "😁", "🤗"];
const BAD_EMOJIS  = ["💩", "🤮", "🤡", "💀", "☠️", "👹", "👺", "😵", "😡"];
const ROUND_TARGETS = [30, 60, 100, 150, 220];
const WARNING_MESSAGES = [
  "AYAW ANG TAE BOSS! 💩",
  "MALI MAN NA 😭",
  "NABIKIL KA SA CLOWN 🤡",
  "LUOD KAAYO 🤮",
  "MINUS KA OY 😂",
  "NGANONG IMONG GI-CLICK NA 😭",
  "AYAW PAGPADALA SA TEMPTATION 🤣",
];
const ROUND_MESSAGES = [
  "GRABE KA BOSS 😎",
  "EMOJI MASTER 😂",
  "HALA KUSOG MAN DIAY KA 🤣",
  "PRO PLAYER DETECTED 🔥",
  "WALAY MAKAPUGONG NIMO 😎",
];
const RANDOM_EVENTS = [
  "AYAW KAPOY CLICK 😂",
  "TAGAAN TIKA COFFEE ☕",
  "ANG TAE NAGHULAT NIMO 💩",
  "LIKAY SA CLOWN BOSS 🤡",
  "EMOJI GOD MODE 😎",
];

/* ─── DOM Refs ─── */
const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════════
   SCREEN MANAGEMENT
═══════════════════════════════════════════════════════════════ */
function showScreen(id) {
  if (id !== 'registrationScreen' && cameraStream) {
    stopStream(cameraStream);
    cameraStream = null;
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ═══════════════════════════════════════════════════════════════
   BACKGROUND PARTICLE CANVAS
═══════════════════════════════════════════════════════════════ */
(function initBgParticles() {
  const canvas = $('bgCanvas');
  const ctx    = canvas.getContext('2d');
  let W, H, stars = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createStars() {
    stars = Array.from({ length: 120 }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      a:  Math.random(),
      da: (Math.random() * 0.008 + 0.002) * (Math.random() > 0.5 ? 1 : -1),
    }));
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    stars.forEach(s => {
      s.x += s.vx; s.y += s.vy;
      s.a += s.da;
      if (s.a > 1 || s.a < 0) s.da *= -1;
      if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
      if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.a));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = Math.random() > 0.97 ? '#bf00ff' : '#00d4ff';
      ctx.shadowBlur  = 6;
      ctx.shadowColor = '#bf00ff';
      ctx.fill();
      ctx.restore();
    });
    requestAnimationFrame(tick);
  }

  resize();
  createStars();
  tick();
  window.addEventListener('resize', () => { resize(); createStars(); });
})();

/* ═══════════════════════════════════════════════════════════════
   CUSTOM CURSOR / CROSSHAIR
═══════════════════════════════════════════════════════════════ */
window.addEventListener('mousemove', e => {
  const ch = $('crosshair');
  if (ch) { ch.style.left = e.clientX + 'px'; ch.style.top = e.clientY + 'px'; }
});

/* ═══════════════════════════════════════════════════════════════
   CAMERA & SELFIE
═══════════════════════════════════════════════════════════════ */
let cameraStream = null;
let modalCameraStream = null;
let profileWasPaused = false;
let backWasPaused = false;

function stopStream(stream) {
  if (stream) stream.getTracks().forEach(track => track.stop());
}

async function startCamera() {
  const video   = $('cameraVideo');
  const overlay = $('cameraOverlay');
  const startBtn= $('startCameraBtn');
  const captBtn = $('captureBtn');

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = cameraStream;
    overlay.classList.add('hidden');
    startBtn.classList.add('hidden');
    captBtn.classList.remove('hidden');
    $('selfieError').textContent = '';
  } catch (err) {
    $('selfieError').textContent = '⚠️ Camera access denied. Please allow camera permissions.';
    console.error('Camera error:', err);
  }
}

function captureSelfie() {
  const video   = $('cameraVideo');
  const canvas  = $('selfieCanvas');
  const ctx     = canvas.getContext('2d');
  const captBtn = $('captureBtn');
  const rtkBtn  = $('retakeBtn');

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;

  // Mirror the canvas to match the video mirror effect
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  GameState.selfieData = canvas.toDataURL('image/jpeg', 0.7);
  const currentName = sanitizeName($('playerName').value.trim());
  if (currentName.length >= 2) GameState.playerName = currentName;

  // Show preview, hide video
  video.classList.add('hidden');
  canvas.classList.remove('hidden');
  captBtn.classList.add('hidden');
  rtkBtn.classList.remove('hidden');

  // Stop stream
  stopStream(cameraStream);
  cameraStream = null;

  updateProfileDisplays();
  validateForm();
}

function retakeSelfie() {
  const video   = $('cameraVideo');
  const canvas  = $('selfieCanvas');
  const rtkBtn  = $('retakeBtn');
  const startBtn= $('startCameraBtn');

  video.classList.remove('hidden');
  canvas.classList.add('hidden');
  rtkBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');
  $('cameraOverlay').classList.remove('hidden');

  GameState.selfieData = '';
  validateForm();
}

/* ═══════════════════════════════════════════════════════════════
   FORM VALIDATION
═══════════════════════════════════════════════════════════════ */
$('playerName').addEventListener('input', validateForm);

function validateForm() {
  const name   = $('playerName').value.trim();
  const hasName   = name.length >= 2;
  const hasSelfie = GameState.selfieData !== '';

  // Name validation
  if ($('playerName').value && !hasName) {
    $('nameError').textContent = 'Name must be at least 2 characters.';
  } else {
    $('nameError').textContent = '';
  }

  // Selfie hint
  $('selfieError').textContent = '';

  $('startGameBtn').disabled = !(hasName && hasSelfie);
  syncRegistrationProfileUI();
}

/* Sanitize name: strip HTML/script tags */
function sanitizeName(name) {
  return name.replace(/<[^>]*>/g, '').replace(/[^\w\s\-'.]/g, '').trim().slice(0, 30);
}

/* ═══════════════════════════════════════════════════════════════
   GAME START
═══════════════════════════════════════════════════════════════ */
function startGame() {
  const rawName = $('playerName').value.trim();

  // Validation guards
  if (rawName.length < 2)         { $('nameError').textContent = 'Please enter your name.'; return; }
  if (!GameState.selfieData)      { $('selfieError').textContent = 'Please capture a selfie.'; return; }

  GameState.playerName = sanitizeName(rawName);

  // Reset state
  GameState.score          = 0;
  GameState.round          = 1;
  GameState.targetScore    = getTargetForRound(1);
  GameState.timeLeft       = GAME_DURATION_SECONDS;
  GameState.isRunning      = false;
  GameState.isPaused       = false;
  GameState.isRoundTransition = false;
  GameState.elapsedSeconds = 0;
  GameState.spawnDelay     = 1050;
  GameState.fallSpeed      = 1.4;
  GameState.emojis         = [];
  GameState.particles      = [];
  clearGameplayTimers();
  selectRoundEmojis();
  updateProfileDisplays();

  runCountdown();
}

/* ─── Countdown 3-2-1-GO ─── */
function runCountdown() {
  showScreen('countdownScreen');
  let n = 3;
  const el = $('countdownNum');

  function tick() {
    if (n > 0) {
      el.style.animation = 'none';
      el.textContent = n;
      void el.offsetHeight; // reflow to restart animation
      el.style.animation = '';
      playSound('countdown');
      n--;
      setTimeout(tick, 900);
    } else {
      el.style.animation = 'none';
      el.textContent = 'GO!';
      void el.offsetHeight;
      el.style.animation = '';
      playSound('go');
      setTimeout(beginGameplay, 800);
    }
  }
  tick();
}

/* ═══════════════════════════════════════════════════════════════
   GAMEPLAY
═══════════════════════════════════════════════════════════════ */
const TARGET_TYPES = [
  { type: 'green', color: '#00ff88', glowColor: 'rgba(0,255,136', points: 10,  radius: 32, speed: 1.8, weight: 50 },
  { type: 'blue',  color: '#00d4ff', glowColor: 'rgba(0,212,255', points: 25,  radius: 28, speed: 2.4, weight: 30 },
  { type: 'red',   color: '#ff2244', glowColor: 'rgba(255,34,68',  points: 50,  radius: 24, speed: 3.0, weight: 15 },
  { type: 'gold',  color: '#ffd700', glowColor: 'rgba(255,215,0',  points: 100, radius: 20, speed: 3.8, weight: 5  },
];

let gameCanvas, gCtx;

function beginGameplay() {
  showScreen('gameScreen');

  gameCanvas = $('gameCanvas');
  gCtx       = gameCanvas.getContext('2d');
  resizeGameCanvas();
  window.addEventListener('resize', resizeGameCanvas);

  // Click / tap to shoot
  gameCanvas.addEventListener('pointerdown', handleShot);

  // Reset HUD
  updateHUD();

  GameState.isRunning = true;

  // Spawn targets periodically
  spawnTarget();
  GameState.spawnInterval = setInterval(spawnTarget, 1200);

  // Countdown timer
  GameState.gameTimer = setInterval(() => {
    GameState.timeLeft--;
    if (GameState.timeLeft <= 10) $('timerDisplay').parentElement.classList.add('urgent');
    if (GameState.timeLeft <= 0)  endGame();
    else updateHUD();
  }, 1000);

  GameState.animFrameId = requestAnimationFrame(gameLoop);
}

function resizeGameCanvas() {
  if (!gameCanvas) return;
  gameCanvas.width  = gameCanvas.offsetWidth  || window.innerWidth;
  gameCanvas.height = gameCanvas.offsetHeight || window.innerHeight;
}

/* ─── Game Loop ─── */
function gameLoop() {
  if (!GameState.isRunning) return;

  gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  updateAndDrawParticles();
  updateAndDrawTargets();

  GameState.animFrameId = requestAnimationFrame(gameLoop);
}

/* ─── Target Spawning ─── */
function spawnTarget() {
  if (!GameState.isRunning) return;

  const W = gameCanvas.width;
  const H = gameCanvas.height;
  const HUD_H = 64;

  // Weighted random pick
  const totalWeight = TARGET_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * totalWeight;
  let typeDef = TARGET_TYPES[0];
  for (const t of TARGET_TYPES) { r -= t.weight; if (r <= 0) { typeDef = t; break; } }

  const margin = typeDef.radius + 10;
  const angle  = Math.random() * Math.PI * 2;

  const target = {
    ...typeDef,
    id:    Math.random(),
    x:     margin + Math.random() * (W - margin * 2),
    y:     HUD_H + margin + Math.random() * (H - HUD_H - margin * 2),
    vx:    Math.cos(angle) * typeDef.speed * (0.7 + Math.random() * 0.6),
    vy:    Math.sin(angle) * typeDef.speed * (0.7 + Math.random() * 0.6),
    life:  1,
    born:  Date.now(),
    maxAge: 5000 + Math.random() * 3000,
    pulse:  0,
    scale:  0,  // grows in
  };

  GameState.targets.push(target);
}

/* ─── Update & Draw Targets ─── */
function updateAndDrawTargets() {
  const W = gameCanvas.width;
  const H = gameCanvas.height;
  const HUD_H = 60;
  const now = Date.now();

  GameState.targets = GameState.targets.filter(t => {
    const age = now - t.born;

    // Fade out near end of life
    t.life = age > t.maxAge * 0.75
      ? 1 - (age - t.maxAge * 0.75) / (t.maxAge * 0.25)
      : 1;

    if (age > t.maxAge || t.life <= 0) return false;

    // Grow in
    t.scale = Math.min(1, age / 200);

    // Move
    t.x += t.vx;
    t.y += t.vy;

    // Bounce off walls
    if (t.x - t.radius < 0)        { t.x = t.radius;        t.vx *= -1; }
    if (t.x + t.radius > W)        { t.x = W - t.radius;    t.vx *= -1; }
    if (t.y - t.radius < HUD_H)    { t.y = HUD_H + t.radius; t.vy *= -1; }
    if (t.y + t.radius > H)        { t.y = H - t.radius;    t.vy *= -1; }

    // Pulse
    t.pulse = (t.pulse + 0.06) % (Math.PI * 2);

    drawTarget(t);
    return true;
  });
}

function drawTarget(t) {
  const ctx   = gCtx;
  const pulse = Math.sin(t.pulse) * 4;
  const r     = (t.radius + pulse * 0.5) * t.scale;

  ctx.save();
  ctx.globalAlpha = t.life;
  ctx.translate(t.x, t.y);

  // Outer glow ring
  const gradient = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.6);
  gradient.addColorStop(0, t.glowColor + ', 0.3)');
  gradient.addColorStop(1, t.glowColor + ', 0)');
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Shadow / glow
  ctx.shadowBlur  = 20 + pulse * 2;
  ctx.shadowColor = t.color;

  // Body circle
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  const bodyGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  bodyGrad.addColorStop(0, '#ffffff');
  bodyGrad.addColorStop(0.3, t.color);
  bodyGrad.addColorStop(1, t.glowColor + ', 0.6)');
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Ring
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Inner dot
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();

  // Points label
  ctx.shadowBlur = 0;
  ctx.fillStyle  = '#fff';
  ctx.font       = `bold ${Math.max(10, r * 0.55)}px Orbitron, monospace`;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`+${t.points}`, 0, 0);

  ctx.restore();
}

/* ─── Shooting / Hit Detection ─── */
function handleShot(e) {
  if (!GameState.isRunning) return;

  const rect = gameCanvas.getBoundingClientRect();
  const mx   = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
  const my   = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

  let hit = false;

  // Check targets in reverse (topmost first)
  for (let i = GameState.targets.length - 1; i >= 0; i--) {
    const t   = GameState.targets[i];
    const dx  = mx - t.x;
    const dy  = my - t.y;
    const dist= Math.hypot(dx, dy);

    if (dist <= t.radius * t.scale + 10) {
      // HIT!
      hit = true;
      GameState.hitStreak++;

      // Combo logic
      clearTimeout(GameState.comboTimer);
      if (GameState.hitStreak >= 3) {
        GameState.combo = Math.min(10, 1 + Math.floor(GameState.hitStreak / 3));
      }
      GameState.comboTimer = setTimeout(() => {
        GameState.hitStreak = 0;
        GameState.combo     = 1;
        updateHUD();
      }, 2000);

      // Score
      const pts = t.points * GameState.combo;
      // Validate score: must be positive integer
      if (pts > 0 && Number.isFinite(pts)) {
        GameState.score += pts;
      }

      updateHUD();

      // Effects
      spawnExplosion(t.x, t.y, t.color, t.radius);
      showScoreFloat(mx, my, `+${pts}`, t.color);
      playSound('hit', t.type);

      if (GameState.combo > 1) showComboPopup(GameState.combo);

      // Remove target
      GameState.targets.splice(i, 1);
      break;
    }
  }

  // Miss effect
  if (!hit) {
    spawnMissEffect(mx, my);
    // Reset combo streak on miss
    GameState.hitStreak = Math.max(0, GameState.hitStreak - 1);
    if (GameState.hitStreak < 3) {
      GameState.combo = 1;
      updateHUD();
    }
  }
}

/* ─── Combo Popup ─── */
function showComboPopup(combo) {
  const el = $('comboPopup');
  el.textContent = `COMBO x${combo}!`;
  el.className = 'combo-popup';
  void el.offsetHeight;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 850);
}

/* ─── Score Float Text ─── */
function showScoreFloat(x, y, text, color) {
  const el       = document.createElement('div');
  el.className   = 'score-float';
  el.textContent = text;
  el.style.left  = x + 'px';
  el.style.top   = y + 'px';
  el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1050);
}

/* ─── HUD Update ─── */
function updateHUD() {
  $('scoreDisplay').textContent = GameState.score;
  $('timerDisplay').textContent = GameState.timeLeft;
  $('comboDisplay').textContent = `x${GameState.combo}`;
}

/* ═══════════════════════════════════════════════════════════════
   PARTICLE EXPLOSION SYSTEM
═══════════════════════════════════════════════════════════════ */
function spawnExplosion(x, y, color, radius) {
  const count = Math.floor(radius * 1.2);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
    const speed = 2 + Math.random() * 5;
    GameState.particles.push({
      x, y,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      r:     2 + Math.random() * 4,
      color,
      life:  1,
      decay: 0.03 + Math.random() * 0.04,
      gravity: 0.12,
    });
  }
  // Shockwave ring
  GameState.particles.push({
    x, y, vx: 0, vy: 0, r: 4, color,
    life: 1, decay: 0.04, gravity: 0,
    ring: true, ringR: radius * 0.5,
  });
}

function spawnMissEffect(x, y) {
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    GameState.particles.push({
      x, y,
      vx: Math.cos(angle) * 2,
      vy: Math.sin(angle) * 2,
      r:  1.5,
      color: 'rgba(255,255,255,0.4)',
      life:  1,
      decay: 0.08,
      gravity: 0,
    });
  }
}

function updateAndDrawParticles() {
  GameState.particles = GameState.particles.filter(p => {
    p.life -= p.decay;
    if (p.life <= 0) return false;

    if (p.ring) {
      p.ringR += 3;
      gCtx.save();
      gCtx.globalAlpha = p.life * 0.6;
      gCtx.beginPath();
      gCtx.arc(p.x, p.y, p.ringR, 0, Math.PI * 2);
      gCtx.strokeStyle = p.color;
      gCtx.lineWidth   = 2;
      gCtx.shadowBlur  = 10;
      gCtx.shadowColor = p.color;
      gCtx.stroke();
      gCtx.restore();
      return true;
    }

    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.97;

    gCtx.save();
    gCtx.globalAlpha = p.life;
    gCtx.beginPath();
    gCtx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    gCtx.fillStyle   = p.color;
    gCtx.shadowBlur  = 8;
    gCtx.shadowColor = p.color;
    gCtx.fill();
    gCtx.restore();
    return true;
  });
}

/* ═══════════════════════════════════════════════════════════════
   SOUND EFFECTS (Web Audio API — procedurally generated)
═══════════════════════════════════════════════════════════════ */
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  return audioCtx;
}

function playSound(type, targetType) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  try {
    switch (type) {
      case 'correct': {
        [520, 740, 980].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.04);
          gain.gain.setValueAtTime(0.22, now + i * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.14);
          osc.start(now + i * 0.04);
          osc.stop(now + i * 0.04 + 0.14);
        });
        break;
      }
      case 'wrong': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.22);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
        break;
      }
      case 'victory': {
        [440, 554, 659, 880, 1108].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.08);
          gain.gain.setValueAtTime(0.25, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.22);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.22);
        });
        break;
      }
      case 'hit': {
        const freqMap = { green: 440, blue: 660, red: 880, gold: 1100 };
        const freq = freqMap[targetType] || 440;

        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.15);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'countdown': {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(660, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        break;
      }
      case 'go': {
        [440, 550, 660, 880].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.setValueAtTime(f, now + i * 0.06);
          g.gain.setValueAtTime(0.3, now + i * 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);
          o.start(now + i * 0.06); o.stop(now + i * 0.06 + 0.15);
        });
        break;
      }
    }
  } catch (e) {
    // Audio errors are non-critical
  }
}

/* ═══════════════════════════════════════════════════════════════
   END GAME
═══════════════════════════════════════════════════════════════ */
function endGame() {
  GameState.isRunning = false;

  // Clear intervals and animation
  clearInterval(GameState.gameTimer);
  clearInterval(GameState.spawnInterval);
  clearTimeout(GameState.comboTimer);
  cancelAnimationFrame(GameState.animFrameId);

  // Remove event listeners
  if (gameCanvas) gameCanvas.removeEventListener('pointerdown', handleShot);
  window.removeEventListener('resize', resizeGameCanvas);

  // Validate final score
  const finalScore = Math.max(0, Math.floor(GameState.score));

  showScreen('gameOverScreen');

  $('resultSelfie').src = GameState.selfieData;
  $('resultName').textContent  = GameState.playerName;
  $('resultScore').textContent = finalScore;
  $('resultRank').textContent  = '';
  $('savingStatus').innerHTML  = '<span class="saving-spinner"></span> Saving score online...';
  $('savingStatus').style.display = 'flex';

  // Save online
  savePlayerScore(GameState.playerName, finalScore, GameState.selfieData)
    .then(rank => {
      GameState.lastRank = rank;
      $('resultRank').textContent  = rank ? `🏅 Rank #${rank} Worldwide` : '';
      $('savingStatus').innerHTML  = '✅ Score saved!';
      setTimeout(() => { $('savingStatus').style.display = 'none'; }, 2500);
    })
    .catch(() => {
      $('savingStatus').innerHTML = 'Could not save score (check server config)';
    });
}

/* ─── Play Again ─── */
function playAgain() {
  showScreen('registrationScreen');
}

/* ═══════════════════════════════════════════════════════════════
   LEADERBOARD — JSONBin.io API
═══════════════════════════════════════════════════════════════ */

/**
 * Load leaderboard data from the server-side API
 * @returns {Promise<Array>}
 */
async function loadLeaderboard() {
  // Show loading
  $('lbLoading').classList.remove('hidden');
  $('lbError').classList.add('hidden');
  $('lbBody').innerHTML = '';
  $('championCard').classList.add('hidden');

  try {
    const res = await fetch(LEADERBOARD_API);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data   = await res.json();
    const scores = Array.isArray(data?.scores) ? data.scores : [];

    // Sort descending
    scores.sort((a, b) => b.score - a.score);

    const top100 = scores.slice(0, 100);

    renderLeaderboard(top100);
    return top100;

  } catch (err) {
    console.error('Leaderboard load error:', err);
    $('lbLoading').classList.add('hidden');
    $('lbError').innerHTML = 'Leaderboard unavailable. Check Vercel environment variables if this is a new deploy.';
    $('lbError').style.color = '#ff6b6b';
    $('lbError').classList.remove('hidden');
    return [];
  }
}

/**
 * Render leaderboard table
 * @param {Array} scores
 */
function renderLeaderboard(scores) {
  $('lbLoading').classList.add('hidden');

  const tbody = $('lbBody');
  tbody.innerHTML = '';

  if (!scores.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:40px">No scores yet. Be the first to play!</td></tr>';
    return;
  }

  // Champion card
  const champ = scores[0];
  $('championSelfie').src        = champ.selfie || '';
  $('championName').textContent  = escapeHtml(champ.name || 'Unknown');
  $('championScore').textContent = `${champ.score?.toLocaleString() || 0} pts`;
  $('championCard').classList.remove('hidden');

  // Table rows
  scores.forEach((entry, i) => {
    const rank  = i + 1;
    const isMe  = entry.playerId
      ? entry.playerId === GameState.playerId
      : entry.name === GameState.playerName && entry.score === GameState.score;

    const tr = document.createElement('tr');
    tr.style.animationDelay = `${i * 0.04}s`;

    if (rank <= 3) tr.classList.add(`rank-${rank}`);
    if (isMe)      tr.classList.add('my-score-row');

    const rankIcon = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    tr.innerHTML = `
      <td class="rank-cell">${rankIcon}</td>
      <td>
        <img class="lb-selfie"
             src="${sanitizeImageSrc(entry.selfie)}"
             alt="${escapeHtml(entry.name)}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><circle cx=%2220%22 cy=%2220%22 r=%2220%22 fill=%22%23333%22/><text x=%2250%25%22 y=%2255%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2218%22>👤</text></svg>'" />
      </td>
      <td class="player-name-cell">${escapeHtml(entry.name || 'Unknown')}</td>
      <td class="score-cell">${(entry.score || 0).toLocaleString()}</td>
      <td class="date-cell">${formatDate(entry.date)}</td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * Save a player score to JSONBin
 * @param {string} name
 * @param {number} score
 * @param {string} selfie base64
 * @returns {Promise<number|null>} rank
 */
async function savePlayerScore(name, score, selfie) {
  // Validate inputs
  if (!name || typeof name !== 'string' || name.length < 1) return null;
  if (typeof score !== 'number' || score < 0 || !Number.isFinite(score)) return null;
  if (!selfie || typeof selfie !== 'string' || !selfie.startsWith('data:image')) return null;

  try {
    const res = await fetch(LEADERBOARD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: GameState.playerId,
        name,
        score,
        selfie,
      }),
    });

    if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);

    const data = await res.json();
    return data.rank || null;

  } catch (err) {
    console.error('Save error:', err);
    return null;
  }
}

/**
 * Get top player from leaderboard
 * @returns {Promise<Object|null>}
 */
async function getTopPlayer() {
  const scores = await loadLeaderboard();
  return scores.length > 0 ? scores[0] : null;
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
═══════════════════════════════════════════════════════════════ */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function sanitizeImageSrc(src) {
  if (!src || typeof src !== 'string') return '';
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/png') || src.startsWith('data:image/webp')) {
    return src;
  }
  return '';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

function isSameDay(isoStr) {
  if (!isoStr) return false;
  try {
    const d     = new Date(isoStr);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  } catch { return false; }
}

/* ═══════════════════════════════════════════════════════════════════════
   DON'T CATCH THAT! ENDLESS EMOJI SURVIVAL GAMEPLAY
═══════════════════════════════════════════════════════════════════════ */
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function sampleEmojis(list, count) {
  return [...list]
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

function getOrCreatePlayerId() {
  let playerId = localStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = window.crypto?.randomUUID?.() || `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }
  return playerId;
}

function saveProfileLocally() {
  if (!GameState.playerId || !GameState.playerName || !GameState.selfieData) return;

  localStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify({
    playerId: GameState.playerId,
    playerName: GameState.playerName,
    selfieData: GameState.selfieData,
  }));
}

function restoreProfileLocally() {
  try {
    const rawProfile = localStorage.getItem(PLAYER_PROFILE_KEY);
    if (!rawProfile) return;

    const profile = JSON.parse(rawProfile);
    if (!profile?.playerName || !profile?.selfieData) return;

    GameState.playerId = profile.playerId || GameState.playerId;
    GameState.playerName = sanitizeName(profile.playerName);
    GameState.selfieData = profile.selfieData;
    $('playerName').value = GameState.playerName;
  } catch (err) {
    console.warn('Profile restore skipped:', err);
  }
}

function getTargetForRound(round) {
  if (round <= ROUND_TARGETS.length) return ROUND_TARGETS[round - 1];

  let target = ROUND_TARGETS[ROUND_TARGETS.length - 1];
  for (let r = ROUND_TARGETS.length + 1; r <= round; r++) {
    target += 100 + (r * 20);
  }
  return target;
}

function selectRoundEmojis() {
  GameState.activeGoodList = sampleEmojis(GOOD_EMOJIS, 3);
  GameState.activeBadList  = sampleEmojis(BAD_EMOJIS, 3);
  GameState.activeGood = GameState.activeGoodList.join(' ');
  GameState.activeBad  = GameState.activeBadList.join(' ');
  updateHUD();
}

function updateDifficulty() {
  GameState.targetScore = getTargetForRound(GameState.round);
  GameState.spawnDelay  = Math.max(230, 780 - ((GameState.round - 1) * 70));
  GameState.fallSpeed   = 2.05 + ((GameState.round - 1) * 0.34);
}

function clearGameplayTimers() {
  clearInterval(GameState.gameTimer);
  clearInterval(GameState.spawnInterval);
  clearTimeout(GameState.randomEventTimer);
  cancelAnimationFrame(GameState.animFrameId);
  GameState.gameTimer = null;
  GameState.spawnInterval = null;
  GameState.randomEventTimer = null;
  GameState.animFrameId = null;
}

function clearGameArea() {
  const area = $('gameArea');
  if (area) area.innerHTML = '';
  GameState.emojis = [];
}

function beginGameplay() {
  requestWakeLock();
  showScreen('gameScreen');
  updateDifficulty();
  updateProfileDisplays();
  setRoundBackground();
  clearGameArea();

  GameState.isRunning = true;
  GameState.isPaused = false;
  GameState.isRoundTransition = false;

  $('pauseOverlay').classList.add('hidden');
  $('roundOverlay').classList.add('hidden');
  $('backModal').classList.add('hidden');
  $('pauseBtn').textContent = '⏸';

  updateHUD();
  spawnWave();
  startSpawning();
  startSurvivalTimer();
  scheduleRandomEvent();

  GameState.lastFrameAt = performance.now();
  GameState.animFrameId = requestAnimationFrame(gameLoop);
}

function startSpawning() {
  clearInterval(GameState.spawnInterval);
  GameState.spawnInterval = setInterval(spawnWave, GameState.spawnDelay);
}

function spawnWave() {
  if (!GameState.isRunning || GameState.isPaused || GameState.isRoundTransition) return;

  const extraChance = Math.min(0.65, 0.12 + (GameState.round * 0.045));
  const count = 1 + (Math.random() < extraChance ? 1 : 0) + (GameState.round >= 5 && Math.random() < 0.18 ? 1 : 0);

  for (let i = 0; i < count; i++) {
    setTimeout(spawnEmoji, i * 105);
  }
}

async function syncLeaderboardProfile() {
  if (!GameState.playerId || !GameState.playerName || !GameState.selfieData) return;

  try {
    await fetch(LEADERBOARD_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: GameState.playerId,
        name: GameState.playerName,
        selfie: GameState.selfieData,
      }),
    });
  } catch (err) {
    console.warn('Profile sync skipped:', err);
  }
}

function startSurvivalTimer() {
  clearInterval(GameState.gameTimer);
  GameState.gameTimer = setInterval(() => {
    if (!GameState.isRunning || GameState.isPaused || GameState.isRoundTransition) return;
    GameState.elapsedSeconds++;
    GameState.timeLeft = Math.max(0, GameState.timeLeft - 1);
    updateHUD();
    if (GameState.timeLeft <= 0) endGame();
  }, 1000);
}

function gameLoop(now) {
  if (!GameState.isRunning) return;

  const previous = GameState.lastFrameAt || now;
  const delta = Math.min(2.5, (now - previous) / 16.67);
  GameState.lastFrameAt = now;

  if (!GameState.isPaused && !GameState.isRoundTransition) {
    updateFallingEmojis(delta);
  }

  GameState.animFrameId = requestAnimationFrame(gameLoop);
}

function spawnEmoji() {
  if (!GameState.isRunning || GameState.isPaused || GameState.isRoundTransition) return;

  const area = $('gameArea');
  if (!area) return;

  const rect = area.getBoundingClientRect();
  const goodChance = Math.max(0.48, 0.68 - ((GameState.round - 1) * 0.018));
  const isGood = Math.random() < goodChance;
  const emoji = isGood ? pickRandom(GameState.activeGoodList) : pickRandom(GameState.activeBadList);
  const size = Math.round(Math.max(34, Math.min(58, rect.width * 0.11)));
  const x = Math.random() * Math.max(1, rect.width - size);

  const el = document.createElement('button');
  el.type = 'button';
  el.className = `falling-emoji ${isGood ? 'good-emoji' : 'bad-emoji'}`;
  el.textContent = emoji;
  el.setAttribute('aria-label', isGood ? `Catch ${emoji}` : `Do not catch ${emoji}`);
  el.style.left = `${x}px`;
  el.style.top = `${-size - 12}px`;
  el.style.fontSize = `${size}px`;

  const item = {
    id: window.crypto?.randomUUID?.() || String(Math.random()),
    el,
    x,
    y: -size - 12,
    size,
    speed: GameState.fallSpeed + Math.random() * (1.75 + GameState.round * 0.08),
    isGood,
    emoji,
    hit: false,
  };

  el.addEventListener('pointerdown', event => handleEmojiClick(event, item));
  area.appendChild(el);
  GameState.emojis.push(item);
}

function updateFallingEmojis(delta) {
  const area = $('gameArea');
  if (!area) return;

  const height = area.clientHeight;
  GameState.emojis = GameState.emojis.filter(item => {
    if (item.hit) return true;

    item.y += item.speed * delta;
    item.el.style.top = `${item.y}px`;

    if (item.y > height + item.size + 20) {
      item.el.remove();
      return false;
    }
    return true;
  });
}

function handleEmojiClick(event, item) {
  event.preventDefault();
  event.stopPropagation();

  if (!GameState.isRunning || GameState.isPaused || GameState.isRoundTransition || item.hit) return;

  item.hit = true;
  const rect = item.el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  if (item.isGood) {
    GameState.score += 1;
    item.el.classList.add('correct-hit');
    showGreenGlow();
    spawnExplosion(x, y, '#00ff88', 18);
    showScoreFloat(x, y, `+1 ${item.emoji}`, '#00ff88');
    playSound('correct');
    updateHUD();

    if (GameState.score >= GameState.targetScore) {
      setTimeout(completeRound, 260);
    }
  } else {
    GameState.score = Math.max(0, GameState.score - 1);
    item.el.classList.add('wrong-hit');
    showRedFlash();
    shakeScreen();
    spawnExplosion(x, y, '#ff2244', 24);
    showScoreFloat(x, y, '-1 😭', '#ff2244');
    showWarningMessage();
    playSound('wrong');
    updateHUD();
  }

  setTimeout(() => {
    item.el.remove();
    GameState.emojis = GameState.emojis.filter(active => active !== item);
  }, item.isGood ? 420 : 520);
}

function completeRound() {
  if (!GameState.isRunning || GameState.isRoundTransition) return;

  GameState.isRoundTransition = true;
  clearInterval(GameState.spawnInterval);
  $('gameArea').classList.add('round-frozen');
  $('gameScreen').classList.add('round-victory');

  const nextRound = GameState.round + 1;
  $('roundCompleteText').textContent = `🎉 ROUND ${GameState.round} COMPLETE 🎉`;
  $('roundMessage').textContent = pickRandom(ROUND_MESSAGES);
  $('roundCountdownNum').classList.remove('hidden');
  $('roundCountdownNum').textContent = '10';
  $('roundNextLabel').classList.add('hidden');
  $('roundNextLabel').textContent = `🚀 ROUND ${nextRound} START 🚀`;
  $('roundOverlay').classList.remove('hidden');

  createConfetti();
  createFireworks();
  playSound('victory');

  let count = 10;
  const countdown = setInterval(() => {
    count--;
    if (count > 0) {
      $('roundCountdownNum').textContent = String(count);
      playSound('countdown');
      createFireworks();
      return;
    }

    clearInterval(countdown);
    $('roundCountdownNum').classList.add('hidden');
    $('roundNextLabel').classList.remove('hidden');
    setTimeout(() => startNextRound(nextRound), 950);
  }, 1000);
}

function startNextRound(round) {
  GameState.round = round;
  updateDifficulty();
  selectRoundEmojis();
  clearGameArea();
  setRoundBackground();
  $('roundOverlay').classList.add('hidden');
  $('gameArea').classList.remove('round-frozen');
  $('gameScreen').classList.remove('round-victory');
  GameState.isRoundTransition = false;
  updateHUD();
  spawnWave();
  startSpawning();
}

function scheduleRandomEvent() {
  clearTimeout(GameState.randomEventTimer);
  const delay = 15000 + Math.random() * 15000;
  GameState.randomEventTimer = setTimeout(() => {
    if (GameState.isRunning && !GameState.isPaused && !GameState.isRoundTransition) {
      showRandomEvent();
    }
    scheduleRandomEvent();
  }, delay);
}

function showRandomEvent() {
  const el = $('randomEventPopup');
  el.textContent = pickRandom(RANDOM_EVENTS);
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = '';
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function showWarningMessage() {
  const el = document.createElement('div');
  el.className = 'warning-msg';
  el.textContent = pickRandom(WARNING_MESSAGES);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

function showGreenGlow() {
  const overlay = document.createElement('div');
  overlay.className = 'green-glow-overlay';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 340);
}

function showRedFlash() {
  const overlay = document.createElement('div');
  overlay.className = 'red-flash';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 430);
}

function shakeScreen() {
  const screen = $('gameScreen');
  screen.classList.remove('screen-shake');
  void screen.offsetHeight;
  screen.classList.add('screen-shake');
  setTimeout(() => screen.classList.remove('screen-shake'), 420);
}

function showScoreFloat(x, y, text, color) {
  const el = document.createElement('div');
  el.className = 'score-float';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1250);
}

function spawnExplosion(x, y, color, count = 18) {
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    const size = 5 + Math.random() * 7;
    const angle = Math.random() * Math.PI * 2;
    const distance = 34 + Math.random() * 58;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    particle.className = 'particle';
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.background = color;
    particle.style.boxShadow = `0 0 12px ${color}`;
    document.body.appendChild(particle);

    particle.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: 0 },
    ], {
      duration: 620 + Math.random() * 260,
      easing: 'cubic-bezier(.16,1,.3,1)',
    }).onfinish = () => particle.remove();
  }
}

function createConfetti() {
  const wrap = $('roundConfetti');
  wrap.innerHTML = '';
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = pickRandom(['#00d4ff', '#bf00ff', '#00ff88', '#ffd700', '#ff2244']);
    piece.style.animationDuration = `${1.5 + Math.random() * 1.8}s`;
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    wrap.appendChild(piece);
  }
}

function createFireworks() {
  const cx = window.innerWidth * (0.25 + Math.random() * 0.5);
  const cy = window.innerHeight * (0.18 + Math.random() * 0.28);
  spawnExplosion(cx, cy, pickRandom(['#ffd700', '#00d4ff', '#bf00ff', '#00ff88']), 30);
}

function updateHUD() {
  if ($('scoreDisplay')) $('scoreDisplay').textContent = GameState.score.toLocaleString();
  if ($('roundDisplay')) $('roundDisplay').textContent = GameState.round;
  if ($('targetDisplay')) $('targetDisplay').textContent = GameState.targetScore.toLocaleString();
  if ($('timerDisplay')) $('timerDisplay').textContent = formatSurvivalTime(GameState.timeLeft);
  if ($('catchEmojiDisplay')) $('catchEmojiDisplay').textContent = GameState.activeGood;
  if ($('avoidEmojiDisplay')) $('avoidEmojiDisplay').textContent = GameState.activeBad;
}

function formatSurvivalTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function setRoundBackground() {
  const screen = $('gameScreen');
  screen.classList.remove('round-bg-1', 'round-bg-2', 'round-bg-3', 'round-bg-4', 'round-bg-5');
  screen.classList.add(`round-bg-${((GameState.round - 1) % 5) + 1}`);
}

function togglePause() {
  if (!GameState.isRunning || GameState.isRoundTransition) return;

  GameState.isPaused = !GameState.isPaused;
  $('pauseOverlay').classList.toggle('hidden', !GameState.isPaused);
  $('gameArea').classList.toggle('game-paused', GameState.isPaused);
  $('pauseBtn').textContent = GameState.isPaused ? '▶' : '⏸';
}

function confirmBack() {
  if (!GameState.isRunning) {
    showScreen('registrationScreen');
    return;
  }

  backWasPaused = GameState.isPaused;
  GameState.isPaused = true;
  $('pauseOverlay').classList.add('hidden');
  $('gameArea').classList.add('game-paused');
  $('backModal').classList.remove('hidden');
}

function closeBackModal() {
  $('backModal').classList.add('hidden');
  if (GameState.isRunning && !backWasPaused) {
    GameState.isPaused = false;
    $('gameArea').classList.remove('game-paused');
    $('pauseBtn').textContent = '⏸';
  }
}

function goBackToMenu() {
  $('backModal').classList.add('hidden');
  endGame();
}

function endGame() {
  if (!GameState.isRunning) return;

  GameState.isRunning = false;
  GameState.isPaused = false;
  GameState.isRoundTransition = false;
  clearGameplayTimers();
  clearGameArea();
  $('pauseOverlay').classList.add('hidden');
  $('roundOverlay').classList.add('hidden');
  $('gameArea').classList.remove('game-paused', 'round-frozen');
  $('gameScreen').classList.remove('round-victory');

  const finalScore = Math.max(0, Math.floor(GameState.score));
  showScreen('gameOverScreen');

  $('resultSelfie').src = GameState.selfieData;
  $('resultName').textContent  = GameState.playerName;
  $('resultScore').textContent = finalScore.toLocaleString();
  $('resultRank').textContent  = '';
  $('resultExtra').textContent = `Round ${GameState.round} • Played ${formatSurvivalTime(GameState.elapsedSeconds)}`;
  $('savingStatus').innerHTML  = '<span class="saving-spinner"></span> Saving score online...';
  $('savingStatus').style.display = 'flex';

  savePlayerScore(GameState.playerName, finalScore, GameState.selfieData)
    .then(rank => {
      GameState.lastRank = rank;
      $('resultRank').textContent = rank ? `🏅 Rank #${rank} Worldwide` : '';
      $('savingStatus').innerHTML = 'Score saved!';
      setTimeout(() => { $('savingStatus').style.display = 'none'; }, 2500);
    })
    .catch(() => {
      $('savingStatus').innerHTML = 'Could not save score (check server config)';
    });
}

function playAgain() {
  GameState.score = 0;
  GameState.round = 1;
  GameState.targetScore = getTargetForRound(1);
  GameState.elapsedSeconds = 0;
  updateRegistrationState();
  showScreen('registrationScreen');
}

function updateProfileDisplays() {
  if ($('hudProfileImg') && GameState.selfieData) $('hudProfileImg').src = GameState.selfieData;
  if ($('modalProfileImg') && GameState.selfieData) $('modalProfileImg').src = GameState.selfieData;
  if ($('registrationProfileImg') && GameState.selfieData) $('registrationProfileImg').src = GameState.selfieData;
  if ($('registrationProfileName')) {
    $('registrationProfileName').textContent = GameState.playerName || sanitizeName($('playerName').value.trim()) || 'PROFILE';
  }
}

function drawSelfiePreview() {
  if (!GameState.selfieData || !$('selfieCanvas')) return;

  const canvas = $('selfieCanvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = GameState.selfieData;
}

function hasCompleteProfile() {
  return sanitizeName($('playerName').value.trim()).length >= 2 && GameState.selfieData !== '';
}

function syncRegistrationProfileUI() {
  const ready = hasCompleteProfile();
  const regContainer = document.querySelector('.reg-container');
  if (!regContainer || !$('registrationProfileBtn')) return;

  regContainer.classList.toggle('profile-ready', ready);
  $('registrationProfileBtn').classList.toggle('hidden', !ready);

  if (ready) {
    GameState.playerName = sanitizeName($('playerName').value.trim());
    updateProfileDisplays();
    saveProfileLocally();
    stopStream(cameraStream);
    cameraStream = null;
  }
}

function updateRegistrationState() {
  if (GameState.selfieData) {
    drawSelfiePreview();
    $('cameraVideo').classList.add('hidden');
    $('selfieCanvas').classList.remove('hidden');
    $('cameraOverlay').classList.add('hidden');
    $('startCameraBtn').classList.add('hidden');
    $('captureBtn').classList.add('hidden');
    $('retakeBtn').classList.remove('hidden');
  }
  syncRegistrationProfileUI();
  validateForm();
}

function showProfileModal() {
  if (!GameState.selfieData) return;

  profileWasPaused = GameState.isPaused;
  if (GameState.isRunning && !GameState.isPaused && !GameState.isRoundTransition) {
    GameState.isPaused = true;
    $('gameArea').classList.add('game-paused');
  }

  GameState.modalSelfieData = GameState.selfieData;
  $('modalPlayerName').value = GameState.playerName || $('playerName').value.trim();
  $('modalProfileImg').src = GameState.selfieData;
  $('modalNameError').textContent = '';
  $('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
  stopStream(modalCameraStream);
  modalCameraStream = null;
  $('profileModal').classList.add('hidden');
  $('modalCameraVideo').classList.remove('hidden');
  $('modalSelfieCanvas').classList.add('hidden');
  $('modalCameraOverlay').classList.remove('hidden');
  $('modalStartCameraBtn').classList.remove('hidden');
  $('modalCaptureBtn').classList.add('hidden');
  $('modalRetakeBtn').classList.add('hidden');

  if (GameState.isRunning && !profileWasPaused) {
    GameState.isPaused = false;
    $('gameArea').classList.remove('game-paused');
    $('pauseBtn').textContent = '⏸';
  }
}

async function modalStartCamera() {
  const video = $('modalCameraVideo');
  try {
    modalCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = modalCameraStream;
    $('modalCameraOverlay').classList.add('hidden');
    $('modalStartCameraBtn').classList.add('hidden');
    $('modalCaptureBtn').classList.remove('hidden');
  } catch (err) {
    $('modalNameError').textContent = 'Camera access denied.';
    console.error('Profile camera error:', err);
  }
}

function modalCaptureSelfie() {
  const video = $('modalCameraVideo');
  const canvas = $('modalSelfieCanvas');
  const ctx = canvas.getContext('2d');

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  GameState.modalSelfieData = canvas.toDataURL('image/jpeg', 0.7);
  $('modalProfileImg').src = GameState.modalSelfieData;
  video.classList.add('hidden');
  canvas.classList.remove('hidden');
  $('modalCaptureBtn').classList.add('hidden');
  $('modalRetakeBtn').classList.remove('hidden');
  stopStream(modalCameraStream);
  modalCameraStream = null;
}

function modalRetakeSelfie() {
  $('modalCameraVideo').classList.remove('hidden');
  $('modalSelfieCanvas').classList.add('hidden');
  $('modalRetakeBtn').classList.add('hidden');
  $('modalStartCameraBtn').classList.remove('hidden');
  $('modalCameraOverlay').classList.remove('hidden');
}

function saveProfile() {
  const name = sanitizeName($('modalPlayerName').value.trim());
  if (name.length < 2) {
    $('modalNameError').textContent = 'Name must be at least 2 characters.';
    return;
  }

  GameState.playerName = name;
  GameState.selfieData = GameState.modalSelfieData || GameState.selfieData;
  $('playerName').value = name;

  drawSelfiePreview();
  updateProfileDisplays();
  updateRegistrationState();
  saveProfileLocally();
  syncLeaderboardProfile();
  closeProfileModal();
}

/* ═══════════════════════════════════════════════════════════════
   TOUCH SUPPORT
═══════════════════════════════════════════════════════════════ */
// Move crosshair on touch
document.addEventListener('touchmove', e => {
  const ch = $('crosshair');
  if (ch && e.touches[0]) {
    ch.style.left = e.touches[0].clientX + 'px';
    ch.style.top  = e.touches[0].clientY + 'px';
  }
}, { passive: true });

// Prevent context menu on long press during game
document.addEventListener('contextmenu', e => {
  if (GameState.isRunning) e.preventDefault();
});

/* ═══════════════════════════════════════════════════════════════
   WAKE LOCK (keep screen on during gameplay on mobile)
═══════════════════════════════════════════════════════════════ */
let wakeLock = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* Not critical */ }
  }
}

async function releaseWakeLock() {
  if (wakeLock) { await wakeLock.release(); wakeLock = null; }
}

// Auto wake lock during gameplay
const _beginGameplay = beginGameplay;
window.beginGameplay = function() {
  requestWakeLock();
  _beginGameplay();
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden && wakeLock) releaseWakeLock();
});

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
(function init() {
  GameState.playerId = getOrCreatePlayerId();
  restoreProfileLocally();
  updateProfileDisplays();
  updateRegistrationState();
  showScreen('registrationScreen');

  // Unlock AudioContext on first interaction
  document.addEventListener('pointerdown', () => getAudioCtx(), { once: true });

  console.log("%c😂 DON'T CATCH THAT! 💩 by Jayver Algadipe", 'color:#bf00ff;font-size:16px;font-weight:bold');
  console.log('%cConfigure JSONBIN_BIN_ID and JSONBIN_API_KEY in Vercel for the online leaderboard.', 'color:#00d4ff');
})();
