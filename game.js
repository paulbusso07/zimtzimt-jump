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
  game.score = 0; game.altitude = 0; game.stickers = 0; game.cameraY = 0; game.lastTime = 0; game.paused = false;
  game.player = { x: game.width / 2 - 17, y: game.height - 88, width: 34, height: 43, velocityY: 0, velocityX: 0, rotation: 0 };
  game.platforms = [{ x: game.width / 2 - 62, y: game.height - 45, width: 124, height: 11, type: 'base' }];
  game.collectibles = []; game.particles = [];
  let y = game.height - 165;
  for (let index = 0; index < 35; index += 1) { addPlatform(y, index); y -= 112 + Math.random() * 46; }
  updateHud();
}

function addPlatform(y, index) {
  const width = 72 + Math.random() * 53;
  const maxX = Math.max(18, game.width - width - 18);
  const previous = game.platforms[game.platforms.length - 1];
  let x = 18 + Math.random() * maxX;
  if (previous) x = Math.max(12, Math.min(maxX, previous.x + (Math.random() - .5) * 260));
  const types = ['lime', 'coral', 'cyan', 'paper'];
  const type = index % 7 === 0 ? 'coral' : types[index % types.length];
  game.platforms.push({ x, y, width, height: 10, type, pulse: Math.random() * 6.28 });
  if (index > 1 && index % 4 === 0) game.collectibles.push({ x: x + width / 2, y: y - 28, collected: false, spin: Math.random() * 6.28, kind: index % 8 === 0 ? 'snow' : 'star' });
}

function startGame() {
  resizeCanvas(); resetGame(); game.running = true; startScreen.classList.add('hidden'); gameOverScreen.classList.add('hidden'); pauseScreen.classList.add('hidden'); hud.classList.remove('hidden'); requestAnimationFrame(loop); playTone(220, .08);
}
function endGame() { game.running = false; hud.classList.add('hidden'); gameOverScreen.classList.remove('hidden'); document.getElementById('finalScore').textContent = String(Math.floor(game.score)).padStart(5, '0'); document.getElementById('finalAltitude').textContent = `${Math.floor(game.altitude)} m`; document.getElementById('finalStickers').textContent = game.stickers; if (game.score > bestScore) { bestScore = Math.floor(game.score); localStorage.setItem(bestScoreKey, bestScore); bestScoreEl.textContent = String(bestScore).padStart(5, '0'); } playTone(110, .2); }
function togglePause() { if (!game.running) return; game.paused = !game.paused; pauseScreen.classList.toggle('hidden', !game.paused); if (!game.paused) { game.lastTime = performance.now(); requestAnimationFrame(loop); } }

