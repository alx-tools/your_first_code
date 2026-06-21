// ============================================================
//  ¡CORRE! – Escapa del Dinosaurio  |  Elite Game Engine v1.0
// ============================================================

const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const btnStart= document.getElementById('btn-start');

// ── Responsive canvas ────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = Math.min(window.innerWidth,  900);
  canvas.height = Math.min(window.innerHeight - 60, 500);
}
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); if (!game.running) drawMenu(); });

// ── Constants ────────────────────────────────────────────────
const GRAVITY     = 0.55;
const JUMP_FORCE  = -13;
const BASE_SPEED  = 5;
const GROUND_H    = 80;   // height of ground area
const FPS_TARGET  = 60;

// Level thresholds (score to reach)
const LEVEL_THRESHOLDS = [0, 300, 700, 1300, 2100, 3200, 4800, 7000, 10000, 14000];

// ── Colour palette ───────────────────────────────────────────
const C = {
  sky1: '#1a1a2e', sky2: '#16213e',
  ground: '#2d2d44', groundLine: '#3d3d5c',
  dino: '#4CAF50', dinoEye: '#ff0', dinoMouth: '#f44',
  person: '#FF9800', personShirt: '#2196F3',
  bullet: '#FFD700',
  car: '#E91E63', moto: '#9C27B0',
  obstacle: '#607D8B',
  refuge: '#00BCD4',
  blood: '#ff2222',
  star: '#FFD700',
};

// ── Game State ───────────────────────────────────────────────
const game = {
  running: false,
  over: false,
  win: false,
  score: 0,
  hiScore: parseInt(localStorage.getItem('hiScore') || '0'),
  level: 1,
  speed: BASE_SPEED,
  frame: 0,
  paused: false,
};

// ── Input ────────────────────────────────────────────────────
const keys = {};
const justPressed = {};
document.addEventListener('keydown', e => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// Mobile touch controls
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dy) > 30 && dy < 0) justPressed['ArrowUp'] = true;
  else if (Math.abs(dy) > 30 && dy > 0) justPressed['ArrowDown'] = true;
  else if (Math.abs(dx) < 20 && Math.abs(dy) < 20) justPressed['KeyF'] = true;
  e.preventDefault();
}, { passive: false });

// ── Player ───────────────────────────────────────────────────
const player = {
  x: 120, y: 0, w: 36, h: 52,
  vy: 0, onGround: false, ducking: false,
  hp: 3, maxHp: 3,
  mode: 'run',   // run | car | moto
  invincible: 0, // frames of invincibility after hit

  // abilities unlocked per level
  hasGun: false, hasCar: false, hasMoto: false, hasBomb: false,
  ammo: 0,
  bombCount: 0,
  jumpCount: 0, maxJumps: 1,   // double-jump at level 5

  animFrame: 0,
  animTimer: 0,

  get groundY() { return canvas.height - GROUND_H - (this.ducking ? this.h * 0.55 : this.h); },
  get hitbox()  {
    const dw = this.ducking ? 0 : 0;
    return { x: this.x + 4, y: this.y + 4, w: this.w - 8 + dw, h: this.h - 8 };
  },
};

// ── Dinosaur ─────────────────────────────────────────────────
const dino = {
  x: -120, y: 0, w: 90, h: 90,
  roarTimer: 0,
  animFrame: 0,
  animTimer: 0,
  chargeTimer: 0,
  charging: false,
  chargeSpeed: 0,

  get groundY() { return canvas.height - GROUND_H - this.h; },
  get hitbox()  { return { x: this.x + 10, y: this.y + 10, w: this.w - 20, h: this.h - 10 }; },
};

// ── Collections ──────────────────────────────────────────────
let obstacles   = [];
let bullets     = [];
let particles   = [];
let powerups    = [];
let scorePopups = [];
let stars       = [];   // background parallax stars
let clouds      = [];

// ── Refuge (end-of-level goal) ───────────────────────────────
let refuge = null;

// ── Sounds (Web Audio API) ───────────────────────────────────
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, type, dur, vol=0.3, startFreq=null) {
  try {
    const ac  = getAudio();
    const osc = ac.createOscillator();
    const gain= ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type;
    if (startFreq) {
      osc.frequency.setValueAtTime(startFreq, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq, ac.currentTime + dur);
    } else {
      osc.frequency.setValueAtTime(freq, ac.currentTime);
    }
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(); osc.stop(ac.currentTime + dur);
  } catch(e){}
}
const SFX = {
  jump:    () => playTone(300, 'sine',   0.15, 0.2, 150),
  shoot:   () => playTone(800, 'square', 0.08, 0.15),
  hit:     () => playTone(80,  'sawtooth',0.3, 0.4),
  die:     () => { playTone(200,'sawtooth',0.5,0.4); setTimeout(()=>playTone(100,'sawtooth',0.8,0.4),200); },
  coin:    () => playTone(880, 'sine',   0.12, 0.2),
  powerup: () => { playTone(440,'sine',0.1,0.3); setTimeout(()=>playTone(660,'sine',0.15,0.3),100); setTimeout(()=>playTone(880,'sine',0.2,0.3),200); },
  roar:    () => { playTone(60,'sawtooth',0.4,0.5,200); },
  levelup: () => { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.2,0.3),i*120)); },
  explode: () => playTone(100,'sawtooth',0.4,0.5,300),
  refuge:  () => { [784,988,1175,1568].forEach((f,i)=>setTimeout(()=>playTone(f,'sine',0.25,0.3),i*100)); },
};

// ── Particle system ──────────────────────────────────────────
function spawnParticles(x, y, color, count=8, speed=3, life=30) {
  for (let i=0; i<count; i++) {
    const angle = Math.random()*Math.PI*2;
    particles.push({
      x, y,
      vx: Math.cos(angle)*speed*(0.5+Math.random()),
      vy: Math.sin(angle)*speed*(0.5+Math.random()) - 2,
      color, life, maxLife: life,
      size: 3 + Math.random()*4,
    });
  }
}

function spawnBlood(x, y) { spawnParticles(x, y, C.blood, 12, 4, 35); }
function spawnStar(x, y)  { spawnParticles(x, y, C.star,  8,  3, 28); }
function spawnSmoke(x, y) { spawnParticles(x, y, '#aaa',  6,  2, 40); }

