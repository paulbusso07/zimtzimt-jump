const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOver');
const pauseScreen = document.getElementById('pauseScreen');
const hud = document.getElementById('hud');
const toast = document.getElementById('toast');
const playerImage = new Image();
playerImage.src = 'https://zimtzimt.com/assets/logos/logo_allos.webp';
const keys = { left: false, right: false };
const keyboardKeys = { left: false, right: false };
const touchPointers = new Map();
const game = { running: false, paused: false, lastTime: 0, score: 0, altitude: 0, stickers: 0, cameraY: 0, platforms: [], collectibles: [], particles: [], stars: [], player: null, width: 0, height: 0, audio: null };
const bestScoreKey = 'zimtzimt-jump-best';
const bestScoreEl = document.getElementById('bestScore');
let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
bestScoreEl.textContent = String(bestScore).padStart(5, '0');

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
  game.score = 0; game.altitude = 0; game.stickers = 0; game.cameraY = 0; game.lastTime = 0; game.paused = false;
  game.player = { x: game.width / 2 - 17, y: game.height - 88, width: 34, height: 43, velocityY: 0, velocityX: 0, rotation: 0 };
  game.platforms = [{ x: game.width / 2 - 62, y: game.height - 45, width: 124, height: 11, type: 'base' }];
  game.collectibles = []; game.particles = [];
  let y = game.height - 165;
  for (let index = 0; index < 28; index += 1) {
    addPlatform(y, index);
    if (index % 4 === 1) addPlatform(y, index + 35);
    y -= 76 + Math.random() * 34;
  }
  updateHud();
}

function addPlatform(y, index) {
  const width = 72 + Math.random() * 53;
  const maxX = Math.max(18, game.width - width - 18);
  const previous = game.platforms[game.platforms.length - 1];
  let x = 18 + Math.random() * maxX;
  if (previous) x = Math.max(12, Math.min(maxX, previous.x + (Math.random() - .5) * 260));
  const types = ['classic', 'tech', 'jelly', 'organic', 'crystal', 'vegetal', 'ice', 'spring'];
  const type = index % 7 === 0 ? 'organic' : types[index % types.length];
  game.platforms.push({ x, y, width, height: 10, type, pulse: Math.random() * 6.28 });
  if (index > 1 && index % 4 === 0) game.collectibles.push({ x: x + width / 2, y: y - 28, collected: false, spin: Math.random() * 6.28, kind: index % 8 === 0 ? 'snow' : 'star' });
}

function startGame() {
  resizeCanvas(); resetGame(); game.running = true; startScreen.classList.add('hidden'); gameOverScreen.classList.add('hidden'); pauseScreen.classList.add('hidden'); hud.classList.remove('hidden'); canvas.focus(); requestAnimationFrame(loop); playTone(220, .08);
}
function endGame() { game.running = false; hud.classList.add('hidden'); gameOverScreen.classList.remove('hidden'); document.getElementById('finalScore').textContent = String(Math.floor(game.score)).padStart(5, '0'); document.getElementById('finalAltitude').textContent = `${Math.floor(game.altitude)} m`; document.getElementById('finalStickers').textContent = game.stickers; if (game.score > bestScore) { bestScore = Math.floor(game.score); localStorage.setItem(bestScoreKey, bestScore); bestScoreEl.textContent = String(bestScore).padStart(5, '0'); } playTone(110, .2); }
function togglePause() { if (!game.running) return; clearControls(); game.paused = !game.paused; pauseScreen.classList.toggle('hidden', !game.paused); if (!game.paused) { game.lastTime = performance.now(); requestAnimationFrame(loop); } }

