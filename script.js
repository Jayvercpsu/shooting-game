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
const LEADERBOARD_API = "/api/leaderboard";

/* ─── Game State ─── */
const GameState = {
  playerName:   "",
  selfieData:   "",        // base64 image
  score:        0,
  timeLeft:     60,
  combo:        1,
  comboTimer:   null,
  hitStreak:    0,
  isRunning:    false,
  gameTimer:    null,
  targets:      [],
  particles:    [],
  animFrameId:  null,
  lastRank:     null,
};

/* ─── DOM Refs ─── */
const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════════
   SCREEN MANAGEMENT
═══════════════════════════════════════════════════════════════ */
function showScreen(id) {
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

  // Show preview, hide video
  video.classList.add('hidden');
  canvas.classList.remove('hidden');
  captBtn.classList.add('hidden');
  rtkBtn.classList.remove('hidden');

  // Stop stream
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }

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
  startCamera(); // Auto-reopen camera
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
  GameState.score     = 0;
  GameState.timeLeft  = 60;
  GameState.combo     = 1;
  GameState.hitStreak = 0;
  GameState.targets   = [];
  GameState.particles = [];

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
    const isMe  = entry.name === GameState.playerName && entry.score === GameState.score;

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
      body: JSON.stringify({ name, score, selfie }),
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
  showScreen('registrationScreen');

  // Unlock AudioContext on first interaction
  document.addEventListener('pointerdown', () => getAudioCtx(), { once: true });

  console.log('%c🎯 SHOOTING CHALLENGE by Jayver Algadipe', 'color:#bf00ff;font-size:16px;font-weight:bold');
  console.log('%cConfigure JSONBIN_BIN_ID and JSONBIN_API_KEY in Vercel for the online leaderboard.', 'color:#00d4ff');
})();