// ── Score popup ──────────────────────────────────────────────
function addScore(pts, x, y, label='') {
  game.score += pts;
  scorePopups.push({ x, y: y - 10, vy: -1.5, life: 55, text: (label || `+${pts}`) });
  updateUI();
}

// ── UI update ────────────────────────────────────────────────
function updateUI() {
  document.getElementById('score-display').textContent = `⭐ ${game.score}`;
  document.getElementById('level-display').textContent = `NIVEL ${game.level}`;
  let hearts = '';
  for (let i=0; i<player.maxHp; i++) hearts += i < player.hp ? '❤️' : '🖤';
  document.getElementById('health-display').textContent = hearts;
  let ammoStr = '';
  if (player.hasGun)  ammoStr += `🔫 ${player.ammo}  `;
  if (player.hasBomb) ammoStr += `💣 ${player.bombCount}`;
  document.getElementById('ammo-display').textContent = ammoStr;
}

// ── Banner / toast ───────────────────────────────────────────
function showBanner(text, duration=1800) {
  const el = document.getElementById('level-banner');
  el.textContent = text;
  el.style.opacity = '1';
  setTimeout(() => el.style.opacity = '0', duration);
}
function showToast(text, duration=2200) {
  const el = document.getElementById('powerup-toast');
  el.textContent = text;
  el.style.opacity = '1';
  setTimeout(() => el.style.opacity = '0', duration);
}

// ── Level configuration ──────────────────────────────────────
const LEVEL_CONFIG = {
  1:  { name:'BOSQUE OSCURO',      bg1:'#0d1b2a', bg2:'#1b2838', obstacleTypes:['rock','cactus'],              refugeScore:300,  dinoHp:5,  dinoSpeed:3.5 },
  2:  { name:'CARRETERA',          bg1:'#1a1a1a', bg2:'#2d2d2d', obstacleTypes:['rock','cactus','car_wreck'],  refugeScore:700,  dinoHp:8,  dinoSpeed:4.0 },
  3:  { name:'ZONA INDUSTRIAL',    bg1:'#1c1c0a', bg2:'#2a2a10', obstacleTypes:['barrel','crate','fire'],      refugeScore:1300, dinoHp:12, dinoSpeed:4.5 },
  4:  { name:'CIUDAD EN RUINAS',   bg1:'#0a0a1a', bg2:'#10102a', obstacleTypes:['rubble','car_wreck','fire'],  refugeScore:2100, dinoHp:16, dinoSpeed:5.0 },
  5:  { name:'DESIERTO',           bg1:'#2a1a00', bg2:'#3a2800', obstacleTypes:['cactus','rock','quicksand'],  refugeScore:3200, dinoHp:20, dinoSpeed:5.5 },
  6:  { name:'VOLCÁN',             bg1:'#2a0a00', bg2:'#1a0500', obstacleTypes:['lava','rock','boulder'],      refugeScore:4800, dinoHp:25, dinoSpeed:6.0 },
  7:  { name:'LABORATORIO',        bg1:'#001a10', bg2:'#002a18', obstacleTypes:['laser','crate','acid'],       refugeScore:7000, dinoHp:30, dinoSpeed:6.5 },
  8:  { name:'HELICÓPTERO',        bg1:'#000a1a', bg2:'#00102a', obstacleTypes:['missile','barrel','laser'],   refugeScore:10000,dinoHp:35, dinoSpeed:7.0 },
  9:  { name:'CUEVA DEL DINO',     bg1:'#0a0a0a', bg2:'#141414', obstacleTypes:['boulder','acid','lava'],      refugeScore:14000,dinoHp:45, dinoSpeed:7.5 },
  10: { name:'BATALLA FINAL',      bg1:'#1a0000', bg2:'#2a0000', obstacleTypes:['all'],                       refugeScore:99999,dinoHp:60, dinoSpeed:8.5 },
};

// Dino boss HP per level
let dinoHp = 5;
let dinoMaxHp = 5;

// ── Unlock abilities per level ───────────────────────────────
function applyLevelAbilities(level) {
  if (level >= 2) { player.hasGun = true;  if (player.ammo < 10) player.ammo += 10; }
  if (level >= 3) { player.hasBomb = true; player.bombCount += 2; }
  if (level >= 4) { player.hasCar = true; }
  if (level >= 5) { player.maxJumps = 2; }  // double jump
  if (level >= 6) { player.hasMoto = true; }
  if (level >= 7) { player.maxHp = 4; if (player.hp < 4) player.hp++; }
  if (level >= 9) { player.maxHp = 5; }
}

// ── Init / Reset ─────────────────────────────────────────────
function initGame() {
  game.running = true;
  game.over    = false;
  game.win     = false;
  game.score   = 0;
  game.level   = 1;
  game.speed   = BASE_SPEED;
  game.frame   = 0;

  Object.assign(player, {
    x: 120, vy: 0, onGround: true, ducking: false,
    mode: 'run', hp: 3, maxHp: 3, invincible: 0,
    hasGun: false, hasCar: false, hasMoto: false, hasBomb: false,
    ammo: 0, bombCount: 0, jumpCount: 0, maxJumps: 1,
    animFrame: 0, animTimer: 0,
  });
  player.y = player.groundY;
  player.w = 36; player.h = 52;

  Object.assign(dino, {
    x: -200, y: dino.groundY, roarTimer: 0,
    animFrame: 0, animTimer: 0,
    chargeTimer: 180, charging: false, chargeSpeed: 0,
  });

  dinoHp = LEVEL_CONFIG[1].dinoHp;
  dinoMaxHp = dinoHp;

  obstacles   = [];
  bullets     = [];
  particles   = [];
  powerups    = [];
  scorePopups = [];
  stars       = [];
  clouds      = [];
  refuge      = null;

  // Generate background stars
  for (let i=0; i<60; i++) {
    stars.push({ x: Math.random()*canvas.width, y: Math.random()*(canvas.height-GROUND_H), speed: 0.2+Math.random()*0.5, size: Math.random()*2.5 });
  }
  for (let i=0; i<6; i++) {
    clouds.push({ x: Math.random()*canvas.width, y: 20+Math.random()*100, speed: 0.5+Math.random(), w: 80+Math.random()*100, h: 30+Math.random()*20 });
  }

  setupLevel(1);
  updateUI();
  overlay.style.display = 'none';
}

