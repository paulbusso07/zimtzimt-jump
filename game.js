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
  gravity: 1320,
  jumpVelocity: -790,
  horizontalAcceleration: 1850,
  maxHorizontalSpeed: 430,
  horizontalFriction: .88
};
const PLATFORM_CONFIG = {
  minVerticalGap: 78,
  maxVerticalGap: 118,
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
  movingVertical: { speed: 42, amplitude: 34 },
  breakable: { breakDelay: .36 },
  bouncy: { jumpVelocity: -1080 },
  trampoline: { jumpVelocity: -1250, disappearDelay: .28 },
  disappearing: { disappearDelay: .48 }
};
const game = { running: false, paused: false, lastTime: 0, score: 0, altitude: 0, cameraY: 0, platforms: [], particles: [], stars: [], player: null, width: 0, height: 0, audio: null };
const bestScoreKey = 'zimtzimt-jump-best';
const bestScoreEl = document.getElementById('bestScore');
let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
bestScoreEl.textContent = String(bestScore).padStart(5, '0');
// Shared leaderboard: Supabase project URL and publishable (anon) key, schema in supabase/scores.sql.
// While either is empty, scores are only kept in this browser.
const LEADERBOARD_CONFIG = { supabaseUrl: 'https://tenylbmbkcltasmjtzij.supabase.co', supabaseKey: 'sb_publishable_nVIbQbndLXEE6QgXdC7iCQ_AapxPT9a', table: 'scores', size: 10 };
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
function normalizeName(name) { return name.trim().replace(/\s+/g, ' ').slice(0, 16); }
function sameName(first, second) { return first.toLowerCase() === second.toLowerCase(); }
function getPlayerName() { try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch { return ''; } }
function setPlayerName(name) { try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch {} }
function readLocalScores() { try { return JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY)) || []; } catch { return []; } }
async function fetchTopScores() {
  if (!isOnlineLeaderboard()) return readLocalScores().slice(0, LEADERBOARD_CONFIG.size);
  const response = await fetch(`${LEADERBOARD_CONFIG.supabaseUrl}/rest/v1/${LEADERBOARD_CONFIG.table}?select=name,score&order=score.desc,created_at.asc&limit=${LEADERBOARD_CONFIG.size}`, { headers: supabaseHeaders() });
  if (!response.ok) throw new Error(`Leaderboard HTTP ${response.status}`);
  return response.json();
}
// Keeps one entry per player (case-insensitive name) holding their best score; resolves to that best score.
async function saveScore(entry) {
  if (!isOnlineLeaderboard()) {
    const scores = readLocalScores();
    const existing = scores.find(score => sameName(score.name, entry.name));
    if (existing && existing.score >= entry.score) return existing.score;
    const updated = [...scores.filter(score => score !== existing), entry].sort((first, second) => second.score - first.score).slice(0, 50);
    localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(updated));
    return entry.score;
  }
  const response = await fetch(`${LEADERBOARD_CONFIG.supabaseUrl}/rest/v1/rpc/submit_score`, { method: 'POST', headers: supabaseHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ p_name: entry.name, p_score: entry.score, p_altitude: entry.altitude }) });
  if (!response.ok) throw new Error(`Leaderboard HTTP ${response.status}`);
  return response.json();
}
function leaderboardMessage(text) { const item = document.createElement('li'); item.className = 'leaderboard-empty'; item.textContent = text; return item; }
function renderLeaderboard(entries) {
  const playerName = getPlayerName();
  const myIndex = playerName ? entries.findIndex(entry => sameName(entry.name, playerName)) : -1;
  [leaderboardEl, leaderboardMiniEl].forEach(list => {
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
  pendingScore = { score: Math.floor(game.score), altitude: Math.floor(game.altitude) };
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
  const basePlatform = { x: game.width / 2 - 62, y: game.height - 45, width: 124, height: 11, type: 'base', pulse: 0 };
  game.player = { x: game.width / 2 - 17, y: basePlatform.y - 43, width: 34, height: 43, velocityY: PHYSICS.jumpVelocity, velocityX: 0, rotation: 0, squashTimer: 0 };
  game.platforms = [basePlatform];
  game.particles = [];
  generatePlatforms();
  updateHud();
}

function getDifficulty() { return Math.min(game.altitude / 1800, 1); }
function getPlatformWidth() { const difficulty = getDifficulty(); return PLATFORM_CONFIG.minWidth - difficulty * 8 + Math.random() * (PLATFORM_CONFIG.maxWidth - PLATFORM_CONFIG.minWidth - difficulty * 18); }
function getVerticalGap() { const difficulty = getDifficulty(); return PLATFORM_CONFIG.minVerticalGap + difficulty * 8 + Math.random() * (PLATFORM_CONFIG.maxVerticalGap - PLATFORM_CONFIG.minVerticalGap + difficulty * 10); }
function getLandingTime(verticalGap) {
  const jumpSpeed = Math.abs(PHYSICS.jumpVelocity);
  const discriminant = Math.max(0, jumpSpeed * jumpSpeed - 2 * PHYSICS.gravity * verticalGap);
  return (jumpSpeed + Math.sqrt(discriminant)) / PHYSICS.gravity;
}
function wrappedDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, game.width - distance);
}
function isReachable(from, x, y, width) {
  const verticalGap = from.y - y;
  if (verticalGap < 0 || verticalGap > Math.abs(PHYSICS.jumpVelocity) ** 2 / (2 * PHYSICS.gravity)) return false;
  const landingTime = getLandingTime(verticalGap);
  const horizontalReach = PHYSICS.maxHorizontalSpeed * landingTime + width / 2 + from.width / 2;
  return wrappedDistance(from.x + from.width / 2, x + width / 2) <= horizontalReach;
}
function findPlatformX(from, y, width, forbidden) {
  const maxX = Math.max(18, game.width - width - 18);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = 18 + Math.random() * maxX;
    const overlapsForbidden = forbidden && x < forbidden.x + forbidden.width + 18 && x + width + 18 > forbidden.x;
    if (!overlapsForbidden && isReachable(from, x, y, width)) return x;
  }
  const reach = PHYSICS.maxHorizontalSpeed * getLandingTime(Math.max(0, from.y - y));
  const direction = Math.random() < .5 ? -1 : 1;
  return Math.max(18, Math.min(maxX, from.x + direction * Math.min(reach, game.width * .38)));
}
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
    if (index % 3 === 1 || Math.random() < .28) addPlatform(nextY, index + 1000, anchor, primary);
    anchor = primary;
    highest = nextY;
    index += 1;
  }
}

