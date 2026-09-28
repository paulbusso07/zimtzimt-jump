const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOver');
const pauseScreen = document.getElementById('pauseScreen');
const hud = document.getElementById('hud');
const playerImage = new Image();
let playerSprite = null;
playerImage.onload = () => {
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d');
  const crop = { x: Math.floor(playerImage.naturalWidth * .25), y: Math.floor(playerImage.naturalHeight * .28), width: Math.floor(playerImage.naturalWidth * .58), height: Math.floor(playerImage.naturalHeight * .64) };
  sourceCanvas.width = crop.width;
  sourceCanvas.height = crop.height;
  sourceContext.drawImage(playerImage, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  const imageData = sourceContext.getImageData(0, 0, crop.width, crop.height);
  const foreground = new Uint8Array(crop.width * crop.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index]; const green = imageData.data[index + 1]; const blue = imageData.data[index + 2];
    const pixel = index / 4; const x = pixel % crop.width + crop.x; const y = Math.floor(pixel / crop.width) + crop.y;
    const brightest = Math.max(red, green, blue); const darkest = Math.min(red, green, blue);
    const cordPixel = x < playerImage.naturalWidth * .4 && y < playerImage.naturalHeight * .72 && red > green * 1.15 && red > blue * 1.1;
    const isBrightColor = !cordPixel && brightest > 48 && brightest - darkest > 24;
    if (isBrightColor) foreground[pixel] = 1;
    imageData.data[index + 3] = isBrightColor ? 255 : 0;
  }
  for (let index = 0; index < foreground.length; index += 1) {
    if (foreground[index]) continue;
    const x = index % crop.width; const y = Math.floor(index / crop.width); let nearForeground = false;
    for (let offsetY = -3; offsetY <= 3 && !nearForeground; offsetY += 1) for (let offsetX = -3; offsetX <= 3; offsetX += 1) {
      const neighborX = x + offsetX; const neighborY = y + offsetY;
      if (neighborX >= 0 && neighborX < crop.width && neighborY >= 0 && neighborY < crop.height && foreground[neighborY * crop.width + neighborX]) { nearForeground = true; break; }
    }
    if (nearForeground) imageData.data[index * 4 + 3] = 255;
  }
  sourceContext.putImageData(imageData, 0, 0);
  playerSprite = sourceCanvas;
};
playerImage.src = 'zinzin2.jpeg';
const platformImage = new Image();
let platformSprite = null;
platformImage.onload = () => {
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d');
  sourceCanvas.width = platformImage.naturalWidth;
  sourceCanvas.height = platformImage.naturalHeight;
  sourceContext.drawImage(platformImage, 0, 0);
  const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  let minX = sourceCanvas.width; let minY = sourceCanvas.height; let maxX = 0; let maxY = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index]; const green = imageData.data[index + 1]; const blue = imageData.data[index + 2];
    if (red > 235 && green > 235 && blue > 235) imageData.data[index + 3] = 0;
    else { const pixel = index / 4; const x = pixel % sourceCanvas.width; const y = Math.floor(pixel / sourceCanvas.width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  sourceContext.putImageData(imageData, 0, 0);
  platformSprite = document.createElement('canvas');
  platformSprite.width = maxX - minX + 1; platformSprite.height = maxY - minY + 1;
  platformSprite.getContext('2d').drawImage(sourceCanvas, minX, minY, platformSprite.width, platformSprite.height, 0, 0, platformSprite.width, platformSprite.height);
};
platformImage.src = 'palteforme.jpeg';
const specialPlatformSprites = {};
// Pre-cut sprites (sprites/*.png) are trimmed to the platform width; surfaceOffset = pixels of effects above the walkable surface.
const SPECIAL_SPRITE_SURFACE_OFFSET = { disappearing: 10 };
['moving', 'movingVertical', 'breakable', 'disappearing', 'small', 'bouncy', 'trampoline'].forEach(type => {
  const image = new Image();
  image.onload = () => { specialPlatformSprites[type] = image; };
  image.src = `sprites/${type}.png`;
});
const keys = { left: false, right: false };
const keyboardKeys = { left: false, right: false };
const touchPointers = new Map();
const tilt = { enabled: false, value: 0 };
const TILT_CONFIG = {
  deadZone: 2,
  maxAngle: 22,
  smoothing: .3
};
const PHYSICS = {
  // Doodle Jump-like arc: ~165px high, ~0.55s to the apex.
  gravity: 1090,
  jumpVelocity: -600,
  // Doodle Jump-like keyboard feel: ramp up to full speed, keep sliding after release.
  horizontalAcceleration: 680,
  turnAcceleration: 1250,
  maxHorizontalSpeed: 340,
  horizontalFriction: .945
};
// Measured on the cut-out sprite: feet span x 4..26 of the 34px hitbox, and the 36px-tall sprite's
// soles sit 34px below its top, so drawing it 34px above the hitbox bottom puts the feet on the landing line.
const PLAYER_FEET = { left: 4, right: 26 };
const PLAYER_SPRITE_FEET = 34;
const LANDING_TOLERANCE = 1;
// Gaps stay at roughly 35-60% of the jump height so every jump keeps some margin.
const PLATFORM_CONFIG = {
  minVerticalGap: 56,
  maxVerticalGap: 84,
  minWidth: 66,
  maxWidth: 112,
  keepAboveScreen: 1.35,
  removeBelowScreen: 140
};
const PLATFORM_TYPES = {
  NORMAL: 'normal',
  MOVING: 'moving',
  MOVING_VERTICAL: 'movingVertical',
  BREAKABLE: 'breakable',
  BOUNCY: 'bouncy',
  DISAPPEARING: 'disappearing',
  SMALL: 'small',
  TRAMPOLINE: 'trampoline'
};
const PLATFORM_SPAWN_CHANCES = {
  normal: .42,
  moving: .12,
  movingVertical: .05,
  breakable: .07,
  bouncy: .06,
  disappearing: .05,
  small: .04,
  trampoline: .03
};
const SPECIAL_PLATFORM_CONFIG = {
  moving: { speed: 82 },
  movingVertical: { speed: 34, amplitude: 24 },
  breakable: { breakDelay: .36 },
  bouncy: { jumpVelocity: -825 },
  trampoline: { jumpVelocity: -950, disappearDelay: .28 },
  disappearing: { disappearDelay: .48 }
};
const MONSTER_TYPES = { CLASSIC: 'classic', JUMPER: 'jumper', FLYING: 'flying' };
const MONSTER_CONFIG = {
  startAltitude: 150,
  minSpacing: 520,
  spawnChance: { min: .05, max: .12 },
  weights: { classic: .45, jumper: .3, flying: .25 },
  flyingFromAltitude: 400,
  // width in px; aspect = sprite height / width; hitbox insets as fractions of the drawn box.
  classic: { width: 46, aspect: .96, hitbox: { x: .16, top: .14, bottom: .04 } },
  jumper: { width: 40, aspect: .99, hitbox: { x: .14, top: .14, bottom: .1 }, hopDelay: [1, 2.2], hopDuration: .7, hopHeight: 64, reach: 170, maxRise: 110 },
  flying: { width: 42, aspect: 1.42, hitbox: { x: .12, top: .06, bottom: .38 }, speed: [55, 95], bob: 6, turnDelay: [1.5, 4] },
  jumperTargets: ['normal', 'moving', 'movingVertical', 'small'],
  stompVelocity: -700
};
// Jetpack power-up: sits on a main-path platform; touching it flies the player up at `speed` for `duration` s.
const JETPACK_CONFIG = { startAltitude: 100, minSpacing: 2400, chance: .03, duration: 2.4, speed: 1150, ramp: 6, width: 28, height: 21, nozzles: [.17, .78] };
// Code-drawn bonuses, placed like the jetpack. Shield: absorbs one monster hit, then `invulnerable` s of safety.
// Springs: the next `jumps` landings launch like a spring platform (without the spring's monster protection).
const ITEM_CONFIG = {
  jetpack: JETPACK_CONFIG,
  shield: { startAltitude: 250, minSpacing: 2600, chance: .04, width: 24, height: 24, invulnerable: 1.2 },
  springs: { startAltitude: 180, minSpacing: 2000, chance: .05, width: 26, height: 20, jumps: 6 }
};
// Black holes can't be shot or stomped: touching the core swallows the player unless a jetpack or spring launch carries
// them through. Platforms keep `clearance` px sideways and `verticalClearance` px up/down away, so a route always exists.
const BLACK_HOLE_CONFIG = { startAltitude: 700, minSpacing: 1700, chance: .07, radius: 24, killRadius: 25, clearance: 34, verticalClearance: 130, pullRadius: 95, pull: 300, swallowDuration: .9 };
// The camera climbs this many metres per pixel scrolled; the score is the altitude.
const ALTITUDE_PER_PIXEL = .22;
// Dashed lines at the player's record and at the top scores on this device, so passing someone shows in the climb.
const MARKER_CONFIG = { leaderboardSize: 10 };
const TOAST_DURATION = { small: 1.4, big: 2.4 };
// Cut out of jetpack.png (flames removed: they're animated in code under the nozzles at `nozzles` × width).
const jetpackSprite = new Image();
jetpackSprite.src = 'sprites/jetpack.png';
// While a fully visible monster (at least `visibleMargin` px below the top edge) is above the player and less
// than `triggerRange` px higher, the player fires straight up every `cooldown` seconds; the balls don't aim,
// so the player has to line up under the monster.
const SHOOT_CONFIG = { triggerRange: 220, visibleMargin: 20, cooldown: .45, speed: 460, radius: 5, life: 2 };
const monsterSprites = {};
Object.values(MONSTER_TYPES).forEach(type => {
  const image = new Image();
  image.onload = () => { monsterSprites[type] = image; };
  image.src = `sprites/monster-${type}.png`;
});
// Seasons only change the look: past `altitude` metres the pyramid art (sprites/pyramids/) replaces the space art.
const PYRAMID_SEASON = {
  altitude: 3000,
  // Pyramid platform art is taller than the space set; its height is squashed by this factor.
  platformSquash: .6,
  player: { height: 44 },
  jetpackNozzles: [.2, .8]
};
const SEASON_TRANSITION = { duration: 3.2, swapAt: .45, streaks: 110 };
function loadImage(src) { const image = new Image(); image.src = src; return image; }
function isImageReady(image) { return Boolean(image && image.complete && image.naturalWidth > 0); }
const pyramidSprites = {
  platforms: Object.fromEntries(['normal', 'moving', 'movingVertical', 'breakable', 'disappearing', 'small', 'bouncy', 'trampoline'].map(type => [type, loadImage(`sprites/pyramids/${type}.png`)])),
  monsters: Object.fromEntries(Object.values(MONSTER_TYPES).map(type => [type, loadImage(`sprites/pyramids/monster-${type}.png`)])),
  player: loadImage('sprites/pyramids/player.png'),
  jetpack: loadImage('sprites/pyramids/jetpack.png')
};
function isPyramidSeason() { return game.season === 'pyramids'; }
function newSandStreak(anywhere) {
  return { x: anywhere ? Math.random() * game.width : -Math.random() * 160, y: Math.random() * game.height, length: 30 + Math.random() * 110, speed: 520 + Math.random() * 760, thickness: 1 + Math.random() * 2.5, alpha: .25 + Math.random() * .55 };
}
function startSeasonTransition() {
  game.seasonTransition = { time: 0, swapped: false, streaks: Array.from({ length: SEASON_TRANSITION.streaks }, () => newSandStreak(true)) };
  playTone(392, .3);
}
// A sandstorm sweeps the screen; the art swaps at its peak (`swapAt`), hidden behind a golden flash.
function updateSeason(delta) {
  if (!game.seasonTransition && !isPyramidSeason() && game.altitude >= PYRAMID_SEASON.altitude) startSeasonTransition();
  const transition = game.seasonTransition;
  if (!transition) return;
  transition.time += delta;
  transition.streaks.forEach(streak => {
    streak.x += streak.speed * delta;
    streak.y += streak.speed * .12 * delta;
    if (streak.x - streak.length > game.width || streak.y > game.height + 20) Object.assign(streak, newSandStreak(false));
  });
  if (!transition.swapped && transition.time >= SEASON_TRANSITION.duration * SEASON_TRANSITION.swapAt) {
    transition.swapped = true;
    game.season = 'pyramids';
    canvasWrap.classList.add('season-pyramids');
    const player = game.player;
    for (let index = 0; index < 36; index += 1) {
      const angle = Math.random() * Math.PI * 2, speed = 80 + Math.random() * 220;
      game.particles.push({ x: player.x + player.width / 2, y: player.y + player.height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .5 + Math.random() * .5, color: Math.random() < .5 ? '#ffd36b' : '#e7ba74', size: 2 + Math.random() * 3 });
    }
    playTone(660, .35);
  }
  if (transition.time >= SEASON_TRANSITION.duration) game.seasonTransition = null;
}
function drawSeasonTransition() {
  const transition = game.seasonTransition;
  if (!transition) return;
  const progress = Math.min(1, transition.time / SEASON_TRANSITION.duration);
  const storm = Math.sin(progress * Math.PI);
  context.save();
  context.fillStyle = `rgba(214,164,98,${.5 * storm})`;
  context.fillRect(0, 0, game.width, game.height);
  context.lineCap = 'round';
  transition.streaks.forEach(streak => {
    context.globalAlpha = streak.alpha * storm;
    context.strokeStyle = '#ffe2a8';
    context.lineWidth = streak.thickness;
    context.beginPath();
    context.moveTo(streak.x - streak.length, streak.y - streak.length * .12);
    context.lineTo(streak.x, streak.y);
    context.stroke();
  });
  const flash = Math.max(0, 1 - Math.abs(progress - SEASON_TRANSITION.swapAt) / .07);
  context.globalAlpha = 1;
  context.fillStyle = `rgba(255,240,200,${.85 * flash})`;
  context.fillRect(0, 0, game.width, game.height);
  const titleIn = Math.min(1, Math.max(0, (progress - .2) / .15));
  const titleOut = Math.min(1, Math.max(0, (.97 - progress) / .15));
  const titleAlpha = Math.min(titleIn, titleOut);
  if (titleAlpha > 0) {
    const centerX = game.width / 2, centerY = game.height * .42;
    const scale = .85 + .15 * (1 - Math.pow(1 - titleIn, 3));
    context.globalAlpha = titleAlpha;
    context.translate(centerX, centerY);
    context.scale(scale, scale);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(255,170,60,.9)';
    context.shadowBlur = 18;
    context.fillStyle = '#5a2a0c';
    context.font = `700 ${Math.round(game.width * .03 + 6)}px Orbitron, sans-serif`;
    context.fillText('S A I S O N   2', 0, -game.width * .1);
    context.font = `${Math.round(game.width * .12)}px 'Sunlight Dreams', serif`;
    context.lineWidth = 6;
    context.strokeStyle = '#7a3e12';
    context.strokeText('Les Pyramides', 0, 0);
    context.fillStyle = '#fff1c4';
    context.fillText('Les Pyramides', 0, 0);
  }
  context.restore();
}
const game = { running: false, paused: false, lastTime: 0, score: 0, altitude: 0, cameraY: 0, platforms: [], particles: [], stars: [], player: null, width: 0, height: 0, audio: null };
const bestScoreKey = 'zimtzimt-jump-best';
const bestScoreEl = document.getElementById('bestScore');
let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
bestScoreEl.textContent = String(bestScore).padStart(5, '0');
// Shared leaderboard: Supabase project URL and publishable (anon) key, schema in supabase/scores.sql.
// While either is empty, scores are only kept in this browser.
const LEADERBOARD_CONFIG = { supabaseUrl: 'https://tenylbmbkcltasmjtzij.supabase.co', supabaseKey: 'sb_publishable_nVIbQbndLXEE6QgXdC7iCQ_AapxPT9a', table: 'scores', size: 10, fullSize: 100 };
const LOCAL_SCORES_KEY = 'zimtzimt-jump-scores';
const PLAYER_NAME_KEY = 'zimtzimt-jump-name';
const leaderboardEl = document.getElementById('leaderboard');
const leaderboardMiniEl = document.getElementById('leaderboardMini');
const leaderboardNoteEl = document.getElementById('leaderboardNote');
const scoreForm = document.getElementById('scoreForm');
const playerNameInput = document.getElementById('playerName');
const saveScoreButton = document.getElementById('saveScoreButton');
const changeNameButton = document.getElementById('changeNameButton');
const scoreStatus = document.getElementById('scoreStatus');
let pendingScore = null;

function isOnlineLeaderboard() { return Boolean(LEADERBOARD_CONFIG.supabaseUrl && LEADERBOARD_CONFIG.supabaseKey); }
function supabaseHeaders(extra = {}) {
  const headers = { apikey: LEADERBOARD_CONFIG.supabaseKey, ...extra };
  // Legacy anon keys are JWTs and also go in Authorization; new publishable keys must not.
  if (LEADERBOARD_CONFIG.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${LEADERBOARD_CONFIG.supabaseKey}`;
  return headers;
}
// Touch-first devices count as mobile; touchscreen laptops keep a fine primary pointer and stay 'pc'.
function getDevice() { return navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches ? 'mobile' : 'pc'; }
// PC and mobile have separate leaderboards; the tabs start on the device being played on.
let leaderboardDevice = getDevice();
function normalizeName(name) { return name.trim().replace(/\s+/g, ' ').slice(0, 16); }
function sameName(first, second) { return first.toLowerCase() === second.toLowerCase(); }
function getPlayerName() { try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch { return ''; } }
function setPlayerName(name) { try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch {} }
function readLocalScores() { try { return JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY)) || []; } catch { return []; } }
async function fetchTopScores(limit = LEADERBOARD_CONFIG.size, device = leaderboardDevice) {
  if (!isOnlineLeaderboard()) return readLocalScores().filter(score => (score.device || 'pc') === device).slice(0, limit);
  const response = await fetch(`${LEADERBOARD_CONFIG.supabaseUrl}/rest/v1/${LEADERBOARD_CONFIG.table}?select=name,score,altitude,device&device=eq.${device}&order=score.desc,created_at.asc&limit=${limit}`, { headers: supabaseHeaders() });
  if (!response.ok) throw new Error(`Leaderboard HTTP ${response.status}`);
  return response.json();
}
// Keeps one entry per player (case-insensitive name) and device holding their best score; resolves to that best score.
async function saveScore(entry) {
  if (!isOnlineLeaderboard()) {
    const scores = readLocalScores();
    const existing = scores.find(score => sameName(score.name, entry.name) && (score.device || 'pc') === entry.device);
    if (existing && existing.score >= entry.score) return existing.score;
    const updated = [...scores.filter(score => score !== existing), entry].sort((first, second) => second.score - first.score).slice(0, 50);
    localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(updated));
    return entry.score;
  }
  const response = await fetch(`${LEADERBOARD_CONFIG.supabaseUrl}/rest/v1/rpc/submit_score`, { method: 'POST', headers: supabaseHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_name: entry.name, p_score: entry.score, p_altitude: entry.altitude, p_device: entry.device }) });
  if (!response.ok) throw new Error(`Leaderboard HTTP ${response.status}`);
  return response.json();
}
function leaderboardMessage(text) { const item = document.createElement('li'); item.className = 'leaderboard-empty'; item.textContent = text; return item; }
function renderLeaderboard(entries, lists = [leaderboardEl, leaderboardMiniEl]) {
  const playerName = getPlayerName();
  const myIndex = playerName ? entries.findIndex(entry => sameName(entry.name, playerName)) : -1;
  lists.forEach(list => {
    if (!entries.length) { list.replaceChildren(leaderboardMessage('Aucun score pour l’instant. À toi de jouer !')); return; }
    list.replaceChildren(...entries.map((entry, index) => {
      const item = document.createElement('li');
      const name = document.createElement('span'); name.className = 'leaderboard-name'; name.textContent = entry.name;
      const score = document.createElement('span'); score.className = 'leaderboard-score'; score.textContent = String(entry.score).padStart(5, '0');
      item.append(name, score);
      if (index === myIndex) item.classList.add('is-me');
      return item;
    }));
  });
  return myIndex;
}
async function refreshLeaderboard() {
  try {
    const myIndex = renderLeaderboard(await fetchTopScores());
    leaderboardNoteEl.textContent = isOnlineLeaderboard() ? '' : 'Classement enregistré sur cet appareil uniquement.';
    return myIndex;
  } catch {
    [leaderboardEl, leaderboardMiniEl].forEach(list => list.replaceChildren(leaderboardMessage('Classement indisponible pour le moment.')));
    return -1;
  }
}
function setScoreStatus(text, kind = '') { scoreStatus.textContent = text; scoreStatus.className = `score-status${kind ? ` is-${kind}` : ''}`; }
function showNameForm(name) {
  scoreForm.hidden = false;
  changeNameButton.hidden = true;
  saveScoreButton.disabled = false;
  playerNameInput.value = name;
  if (matchMedia('(pointer: fine)').matches) playerNameInput.focus();
}
async function submitPendingScore(name) {
  if (!pendingScore) return;
  scoreForm.hidden = true;
  changeNameButton.hidden = true;
  setScoreStatus('Envoi du signal…');
  try {
    const best = await saveScore({ name, ...pendingScore });
    setPlayerName(name);
    setLeaderboardDevice(pendingScore.device);
    const myIndex = await refreshLeaderboard();
    const rank = myIndex >= 0 ? ` · n°${myIndex + 1}` : '';
    setScoreStatus(best > pendingScore.score ? `${name}, ton record reste ${String(best).padStart(5, '0')}${rank}` : `Record enregistré pour ${name}${rank} !`, 'success');
    changeNameButton.hidden = false;
  } catch {
    showNameForm(name);
    setScoreStatus('Impossible d’enregistrer le score. Réessaie.', 'error');
  }
}
function openScoreForm() {
  pendingScore = { score: Math.floor(game.score), altitude: Math.floor(game.altitude), device: getDevice() };
  setScoreStatus('');
  const savedName = getPlayerName();
  if (savedName) submitPendingScore(savedName);
  else showNameForm('');
}
scoreForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = normalizeName(playerNameInput.value);
  if (!name) { setScoreStatus('Entre un nom pour enregistrer ton score.', 'error'); return; }
  saveScoreButton.disabled = true;
  submitPendingScore(name);
});
changeNameButton.addEventListener('click', () => { setScoreStatus(''); showNameForm(''); });
const leaderboardModal = document.getElementById('leaderboardModal');
const leaderboardFullEl = document.getElementById('leaderboardFull');
let pausedForLeaderboard = false;
async function openLeaderboardModal() {
  pausedForLeaderboard = game.running && !game.paused;
  if (pausedForLeaderboard) togglePause();
  leaderboardModal.hidden = false;
  document.getElementById('closeLeaderboardButton').focus();
  loadFullLeaderboard();
}
async function loadFullLeaderboard() {
  leaderboardFullEl.replaceChildren(leaderboardMessage('Chargement…'));
  try {
    const myIndex = renderLeaderboard(await fetchTopScores(LEADERBOARD_CONFIG.fullSize), [leaderboardFullEl]);
    leaderboardFullEl.children[myIndex]?.scrollIntoView({ block: 'center' });
  } catch {
    leaderboardFullEl.replaceChildren(leaderboardMessage('Classement indisponible pour le moment.'));
  }
}
function setLeaderboardDevice(device) {
  leaderboardDevice = device;
  document.querySelectorAll('.device-tabs button').forEach(button => {
    const active = button.dataset.device === device;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
}
document.querySelectorAll('.device-tabs button').forEach(button => button.addEventListener('click', () => {
  setLeaderboardDevice(button.dataset.device);
  refreshLeaderboard();
  if (!leaderboardModal.hidden) loadFullLeaderboard();
}));
function closeLeaderboardModal() {
  if (leaderboardModal.hidden) return;
  leaderboardModal.hidden = true;
  if (pausedForLeaderboard && game.paused) togglePause();
  pausedForLeaderboard = false;
}
document.getElementById('leaderboardButton').addEventListener('click', openLeaderboardModal);
document.getElementById('closeLeaderboardButton').addEventListener('click', closeLeaderboardModal);
leaderboardModal.addEventListener('click', event => { if (event.target === leaderboardModal) closeLeaderboardModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeLeaderboardModal(); });
setLeaderboardDevice(leaderboardDevice);
refreshLeaderboard();
setInterval(() => { if (!game.running) refreshLeaderboard(); }, 60000);

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.floor(bounds.width * ratio);
  canvas.height = Math.floor(bounds.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  game.width = bounds.width;
  game.height = bounds.height;
  game.stars = Array.from({ length: 85 }, (_, index) => ({ x: (index * 97) % game.width, y: (index * 47) % game.height, size: index % 9 === 0 ? 2 : 1, alpha: .2 + (index % 6) / 10 }));
}

function resetGame() {
  clearControls();
  game.score = 0; game.altitude = 0; game.cameraY = 0; game.lastTime = 0; game.paused = false;
  const basePlatform = { x: game.width / 2 - 62, y: game.height - 45, width: 124, height: 11, type: 'base', pulse: 0, active: true, destroyed: false, breakTimer: 0 };
  // Nothing spawns over the player's first bounces, so an idle player keeps hopping on the base platform.
  const jumpHeight = PHYSICS.jumpVelocity ** 2 / (2 * PHYSICS.gravity);
  game.startColumn = { left: game.width / 2 - 25, right: game.width / 2 + 21, top: basePlatform.y - jumpHeight - 12 };
  game.player = { x: game.width / 2 - 17, y: basePlatform.y - 43, width: 34, height: 43, velocityY: PHYSICS.jumpVelocity, velocityX: 0, rotation: 0, squashTimer: 0, shield: false, invulnerable: 0, springJumps: 0, swallowed: null, swallowTime: 0 };
  game.platforms = [basePlatform];
  game.particles = [];
  game.monsters = [];
  game.projectiles = [];
  game.shootCooldown = 0;
  game.firing = false;
  game.items = [];
  game.droppedJetpacks = [];
  game.lastItemWorldY = Object.fromEntries(Object.keys(ITEM_CONFIG).map(kind => [kind, Infinity]));
  game.hazards = [];
  game.lastBlackHoleWorldY = Infinity;
  game.toasts = [];
  game.runId = (game.runId || 0) + 1;
  loadRecordMarkers();
  game.season = 'space';
  game.seasonTransition = null;
  canvasWrap.classList.remove('season-pyramids');
  generatePlatforms();
  updateHud();
}

function getDifficulty() { return Math.min(game.altitude / 1800, 1); }
function getPlatformWidth() { const difficulty = getDifficulty(); return PLATFORM_CONFIG.minWidth - difficulty * 8 + Math.random() * (PLATFORM_CONFIG.maxWidth - PLATFORM_CONFIG.minWidth - difficulty * 18); }
function getVerticalGap() { const difficulty = getDifficulty(); return PLATFORM_CONFIG.minVerticalGap + difficulty * 6 + Math.random() * (PLATFORM_CONFIG.maxVerticalGap - PLATFORM_CONFIG.minVerticalGap + difficulty * 8); }
function getLandingTime(verticalGap) {
  const jumpSpeed = Math.abs(PHYSICS.jumpVelocity);
  const discriminant = Math.max(0, jumpSpeed * jumpSpeed - 2 * PHYSICS.gravity * verticalGap);
  return (jumpSpeed + Math.sqrt(discriminant)) / PHYSICS.gravity;
}
// Distance covered from a standstill in `time`, accounting for the ramp up to full speed.
function getHorizontalReach(time) {
  const rampTime = PHYSICS.maxHorizontalSpeed / PHYSICS.horizontalAcceleration;
  if (time <= rampTime) return PHYSICS.horizontalAcceleration * time * time / 2;
  return PHYSICS.maxHorizontalSpeed * (time - rampTime / 2);
}
function wrappedDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, game.width - distance);
}
function isReachable(from, x, y, width) {
  const verticalGap = from.y - y;
  if (verticalGap < 0 || verticalGap > Math.abs(PHYSICS.jumpVelocity) ** 2 / (2 * PHYSICS.gravity)) return false;
  const landingTime = getLandingTime(verticalGap);
  const horizontalReach = getHorizontalReach(landingTime) + width / 2 + from.width / 2;
  return wrappedDistance(from.x + from.width / 2, x + width / 2) <= horizontalReach;
}
function findPlatformX(from, y, width, forbidden) {
  const maxX = Math.max(18, game.width - width - 18);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = 18 + Math.random() * maxX;
    const overlapsForbidden = forbidden && x < forbidden.x + forbidden.width + 18 && x + width + 18 > forbidden.x;
    if (!overlapsForbidden && !isBlockedSpot(x, y, width) && isReachable(from, x, y, width)) return x;
  }
  const reach = getHorizontalReach(getLandingTime(Math.max(0, from.y - y)));
  const direction = Math.random() < .5 ? -1 : 1;
  const candidates = [direction, -direction].map(side => Math.max(18, Math.min(maxX, from.x + side * Math.min(reach, game.width * .38))));
  return candidates.find(x => !isBlockedSpot(x, y, width)) ?? candidates[0];
}
function isInStartColumn(x, y, width) {
  const column = game.startColumn;
  return game.cameraY === 0 && y > column.top && x < column.right && x + width > column.left;
}
function isBlockedSpot(x, y, width) { return isNearBlackHole(x, y, width) || isInStartColumn(x, y, width); }
function choosePlatformType(onMainPath = false) {
  if (game.altitude < 30) return PLATFORM_TYPES.NORMAL;
  const progression = .4 + .6 * Math.min(1, (game.altitude - 30) / 700);
  // Horizontal movers could drift out of reach, so they never carry the guaranteed path.
  const specialEntries = Object.entries(PLATFORM_SPAWN_CHANCES).filter(([type]) => type !== PLATFORM_TYPES.NORMAL && !(onMainPath && type === PLATFORM_TYPES.MOVING));
  const specialTotal = specialEntries.reduce((sum, [, chance]) => sum + chance * progression, 0);
  let roll = Math.random() * (PLATFORM_SPAWN_CHANCES.normal + specialTotal);
  if (roll < PLATFORM_SPAWN_CHANCES.normal) return PLATFORM_TYPES.NORMAL;
  roll -= PLATFORM_SPAWN_CHANCES.normal;
  for (const [type, chance] of specialEntries) {
    const adjustedChance = chance * progression;
    if (roll < adjustedChance) return type;
    roll -= adjustedChance;
  }
  return PLATFORM_TYPES.NORMAL;
}
function addPlatform(y, index, from, forbidden, onMainPath = false) {
  let width = getPlatformWidth();
  const type = choosePlatformType(onMainPath);
  if (type === PLATFORM_TYPES.SMALL) width *= .68;
  const x = from ? findPlatformX(from, y, width, forbidden) : 18 + Math.random() * Math.max(18, game.width - width - 36);
  const platform = { x, y, width, height: 10, type, pulse: Math.random() * 6.28, velocityX: 0, velocityY: 0, baseY: y, active: true, destroyed: false, breakTimer: 0 };
  if (type === PLATFORM_TYPES.MOVING) platform.velocityX = (Math.random() < .5 ? -1 : 1) * SPECIAL_PLATFORM_CONFIG.moving.speed;
  if (type === PLATFORM_TYPES.MOVING_VERTICAL) platform.velocityY = (Math.random() < .5 ? -1 : 1) * SPECIAL_PLATFORM_CONFIG.movingVertical.speed;
  game.platforms.push(platform);
  return platform;
}
function generatePlatforms() {
  let anchor = game.platforms.reduce((highestPlatform, platform) => platform.y < highestPlatform.y ? platform : highestPlatform, game.platforms[0]);
  let highest = anchor.y;
  let index = 0;
  while (highest > -game.height * PLATFORM_CONFIG.keepAboveScreen) {
    const nextY = highest - getVerticalGap();
    const primary = addPlatform(nextY, index, anchor, null, true);
    maybeSpawnItem(primary);
    if (index % 3 === 1 || Math.random() < .28) addPlatform(nextY, index + 1000, anchor, primary);
    maybeSpawnMonster(nextY);
    maybeSpawnBlackHole(nextY);
    anchor = primary;
    highest = nextY;
    index += 1;
  }
}

function randomBetween([min, max]) { return min + Math.random() * (max - min); }
function chooseMonsterType() {
  const weights = Object.entries(MONSTER_CONFIG.weights).filter(([type]) => type !== MONSTER_TYPES.FLYING || game.altitude >= MONSTER_CONFIG.flyingFromAltitude);
  let roll = Math.random() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [type, weight] of weights) { if (roll < weight) return type; roll -= weight; }
  return MONSTER_TYPES.CLASSIC;
}
function getMonsterAnchorY(monster) { return monster.platform ? monster.platform.y : monster.baseY; }
// Gives a grounded monster its own normal platform on the row, clear of the platforms already there.
function addMonsterPlatform(y) {
  const width = 84;
  const rowPlatforms = game.platforms.filter(platform => Math.abs(platform.y - y) < 24);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = 18 + Math.random() * Math.max(0, game.width - width - 36);
    if (!isNearBlackHole(x, y, width) && rowPlatforms.every(platform => x + width + 26 < platform.x || x > platform.x + platform.width + 26)) {
      const platform = { x, y, width, height: 10, type: PLATFORM_TYPES.NORMAL, pulse: 0, velocityX: 0, velocityY: 0, baseY: y, active: true, destroyed: false, breakTimer: 0 };
      game.platforms.push(platform);
      return platform;
    }
  }
  return null;
}
function maybeSpawnMonster(y) {
  if (game.altitude < MONSTER_CONFIG.startAltitude) return;
  if (game.monsters.some(monster => Math.abs(getMonsterAnchorY(monster) - y) < MONSTER_CONFIG.minSpacing)) return;
  const { min, max } = MONSTER_CONFIG.spawnChance;
  if (Math.random() >= min + (max - min) * getDifficulty()) return;
  const type = chooseMonsterType();
  const config = MONSTER_CONFIG[type];
  const monster = { type, width: config.width, height: config.width * getMonsterAspect(type), x: 0, y: 0, alive: true, platform: null, hop: null, hopTimer: randomBetween(MONSTER_CONFIG.jumper.hopDelay), velocityX: 0, baseY: 0, phase: Math.random() * 6.28, turnTimer: 0, rotation: 0, velocityY: 0 };
  if (type === MONSTER_TYPES.FLYING) {
    monster.baseY = y - 40;
    monster.x = 18 + Math.random() * (game.width - monster.width - 36);
    monster.velocityX = (Math.random() < .5 ? -1 : 1) * randomBetween(config.speed);
    monster.turnTimer = randomBetween(config.turnDelay);
  } else {
    monster.platform = addMonsterPlatform(y);
    if (!monster.platform) return;
  }
  placeMonster(monster);
  game.monsters.push(monster);
}
function platformCenter(platform) { return platform.x + platform.width / 2; }
function placeMonster(monster) {
  if (monster.type === MONSTER_TYPES.FLYING) { monster.y = monster.baseY + Math.sin(monster.phase) * MONSTER_CONFIG.flying.bob; return; }
  let centerX = platformCenter(monster.platform);
  let bottom = monster.platform.y + 2;
  if (monster.hop) {
    const { from, to, t } = monster.hop;
    centerX = platformCenter(from) + (platformCenter(to) - platformCenter(from)) * t;
    bottom = from.y + (to.y - from.y) * t + 2 - MONSTER_CONFIG.jumper.hopHeight * 4 * t * (1 - t);
  }
  monster.x = centerX - monster.width / 2;
  monster.y = bottom - monster.height;
}
function isPlatformFree(platform, except) { return !game.monsters.some(monster => monster !== except && monster.alive && (monster.platform === platform || monster.hop?.to === platform)); }
function startJumperHop(monster) {
  const config = MONSTER_CONFIG.jumper;
  const from = monster.platform;
  const targets = game.platforms.filter(platform => platform !== from && platform.active && !platform.destroyed && MONSTER_CONFIG.jumperTargets.includes(platform.type)
    && Math.abs(platformCenter(platform) - platformCenter(from)) <= config.reach && from.y - platform.y <= config.maxRise && platform.y - from.y <= config.maxRise && isPlatformFree(platform, monster));
  if (!targets.length) return;
  monster.hop = { from, to: targets[Math.floor(Math.random() * targets.length)], t: 0 };
}
function updateMonsters(delta) {
  game.monsters.forEach(monster => {
    if (!monster.alive) {
      monster.velocityY += PHYSICS.gravity * delta;
      monster.y += monster.velocityY * delta;
      monster.rotation += delta * 6;
      return;
    }
    if (monster.type === MONSTER_TYPES.FLYING) {
      const config = MONSTER_CONFIG.flying;
      monster.phase += delta * 3;
      monster.x += monster.velocityX * delta;
      monster.turnTimer -= delta;
      if (monster.turnTimer <= 0) { monster.velocityX *= -1; monster.turnTimer = randomBetween(config.turnDelay); }
      if (monster.x < 8 || monster.x + monster.width > game.width - 8) { monster.x = Math.max(8, Math.min(game.width - 8 - monster.width, monster.x)); monster.velocityX = -monster.velocityX; }
    } else {
      if (monster.platform.destroyed || !monster.platform.active) { monster.alive = false; monster.velocityY = 0; return; }
      if (monster.type === MONSTER_TYPES.JUMPER) {
        if (monster.hop) {
          if (monster.hop.to.destroyed || !monster.hop.to.active) monster.hop = null;
          else {
            monster.hop.t += delta / MONSTER_CONFIG.jumper.hopDuration;
            if (monster.hop.t >= 1) { monster.platform = monster.hop.to; monster.hop = null; monster.hopTimer = randomBetween(MONSTER_CONFIG.jumper.hopDelay); }
          }
        } else if ((monster.hopTimer -= delta) <= 0) {
          monster.hopTimer = randomBetween(MONSTER_CONFIG.jumper.hopDelay);
          startJumperHop(monster);
        }
      }
    }
    placeMonster(monster);
  });
  game.monsters = game.monsters.filter(monster => monster.y < game.height + PLATFORM_CONFIG.removeBelowScreen);
}
function getMonsterHitbox(monster) {
  const { hitbox } = MONSTER_CONFIG[monster.type];
  return { left: monster.x + monster.width * hitbox.x, right: monster.x + monster.width * (1 - hitbox.x), top: monster.y + monster.height * hitbox.top, bottom: monster.y + monster.height * (1 - hitbox.bottom) };
}
function killMonster(monster) {
  const box = getMonsterHitbox(monster);
  monster.alive = false;
  monster.velocityY = -120;
  burst(box.left + (box.right - box.left) / 2, box.top, 'monster');
  playTone(640, .1);
}
function monsterCenter(monster) { return { x: monster.x + monster.width / 2, y: monster.y + monster.height / 2 }; }
function updateShooting(delta) {
  const player = game.player;
  player.shootTimer = Math.max(0, (player.shootTimer || 0) - delta);
  const origin = { x: player.x + player.width / 2, y: player.y + 10 };
  // Start when a visible monster comes within range; keep going while one stays on screen above the feet,
  // so the player's own bouncing doesn't chop the rhythm.
  const startsFiring = game.monsters.some(monster => {
    if (!monster.alive || monster.y < SHOOT_CONFIG.visibleMargin) return false;
    const height = origin.y - monsterCenter(monster).y;
    return height > 0 && height < SHOOT_CONFIG.triggerRange;
  });
  const keepsFiring = game.firing && game.monsters.some(monster => monster.alive && monster.y + monster.height > 0 && monsterCenter(monster).y < player.y + player.height);
  const wasFiring = game.firing;
  game.firing = !player.dead && (startsFiring || keepsFiring);
  if (!game.firing) game.shootCooldown = 0;
  else {
    if (!wasFiring) game.shootCooldown = 0;
    game.shootCooldown -= delta;
    // Fixed cadence: carry the leftover time over so frame jitter doesn't drift the rhythm.
    while (game.shootCooldown <= 0) {
      game.projectiles.push({ x: origin.x, y: origin.y, velocityX: 0, velocityY: -SHOOT_CONFIG.speed, life: SHOOT_CONFIG.life });
      game.shootCooldown += SHOOT_CONFIG.cooldown;
      player.shootTimer = .12;
      playTone(880, .04);
    }
  }
  game.projectiles.forEach(projectile => {
    projectile.x += projectile.velocityX * delta;
    projectile.y += projectile.velocityY * delta;
    projectile.life -= delta;
    const hit = game.monsters.find(monster => {
      if (!monster.alive || monster.y + monster.height < 0) return false;
      const box = getMonsterHitbox(monster);
      return projectile.x + SHOOT_CONFIG.radius > box.left && projectile.x - SHOOT_CONFIG.radius < box.right && projectile.y + SHOOT_CONFIG.radius > box.top && projectile.y - SHOOT_CONFIG.radius < box.bottom;
    });
    if (hit) { killMonster(hit); projectile.life = 0; }
  });
  game.projectiles = game.projectiles.filter(projectile => projectile.life > 0 && projectile.x > -20 && projectile.x < game.width + 20 && projectile.y > -20 && projectile.y < game.height + 20);
}
function drawProjectile(projectile) {
  context.save();
  context.shadowColor = isPyramidSeason() ? '#ffb347' : '#00ffff';
  context.shadowBlur = 12;
  context.fillStyle = isPyramidSeason() ? '#ffe7a3' : '#b8ffff';
  context.beginPath();
  context.arc(projectile.x, projectile.y, SHOOT_CONFIG.radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
// Landing on a monster from above squashes it; any other contact knocks the player out.
function handleMonsterCollisions(previousBottom) {
  const player = game.player;
  const body = { left: player.x + PLAYER_FEET.left, right: player.x + PLAYER_FEET.right, top: player.y + 8, bottom: player.y + player.height };
  for (const monster of game.monsters) {
    if (!monster.alive) continue;
    const box = getMonsterHitbox(monster);
    if (body.right <= box.left || body.left >= box.right || body.bottom <= box.top || body.top >= box.bottom) continue;
    if (player.velocityY > 0 && previousBottom <= box.top + 10) {
      killMonster(monster);
      player.y = box.top - player.height;
      player.velocityY = MONSTER_CONFIG.stompVelocity;
      player.squashTimer = .16;
    } else if (player.shield) {
      player.shield = false;
      player.invulnerable = ITEM_CONFIG.shield.invulnerable;
      killMonster(monster);
      burst(player.x + player.width / 2, player.y + player.height / 2, 'shield');
      showToast('Bouclier brisé !', { color: '#00ffff' });
      playTone(260, .2);
    } else {
      player.dead = true;
      player.velocityY = Math.min(player.velocityY, -220);
      player.velocityX *= .3;
      clearControls();
      burst(player.x + player.width / 2, player.y + player.height / 2, 'monster');
      playTone(150, .25);
    }
    return;
  }
}
function getMonsterSprite(type) {
  const pyramid = isPyramidSeason() ? pyramidSprites.monsters[type] : null;
  return isImageReady(pyramid) ? pyramid : monsterSprites[type];
}
function getMonsterAspect(type) {
  const sprite = getMonsterSprite(type);
  return isImageReady(sprite) ? sprite.naturalHeight / sprite.naturalWidth : MONSTER_CONFIG[type].aspect;
}
function drawMonster(monster) {
  const sprite = getMonsterSprite(monster.type);
  context.save();
  context.translate(monster.x + monster.width / 2, monster.y + monster.height / 2);
  if (!monster.alive) { context.rotate(monster.rotation); context.globalAlpha = .8; }
  if (monster.type === MONSTER_TYPES.FLYING && monster.velocityX < 0) context.scale(-1, 1);
  if (monster.hop) { const stretch = 1 + Math.sin(monster.hop.t * Math.PI) * .08; context.scale(1 / stretch, stretch); }
  if (isImageReady(sprite)) {
    // fit inside the hitbox box without stretching, standing on its bottom edge
    const fit = Math.min(monster.width / sprite.naturalWidth, monster.height / sprite.naturalHeight);
    const width = sprite.naturalWidth * fit, height = sprite.naturalHeight * fit;
    context.drawImage(sprite, -width / 2, monster.height / 2 - height, width, height);
  }
  else { context.fillStyle = '#ff00ff'; context.beginPath(); context.arc(0, 0, monster.width / 2, 0, Math.PI * 2); context.fill(); }
  context.restore();
}

function isNearBlackHole(x, y, width) {
  const { radius, clearance, verticalClearance } = BLACK_HOLE_CONFIG;
  return game.hazards.some(hole => Math.abs(hole.y - y) < verticalClearance && x < hole.x + radius + clearance && x + width > hole.x - radius - clearance);
}
// Sits between this row and the next one, in a column no nearby platform uses (later rows avoid it via isNearBlackHole).
function maybeSpawnBlackHole(y) {
  const { startAltitude, minSpacing, chance, radius, clearance, verticalClearance } = BLACK_HOLE_CONFIG;
  if (game.altitude < startAltitude) return;
  const worldY = y - game.cameraY;
  if (game.lastBlackHoleWorldY - worldY < minSpacing || Math.random() >= chance) return;
  const holeY = y - 40;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const x = radius + 12 + Math.random() * Math.max(0, game.width - 2 * (radius + 12));
    const clear = game.platforms.every(platform => Math.abs(platform.y - holeY) >= verticalClearance || platform.x > x + radius + clearance || platform.x + platform.width < x - radius - clearance);
    if (!clear) continue;
    game.hazards.push({ x, y: holeY, spin: Math.random() * 6.28 });
    game.lastBlackHoleWorldY = worldY;
    return;
  }
}
function updateBlackHoles(delta) {
  game.hazards.forEach(hole => { hole.spin += delta * 2.4; });
  game.hazards = game.hazards.filter(hole => hole.y < game.height + PLATFORM_CONFIG.removeBelowScreen);
  const player = game.player;
  if (player.dead || isPlayerProtected()) return;
  const centerX = player.x + player.width / 2, centerY = player.y + player.height / 2;
  for (const hole of game.hazards) {
    const offsetX = hole.x - centerX, distance = Math.hypot(offsetX, hole.y - centerY);
    if (distance < BLACK_HOLE_CONFIG.killRadius) {
      player.dead = true;
      player.swallowed = hole;
      clearControls();
      player.velocityY = 0;
      playTone(90, .6);
      return;
    }
    // A gentle sideways pull: noticeable, but slower than the player's own acceleration so it can be escaped.
    if (distance < BLACK_HOLE_CONFIG.pullRadius) player.velocityX += Math.sign(offsetX) * BLACK_HOLE_CONFIG.pull * (1 - distance / BLACK_HOLE_CONFIG.pullRadius) * delta;
  }
}
// The player spirals into the core, feet first, shrinking as drawPlayer reads swallowTime.
function updateSwallowed(delta) {
  const player = game.player;
  const hole = player.swallowed;
  player.swallowTime += delta;
  hole.spin += delta * 6;
  const pull = Math.min(1, delta * 6);
  player.x += (hole.x - player.width / 2 - player.x) * pull;
  player.y += (hole.y - player.height - player.y) * pull;
  player.rotation += delta * 12;
  updateParticles(delta);
  if (player.swallowTime >= BLACK_HOLE_CONFIG.swallowDuration) endGame();
}
function paintBlackHole(ctx, x, y, radius, spin, pyramids) {
  const [inner, outer] = pyramids ? ['#ffd36b', '#b8612a'] : ['#00ffff', '#ff00ff'];
  ctx.save();
  ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, 0, radius * .5, 0, 0, radius * 2.2);
  halo.addColorStop(0, pyramids ? 'rgba(90,40,10,.85)' : 'rgba(60,0,90,.85)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0, 0, radius * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(-spin);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, radius * .09);
  ctx.globalAlpha = .75;
  for (let arm = 0; arm < 4; arm += 1) {
    ctx.strokeStyle = arm % 2 ? inner : outer;
    ctx.beginPath();
    for (let step = 0; step <= 16; step += 1) { const t = step / 16; const angle = arm * Math.PI / 2 + t * 3; const distance = radius * (1.9 - t * 1.3); ctx.lineTo(Math.cos(angle) * distance, Math.sin(angle) * distance); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = outer;
  ctx.shadowBlur = radius * .6;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(0, 0, radius * .6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = inner;
  ctx.lineWidth = Math.max(1, radius * .07);
  ctx.stroke();
  ctx.restore();
}
function drawBlackHoles() { game.hazards.forEach(hole => paintBlackHole(context, hole.x, hole.y, BLACK_HOLE_CONFIG.radius, hole.spin, isPyramidSeason())); }

function paintShieldBubble(ctx, centerX, centerY, radius, pyramids, crest) {
  const rim = pyramids ? '255,200,90' : '0,255,255';
  ctx.save();
  const fill = ctx.createRadialGradient(centerX - radius * .35, centerY - radius * .35, radius * .1, centerX, centerY, radius);
  fill.addColorStop(0, 'rgba(255,255,255,.5)'); fill.addColorStop(.55, `rgba(${rim},.1)`); fill.addColorStop(1, `rgba(${rim},.35)`);
  ctx.fillStyle = fill;
  ctx.strokeStyle = `rgba(${rim},.9)`;
  ctx.lineWidth = Math.max(1.5, radius * .08);
  ctx.shadowColor = `rgb(${rim})`;
  ctx.shadowBlur = radius * .5;
  ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (crest) {
    const size = radius * .5;
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(${rim},.9)`;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size); ctx.lineTo(centerX + size * .8, centerY - size * .6); ctx.lineTo(centerX + size * .7, centerY + size * .2);
    ctx.quadraticCurveTo(centerX + size * .4, centerY + size * .8, centerX, centerY + size);
    ctx.quadraticCurveTo(centerX - size * .4, centerY + size * .8, centerX - size * .7, centerY + size * .2);
    ctx.lineTo(centerX - size * .8, centerY - size * .6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
// Two coils topped with soles; also drawn under the player's feet while spring jumps remain.
function paintSprings(ctx, x, y, width, height, pyramids) {
  const accent = pyramids ? '#ffb347' : '#ff4dff';
  const soleHeight = height * .3;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  [.27, .73].forEach(ratio => {
    const centerX = x + width * ratio, coilWidth = width * .15, top = y + soleHeight, bottom = y + height;
    ctx.strokeStyle = '#d9e3ff';
    ctx.lineWidth = Math.max(1.3, width * .06);
    ctx.beginPath();
    ctx.moveTo(centerX - coilWidth, bottom);
    for (let turn = 1; turn <= 6; turn += 1) ctx.lineTo(centerX + (turn % 2 ? coilWidth : -coilWidth), bottom - (bottom - top) * turn / 6);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.roundRect(centerX - width * .2, y, width * .4, soleHeight, soleHeight * .45); ctx.fill();
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}
function drawWornShield() {
  const player = game.player;
  if (!player.shield || player.dead) return;
  context.save();
  context.globalAlpha = .55 + Math.sin(performance.now() / 180) * .1;
  paintShieldBubble(context, player.x + player.width / 2, player.y + player.height / 2, 30, isPyramidSeason(), false);
  context.restore();
}
function drawWornSprings() {
  const player = game.player;
  if (!player.springJumps || player.dead) return;
  paintSprings(context, player.x + PLAYER_FEET.left - 2, player.y + player.height - 7, PLAYER_FEET.right - PLAYER_FEET.left + 4, 10, isPyramidSeason());
}

function getJetpackLook() {
  const pyramid = isPyramidSeason() && isImageReady(pyramidSprites.jetpack);
  const image = pyramid ? pyramidSprites.jetpack : jetpackSprite;
  const height = isImageReady(image) ? JETPACK_CONFIG.width * image.naturalHeight / image.naturalWidth : JETPACK_CONFIG.height;
  return { image, height, nozzles: pyramid ? PYRAMID_SEASON.jetpackNozzles : JETPACK_CONFIG.nozzles };
}
// World y (fixed as the camera scrolls) keeps each kind of bonus `minSpacing` apart even after one is used up.
function maybeSpawnItem(platform) {
  if (platform.type !== PLATFORM_TYPES.NORMAL) return;
  const worldY = platform.y - game.cameraY;
  const kind = Object.keys(ITEM_CONFIG).find(kind => {
    const config = ITEM_CONFIG[kind];
    return game.altitude >= config.startAltitude && game.lastItemWorldY[kind] - worldY >= config.minSpacing && Math.random() < config.chance;
  });
  if (!kind) return;
  game.lastItemWorldY[kind] = worldY;
  game.items.push({ kind, platform, offset: (Math.random() - .5) * Math.max(0, platform.width - ITEM_CONFIG[kind].width - 12), phase: Math.random() * 6.28 });
}
function getItemBox(item) {
  const { width, height } = ITEM_CONFIG[item.kind];
  const x = item.platform.x + item.platform.width / 2 + item.offset - width / 2;
  return { x, y: item.platform.y - height + 1, width, height };
}
function pickUpItem(item) {
  const player = game.player;
  game.items = game.items.filter(other => other !== item);
  if (item.kind === 'jetpack') { player.jetpackTime = JETPACK_CONFIG.duration; playTone(300, .3); }
  if (item.kind === 'shield') { player.shield = true; showToast('Bouclier activé', { color: '#00ffff' }); playTone(700, .18); }
  if (item.kind === 'springs') { player.springJumps = ITEM_CONFIG.springs.jumps; showToast(`Chaussures à ressort ×${ITEM_CONFIG.springs.jumps}`, { color: '#ff4dff' }); playTone(480, .18); }
}
function updateItems(delta) {
  const player = game.player;
  game.items = game.items.filter(item => game.platforms.includes(item.platform));
  if (!player.dead) {
    // A jetpack can't be stacked on a running one, nor a shield on a shield; springs just refill.
    const pickedUp = game.items.find(item => {
      if ((item.kind === 'jetpack' && player.jetpackTime) || (item.kind === 'shield' && player.shield)) return false;
      const box = getItemBox(item);
      return player.x + PLAYER_FEET.right > box.x && player.x + PLAYER_FEET.left < box.x + box.width && player.y + player.height > box.y && player.y + 8 < box.y + box.height;
    });
    if (pickedUp) pickUpItem(pickedUp);
  }
  game.items.forEach(item => { item.phase += delta * 4; });
  game.droppedJetpacks.forEach(jetpack => { jetpack.velocityY += PHYSICS.gravity * delta; jetpack.x += jetpack.velocityX * delta; jetpack.y += jetpack.velocityY * delta; jetpack.rotation += delta * 7; });
  game.droppedJetpacks = game.droppedJetpacks.filter(jetpack => jetpack.y < game.height + 60);
}
// Returns true while the jetpack drives the vertical speed (gravity is skipped).
function applyJetpackThrust(delta) {
  const player = game.player;
  if (!player.jetpackTime) return false;
  player.jetpackTime = Math.max(0, player.jetpackTime - delta);
  player.velocityY += (-JETPACK_CONFIG.speed - player.velocityY) * Math.min(1, delta * JETPACK_CONFIG.ramp);
  for (let index = 0; index < 2; index += 1) game.particles.push({ x: player.x - 10 + getJetpackLook().nozzles[Math.random() < .5 ? 0 : 1] * JETPACK_CONFIG.width + (Math.random() - .5) * 4, y: player.y + player.height - 4, vx: (Math.random() - .5) * 60, vy: 180 + Math.random() * 120, life: .25 + Math.random() * .2, color: Math.random() < .5 ? '#ffb347' : '#ff4dff', size: 2 + Math.random() * 3 });
  if (!player.jetpackTime) player.boosted = true;
  if (!player.jetpackTime) game.droppedJetpacks.push({ x: player.x - 10, y: player.y + 12, velocityX: -60 + Math.random() * 120, velocityY: -80, rotation: 0 });
  return true;
}
function drawJetpackFlame(x, y, nozzles) {
  const length = 10 + Math.random() * 8;
  context.save();
  context.shadowColor = '#ff4dff';
  context.shadowBlur = 12;
  nozzles.map(ratio => x + ratio * JETPACK_CONFIG.width).forEach(nozzle => {
    const flame = context.createLinearGradient(0, y, 0, y + length);
    flame.addColorStop(0, '#ffffff'); flame.addColorStop(.35, '#ffb347'); flame.addColorStop(1, 'rgba(255,77,255,0)');
    context.fillStyle = flame;
    context.beginPath(); context.moveTo(nozzle - 3, y); context.lineTo(nozzle + 3, y); context.lineTo(nozzle, y + length); context.closePath(); context.fill();
  });
  context.restore();
}
function drawItems() {
  const look = getJetpackLook();
  const pyramids = isPyramidSeason();
  game.items.forEach(item => {
    const box = getItemBox(item);
    const bob = Math.sin(item.phase) * 1.5;
    if (item.kind === 'shield') { paintShieldBubble(context, box.x + box.width / 2, box.y + box.height / 2 - 3 + bob, box.width / 2, pyramids, true); return; }
    if (item.kind === 'springs') { paintSprings(context, box.x, box.y - 2 + bob, box.width, box.height, pyramids); return; }
    if (!isImageReady(look.image)) return;
    context.save();
    context.shadowColor = isPyramidSeason() ? '#ffd36b' : '#33ffff';
    context.shadowBlur = 10 + Math.sin(item.phase) * 4;
    context.drawImage(look.image, box.x, box.y + box.height - look.height - 2 + Math.sin(item.phase) * 1.5, box.width, look.height);
    context.restore();
  });
  if (isImageReady(look.image)) game.droppedJetpacks.forEach(jetpack => {
    context.save();
    context.translate(jetpack.x + JETPACK_CONFIG.width / 2, jetpack.y + JETPACK_CONFIG.height / 2);
    context.rotate(jetpack.rotation);
    context.globalAlpha = .8;
    context.drawImage(look.image, -JETPACK_CONFIG.width / 2, -look.height / 2, JETPACK_CONFIG.width, look.height);
    context.restore();
  });
}
// A jetpack flight or a spring/trampoline launch makes the player pass through monsters until the apex,
// as does the short grace period after a shield breaks.
function isPlayerProtected() { return Boolean(game.player.jetpackTime || game.player.boosted || game.player.invulnerable > 0); }
function drawShield() {
  if (!isPlayerProtected() || game.player.dead) return;
  const player = game.player;
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;
  const glow = context.createRadialGradient(centerX, centerY, 8, centerX, centerY, 34);
  glow.addColorStop(0, 'rgba(0,255,255,0)');
  glow.addColorStop(.7, 'rgba(0,255,255,.16)');
  glow.addColorStop(1, 'rgba(0,255,255,0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(centerX, centerY, 34, 0, Math.PI * 2);
  context.fill();
}
function drawWornJetpack() {
  const player = game.player;
  if (!player.jetpackTime) return;
  // Strapped to the left of the sprite so it shows past the character's body.
  const x = player.x - 10;
  const y = player.y + 12;
  const look = getJetpackLook();
  drawJetpackFlame(x, y + look.height - 2, look.nozzles);
  if (isImageReady(look.image)) context.drawImage(look.image, x, y, JETPACK_CONFIG.width, look.height);
}

function startGame() {
  requestTiltPermission();
  resizeCanvas(); resetGame(); game.running = true; startScreen.classList.add('hidden'); gameOverScreen.classList.add('hidden'); pauseScreen.classList.add('hidden'); hud.classList.remove('hidden'); canvas.focus(); requestAnimationFrame(loop); playTone(220, .08);
}
function endGame() {
  game.running = false; hud.classList.add('hidden');
  document.getElementById('overReason').textContent = game.player.swallowed ? 'Aspiré par un trou noir' : game.player.dead ? 'Attaqué par un monstre' : 'Signal perdu';
  gameOverScreen.classList.remove('hidden');
  document.getElementById('finalScore').textContent = String(Math.floor(game.score)).padStart(5, '0');
  document.getElementById('finalAltitude').textContent = `${Math.floor(game.altitude)} m`;
  const isNewRecord = bestScore > 0 && Math.floor(game.score) > bestScore;
  document.getElementById('finalScoreLabel').textContent = isNewRecord ? 'Nouveau record !' : 'Score';
  document.getElementById('finalScoreLabel').classList.toggle('is-record', isNewRecord);
  if (game.score > bestScore) { bestScore = Math.floor(game.score); localStorage.setItem(bestScoreKey, bestScore); bestScoreEl.textContent = String(bestScore).padStart(5, '0'); }
  shareButton.textContent = 'Partager';
  openScoreForm(); playTone(110, .2);
}

function loadRecordMarkers() {
  game.markers = bestScore > 0 ? [{ altitude: bestScore, label: 'Ton record', mine: true, passed: false }] : [];
  const runId = game.runId;
  fetchTopScores(MARKER_CONFIG.leaderboardSize, getDevice()).then(entries => {
    if (game.runId !== runId) return;
    const myName = getPlayerName();
    entries.forEach((entry, index) => {
      const altitude = entry.altitude || entry.score;
      if (altitude <= 0 || (myName && sameName(entry.name, myName))) return;
      // Scores already beaten by the time the list arrives shouldn't all pop at once.
      game.markers.push({ altitude, label: `n°${index + 1} ${entry.name}`, name: entry.name, rank: index + 1, passed: game.altitude >= altitude });
    });
  }).catch(() => {});
}
function updateMarkers() {
  game.markers.forEach(marker => {
    if (marker.passed || game.altitude < marker.altitude) return;
    marker.passed = true;
    if (marker.mine) celebrateRecord();
    else if (marker.rank === 1) { showToast('Tu prends la 1re place !', { big: true, color: '#ffd84d' }); playTone(988, .2); }
    else { showToast(`${marker.name} dépassé !`, { color: '#00ffff' }); playTone(740, .1); }
  });
}
function markerScreenY(marker) { return game.height * .45 - (marker.altitude - game.altitude) / ALTITUDE_PER_PIXEL; }
function drawMarkers() {
  game.markers.forEach(marker => {
    const y = markerScreenY(marker);
    if (y < -4 || y > game.height + 4) return;
    const color = marker.mine ? '#ff4dff' : '#00ffff';
    const label = `${marker.label} · ${marker.altitude} m`;
    context.save();
    context.globalAlpha = marker.passed ? .35 : .85;
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.setLineDash([8, 6]);
    context.beginPath(); context.moveTo(0, y); context.lineTo(game.width, y); context.stroke();
    context.setLineDash([]);
    context.font = '700 10px Orbitron, sans-serif';
    context.textAlign = 'right';
    context.textBaseline = 'bottom';
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(0,0,26,.8)';
    context.strokeText(label, game.width - 8, y - 4);
    context.fillStyle = color;
    context.fillText(label, game.width - 8, y - 4);
    context.restore();
  });
}
function celebrateRecord() {
  showToast('NOUVEAU RECORD !', { big: true, color: '#ff4dff' });
  const player = game.player;
  const colors = ['#ff4dff', '#00ffff', '#8cff3a', '#ffd84d'];
  for (let index = 0; index < 40; index += 1) {
    const angle = -Math.PI / 2 + (Math.random() - .5) * 2.4, speed = 160 + Math.random() * 260;
    game.particles.push({ x: player.x + player.width / 2, y: player.y + player.height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .6 + Math.random() * .6, color: colors[index % colors.length], size: 2 + Math.random() * 3 });
  }
  [523, 659, 784, 1047].forEach((frequency, index) => setTimeout(() => playTone(frequency, .14), index * 90));
}
// Toasts queue up so a pickup message never hides the record banner.
function showToast(text, { big = false, color = '#00ffff' } = {}) { game.toasts.push({ text, big, color, time: 0 }); }
function updateToasts(delta) {
  const toast = game.toasts[0];
  if (toast && (toast.time += delta) >= (toast.big ? TOAST_DURATION.big : TOAST_DURATION.small)) game.toasts.shift();
}
function drawToast() {
  const toast = game.toasts[0];
  if (!toast) return;
  const progress = toast.time / (toast.big ? TOAST_DURATION.big : TOAST_DURATION.small);
  const pop = toast.big ? 1 + .35 * Math.max(0, 1 - progress / .12) : 1;
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, progress / .1, (1 - progress) / .2));
  context.translate(game.width / 2, game.height * (toast.big ? .27 : .2));
  context.scale(pop, pop);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = toast.big ? `900 ${Math.round(Math.min(32, game.width * .07))}px Orbitron, sans-serif` : `700 ${Math.round(Math.min(15, game.width * .038))}px Orbitron, sans-serif`;
  context.lineWidth = toast.big ? 6 : 4;
  context.strokeStyle = 'rgba(0,0,26,.85)';
  context.strokeText(toast.text, 0, 0);
  context.shadowColor = toast.color;
  context.shadowBlur = 14;
  context.fillStyle = toast.big ? '#ffffff' : toast.color;
  context.fillText(toast.text, 0, 0);
  context.restore();
}

const shareButton = document.getElementById('shareButton');
async function shareScore() {
  const text = `J'ai atteint ${Math.floor(game.altitude)} m sur Z'imtZ'imt Jump ! Tu peux faire mieux ?`;
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) { await navigator.share({ title: "Z'imtZ'imt Jump", text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    shareButton.textContent = 'Lien copié !';
  } catch (error) {
    if (error.name !== 'AbortError') shareButton.textContent = 'Partage impossible';
  }
}
shareButton.addEventListener('click', shareScore);

// The side-panel guide shows the code-drawn bonuses and the black hole with the same art as in game.
function paintGuideIcons() {
  const painters = {
    shield: ctx => paintShieldBubble(ctx, 40, 26, 22, false, true),
    springs: ctx => paintSprings(ctx, 20, 4, 40, 44, false),
    blackHole: ctx => paintBlackHole(ctx, 40, 26, 11, .6, false)
  };
  document.querySelectorAll('[data-guide-icon]').forEach(image => {
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 80; iconCanvas.height = 52;
    painters[image.dataset.guideIcon](iconCanvas.getContext('2d'));
    image.src = iconCanvas.toDataURL();
  });
}
paintGuideIcons();
function togglePause() { if (!game.running) return; clearControls(); game.paused = !game.paused; pauseScreen.classList.toggle('hidden', !game.paused); if (!game.paused) { game.lastTime = performance.now(); requestAnimationFrame(loop); } }

function loop(timestamp) {
  if (!game.running || game.paused) return;
  const delta = Math.min((timestamp - (game.lastTime || timestamp)) / 1000, .035); game.lastTime = timestamp;
  update(delta); draw(); requestAnimationFrame(loop);
}
function updateSpecialPlatforms(delta) {
  game.platforms.forEach(platform => {
    platform.previousY = platform.y;
    if (platform.type === PLATFORM_TYPES.MOVING) {
      platform.x += platform.velocityX * delta;
      if (platform.x <= 18 || platform.x + platform.width >= game.width - 18) { platform.x = Math.max(18, Math.min(game.width - 18 - platform.width, platform.x)); platform.velocityX *= -1; }
    }
    if (platform.type === PLATFORM_TYPES.MOVING_VERTICAL) {
      platform.y += platform.velocityY * delta;
      if (platform.y <= platform.baseY - SPECIAL_PLATFORM_CONFIG.movingVertical.amplitude || platform.y >= platform.baseY + SPECIAL_PLATFORM_CONFIG.movingVertical.amplitude) { platform.y = Math.max(platform.baseY - SPECIAL_PLATFORM_CONFIG.movingVertical.amplitude, Math.min(platform.baseY + SPECIAL_PLATFORM_CONFIG.movingVertical.amplitude, platform.y)); platform.velocityY *= -1; }
    }
    if (platform.breakTimer > 0) { platform.breakTimer -= delta; if (platform.breakTimer <= 0) platform.destroyed = true; }
  });
}
function handlePlatformLanding(platform) {
  const player = game.player;
  if (!platform.active || platform.destroyed) return;
  player.y = platform.y - player.height;
  if (platform.type === PLATFORM_TYPES.BOUNCY) player.velocityY = SPECIAL_PLATFORM_CONFIG.bouncy.jumpVelocity;
  else if (platform.type === PLATFORM_TYPES.TRAMPOLINE) { player.velocityY = SPECIAL_PLATFORM_CONFIG.trampoline.jumpVelocity; platform.active = false; platform.breakTimer = SPECIAL_PLATFORM_CONFIG.trampoline.disappearDelay; }
  else if (player.springJumps > 0) { player.velocityY = SPECIAL_PLATFORM_CONFIG.bouncy.jumpVelocity; player.springJumps -= 1; }
  else player.velocityY = PHYSICS.jumpVelocity;
  if (platform.type === PLATFORM_TYPES.BREAKABLE) platform.breakTimer = SPECIAL_PLATFORM_CONFIG.breakable.breakDelay;
  if (platform.type === PLATFORM_TYPES.DISAPPEARING) { platform.active = false; platform.breakTimer = SPECIAL_PLATFORM_CONFIG.disappearing.disappearDelay; }
  // Springs and trampolines protect from monsters until the top of the jump.
  player.boosted = platform.type === PLATFORM_TYPES.BOUNCY || platform.type === PLATFORM_TYPES.TRAMPOLINE;
  player.squashTimer = .16;
  player.rotation *= .5;
  burst(platform.x + platform.width / 2, platform.y, platform.type);
  playTone(platform.type === PLATFORM_TYPES.BOUNCY || platform.type === PLATFORM_TYPES.TRAMPOLINE ? 520 : 320 + Math.random() * 70, .06);
}
function update(delta) {
  const player = game.player;
  updateToasts(delta);
  if (player.swallowed) { updateSwallowed(delta); return; }
  updateSpecialPlatforms(delta);
  updateMonsters(delta);
  player.squashTimer = Math.max(0, player.squashTimer - delta);
  player.invulnerable = Math.max(0, player.invulnerable - delta);
  const movingLeft = keys.left === true;
  const movingRight = keys.right === true;
  const inputDirection = player.dead || movingLeft === movingRight ? 0 : movingLeft ? -1 : 1;
  if (inputDirection) player.velocityX += inputDirection * (Math.sign(player.velocityX) === -inputDirection ? PHYSICS.turnAcceleration : PHYSICS.horizontalAcceleration) * delta;
  else if (tilt.enabled && !player.dead) player.velocityX += (tilt.value * PHYSICS.maxHorizontalSpeed - player.velocityX) * Math.min(1, delta * 14);
  else player.velocityX *= Math.pow(PHYSICS.horizontalFriction, delta * 60);
  player.velocityX = Math.max(-PHYSICS.maxHorizontalSpeed, Math.min(PHYSICS.maxHorizontalSpeed, player.velocityX));
  player.x += player.velocityX * delta;
  if (player.x + player.width < 0) player.x = game.width;
  if (player.x > game.width) player.x = -player.width;
  const previousBottom = player.y + player.height;
  if (!applyJetpackThrust(delta)) player.velocityY += PHYSICS.gravity * delta;
  player.y += player.velocityY * delta;
  if (player.boosted && player.velocityY >= 0) player.boosted = false;
  let landedPlatform = null;
  if (player.velocityY > 0 && !player.dead) {
    // Compare against where the platform was last frame so rising platforms can't slip past the feet.
    landedPlatform = game.platforms.find(platform => platform.active && !platform.destroyed && previousBottom <= Math.max(platform.y, platform.previousY ?? platform.y) + LANDING_TOLERANCE && player.y + player.height >= platform.y && player.x + PLAYER_FEET.right > platform.x && player.x + PLAYER_FEET.left < platform.x + platform.width);
  }
  if (landedPlatform) {
    handlePlatformLanding(landedPlatform);
  }
  if (!player.dead && !isPlayerProtected()) handleMonsterCollisions(previousBottom);
  updateBlackHoles(delta);
  updateItems(delta);
  updateShooting(delta);
  if (player.y < game.height * .45 && !player.dead) {
    const shift = game.height * .45 - player.y;
    player.y = game.height * .45;
    game.cameraY += shift;
    game.altitude += shift * ALTITUDE_PER_PIXEL;
    // The score is the altitude reached, in metres.
    game.score = game.altitude;
    game.platforms.forEach(platform => { platform.y += shift; if (platform.type === PLATFORM_TYPES.MOVING_VERTICAL) platform.baseY += shift; });
    game.monsters.forEach(monster => { monster.y += shift; monster.baseY += shift; });
    game.projectiles.forEach(projectile => { projectile.y += shift; });
    game.droppedJetpacks.forEach(jetpack => { jetpack.y += shift; });
    game.hazards.forEach(hole => { hole.y += shift; });
    updateMarkers();
  }
  game.platforms = game.platforms.filter(platform => !platform.destroyed && platform.y < game.height + PLATFORM_CONFIG.removeBelowScreen);
  generatePlatforms();
  updateParticles(delta);
  player.rotation += player.dead ? delta * 5 : player.velocityX * delta * .002;
  updateSeason(delta);
  if (player.y > game.height + 120) endGame();
  updateHud();
}
function updateHud() { document.getElementById('score').textContent = String(Math.floor(game.score)).padStart(5, '0'); document.getElementById('altitude').textContent = Math.floor(game.altitude); document.getElementById('altitudeBar').style.transform = `scaleX(${Math.min(game.altitude / 900, 1)})`; }
function updateParticles(delta) { game.particles.forEach(particle => { particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.life -= delta; particle.vy += 80 * delta; }); game.particles = game.particles.filter(particle => particle.life > 0); }
function burst(x, y, type) { const color = type === 'monster' ? '#ff00ff' : type === 'shield' ? '#b8ffff' : type === PLATFORM_TYPES.DISAPPEARING || type === PLATFORM_TYPES.TRAMPOLINE ? '#00ffff' : '#8cff3a'; for (let index = 0; index < 8; index += 1) game.particles.push({ x, y, vx: (Math.random() - .5) * 150, vy: (Math.random() - .8) * 180, life: .3 + Math.random() * .35, color, size: 2 + Math.random() * 3 }); }

function draw() { context.clearRect(0, 0, game.width, game.height); drawBackground(); drawMarkers(); drawBlackHoles(); game.platforms.forEach(drawPlatform); drawItems(); game.monsters.forEach(drawMonster); game.projectiles.forEach(drawProjectile); game.particles.forEach(drawParticle); drawShield(); drawWornJetpack(); drawWornSprings(); drawPlayer(); drawWornShield(); drawMuzzleFlash(); drawSeasonTransition(); drawToast(); }
function drawMuzzleFlash() {
  const player = game.player;
  if (!player.shootTimer) return;
  context.save();
  context.globalAlpha = player.shootTimer / .12;
  context.shadowColor = '#00ffff';
  context.shadowBlur = 16;
  context.fillStyle = '#e8ffff';
  context.beginPath();
  context.arc(player.x + player.width / 2, player.y + 10, 7, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
// 0 = space, 1 = pyramids; eases across the first part of the season transition.
function getPyramidBlend() {
  const transition = game.seasonTransition;
  if (!transition) return isPyramidSeason() ? 1 : 0;
  const progress = Math.min(1, transition.time / (SEASON_TRANSITION.duration * .6));
  return progress * progress * (3 - 2 * progress);
}
function drawBackground() {
  const blend = getPyramidBlend();
  if (blend < 1) drawSpaceBackground();
  if (blend > 0) { context.save(); context.globalAlpha = blend; drawPyramidBackground(); context.restore(); }
}
// The desert scene is static, so it is painted once per canvas size and reused.
let pyramidBackdrop = null;
function getPyramidBackdrop() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (pyramidBackdrop && pyramidBackdrop.logicalWidth === game.width && pyramidBackdrop.logicalHeight === game.height) return pyramidBackdrop;
  const backdrop = document.createElement('canvas');
  backdrop.width = Math.ceil(game.width * ratio); backdrop.height = Math.ceil(game.height * ratio);
  backdrop.logicalWidth = game.width; backdrop.logicalHeight = game.height;
  const draw = backdrop.getContext('2d'); draw.scale(ratio, ratio);
  const w = game.width, h = game.height, horizon = h * .7;
  const sky = draw.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2d2160'); sky.addColorStop(.45, '#7a4f93'); sky.addColorStop(.8, '#d98f72'); sky.addColorStop(1, '#f4c27f');
  draw.fillStyle = sky; draw.fillRect(0, 0, w, h);
  const sunX = w * .6, sunY = horizon - h * .08;
  const glow = draw.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * .55);
  glow.addColorStop(0, 'rgba(255,236,170,.85)'); glow.addColorStop(.18, 'rgba(255,196,120,.45)'); glow.addColorStop(1, 'rgba(255,160,110,0)');
  draw.fillStyle = glow; draw.fillRect(0, 0, w, h);
  draw.fillStyle = '#fff1c4'; draw.beginPath(); draw.arc(sunX, sunY, w * .07, 0, Math.PI * 2); draw.fill();
  draw.fillStyle = 'rgba(92,60,120,.35)';
  [[.2, .2, .34], [.75, .3, .28], [.45, .12, .22]].forEach(([cx, cy, span]) => { draw.beginPath(); draw.ellipse(w * cx, h * cy, w * span, h * .018, 0, 0, Math.PI * 2); draw.fill(); });
  const pyramid = (cx, base, size, light, shade) => {
    draw.fillStyle = light; draw.beginPath(); draw.moveTo(cx - size, base); draw.lineTo(cx, base - size * .95); draw.lineTo(cx + size * .15, base); draw.closePath(); draw.fill();
    draw.fillStyle = shade; draw.beginPath(); draw.moveTo(cx + size * .15, base); draw.lineTo(cx, base - size * .95); draw.lineTo(cx + size, base); draw.closePath(); draw.fill();
    draw.strokeStyle = 'rgba(60,30,40,.18)'; draw.lineWidth = 1;
    for (let step = 1; step < 7; step += 1) { const y = base - size * .95 * step / 7; const half = size * (1 - step / 7); draw.beginPath(); draw.moveTo(cx - half, y); draw.lineTo(cx + half, y); draw.stroke(); }
  };
  pyramid(w * .18, horizon + 4, w * .2, '#b98a8e', '#8e6679');
  pyramid(w * .82, horizon + 6, w * .16, '#b98a8e', '#8e6679');
  pyramid(w * .5, horizon + 10, w * .3, '#e0ad6c', '#b27a48');
  const dune = (top, color, amplitude, phase) => {
    draw.fillStyle = color; draw.beginPath(); draw.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) draw.lineTo(x, top + Math.sin(x / w * Math.PI * 2 + phase) * amplitude);
    draw.lineTo(w, h); draw.closePath(); draw.fill();
  };
  dune(horizon + 8, '#e7ba74', h * .012, .4);
  dune(horizon + h * .07, '#d6a462', h * .02, 2.1);
  dune(horizon + h * .15, '#c08c50', h * .025, 4.2);
  draw.strokeStyle = 'rgba(110,70,35,.28)'; draw.lineWidth = 1.2;
  for (let row = 0; row < 3; row += 1) {
    const y = h * (.9 + row * .035);
    for (let x = 10 + row * 7; x < w; x += 22) { draw.beginPath(); draw.moveTo(x, y); draw.lineTo(x + 8, y); draw.moveTo(x + 4, y - 4); draw.lineTo(x + 4, y + 4); draw.stroke(); }
  }
  pyramidBackdrop = backdrop;
  return backdrop;
}
function drawPyramidBackground() {
  context.drawImage(getPyramidBackdrop(), 0, 0, game.width, game.height);
  // drifting sand motes scroll with the climb like the stars do in space
  game.stars.forEach(star => { const y = (star.y + game.cameraY * .08) % game.height; context.fillStyle = star.size > 1 ? 'rgba(255,230,170,.8)' : 'rgba(255,248,225,.55)'; context.fillRect(star.x, y, star.size + .5, star.size + .5); });
}
function drawSpaceBackground() {
  const gradient = context.createLinearGradient(0, 0, 0, game.height); gradient.addColorStop(0, '#0b0636'); gradient.addColorStop(1, '#00001a'); context.fillStyle = gradient; context.fillRect(0, 0, game.width, game.height);
  const nebulas = [[.85, .22, 'rgba(140,255,58,.13)', 'rgba(0,0,255,.1)'], [.1, .85, 'rgba(255,0,255,.2)', 'rgba(255,140,0,.08)']];
  nebulas.forEach(([x, y, inner, outer]) => { const glow = context.createRadialGradient(game.width * x, game.height * y, 0, game.width * x, game.height * y, game.width * .75); glow.addColorStop(0, inner); glow.addColorStop(.5, outer); glow.addColorStop(1, 'rgba(0,0,26,0)'); context.fillStyle = glow; context.fillRect(0, 0, game.width, game.height); });
  game.stars.forEach(star => { const y = (star.y + game.cameraY * .08) % game.height; context.globalAlpha = star.alpha; context.fillStyle = star.size > 1 ? '#00ffff' : '#ffffff'; context.fillRect(star.x, y, star.size, star.size); }); context.globalAlpha = 1;
}
function drawPlatform(platform) {
  const { x, y, width } = platform;
  const pyramidSprite = isPyramidSeason() ? pyramidSprites.platforms[platform.type === 'base' ? PLATFORM_TYPES.NORMAL : platform.type] : null;
  if (isImageReady(pyramidSprite)) {
    context.save();
    context.globalAlpha = platform.active ? (platform.breakTimer > 0 ? .45 + Math.abs(Math.sin(platform.breakTimer * 22)) * .55 : 1) : .35;
    // sand-coloured art needs a soft dark halo to stand out against the dunes
    context.shadowColor = 'rgba(70,30,10,.55)';
    context.shadowBlur = 6;
    context.shadowOffsetY = 2;
    context.drawImage(pyramidSprite, x, y - 2, width, width * pyramidSprite.naturalHeight / pyramidSprite.naturalWidth * PYRAMID_SEASON.platformSquash);
    context.restore();
    return;
  }
  const specialSprite = platform.type !== PLATFORM_TYPES.NORMAL && platform.type !== 'base' ? specialPlatformSprites[platform.type] : null;
  if (specialSprite) {
    const scale = width / specialSprite.naturalWidth;
    const surfaceOffset = (SPECIAL_SPRITE_SURFACE_OFFSET[platform.type] || 0) * scale;
    context.save();
    context.globalAlpha = platform.active ? (platform.breakTimer > 0 ? .45 + Math.abs(Math.sin(platform.breakTimer * 22)) * .55 : 1) : .35;
    context.drawImage(specialSprite, x, y - 2 - surfaceOffset, width, specialSprite.naturalHeight * scale);
    if (platform.type === PLATFORM_TYPES.BREAKABLE && platform.breakTimer > 0) {
      context.strokeStyle = '#10141d'; context.lineWidth = 2; context.beginPath(); context.moveTo(x + width * .3, y + 2); context.lineTo(x + width * .42, y + 9); context.lineTo(x + width * .55, y + 3); context.lineTo(x + width * .7, y + 10); context.stroke();
    }
    context.restore();
    return;
  }
  if (platformSprite) {
    context.save();
    context.globalAlpha = .98;
    const platformVisualHeight = width * platformSprite.height / platformSprite.width * .7;
    context.drawImage(platformSprite, x, y - 2, width, platformVisualHeight);
    context.restore();
    return;
  }
  const colors = { classic: '#d8f546', tech: '#6ee9db', jelly: '#d66cff', organic: '#ff6654', crystal: '#b995ff', vegetal: '#55d68b', ice: '#8bdcff', spring: '#f1eee5' };
  const color = colors[platform.type] || colors.classic;
  context.save();
  context.translate(x, y);
  context.fillStyle = 'rgba(0,0,0,.3)';
  context.fillRect(4, 6, width, 8);
  context.fillStyle = color;
  context.strokeStyle = '#10141d';
  context.lineWidth = 2;
  context.beginPath();
  if (platform.type === 'tech') {
    context.roundRect(0, 0, width, 10, 4); context.fill(); context.stroke();
    context.fillStyle = '#10141d';
    for (let index = 12; index < width - 8; index += 18) context.fillRect(index, 3, 7, 3);
  } else if (platform.type === 'jelly') {
    context.moveTo(0, 5); context.quadraticCurveTo(width * .5, -8, width, 5); context.lineTo(width - 5, 10); context.lineTo(width * .78, 18); context.lineTo(width * .62, 10); context.lineTo(width * .45, 17); context.lineTo(width * .3, 10); context.lineTo(8, 16); context.closePath(); context.fill(); context.stroke();
  } else if (platform.type === 'organic') {
    context.moveTo(0, 3); for (let index = 0; index <= 8; index += 1) context.lineTo(width * index / 8, index % 2 ? 0 : 7); context.lineTo(width - 5, 13); context.lineTo(6, 13); context.closePath(); context.fill(); context.stroke();
    context.fillStyle = '#d8f546'; context.fillRect(width * .2, 2, 4, 3); context.fillRect(width * .7, 3, 4, 3);
  } else if (platform.type === 'crystal') {
    context.moveTo(0, 7); context.lineTo(width * .18, -4); context.lineTo(width * .3, 4); context.lineTo(width * .46, -9); context.lineTo(width * .6, 4); context.lineTo(width * .78, -3); context.lineTo(width, 7); context.lineTo(width - 5, 11); context.lineTo(5, 11); context.closePath(); context.fill(); context.stroke();
  } else if (platform.type === 'vegetal') {
    context.roundRect(0, 1, width, 10, 4); context.fill(); context.stroke();
    context.strokeStyle = '#10141d'; context.lineWidth = 1.5;
    for (let index = 12; index < width - 8; index += 20) { context.beginPath(); context.moveTo(index, 2); context.quadraticCurveTo(index - 4, -8, index + 1, -12); context.stroke(); context.fillStyle = '#d8f546'; context.beginPath(); context.arc(index + 1, -12, 3, 0, Math.PI * 2); context.fill(); }
  } else if (platform.type === 'ice') {
    context.moveTo(0, 0); context.lineTo(width, 0); context.lineTo(width - 5, 10); context.lineTo(width * .78, 18); context.lineTo(width * .62, 10); context.lineTo(width * .43, 16); context.lineTo(width * .25, 10); context.lineTo(5, 12); context.closePath(); context.fill(); context.stroke();
  } else if (platform.type === 'spring') {
    context.roundRect(0, 0, width, 9, 4); context.fill(); context.stroke();
    context.strokeStyle = '#ff6654'; context.lineWidth = 2; context.beginPath(); context.moveTo(width * .25, 9); context.bezierCurveTo(width * .12, 17, width * .38, 18, width * .25, 26); context.bezierCurveTo(width * .12, 32, width * .38, 33, width * .25, 39); context.moveTo(width * .75, 9); context.bezierCurveTo(width * .62, 17, width * .88, 18, width * .75, 26); context.bezierCurveTo(width * .62, 32, width * .88, 33, width * .75, 39); context.stroke();
  } else {
    context.roundRect(0, 0, width, 10, 3); context.fill(); context.stroke();
    context.fillStyle = 'rgba(255,255,255,.5)'; context.fillRect(5, 2, width - 10, 2);
  }
  context.restore();
}
function drawPlayer() { const player = game.player; const squash = player.squashTimer > 0 ? player.squashTimer / .16 : 0; const scaleX = 1 + squash * .13; const scaleY = 1 - squash * .2; context.save(); context.translate(player.x + player.width / 2, player.y + player.height); context.rotate(player.rotation); const shrink = player.swallowed ? Math.max(0, 1 - player.swallowTime / BLACK_HOLE_CONFIG.swallowDuration) : 1; context.scale(scaleX * shrink, scaleY * shrink); context.fillStyle = 'rgba(0,0,0,.3)'; context.beginPath(); context.ellipse(0, 0, 13, 2.5, 0, 0, Math.PI * 2); context.fill(); const pyramidPlayer = isPyramidSeason() && isImageReady(pyramidSprites.player) ? pyramidSprites.player : null; if (pyramidPlayer) { const height = PYRAMID_SEASON.player.height; const width = height * pyramidPlayer.naturalWidth / pyramidPlayer.naturalHeight; context.drawImage(pyramidPlayer, -width / 2, -height + 1, width, height); } else if (playerSprite) { context.drawImage(playerSprite, -16, -PLAYER_SPRITE_FEET, 32, 36); } else { context.translate(0, -player.height / 2); context.fillStyle = '#d8f546'; context.beginPath(); context.ellipse(0, -2, 16, 18, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#10141d'; context.beginPath(); context.ellipse(0, 1, 13, 10, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#f1eee5'; context.beginPath(); context.arc(-5, -1, 2.5, 0, Math.PI * 2); context.arc(5, -1, 2.5, 0, Math.PI * 2); context.fill(); } context.restore(); }
function drawParticle(particle) { context.globalAlpha = Math.max(0, particle.life * 2); context.fillStyle = particle.color; context.fillRect(particle.x, particle.y, particle.size, particle.size); context.globalAlpha = 1; }

function playTone(frequency, duration) { if (!game.audio) game.audio = new (window.AudioContext || window.webkitAudioContext)(); const oscillator = game.audio.createOscillator(); const gain = game.audio.createGain(); oscillator.frequency.value = frequency; oscillator.type = 'square'; gain.gain.setValueAtTime(.025, game.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, game.audio.currentTime + duration); oscillator.connect(gain); gain.connect(game.audio.destination); oscillator.start(); oscillator.stop(game.audio.currentTime + duration); }
document.getElementById('startButton').addEventListener('click', startGame); document.getElementById('restartButton').addEventListener('click', startGame); document.getElementById('pauseButton').addEventListener('click', togglePause);
// Mobile toolbars showing/hiding and rotations resize the canvas mid-game; keep its bitmap in step so nothing stretches.
window.addEventListener('resize', () => { resizeCanvas(); if (game.player && (game.paused || !game.running)) draw(); });
function syncControls() {
  const touchDirections = [...touchPointers.values()];
  keys.left = keyboardKeys.left || touchDirections.includes('left');
  keys.right = keyboardKeys.right || touchDirections.includes('right');
}
function handleKeyDown(event) { if (event.target instanceof HTMLInputElement || !leaderboardModal.hidden) return; if (event.code === 'ArrowLeft') { keyboardKeys.left = true; syncControls(); event.preventDefault(); } if (event.code === 'ArrowRight') { keyboardKeys.right = true; syncControls(); event.preventDefault(); } if (event.code === 'KeyP') togglePause(); }
function handleKeyUp(event) { if (event.code === 'ArrowLeft') keyboardKeys.left = false; if (event.code === 'ArrowRight') keyboardKeys.right = false; syncControls(); }
function clearControls() { keyboardKeys.left = false; keyboardKeys.right = false; touchPointers.clear(); keys.left = false; keys.right = false; if (game.player) game.player.velocityX = 0; }
document.addEventListener('keydown', handleKeyDown); document.addEventListener('keyup', handleKeyUp);
window.addEventListener('keyup', handleKeyUp); window.addEventListener('blur', clearControls); window.addEventListener('mouseleave', clearControls);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearControls(); });
canvas.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') return; const midpoint = canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2; touchPointers.set(event.pointerId, event.clientX < midpoint ? 'left' : 'right'); canvas.setPointerCapture(event.pointerId); syncControls(); });
function releasePointer(event) { touchPointers.delete(event.pointerId); syncControls(); }
window.addEventListener('pointerup', releasePointer); window.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointerleave', event => { if (event.pointerType !== 'mouse') { touchPointers.delete(event.pointerId); syncControls(); } });
canvas.addEventListener('lostpointercapture', releasePointer);
function getScreenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? window.orientation : 0;
}
function handleOrientation(event) {
  if (event.gamma === null || event.beta === null) return;
  const screenAngle = (getScreenAngle() + 360) % 360;
  let angle = event.gamma;
  if (screenAngle === 90) angle = event.beta;
  else if (screenAngle === 270) angle = -event.beta;
  else if (screenAngle === 180) angle = -event.gamma;
  const magnitude = Math.max(0, Math.abs(angle) - TILT_CONFIG.deadZone);
  const target = Math.sign(angle) * Math.min(1, magnitude / (TILT_CONFIG.maxAngle - TILT_CONFIG.deadZone));
  tilt.value += (target - tilt.value) * TILT_CONFIG.smoothing;
  if (!tilt.enabled) { tilt.enabled = true; updateControlHint(); }
}
function listenToTilt() { window.removeEventListener('deviceorientation', handleOrientation); window.addEventListener('deviceorientation', handleOrientation); }
function requestTiltPermission() {
  if (typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(state => { if (state === 'granted') listenToTilt(); }).catch(() => {});
  } else listenToTilt();
}
function updateControlHint() {
  const hint = document.querySelector('.control-hint');
  if (tilt.enabled) hint.textContent = 'Incline ton téléphone pour piloter';
  else if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'Touche gauche / droite ou incline ton téléphone';
}
listenToTilt();
updateControlHint();
resizeCanvas();