function setupLevel(lvl) {
  const cfg = LEVEL_CONFIG[lvl] || LEVEL_CONFIG[10];
  dinoHp    = cfg.dinoHp;
  dinoMaxHp = dinoHp;
  game.speed = BASE_SPEED + (lvl - 1) * 0.4;
  obstacles  = [];
  powerups   = [];
  refuge     = null;
  applyLevelAbilities(lvl);

  // Place refuge far to the right
  const refugeX = canvas.width + 500 + lvl * 200;
  refuge = { x: refugeX, y: 0, w: 80, h: canvas.height - GROUND_H, reached: false };
  refuge.y = canvas.height - GROUND_H - refuge.h;

  // Spawn initial obstacles
  spawnObstaclesBatch(lvl);
  updateUI();
}

// ── Obstacle spawning ─────────────────────────────────────────
const OBSTACLE_DEFS = {
  rock:      { w:40, h:45, color:'#78909C', label:'🪨', pts:5 },
  cactus:    { w:28, h:70, color:'#388E3C', label:'🌵', pts:5 },
  car_wreck: { w:90, h:45, color:'#B71C1C', label:'🚗', pts:10 },
  barrel:    { w:38, h:50, color:'#5D4037', label:'🛢️', pts:8 },
  crate:     { w:45, h:45, color:'#795548', label:'📦', pts:8 },
  fire:      { w:35, h:55, color:'#FF6D00', label:'🔥', pts:12, damaging:true },
  rubble:    { w:60, h:40, color:'#546E7A', label:'🧱', pts:10 },
  quicksand: { w:70, h:20, color:'#FFA726', label:'ARENA', pts:15, slow:true },
  lava:      { w:60, h:18, color:'#FF3D00', label:'LAVA', pts:20, damaging:true },
  boulder:   { w:65, h:65, color:'#616161', label:'🪨', pts:15 },
  laser:     { w:8,  h:canvas.height, color:'#FF1744', label:'LASER', pts:20, damaging:true },
  acid:      { w:55, h:18, color:'#76FF03', label:'ÁCIDO', pts:20, damaging:true },
  missile:   { w:50, h:25, color:'#FF6F00', label:'🚀', pts:25 },
};

function spawnObstaclesBatch(lvl) {
  const cfg   = LEVEL_CONFIG[lvl] || LEVEL_CONFIG[10];
  const types = cfg.obstacleTypes[0] === 'all'
    ? Object.keys(OBSTACLE_DEFS)
    : cfg.obstacleTypes;

  let x = canvas.width + 100;
  const count = 8 + lvl * 3;
  for (let i=0; i<count; i++) {
    const type = types[Math.floor(Math.random()*types.length)];
    const def  = OBSTACLE_DEFS[type];
    const gap  = 220 + Math.random() * 300;
    x += gap;

    // Stop spawning before refuge
    if (refuge && x + def.w > refuge.x - 200) break;

    obstacles.push({
      type, x,
      w: def.w, h: def.h,
      color: def.color,
      pts: def.pts,
      damaging: def.damaging || false,
      slow: def.slow || false,
      y: canvas.height - GROUND_H - def.h,
      flickerTimer: 0,
    });
  }

  // Spawn powerups between obstacles
  spawnPowerupsBatch(lvl, types);
}

function spawnPowerupsBatch(lvl) {
  const count = 3 + lvl;
  for (let i=0; i<count; i++) {
    const types = ['ammo','health','speed','bomb','shield'];
    if (lvl < 2) types.splice(types.indexOf('ammo'),1);
    const type = types[Math.floor(Math.random()*types.length)];
    const x    = canvas.width + 300 + i * 400 + Math.random() * 200;
    const y    = canvas.height - GROUND_H - 90 - Math.random() * 80;
    powerups.push({ type, x, y, w:30, h:30, collected:false, bobTimer: Math.random()*Math.PI*2 });
  }
}

// ── Collision helper ──────────────────────────────────────────
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── Main update ───────────────────────────────────────────────
let lastTime = 0;
function gameLoop(timestamp) {
  if (!game.running) return;
  const dt = Math.min((timestamp - lastTime) / (1000/FPS_TARGET), 3);
  lastTime = timestamp;

  update(dt);
  draw();

  // Clear just-pressed
  for (const k in justPressed) delete justPressed[k];

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (game.over || game.win) return;
  game.frame++;

  // ── Speed ramp ──────────────────────────────────────────────
  game.speed = BASE_SPEED + (game.level - 1) * 0.4 + game.score * 0.0004;
  if (player.mode === 'car')  game.speed *= 1.6;
  if (player.mode === 'moto') game.speed *= 1.35;

  // ── Level progression ────────────────────────────────────────
  const nextThresh = LEVEL_THRESHOLDS[game.level] || 99999;
  if (game.score >= nextThresh && game.level < 10) {
    game.level++;
    SFX.levelup();
    showBanner(`🏆 NIVEL ${game.level}: ${LEVEL_CONFIG[game.level]?.name || ''}`, 2000);
    setupLevel(game.level);
  }

  // ── Player input ─────────────────────────────────────────────
  updatePlayer(dt);

  // ── Dino AI ──────────────────────────────────────────────────
  updateDino(dt);

  // ── Bullets ──────────────────────────────────────────────────
  updateBullets(dt);

  // ── Obstacles ────────────────────────────────────────────────
  updateObstacles(dt);

  // ── Powerups ─────────────────────────────────────────────────
  updatePowerups(dt);

  // ── Refuge ───────────────────────────────────────────────────
  updateRefuge(dt);

  // ── Particles / score popups ─────────────────────────────────
  particles   = particles.filter(p => p.life > 0);
  scorePopups = scorePopups.filter(p => p.life > 0);
  particles.forEach(p  => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life--; });
  scorePopups.forEach(p => { p.x+=0.3; p.y+=p.vy; p.life--; });

  // ── Stars parallax ──────────────────────────────────────────
  stars.forEach(s => { s.x -= s.speed * dt; if (s.x < 0) s.x = canvas.width; });
  clouds.forEach(c => { c.x -= c.speed * dt; if (c.x + c.w < 0) c.x = canvas.width + 100; });

  // ── Passive score (survival) ─────────────────────────────────
  if (game.frame % 30 === 0) {
    addScore(1, player.x, player.y - 20);
  }
}