function loop(timestamp) {
  if (!game.running || game.paused) return;
  const delta = Math.min((timestamp - (game.lastTime || timestamp)) / 1000, .035); game.lastTime = timestamp;
  update(delta); draw(); requestAnimationFrame(loop);
}
function update(delta) {
  const player = game.player; const horizontalSpeed = 650;
  player.velocityX = keys.left ? -horizontalSpeed : keys.right ? horizontalSpeed : 0;
  player.x += player.velocityX * delta; player.x = (player.x + game.width + 10) % (game.width + 10) - 5; player.velocityY += 1580 * delta; const previousBottom = player.y + player.height; player.y += player.velocityY * delta;
  if (player.velocityY > 0) game.platforms.forEach(platform => { if (previousBottom <= platform.y && player.y + player.height >= platform.y && player.x + player.width - 7 > platform.x && player.x + 7 < platform.x + platform.width) { player.y = platform.y - player.height; player.velocityY = -690; player.rotation *= .5; burst(platform.x + platform.width / 2, platform.y, platform.type); playTone(320 + Math.random() * 70, .045); } });
  const basePlatform = game.platforms.find(platform => platform.type === 'base');
  if (basePlatform && player.velocityY > 0 && player.y + player.height >= basePlatform.y && player.x + player.width - 7 > basePlatform.x && player.x + 7 < basePlatform.x + basePlatform.width) { player.y = basePlatform.y - player.height; player.velocityY = -690; }
  if (player.y < game.height * .38) { const shift = game.height * .38 - player.y; player.y = game.height * .38; game.cameraY += shift; game.score += shift * .3; game.altitude += shift * .22; game.platforms.forEach(platform => { platform.y += shift; }); game.collectibles.forEach(item => { item.y += shift; }); }
  game.platforms = game.platforms.filter(platform => platform.y < game.height + 30); while (game.platforms.length < 35) { const highest = Math.min(...game.platforms.map(platform => platform.y)); addPlatform(highest - 112 - Math.random() * 46, game.platforms.length); }
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
function drawPlatform(platform) { const color = ({ lime: '#d8f546', coral: '#ff6654', cyan: '#6ee9db', paper: '#f1eee5', base: '#d8f546' })[platform.type] || '#d8f546'; context.fillStyle = 'rgba(0,0,0,.28)'; context.fillRect(platform.x + 4, platform.y + 5, platform.width, platform.height); context.fillStyle = color; context.fillRect(platform.x, platform.y, platform.width, platform.height); context.fillStyle = 'rgba(255,255,255,.45)'; context.fillRect(platform.x + 4, platform.y + 2, platform.width - 8, 2); if (platform.type === 'coral') { context.fillStyle = '#10141d'; context.font = '8px Chakra Petch'; context.fillText('Z', platform.x + platform.width / 2 - 2, platform.y - 5); } }
function drawCollectible(item) { const scale = .75 + Math.abs(Math.sin(item.spin)) * .25; context.save(); context.translate(item.x, item.y); context.rotate(item.spin * .25); context.scale(scale, scale); context.fillStyle = item.kind === 'snow' ? '#d9c7ff' : '#d8f546'; context.beginPath(); for (let index = 0; index < 8; index += 1) { const radius = index % 2 ? 5 : 13; const angle = -Math.PI / 2 + index * Math.PI / 4; context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); } context.closePath(); context.fill(); context.fillStyle = '#10141d'; context.font = '12px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(item.kind === 'snow' ? '⛄' : '✦', 0, 1); context.restore(); }
function drawPlayer() { const player = game.player; context.save(); context.translate(player.x + player.width / 2, player.y + player.height / 2); context.rotate(player.rotation); context.fillStyle = 'rgba(0,0,0,.3)'; context.beginPath(); context.ellipse(0, 23, 19, 4, 0, 0, Math.PI * 2); context.fill(); if (playerImage.complete && playerImage.naturalWidth > 0) { context.drawImage(playerImage, -25, -29, 50, 58); } else { context.fillStyle = '#d8f546'; context.beginPath(); context.ellipse(0, -2, 16, 18, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#10141d'; context.beginPath(); context.ellipse(0, 1, 13, 10, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = '#f1eee5'; context.beginPath(); context.arc(-5, -1, 2.5, 0, Math.PI * 2); context.arc(5, -1, 2.5, 0, Math.PI * 2); context.fill(); } context.restore(); }
function drawParticle(particle) { context.globalAlpha = Math.max(0, particle.life * 2); context.fillStyle = particle.color; context.fillRect(particle.x, particle.y, particle.size, particle.size); context.globalAlpha = 1; }

function playTone(frequency, duration) { if (!document.getElementById('soundToggle').dataset.on) return; if (!game.audio) game.audio = new (window.AudioContext || window.webkitAudioContext)(); const oscillator = game.audio.createOscillator(); const gain = game.audio.createGain(); oscillator.frequency.value = frequency; oscillator.type = 'square'; gain.gain.setValueAtTime(.025, game.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, game.audio.currentTime + duration); oscillator.connect(gain); gain.connect(game.audio.destination); oscillator.start(); oscillator.stop(game.audio.currentTime + duration); }
document.getElementById('soundToggle').dataset.on = 'true'; document.getElementById('soundToggle').addEventListener('click', event => { const on = event.currentTarget.dataset.on === 'true'; event.currentTarget.dataset.on = String(!on); event.currentTarget.textContent = on ? '×' : '♫'; });
document.getElementById('startButton').addEventListener('click', startGame); document.getElementById('restartButton').addEventListener('click', startGame); document.getElementById('pauseButton').addEventListener('click', togglePause);
window.addEventListener('resize', () => { if (!game.running) resizeCanvas(); }); window.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { keys.left = true; event.preventDefault(); } if (event.key === 'ArrowRight') { keys.right = true; event.preventDefault(); } if (event.key.toLowerCase() === 'p') togglePause(); }); window.addEventListener('keyup', event => { if (event.key === 'ArrowLeft') keys.left = false; if (event.key === 'ArrowRight') keys.right = false; });
canvas.addEventListener('pointerdown', event => { const midpoint = canvas.getBoundingClientRect().left + canvas.getBoundingClientRect().width / 2; if (event.clientX < midpoint) keys.left = true; else keys.right = true; }); window.addEventListener('pointerup', () => { keys.left = false; keys.right = false; });
resizeCanvas();