function startGame() {
  requestTiltPermission();
  resizeCanvas(); resetGame(); game.running = true; startScreen.classList.add('hidden'); gameOverScreen.classList.add('hidden'); pauseScreen.classList.add('hidden'); hud.classList.remove('hidden'); canvas.focus(); requestAnimationFrame(loop); playTone(220, .08);
}
function endGame() { game.running = false; hud.classList.add('hidden'); gameOverScreen.classList.remove('hidden'); document.getElementById('finalScore').textContent = String(Math.floor(game.score)).padStart(5, '0'); document.getElementById('finalAltitude').textContent = `${Math.floor(game.altitude)} m`; if (game.score > bestScore) { bestScore = Math.floor(game.score); localStorage.setItem(bestScoreKey, bestScore); bestScoreEl.textContent = String(bestScore).padStart(5, '0'); } openScoreForm(); playTone(110, .2); }
function togglePause() { if (!game.running) return; clearControls(); game.paused = !game.paused; pauseScreen.classList.toggle('hidden', !game.paused); if (!game.paused) { game.lastTime = performance.now(); requestAnimationFrame(loop); } }

function loop(timestamp) {
  if (!game.running || game.paused) return;
  const delta = Math.min((timestamp - (game.lastTime || timestamp)) / 1000, .035); game.lastTime = timestamp;
  update(delta); draw(); requestAnimationFrame(loop);
}
function updateSpecialPlatforms(delta) {
  game.platforms.forEach(platform => {
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
  else player.velocityY = PHYSICS.jumpVelocity;
  if (platform.type === PLATFORM_TYPES.BREAKABLE) platform.breakTimer = SPECIAL_PLATFORM_CONFIG.breakable.breakDelay;
  if (platform.type === PLATFORM_TYPES.DISAPPEARING) { platform.active = false; platform.breakTimer = SPECIAL_PLATFORM_CONFIG.disappearing.disappearDelay; }
  player.squashTimer = .16;
  player.rotation *= .5;
  burst(platform.x + platform.width / 2, platform.y, platform.type);
  playTone(platform.type === PLATFORM_TYPES.BOUNCY || platform.type === PLATFORM_TYPES.TRAMPOLINE ? 520 : 320 + Math.random() * 70, .06);
}
function update(delta) {
  const player = game.player;
  updateSpecialPlatforms(delta);
  player.squashTimer = Math.max(0, player.squashTimer - delta);
  const movingLeft = keys.left === true;
  const movingRight = keys.right === true;
  const inputDirection = movingLeft === movingRight ? 0 : movingLeft ? -1 : 1;
  if (inputDirection) player.velocityX += inputDirection * PHYSICS.horizontalAcceleration * delta;
  else if (tilt.enabled) player.velocityX += (tilt.value * PHYSICS.maxHorizontalSpeed - player.velocityX) * Math.min(1, delta * 14);
  else player.velocityX *= Math.pow(PHYSICS.horizontalFriction, delta * 60);
  player.velocityX = Math.max(-PHYSICS.maxHorizontalSpeed, Math.min(PHYSICS.maxHorizontalSpeed, player.velocityX));
  player.x += player.velocityX * delta;
  if (player.x + player.width < 0) player.x = game.width;
  if (player.x > game.width) player.x = -player.width;
  const previousBottom = player.y + player.height;
  player.velocityY += PHYSICS.gravity * delta;
  player.y += player.velocityY * delta;
  let landedPlatform = null;
  if (player.velocityY > 0) {
    landedPlatform = game.platforms.find(platform => platform.active && !platform.destroyed && previousBottom <= platform.y && player.y + player.height >= platform.y && player.x + player.width - 7 > platform.x && player.x + 7 < platform.x + platform.width);
  }
  if (landedPlatform) {
    handlePlatformLanding(landedPlatform);
  }
  if (player.y < game.height * .45) {
    const shift = game.height * .45 - player.y;
    player.y = game.height * .45;
    game.cameraY += shift;
    game.score += shift * .3;
    game.altitude += shift * .22;
    game.platforms.forEach(platform => { platform.y += shift; if (platform.type === PLATFORM_TYPES.MOVING_VERTICAL) platform.baseY += shift; });
  }
  game.platforms = game.platforms.filter(platform => !platform.destroyed && platform.y < game.height + PLATFORM_CONFIG.removeBelowScreen);
  generatePlatforms();
  game.particles.forEach(particle => { particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.life -= delta; particle.vy += 80 * delta; }); game.particles = game.particles.filter(particle => particle.life > 0);
  player.rotation += player.velocityX * delta * .002;
  if (player.y > game.height + 120) endGame();
  updateHud();
}
function updateHud() { document.getElementById('score').textContent = String(Math.floor(game.score)).padStart(5, '0'); document.getElementById('altitude').textContent = Math.floor(game.altitude); document.getElementById('altitudeBar').style.transform = `scaleX(${Math.min(game.altitude / 900, 1)})`; }
function burst(x, y, type) { const color = type === PLATFORM_TYPES.DISAPPEARING || type === PLATFORM_TYPES.TRAMPOLINE ? '#00ffff' : '#8cff3a'; for (let index = 0; index < 8; index += 1) game.particles.push({ x, y, vx: (Math.random() - .5) * 150, vy: (Math.random() - .8) * 180, life: .3 + Math.random() * .35, color, size: 2 + Math.random() * 3 }); }

function draw() { context.clearRect(0, 0, game.width, game.height); drawBackground(); game.platforms.forEach(drawPlatform); game.particles.forEach(drawParticle); drawPlayer(); }
function drawBackground() {
  const gradient = context.createLinearGradient(0, 0, 0, game.height); gradient.addColorStop(0, '#0b0636'); gradient.addColorStop(1, '#00001a'); context.fillStyle = gradient; context.fillRect(0, 0, game.width, game.height);
  const nebulas = [[.85, .22, 'rgba(140,255,58,.13)', 'rgba(0,0,255,.1)'], [.1, .85, 'rgba(255,0,255,.2)', 'rgba(255,140,0,.08)']];
  nebulas.forEach(([x, y, inner, outer]) => { const glow = context.createRadialGradient(game.width * x, game.height * y, 0, game.width * x, game.height * y, game.width * .75); glow.addColorStop(0, inner); glow.addColorStop(.5, outer); glow.addColorStop(1, 'rgba(0,0,26,0)'); context.fillStyle = glow; context.fillRect(0, 0, game.width, game.height); });
  game.stars.forEach(star => { const y = (star.y + game.cameraY * .08) % game.height; context.globalAlpha = star.alpha; context.fillStyle = star.size > 1 ? '#00ffff' : '#ffffff'; context.fillRect(star.x, y, star.size, star.size); }); context.globalAlpha = 1;
}
function drawPlatform(platform) {
  const { x, y, width } = platform;
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
function drawPlayer() { const player = game.player; const squash = player.squashTimer > 0 ? player.squashTimer / .16 : 0; const scaleX = 1 + squash * .13; const scaleY = 1 - squash * .2; context.save(); context.translate(player.x + player.width / 2, player.y + player.height / 2); context.rotate(player.rotation); context.scale(scaleX, scaleY); context.fillStyle = 'rgba(0,0,0,.3)'; context.beginPath(); context.ellipse(0, 19, 13, 2.5, 0, 0, Math.PI * 2); context.fill(); if (playerSprite) { context.drawImage(playerSprite, -16, -18, 32, 36); } else { context.fillStyle = '#d8f546'; context.beginPath(); context.ellipse(0, -2, 16, 18, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#10141d'; context.beginPath(); context.ellipse(0, 1, 13, 10, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#f1eee5'; context.beginPath(); context.arc(-5, -1, 2.5, 0, Math.PI * 2); context.arc(5, -1, 2.5, 0, Math.PI * 2); context.fill(); } context.restore(); }
function drawParticle(particle) { context.globalAlpha = Math.max(0, particle.life * 2); context.fillStyle = particle.color; context.fillRect(particle.x, particle.y, particle.size, particle.size); context.globalAlpha = 1; }

function playTone(frequency, duration) { if (!document.getElementById('soundToggle').dataset.on) return; if (!game.audio) game.audio = new (window.AudioContext || window.webkitAudioContext)(); const oscillator = game.audio.createOscillator(); const gain = game.audio.createGain(); oscillator.frequency.value = frequency; oscillator.type = 'square'; gain.gain.setValueAtTime(.025, game.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, game.audio.currentTime + duration); oscillator.connect(gain); gain.connect(game.audio.destination); oscillator.start(); oscillator.stop(game.audio.currentTime + duration); }
document.getElementById('soundToggle').dataset.on = 'true'; document.getElementById('soundToggle').addEventListener('click', event => { const on = event.currentTarget.dataset.on === 'true'; event.currentTarget.dataset.on = String(!on); event.currentTarget.textContent = on ? '×' : '♫'; });
document.getElementById('startButton').addEventListener('click', startGame); document.getElementById('restartButton').addEventListener('click', startGame); document.getElementById('pauseButton').addEventListener('click', togglePause);
window.addEventListener('resize', () => { if (!game.running) resizeCanvas(); });
function syncControls() {
  const touchDirections = [...touchPointers.values()];
  keys.left = keyboardKeys.left || touchDirections.includes('left');
  keys.right = keyboardKeys.right || touchDirections.includes('right');
  if (game.player && !keys.left && !keys.right) game.player.velocityX = 0;
}
function handleKeyDown(event) { if (event.target instanceof HTMLInputElement) return; if (event.code === 'ArrowLeft') { keyboardKeys.left = true; syncControls(); event.preventDefault(); } if (event.code === 'ArrowRight') { keyboardKeys.right = true; syncControls(); event.preventDefault(); } if (event.code === 'KeyP') togglePause(); }
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