// ── Player update ─────────────────────────────────────────────
function updatePlayer(dt) {
  const p = player;

  // Duck
  const wasDucking = p.ducking;
  p.ducking = (keys['ArrowDown'] || keys['KeyS']) && p.onGround;
  if (p.ducking !== wasDucking) {
    p.h = p.ducking ? 30 : 52;
  }

  // Jump
  if ((justPressed['Space'] || justPressed['ArrowUp'] || justPressed['KeyW'])) {
    if (p.onGround || p.jumpCount < p.maxJumps) {
      p.vy = JUMP_FORCE * (p.mode === 'car' ? 0.85 : 1);
      p.onGround = false;
      p.jumpCount++;
      SFX.jump();
      spawnParticles(p.x + p.w/2, p.y + p.h, '#aaa', 5, 2, 20);
    }
  }

  // Shoot
  if ((justPressed['KeyF'] || justPressed['KeyZ']) && p.hasGun && p.ammo > 0) {
    fireBullet();
  }

  // Bomb
  if (justPressed['KeyB'] && p.hasBomb && p.bombCount > 0) {
    fireBomb();
  }

  // Gravity
  p.vy += GRAVITY * dt;
  p.y  += p.vy   * dt;

  const gy = p.groundY;
  if (p.y >= gy) {
    p.y = gy; p.vy = 0; p.onGround = true; p.jumpCount = 0;
  } else {
    p.onGround = false;
  }

  // Adjust width/height for mode
  if (p.mode === 'car')  { p.w = 90; p.h = 46; }
  else if (p.mode === 'moto') { p.w = 70; p.h = 40; }
  else { p.w = 36; p.h = p.ducking ? 30 : 52; }

  // Animation
  p.animTimer++;
  if (p.animTimer >= 8) { p.animTimer = 0; p.animFrame = (p.animFrame+1) % 4; }

  // Invincibility countdown
  if (p.invincible > 0) p.invincible -= dt;
}

// ── Fire bullet ───────────────────────────────────────────────
function fireBullet() {
  player.ammo--;
  SFX.shoot();
  bullets.push({
    x: player.x + player.w, y: player.y + player.h * 0.35,
    vx: 14 + game.speed, vy: 0,
    w: 16, h: 8, type: 'bullet',
    color: C.bullet,
  });
  spawnParticles(player.x + player.w, player.y + player.h*0.35, C.bullet, 3, 2, 12);
  updateUI();
}

function fireBomb() {
  player.bombCount--;
  SFX.explode();
  bullets.push({
    x: player.x + player.w, y: player.y,
    vx: 8 + game.speed * 0.5, vy: -5,
    w: 20, h: 20, type: 'bomb',
    color: '#FF6F00',
    fuse: 80,
  });
  updateUI();
}

// ── Bullets update ────────────────────────────────────────────
function updateBullets(dt) {
  bullets = bullets.filter(b => b.x < canvas.width + 100 && b.x > -50);

  bullets.forEach(b => {
    b.x += b.vx * dt;
    b.y += (b.vy || 0) * dt;

    if (b.type === 'bomb') {
      b.vy += GRAVITY * dt;
      b.fuse -= dt;
      if (b.fuse <= 0) {
        // Explode
        spawnParticles(b.x, b.y, '#FF6F00', 20, 6, 40);
        spawnParticles(b.x, b.y, '#FFF',    10, 3, 25);
        SFX.explode();
        b.x = -9999; // remove

        // Blast radius: hurt dino
        const blast = { x: b.x - 80, y: b.y - 80, w: 160, h: 160 };
        if (rectsOverlap(blast, dino.hitbox)) { hitDino(20, b.x, b.y); }
        return;
      }
    }

    // Hit dino
    if (rectsOverlap(b, dino.hitbox)) {
      hitDino(b.type === 'bomb' ? 15 : 8, b.x, b.y);
      b.x = -9999;
    }
  });
}

// ── Hit dino ─────────────────────────────────────────────────
function hitDino(dmg, x, y) {
  dinoHp -= dmg;
  spawnBlood(x || dino.x + dino.w * 0.5, y || dino.y + dino.h * 0.3);
  SFX.hit();
  addScore(15, dino.x + dino.w/2, dino.y, `💥+${dmg}`);

  if (dinoHp <= 0) {
    dinoHp = 0;
    addScore(150, dino.x + dino.w/2, dino.y - 40, '🏆 DINO KO! +150');
    spawnParticles(dino.x + dino.w/2, dino.y + dino.h/2, C.blood, 30, 6, 50);
    spawnParticles(dino.x + dino.w/2, dino.y + dino.h/2, '#FFD700', 15, 4, 40);
    SFX.die();
    showToast('💀 ¡DINOSAURIO DERROTADO! +150pts', 2500);
    dino.x = -500;
    // Respawn dino after a break
    setTimeout(() => {
      dino.x = -300;
      const cfg = LEVEL_CONFIG[game.level] || LEVEL_CONFIG[10];
      dinoHp = cfg.dinoHp;
      dinoMaxHp = dinoHp;
    }, 6000);
  }
}

// ── Dino update ───────────────────────────────────────────────
function updateDino(dt) {
  const d = dino;
  d.y = d.groundY;

  // Approach player
  const dist = player.x - d.x;
  const cfg  = LEVEL_CONFIG[game.level] || LEVEL_CONFIG[10];
  let speed  = cfg.dinoSpeed * dt;

  // Charging mechanic
  if (!d.charging) {
    d.chargeTimer -= dt;
    if (d.chargeTimer <= 0 && dist > 0 && dist < canvas.width) {
      d.charging    = true;
      d.chargeSpeed = speed * 3.5;
      d.chargeTimer = 200 + Math.random() * 200;
      SFX.roar();
      showToast('🦖 ¡EL DINOSAURIO CARGA!', 1000);
    }
  } else {
    speed = d.chargeSpeed;
    if (dist > canvas.width * 0.7 || dist < 0) {
      d.charging    = false;
      d.chargeSpeed = 0;
    }
  }

  // Move dino toward player (keep behind)
  const targetX = player.x - 250;
  if (d.x < targetX) d.x += speed * 0.8;
  else if (d.x > targetX + 60) d.x -= speed * 0.3;

  // Roar cooldown
  d.roarTimer -= dt;
  if (d.roarTimer <= 0 && dist > 0) {
    d.roarTimer = 180 + Math.random() * 180;
    SFX.roar();
    spawnParticles(d.x + d.w, d.y + d.h * 0.2, '#ff6600', 6, 3, 25);
  }

  // Animation
  d.animTimer++;
  if (d.animTimer >= 6) { d.animTimer = 0; d.animFrame = (d.animFrame+1) % 4; }

  // Dino hits player
  if (player.invincible <= 0 && rectsOverlap(d.hitbox, player.hitbox)) {
    damagePlayer(1);
  }
}