function loop(timestamp) {
  if (!game.running || game.paused) return;
  const delta = Math.min((timestamp - (game.lastTime || timestamp)) / 1000, .035); game.lastTime = timestamp;
  update(delta); draw(); requestAnimationFrame(loop);
}
function update(delta) {
  const player = game.player; const horizontalSpeed = 650;
  const movingLeft = keys.left === true;
  const movingRight = keys.right === true;
  const horizontalDirection = movingLeft === movingRight ? 0 : movingLeft ? -1 : 1;
  player.velocityX = horizontalDirection * horizontalSpeed;
  player.x += player.velocityX * delta; player.x = (player.x + 5 + game.width + 10) % (game.width + 10) - 5; player.velocityY += 1580 * delta; const previousBottom = player.y + player.height; player.y += player.velocityY * delta;
  if (player.velocityY > 0) game.platforms.forEach(platform => { if (previousBottom <= platform.y && player.y + player.height >= platform.y && player.x + player.width - 7 > platform.x && player.x + 7 < platform.x + platform.width) { player.y = platform.y - player.height; player.velocityY = -690; player.rotation *= .5; burst(platform.x + platform.width / 2, platform.y, platform.type); playTone(320 + Math.random() * 70, .045); } });
  const basePlatform = game.platforms.find(platform => platform.type === 'base');
  if (basePlatform && player.velocityY > 0 && player.y + player.height >= basePlatform.y && player.x + player.width - 7 > basePlatform.x && player.x + 7 < basePlatform.x + basePlatform.width) { player.y = basePlatform.y - player.height; player.velocityY = -690; }
  if (player.y < game.height * .38) { const shift = game.height * .38 - player.y; player.y = game.height * .38; game.cameraY += shift; game.score += shift * .3; game.altitude += shift * .22; game.platforms.forEach(platform => { platform.y += shift; }); game.collectibles.forEach(item => { item.y += shift; }); }
  game.platforms = game.platforms.filter(platform => platform.y < game.height + 30); while (game.platforms.length < 35) { const highest = Math.min(...game.platforms.map(platform => platform.y)); const nextY = game.platforms.length % 4 === 0 ? highest : highest - 76 - Math.random() * 34; addPlatform(nextY, game.platforms.length); }
  game.collectibles.forEach(item => { item.spin += delta * 4; if (!item.collected && Math.abs(player.x + player.width / 2 - item.x) < 24 && Math.abs(player.y + player.height / 2 - item.y) < 29) { item.collected = true; game.stickers += 1; burst(item.x, item.y, 'sticker'); showToast(item.kind === 'snow' ? 'ZINZIN CAPTÉ !' : 'STICKER CAPTÉ !'); playTone(600, .12); } });
  game.collectibles = game.collectibles.filter(item => item.y < game.height + 30 && !item.collected); game.particles.forEach(particle => { particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.life -= delta; particle.vy += 80 * delta; }); game.particles = game.particles.filter(particle => particle.life > 0);
  player.rotation += player.velocityX * delta * .002;
  if (player.y > game.height + 60) {
    if (game.altitude < 200) { player.y = game.height - 88; player.velocityY = -690; }
    else endGame();
  }
  updateHud();
}
function updateHud() { document.getElementById('score').textContent = String(Math.floor(game.score)).padStart(5, '0'); document.getElementById('altitude').textContent = Math.floor(game.altitude); document.getElementById('stickerCount').textContent = game.stickers; document.getElementById('missionProgress').textContent = `${Math.min(game.stickers, 3)}/3`; document.getElementById('missionBar').style.width = `${Math.min(game.stickers / 3 * 100, 100)}%`; document.getElementById('altitudeBar').style.transform = `scaleX(${Math.min(game.altitude / 900, 1)})`; }
function burst(x, y, type) { const color = type === 'coral' ? '#ff6654' : type === 'cyan' ? '#6ee9db' : type === 'sticker' ? '#d8f546' : '#d8f546'; for (let index = 0; index < 8; index += 1) game.particles.push({ x, y, vx: (Math.random() - .5) * 150, vy: (Math.random() - .8) * 180, life: .3 + Math.random() * .35, color, size: 2 + Math.random() * 3 }); }
function showToast(text) { toast.textContent = text; toast.classList.remove('hidden'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.add('hidden'), 1400); }

function draw() { context.clearRect(0, 0, game.width, game.height); drawBackground(); game.platforms.forEach(drawPlatform); game.collectibles.forEach(drawCollectible); game.particles.forEach(drawParticle); drawPlayer(); }
function drawBackground() { const gradient = context.createLinearGradient(0, 0, 0, game.height); gradient.addColorStop(0, '#18253b'); gradient.addColorStop(1, '#10141d'); context.fillStyle = gradient; context.fillRect(0, 0, game.width, game.height); game.stars.forEach(star => { const y = (star.y + game.cameraY * .08) % game.height; context.globalAlpha = star.alpha; context.fillStyle = star.size > 1 ? '#d8f546' : '#f1eee5'; context.fillRect(star.x, y, star.size, star.size); }); context.globalAlpha = 1; for (let index = 0; index < 4; index += 1) { context.strokeStyle = index === 0 ? 'rgba(110,233,219,.11)' : 'rgba(241,238,229,.045)'; context.lineWidth = index === 0 ? 2 : 1; context.beginPath(); context.arc(game.width * .86, game.height * .25, 80 + index * 23, 0, Math.PI * 2); context.stroke(); } }
function drawPlatform(platform) {
  const { x, y, width } = platform;
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
function drawCollectible(item) { const scale = .75 + Math.abs(Math.sin(item.spin)) * .25; context.save(); context.translate(item.x, item.y); context.rotate(item.spin * .25); context.scale(scale, scale); context.fillStyle = item.kind === 'snow' ? '#d9c7ff' : '#d8f546'; context.beginPath(); for (let index = 0; index < 8; index += 1) { const radius = index % 2 ? 5 : 13; const angle = -Math.PI / 2 + index * Math.PI / 4; context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); } context.closePath(); context.fill(); context.fillStyle = '#10141d'; context.font = '12px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(item.kind === 'snow' ? '⛄' : '✦', 0, 1); context.restore(); }
function drawPlayer() { const player = game.player; context.save(); context.translate(player.x + player.width / 2, player.y + player.height / 2); context.rotate(player.rotation); context.fillStyle = 'rgba(0,0,0,.3)'; context.beginPath(); context.ellipse(0, 23, 19, 4, 0, 0, Math.PI * 2); context.fill(); if (playerImage.complete && playerImage.naturalWidth > 0) { context.drawImage(playerImage, -25, -29, 50, 58); } else { context.fillStyle = '#d8f546'; context.beginPath(); context.ellipse(0, -2, 16, 18, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#10141d'; context.beginPath(); context.ellipse(0, 1, 13, 10, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#f1eee5'; context.beginPath(); context.arc(-5, -1, 2.5, 0, Math.PI * 2); context.arc(5, -1, 2.5, 0, Math.PI * 2); context.fill(); } context.restore(); }
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
function handleKeyDown(event) { if (event.code === 'ArrowLeft') { keyboardKeys.left = true; syncControls(); event.preventDefault(); } if (event.code === 'ArrowRight') { keyboardKeys.right = true; syncControls(); event.preventDefault(); } if (event.code === 'KeyP') togglePause(); }
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
resizeCanvas();