// ── Damage player ─────────────────────────────────────────────
function damagePlayer(dmg) {
  if (player.invincible > 0) return;
  player.hp -= dmg;
  player.invincible = 90;
  SFX.hit();
  spawnBlood(player.x + player.w/2, player.y + player.h/2);
  updateUI();
  if (player.hp <= 0) {
    gameOver();
  }
}

// ── Obstacles update ──────────────────────────────────────────
function updateObstacles(dt) {
  obstacles.forEach(o => {
    o.x -= game.speed * dt;
    o.flickerTimer = (o.flickerTimer || 0) + 1;
  });
  obstacles = obstacles.filter(o => o.x > -200);

  obstacles.forEach(o => {
    const hit = rectsOverlap(player.hitbox, { x: o.x, y: o.y, w: o.w, h: o.h });
    if (hit && player.invincible <= 0) {
      if (o.damaging) {
        damagePlayer(1);
      } else if (o.slow) {
        // slow effect
        player.invincible = 40;
        addScore(-5, player.x, player.y - 20, '-5');
      } else {
        damagePlayer(1);
      }
      spawnParticles(o.x + o.w/2, o.y, '#aaa', 8, 3, 25);
    }
  });

  // Score for obstacles jumped over
  obstacles.forEach(o => {
    if (!o.passed && o.x + o.w < player.x) {
      o.passed = true;
      addScore(o.pts, o.x, o.y - 20, `✅+${o.pts}`);
      spawnStar(player.x + player.w/2, player.y - 10);
    }
  });
}

// ── Powerups update ───────────────────────────────────────────
function updatePowerups(dt) {
  const POWERUP_DEF = {
    ammo:   { emoji:'🔫', label:'MUNICIÓN +8',   color:'#FFD700' },
    health: { emoji:'❤️',  label:'VIDA +1',       color:'#ff4444' },
    speed:  { emoji:'⚡',  label:'TURBO!',        color:'#00BFFF' },
    bomb:   { emoji:'💣',  label:'BOMBA +2',      color:'#FF6F00' },
    shield: { emoji:'🛡️',  label:'ESCUDO!',       color:'#00E5FF' },
    car:    { emoji:'🚗',  label:'¡AUTO!',        color:'#E91E63' },
    moto:   { emoji:'🏍️',  label:'¡MOTO!',       color:'#9C27B0' },
  };

  powerups.forEach(p => {
    if (p.collected) return;
    p.x -= game.speed * dt * 0.5;
    p.bobTimer += 0.05;
    p.displayY = p.y + Math.sin(p.bobTimer) * 8;

    if (rectsOverlap(player.hitbox, { x: p.x, y: p.displayY, w: p.w, h: p.h })) {
      p.collected = true;
      const def   = POWERUP_DEF[p.type];
      SFX.powerup();
      spawnParticles(p.x + 15, p.displayY + 15, def.color, 12, 4, 35);
      showToast(`${def.emoji} ${def.label}`, 2000);
      addScore(20, p.x, p.displayY, `${def.emoji}+20`);

      switch(p.type) {
        case 'ammo':   player.ammo      += 8; break;
        case 'health': player.hp = Math.min(player.hp+1, player.maxHp); break;
        case 'speed':  game.speed = Math.min(game.speed * 1.3, 18); break;
        case 'bomb':   player.bombCount += 2; break;
        case 'shield': player.invincible = 300; break;
        case 'car':
          player.mode = player.mode === 'car' ? 'run' : 'car';
          if (!player.hasCar) player.hasCar = true;
          break;
        case 'moto':
          player.mode = player.mode === 'moto' ? 'run' : 'moto';
          if (!player.hasMoto) player.hasMoto = true;
          break;
      }
      updateUI();
    }
  });

  // Spawn car/moto powerups at appropriate levels
  if (game.level >= 4 && !powerups.find(p => p.type === 'car') && Math.random() < 0.002) {
    powerups.push({ type:'car',  x:canvas.width+50, y:canvas.height-GROUND_H-60, w:30, h:30, collected:false, bobTimer:0 });
  }
  if (game.level >= 6 && !powerups.find(p => p.type === 'moto') && Math.random() < 0.002) {
    powerups.push({ type:'moto', x:canvas.width+50, y:canvas.height-GROUND_H-60, w:30, h:30, collected:false, bobTimer:0 });
  }
}

// ── Refuge update ─────────────────────────────────────────────
function updateRefuge(dt) {
  if (!refuge || refuge.reached) return;
  refuge.x -= game.speed * dt;

  if (rectsOverlap(player.hitbox, { x: refuge.x, y: refuge.y, w: refuge.w, h: refuge.h })) {
    refuge.reached = true;
    SFX.refuge();
    const bonus = game.level * 100;
    addScore(bonus, player.x, player.y - 50, `🏠 REFUGIO! +${bonus}`);
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#00BCD4', 20, 5, 50);
    spawnParticles(player.x + player.w/2, player.y + player.h/2, '#FFD700', 15, 4, 45);
    showBanner(`🏠 ¡REFUGIO ALCANZADO! +${bonus}`, 2500);

    if (game.level >= 10) {
      setTimeout(() => winGame(), 2000);
    } else {
      setTimeout(() => {
        game.level++;
        SFX.levelup();
        showBanner(`🏆 NIVEL ${game.level}: ${LEVEL_CONFIG[game.level]?.name || 'FINAL'}`, 2000);
        setupLevel(game.level);
      }, 2500);
    }
  }
}

// ── Game Over / Win ───────────────────────────────────────────
function gameOver() {
  game.over = true;
  SFX.die();
  spawnParticles(player.x + player.w/2, player.y + player.h/2, C.blood, 25, 5, 60);
  if (game.score > game.hiScore) { game.hiScore = game.score; localStorage.setItem('hiScore', game.hiScore); }

  setTimeout(() => {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <h1>💀 ¡TE COMIÓ!</h1>
      <h2>El dinosaurio ganó esta vez...</h2>
      <p class="big-score">Puntuación: ${game.score}</p>
      <p style="color:#ffd700">🏆 Récord: ${game.hiScore}</p>
      <p>Llegaste al nivel ${game.level}</p>
      <button id="btn-start" onclick="initGame()" style="margin-top:20px;padding:14px 40px;font-size:20px;background:#ff4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:monospace;">¡INTENTAR DE NUEVO!</button>
    `;
    game.running = false;
  }, 1200);
}

function winGame() {
  game.win = true;
  if (game.score > game.hiScore) { game.hiScore = game.score; localStorage.setItem('hiScore', game.hiScore); }
  SFX.levelup();

  setTimeout(() => {
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <h1 style="color:#ffd700;font-size:48px;">🏆 ¡GANASTE!</h1>
      <h2 style="color:#00ff88">¡Sobreviviste al dinosaurio!</h2>
      <p class="big-score" style="font-size:50px;color:#ffd700;">⭐ ${game.score}</p>
      <p style="color:#aaa">¡Eres un superviviente legendario!</p>
      <p style="color:#ffd700">🏆 Récord: ${game.hiScore}</p>
      <button id="btn-start" onclick="initGame()" style="margin-top:20px;padding:14px 40px;font-size:20px;background:#00aa44;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:monospace;">JUGAR DE NUEVO</button>
    `;
    game.running = false;
  }, 2000);
}

// ════════════════════════════════════════════════════════════════
//  DRAW ENGINE
// ════════════════════════════════════════════════════════════════
function draw() {
  const cfg = LEVEL_CONFIG[game.level] || LEVEL_CONFIG[10];

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, cfg.bg1);
  grad.addColorStop(1, cfg.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars();
  drawClouds();
  drawGround();
  drawRefuge();
  drawObstacles();
  drawPowerups();
  drawBullets();
  drawDino();
  drawPlayer();
  drawParticles();
  drawScorePopups();
  drawDinoHpBar();
}

function drawStars() {
  ctx.save();
  stars.forEach(s => {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random()*0.5})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}

function drawClouds() {
  ctx.save();
  clouds.forEach(c => {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(c.x + c.w/2, c.y + c.h/2, c.w/2, c.h/2, 0, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}

function drawGround() {
  const gy = canvas.height - GROUND_H;
  // Ground base
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, gy, canvas.width, GROUND_H);
  // Ground line
  ctx.strokeStyle = C.groundLine;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(canvas.width, gy);
  ctx.stroke();
  // Ground detail lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i=0; i<6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, gy + 10 + i*10);
    ctx.lineTo(canvas.width, gy + 10 + i*10);
    ctx.stroke();
  }
}

function drawRefuge() {
  if (!refuge || refuge.reached) return;
  const r = refuge;
  // Building silhouette
  ctx.fillStyle = C.refuge;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  // Door
  ctx.fillStyle = '#004d60';
  ctx.fillRect(r.x + r.w*0.3, r.y + r.h*0.55, r.w*0.4, r.h*0.45);
  // Sign
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 11px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('🏠', r.x + r.w/2, r.y + 24);
  ctx.fillText('REFUGIO', r.x + r.w/2, r.y + 42);
  // Glow
  ctx.shadowBlur = 20;
  ctx.shadowColor = C.refuge;
  ctx.strokeStyle = C.refuge;
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}

function drawObstacles() {
  obstacles.forEach(o => {
    ctx.save();
    // Glow for damaging
    if (o.damaging) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = o.color;
    }
    ctx.fillStyle = o.color;
    ctx.fillRect(o.x, o.y, o.w, o.h);

    // Details by type
    if (o.type === 'fire' || o.type === 'lava') {
      // Animated flame top
      const flicker = Math.sin(game.frame * 0.3 + o.x) * 5;
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + o.w*0.25, o.y - 10 + flicker);
      ctx.lineTo(o.x + o.w*0.5,  o.y - 18 + flicker*0.5);
      ctx.lineTo(o.x + o.w*0.75, o.y - 12 + flicker);
      ctx.lineTo(o.x + o.w, o.y);
      ctx.fill();
    }
    if (o.type === 'laser') {
      ctx.fillStyle = `rgba(255,23,68,${0.4 + Math.sin(game.frame*0.2)*0.3})`;
      ctx.fillRect(o.x - 15, 0, o.w + 30, canvas.height);
    }
    if (o.type === 'cactus') {
      ctx.fillStyle = '#1B5E20';
      ctx.fillRect(o.x + o.w*0.35, o.y, o.w*0.3, o.h);
      ctx.fillRect(o.x + o.w*0.05, o.y + o.h*0.3, o.w*0.3, o.h*0.25);
      ctx.fillRect(o.x + o.w*0.65, o.y + o.h*0.4, o.w*0.3, o.h*0.2);
    }
    ctx.restore();

    // Label
    ctx.font = '11px Courier New';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(OBSTACLE_DEFS[o.type]?.label || '', o.x + o.w/2, o.y - 6);
    ctx.textAlign = 'left';
  });
}

function drawPowerups() {
  const POWERUP_DEF = {
    ammo:'🔫', health:'❤️', speed:'⚡', bomb:'💣', shield:'🛡️', car:'🚗', moto:'🏍️',
  };
  powerups.forEach(p => {
    if (p.collected) return;
    const dy = p.displayY || p.y;
    // Glow
    ctx.save();
    ctx.shadowBlur  = 15;
    ctx.shadowColor = '#FFD700';
    // Circle bg
    ctx.fillStyle   = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(p.x + p.w/2, dy + p.h/2, p.w*0.7, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    // Emoji
    ctx.font = '22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(POWERUP_DEF[p.type] || '?', p.x + p.w/2, dy + p.h*0.85);
    ctx.textAlign = 'left';
  });
}

function drawBullets() {
  bullets.forEach(b => {
    if (b.type === 'bomb') {
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('💣', b.x, b.y + 20);
      ctx.textAlign = 'left';
      return;
    }
    ctx.save();
    ctx.shadowBlur  = 10;
    ctx.shadowColor = C.bullet;
    ctx.fillStyle   = C.bullet;
    ctx.beginPath();
    ctx.ellipse(b.x + b.w/2, b.y + b.h/2, b.w/2, b.h/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPlayer() {
  const p   = player;
  const blink = (p.invincible > 0 && Math.floor(game.frame / 5) % 2 === 0);
  if (blink) return;

  ctx.save();

  if (p.mode === 'car') {
    drawCar(p.x, p.y, p.w, p.h);
  } else if (p.mode === 'moto') {
    drawMoto(p.x, p.y, p.w, p.h);
  } else {
    drawHuman(p.x, p.y, p.w, p.h, p.ducking, p.animFrame, p.onGround);
  }

  // Shield glow
  if (p.invincible > 0 && player.hp > 0) {
    ctx.strokeStyle = 'rgba(0,229,255,0.6)';
    ctx.lineWidth   = 3;
    ctx.shadowBlur  = 12;
    ctx.shadowColor = '#00E5FF';
    ctx.beginPath();
    ctx.ellipse(p.x + p.w/2, p.y + p.h/2, p.w*0.7, p.h*0.6, 0, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHuman(x, y, w, h, ducking, frame, onGround) {
  const legOff = onGround ? Math.sin(frame * Math.PI/2) * 8 : 0;
  const armOff = onGround ? Math.cos(frame * Math.PI/2) * 7 : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + w/2, y + h + 3, w*0.5, 6, 0, 0, Math.PI*2);
  ctx.fill();

  if (ducking) {
    // Body crouched
    ctx.fillStyle = '#2196F3';
    ctx.fillRect(x + 4, y + 5, w - 8, h - 8);
    // Head
    ctx.fillStyle = '#FFCA28';
    ctx.beginPath();
    ctx.arc(x + w/2, y + 9, 10, 0, Math.PI*2);
    ctx.fill();
    return;
  }

  // Legs
  ctx.strokeStyle = '#795548'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w*0.35, y + h*0.65);
  ctx.lineTo(x + w*0.25, y + h + legOff);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w*0.65, y + h*0.65);
  ctx.lineTo(x + w*0.75, y + h - legOff);
  ctx.stroke();

  // Body
  ctx.fillStyle = player.hasGun ? '#1565C0' : '#2196F3';
  ctx.fillRect(x + 6, y + h*0.3, w - 12, h*0.42);

  // Arms
  ctx.strokeStyle = '#FFCA28'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + w*0.2, y + h*0.35);
  ctx.lineTo(x + w*0.05, y + h*0.55 + armOff);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + w*0.8, y + h*0.35);
  ctx.lineTo(x + w*0.95, y + h*0.55 - armOff);
  ctx.stroke();

  // Gun
  if (player.hasGun) {
    ctx.fillStyle = '#333';
    ctx.fillRect(x + w*0.8, y + h*0.38, 18, 7);
    ctx.fillStyle = '#555';
    ctx.fillRect(x + w*0.8 + 14, y + h*0.4, 10, 4);
  }

  // Head
  ctx.fillStyle = '#FFCA28';
  ctx.beginPath();
  ctx.arc(x + w/2, y + h*0.22, 12, 0, Math.PI*2);
  ctx.fill();
  // Hair
  ctx.fillStyle = '#333';
  ctx.fillRect(x + w/2 - 8, y + h*0.1, 16, 7);
  // Eyes
  ctx.fillStyle = '#333';
  ctx.fillRect(x + w/2 - 5, y + h*0.19, 3, 3);
  ctx.fillRect(x + w/2 + 2, y + h*0.19, 3, 3);
  // Mouth (scared expression)
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + w/2, y + h*0.27, 3, 0, Math.PI);
  ctx.stroke();
  // Sweat drop
  ctx.fillStyle = 'rgba(100,180,255,0.8)';
  ctx.beginPath();
  ctx.arc(x + w/2 + 8, y + h*0.15, 3, 0, Math.PI*2);
  ctx.fill();
}

function drawCar(x, y, w, h) {
  // Body
  ctx.fillStyle = C.car;
  ctx.beginPath();
  ctx.roundRect(x, y + h*0.3, w, h*0.7, 4);
  ctx.fill();
  // Roof
  ctx.fillStyle = '#F48FB1';
  ctx.beginPath();
  ctx.roundRect(x + w*0.1, y, w*0.8, h*0.4, 5);
  ctx.fill();
  // Windows
  ctx.fillStyle = 'rgba(150,230,255,0.8)';
  ctx.fillRect(x + w*0.15, y + h*0.04, w*0.3, h*0.28);
  ctx.fillRect(x + w*0.55, y + h*0.04, w*0.3, h*0.28);
  // Wheels
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(x + w*0.2, y + h, h*0.28, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w*0.8, y + h, h*0.28, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#555';
  ctx.beginPath(); ctx.arc(x + w*0.2, y + h, h*0.15, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w*0.8, y + h, h*0.15, 0, Math.PI*2); ctx.fill();
  // Speed lines
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
  [-10,-20,-30].forEach(off => {
    ctx.beginPath(); ctx.moveTo(x + off, y + h*0.5); ctx.lineTo(x + off - 20, y + h*0.5); ctx.stroke();
  });
  // Driver head
  ctx.fillStyle = '#FFCA28';
  ctx.beginPath(); ctx.arc(x + w*0.35, y + h*0.15, 9, 0, Math.PI*2); ctx.fill();
}

function drawMoto(x, y, w, h) {
  // Body
  ctx.fillStyle = C.moto;
  ctx.fillRect(x + w*0.1, y + h*0.3, w*0.8, h*0.45);
  // Wheel front
  ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(x + w*0.8, y + h*0.85, h*0.3, 0, Math.PI*2); ctx.stroke();
  // Wheel back
  ctx.beginPath(); ctx.arc(x + w*0.2, y + h*0.85, h*0.3, 0, Math.PI*2); ctx.stroke();
  // Handlebars
  ctx.strokeStyle = '#888'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + w*0.6, y + h*0.2); ctx.lineTo(x + w*0.85, y + h*0.1); ctx.stroke();
  // Rider
  ctx.fillStyle = '#CE93D8';
  ctx.fillRect(x + w*0.3, y, w*0.35, h*0.45);
  ctx.fillStyle = '#FFCA28';
  ctx.beginPath(); ctx.arc(x + w*0.45, y - 5, 10, 0, Math.PI*2); ctx.fill();
  // Exhaust
  ctx.fillStyle = 'rgba(200,200,200,0.3)';
  ctx.beginPath(); ctx.arc(x - 5, y + h*0.5, 5 + Math.random()*4, 0, Math.PI*2); ctx.fill();
}

function drawDino() {
  const d = dino;
  if (d.x < -d.w - 20) return;

  ctx.save();
  const legOff = Math.sin(d.animFrame * Math.PI/2) * 12;
  const charging = d.charging;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(d.x + d.w*0.45, d.y + d.h + 4, d.w*0.45, 10, 0, 0, Math.PI*2);
  ctx.fill();

  // Tail
  ctx.fillStyle = '#2E7D32';
  ctx.beginPath();
  ctx.moveTo(d.x + 10, d.y + d.h*0.7);
  ctx.quadraticCurveTo(d.x - 30, d.y + d.h*0.9, d.x - 20, d.y + d.h*0.5);
  ctx.quadraticCurveTo(d.x - 5,  d.y + d.h*0.55, d.x + 10, d.y + d.h*0.7);
  ctx.fill();

  // Body
  ctx.fillStyle = charging ? '#FF5252' : '#388E3C';
  ctx.beginPath();
  ctx.ellipse(d.x + d.w*0.45, d.y + d.h*0.6, d.w*0.42, d.h*0.38, -0.1, 0, Math.PI*2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#A5D6A7';
  ctx.beginPath();
  ctx.ellipse(d.x + d.w*0.45, d.y + d.h*0.65, d.w*0.28, d.h*0.24, 0, 0, Math.PI*2);
  ctx.fill();

  // Legs
  ctx.fillStyle = '#2E7D32'; ctx.lineWidth = 0;
  // Back leg
  ctx.fillRect(d.x + d.w*0.15, d.y + d.h*0.7,  16, 30 + legOff);
  ctx.fillRect(d.x + d.w*0.12, d.y + d.h + legOff - 5, 22, 12);
  // Front leg
  ctx.fillRect(d.x + d.w*0.5,  d.y + d.h*0.75, 14, 25 - legOff);
  ctx.fillRect(d.x + d.w*0.48, d.y + d.h - legOff,     20, 12);

  // Neck + Head
  ctx.fillStyle = charging ? '#FF5252' : '#388E3C';
  ctx.beginPath();
  ctx.moveTo(d.x + d.w*0.5, d.y + d.h*0.3);
  ctx.quadraticCurveTo(d.x + d.w*0.7, d.y + d.h*0.1, d.x + d.w*0.88, d.y + d.h*0.18);
  ctx.quadraticCurveTo(d.x + d.w*0.95, d.y + d.h*0.08, d.x + d.w*0.85, d.y + d.h*0.05);
  ctx.quadraticCurveTo(d.x + d.w*0.55, d.y - 5,        d.x + d.w*0.48, d.y + d.h*0.3);
  ctx.fill();

  // Head box
  ctx.fillStyle = charging ? '#FF1744' : '#43A047';
  ctx.beginPath();
  ctx.roundRect(d.x + d.w*0.62, d.y - 8, d.w*0.42, d.h*0.35, 6);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#FFF700';
  ctx.beginPath(); ctx.arc(d.x + d.w*0.88, d.y + 8, 6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(d.x + d.w*0.89, d.y + 8, 3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(d.x + d.w*0.905, d.y + 6, 1.5, 0, Math.PI*2); ctx.fill();

  // Teeth / mouth
  ctx.fillStyle = '#FFF';
  const mouthOpen = charging ? 14 : 6;
  ctx.fillRect(d.x + d.w*0.88, d.y + d.h*0.22, d.w*0.14, mouthOpen);
  ctx.fillStyle = '#FF1744';
  ctx.fillRect(d.x + d.w*0.89, d.y + d.h*0.22 + 1, d.w*0.12, mouthOpen - 3);
  // Teeth spikes
  ctx.fillStyle = '#FFF';
  for (let i=0; i<3; i++) {
    ctx.beginPath();
    const tx = d.x + d.w*0.89 + i * 5;
    ctx.moveTo(tx, d.y + d.h*0.22);
    ctx.lineTo(tx + 2.5, d.y + d.h*0.22 + 4);
    ctx.lineTo(tx + 5, d.y + d.h*0.22);
    ctx.fill();
  }

  // Spikes on back
  ctx.fillStyle = '#1B5E20';
  for (let i=0; i<5; i++) {
    const sx = d.x + d.w*0.3 + i*12;
    const sy = d.y + d.h*0.28 - i*3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 5, sy - 12 + i*2);
    ctx.lineTo(sx + 10, sy);
    ctx.fill();
  }

  // Charge indicator
  if (charging) {
    ctx.strokeStyle = '#FF1744'; ctx.lineWidth = 2;
    ctx.shadowBlur = 15; ctx.shadowColor = '#FF1744';
    ctx.beginPath(); ctx.arc(d.x + d.w/2, d.y + d.h/2, d.w*0.6, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 14px Courier New';
    ctx.fillStyle = '#FF1744';
    ctx.textAlign = 'center';
    ctx.fillText('⚡CARGA⚡', d.x + d.w/2, d.y - 20);
    ctx.textAlign = 'left';
  }

  ctx.restore();

  // HP bar above dino
  if (dinoHp > 0) {
    const bx = d.x, by = d.y - 35, bw = d.w, bh = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, bw, bh);
    const ratio = dinoHp / dinoMaxHp;
    ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#f44336';
    ctx.fillRect(bx, by, bw * ratio, bh);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
  }
}

function drawParticles() {
  particles.forEach(p => {
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function drawScorePopups() {
  scorePopups.forEach(p => {
    const alpha = Math.min(1, p.life / 30);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font        = 'bold 16px Courier New';
    ctx.fillStyle   = '#FFD700';
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#FFD700';
    ctx.textAlign   = 'center';
    ctx.fillText(p.text, p.x, p.y);
    ctx.restore();
  });
  ctx.textAlign = 'left';
}

function drawDinoHpBar() {
  // Big HP bar on screen top-right area
  const bx = canvas.width - 220, by = 12, bw = 200, bh = 14;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(bx - 5, by - 4, bw + 10, bh + 8);
  const ratio = dinoHp / dinoMaxHp;
  ctx.fillStyle = ratio > 0.5 ? '#4CAF50' : ratio > 0.25 ? '#FF9800' : '#f44336';
  ctx.fillRect(bx, by, bw * ratio, bh);
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.font = '11px Courier New';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(`🦖 ${dinoHp}/${dinoMaxHp}`, bx + bw, by + bh + 14);
  ctx.textAlign = 'left';
}

function drawMenu() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ── Boot ──────────────────────────────────────────────────────
btnStart.addEventListener('click', () => initGame());
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !game.running && !game.over) {
    initGame();
  }
});

// Initial overlay render
drawMenu();
updateUI();
