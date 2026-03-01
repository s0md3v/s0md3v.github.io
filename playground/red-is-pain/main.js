import { World } from './modules/World.js';
import { Renderer } from './modules/Renderer.js';
import { Utils } from './modules/Utils.js';
import { AudioController } from './modules/AudioController.js';
import { PlayerInput } from './modules/PlayerInput.js';
import { mapData } from './assets/maps/map.js';

let selectedAgent = null;
let gameMode = 'AI_VS_AI';
let playerInput = null;
const audioController = new AudioController();

const resumeAudio = () => {
    if (audioController.context && audioController.context.state === 'suspended') {
        audioController.context.resume().then(() => {
            console.log("AudioContext resumed successfully.");
        }).catch(err => console.warn("AudioContext resume failed:", err));
    }
};

window.addEventListener('click', resumeAudio, { once: true });
window.addEventListener('keydown', resumeAudio, { once: true });
window.addEventListener('touchstart', resumeAudio, { once: true });

const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');
let world, renderer;
let animationId;

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let isGameOver = false;
let lastTime = performance.now();

// --- MODE SELECTION ---
function startGame(mapData = null) {

    world = new World(canvas.width, canvas.height, audioController, mapData, gameMode);
    renderer = new Renderer(ctx, world);

    // Set game mode on renderer for fog of war
    renderer.gameMode = gameMode;

    // Initial Zoom: Scale to ensure a consistent view regardless of screen resolution
    const zoomX = canvas.width / world.width;
    const zoomY = canvas.height / world.height;
    
    // Fit the map with a small buffer
    const idealZoom = Math.min(zoomX, zoomY) * 0.95;
    renderer.camera.zoom = Math.max(0.2, Math.min(3.0, idealZoom));
    
    renderer.camera.x = world.width / 2;
    renderer.camera.y = world.height / 2;

    // --- HUMAN MODE SETUP ---
    if (gameMode === 'HUMAN' && world.playerAgent) {
        playerInput = new PlayerInput(canvas);
        selectedAgent = world.playerAgent;
        renderer.setSelectedAgent(selectedAgent);

        // Camera starts centered on player
        renderer.camera.x = world.playerAgent.pos.x;
        renderer.camera.y = world.playerAgent.pos.y;
        renderer.camera.zoom = 2.0; // Closer zoom for player mode

        // Initialize fog of war canvas
        renderer.initFogOfWar(world.width, world.height);

        // Show the sidebar in player mode so stats can be viewed there
        const sidebar = document.getElementById('inspector-sidebar');
        if (sidebar) sidebar.style.display = '';

        const humanControls = document.getElementById('human-controls');
        if (humanControls) humanControls.style.display = 'block';
        
        const spaceHint = document.getElementById('empty-space-hint');
        if (spaceHint) spaceHint.style.display = 'block';
    } else {
        playerInput = null;
        const sidebar = document.getElementById('inspector-sidebar');
        if (sidebar) sidebar.style.display = '';
        
        const humanControls = document.getElementById('human-controls');
        if (humanControls) humanControls.style.display = 'none';
        
        const spaceHint = document.getElementById('empty-space-hint');
        if (spaceHint) spaceHint.style.display = 'none';
    }
    
    const updateDebug = () => {
        renderer.debugOptions.showVision = document.getElementById('toggle-vision').checked;
        renderer.debugOptions.showTrust = document.getElementById('toggle-trust').checked;
        renderer.debugOptions.showHeatmap = document.getElementById('toggle-heatmap').checked;
        renderer.debugOptions.showTargets = document.getElementById('toggle-targets').checked;
    };
    
    document.getElementById('toggle-vision').onchange = updateDebug;
    document.getElementById('toggle-trust').onchange = updateDebug;
    document.getElementById('toggle-heatmap').onchange = updateDebug;
    document.getElementById('toggle-targets').onchange = updateDebug;
    updateDebug();

    const menu = document.getElementById('start-menu');
    if (menu) menu.style.display = 'none';

    isGameOver = false;
    lastTime = performance.now();
    loop(lastTime);
}

// --- WAIT FOR USER TO START ---
const startMenu = document.getElementById('start-menu');
if (startMenu) startMenu.style.display = 'flex'; // Show menu on load

document.getElementById('btn-start-ai').onclick = () => {
    gameMode = 'AI_VS_AI';
    startGame(mapData);
};

document.getElementById('btn-start-human').onclick = () => {
    gameMode = 'HUMAN';
    startGame(mapData);
};

document.getElementById('btn-info').onclick = () => {
    document.getElementById('info-modal').style.display = 'flex';
};

document.getElementById('btn-close-info').onclick = () => {
    document.getElementById('info-modal').style.display = 'none';
};

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('mousedown', (e) => {
    if (!renderer) return;
    
    // In HUMAN mode, left click is handled by PlayerInput (shooting)
    if (gameMode === 'HUMAN' && e.button === 0 && !e.altKey) return;

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault();
        return;
    }

    if (!world) return;
    const rect = canvas.getBoundingClientRect();
    
    const screenX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const screenY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    
    const cam = renderer.camera;
    const worldX = (screenX - canvas.width / 2) / cam.zoom + cam.x;
    const worldY = (screenY - canvas.height / 2) / cam.zoom + cam.y;
    
    selectedAgent = world.agents.find(a => Utils.distance(a.pos, { x: worldX, y: worldY }) < a.radius + 15);
    if (renderer) renderer.setSelectedAgent(selectedAgent);
});

// Track mouse position for player aim
canvas.addEventListener('mousemove', (e) => {
    if (isDragging && renderer && gameMode !== 'HUMAN') {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        
        renderer.camera.x -= dx / renderer.camera.zoom;
        renderer.camera.y -= dy / renderer.camera.zoom;
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }

    // Update player aim world position
    if (playerInput && renderer) {
        const rect = canvas.getBoundingClientRect();
        const screenX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const screenY = ((e.clientY - rect.top) / rect.height) * canvas.height;
        const cam = renderer.camera;
        const wx = (screenX - canvas.width / 2) / cam.zoom + cam.x;
        const wy = (screenY - canvas.height / 2) / cam.zoom + cam.y;
        playerInput.setMouseWorldPos(wx, wy);
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

canvas.addEventListener('wheel', (e) => {
    if (!renderer) return;
    e.preventDefault();
    
    const zoomSpeed = 0.002;
    renderer.camera.zoom -= e.deltaY * zoomSpeed;
    renderer.camera.zoom = Math.max(0.1, Math.min(5.0, renderer.camera.zoom));
}, { passive: false });

function updateInspector() {
    if (!world) return;

    const signalPanel = document.getElementById('signal-header');
    const biometricPanel = document.getElementById('biometric-stats');
    const statsHud = document.getElementById('stats-hud');
    const badgeContainer = document.getElementById('status-badges-container');
    const agent = selectedAgent;

    if (agent && !agent.state.isDead) {
        biometricPanel.style.display = 'block';

        const weapon = agent.state.inventory.weapon;
        const hpPercent = (agent.state.hp / agent.state.maxHp) * 100;
        const stressPercent = agent.state.stress;
        const moralePercent = agent.state.morale;
        const staminaPercent = (agent.state.stamina / 100) * 100;

        const roleIcon = agent.role === 'MEDIC' ? '✚' : agent.role === 'MARKSMAN' ? '⌖' : '⚔';
        signalPanel.innerHTML = `
            <div class="identity-header">
                <div>
                    <div class="agent-id" style="color: ${agent.team === 0 ? '#3b7ad6' : '#d63b3b'}">UNIT #${agent.id.toString().padStart(3, '0')}</div>
                    <div class="role-info" style="margin-bottom: 5px;">
                        ${agent.rank === 1 ? '<span class="captain-star">★</span>' : ''}
                        <span>${roleIcon} ${agent.role}</span>
                    </div>
                </div>
            </div>

            <div class="intent-text" style="font-size: 0.9rem; opacity: 0.8; font-family: 'Courier New', monospace; margin-top: 5px;">
                💭 <span>${getActionDescription(agent)}</span>
            </div>
        `;

        statsHud.innerHTML = `
            <div class="hud-container">
                <div class="hud-combat-grid" style="display: flex; gap: 10px; align-items: stretch;">
                    <div class="hud-vitals-group" style="background: #16161a; padding: 10px; border-radius: 4px; border: 1px solid #222; flex: 1; height: 75px; display: flex; flex-direction: column; justify-content: center;">
                        <div class="hud-label-row">
                            <span>HP</span>
                            <span class="hud-value-text">${Math.ceil(agent.state.hp)} / ${agent.state.maxHp}</span>
                        </div>
                        <div class="hud-bar-track" style="margin-top: 5px;">
                            <div class="hud-bar-fill fill-hp" style="width: ${hpPercent}%"></div>
                        </div>
                    </div>

                    <div class="hud-ammo-block" style="align-items: center; background: #16161a; padding: 10px; border-radius: 4px; border: 1px solid #222; flex: 1; height: 75px; display: flex; flex-direction: column; justify-content: center;">
                        <div class="hud-ammo-value" style="font-size: 1.8rem; line-height: 1;">${weapon.ammo}</div>
                        <div class="hud-ammo-meta" style="margin-top: 2px;">
                            <span>/ ${weapon.carriedAmmo}</span>
                            <span>${weapon.name.toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                <div class="speedo-row">
                    <div class="speedo-container">
                        <div class="speedo-label">STAMINA</div>
                        <div class="speedo-gauge">
                            <div class="speedo-bg speedo-bg-good"></div>
                            <div class="speedo-mask"></div>
                            <div class="speedo-needle" style="transform: rotate(${staminaPercent * 1.8}deg);"></div>
                            <div class="speedo-center"></div>
                        </div>
                        <div class="speedo-val">${Math.ceil(agent.state.stamina)}</div>
                    </div>
                    
                    <div class="speedo-container">
                        <div class="speedo-label">MORALE</div>
                        <div class="speedo-gauge">
                            <div class="speedo-bg speedo-bg-good"></div>
                            <div class="speedo-mask"></div>
                            <div class="speedo-needle" style="transform: rotate(${moralePercent * 1.8}deg);"></div>
                            <div class="speedo-center"></div>
                        </div>
                        <div class="speedo-val">${Math.ceil(agent.state.morale)}</div>
                    </div>

                    <div class="speedo-container">
                        <div class="speedo-label">STRESS</div>
                        <div class="speedo-gauge">
                            <div class="speedo-bg speedo-bg-stress"></div>
                            <div class="speedo-mask"></div>
                            <div class="speedo-needle" style="transform: rotate(${stressPercent * 1.8}deg);"></div>
                            <div class="speedo-center"></div>
                        </div>
                        <div class="speedo-val">${Math.ceil(agent.state.stress)}</div>
                    </div>
                </div>
            </div>
        `;

        const badges = [];
        if (agent.rank === 1) badges.push('<span class="status-badge active buff">SQUAD LEADER</span>');
        if (agent.state.isDowned) badges.push('<span class="status-badge active">CRITICAL</span>');
        if (agent.state.isPinned) badges.push('<span class="status-badge active">PINNED</span>');
        else if (agent.state.suppression > 50) badges.push('<span class="status-badge active">SUPPRESSED</span>');
        
        if (agent.state.reloadingUntil > Date.now()) badges.push('<span class="status-badge active buff">RELOADING</span>');
        if (agent.state.stress > 80) badges.push('<span class="status-badge active">PANIC</span>');
        if (agent.state.fatigue > 50) badges.push('<span class="status-badge active">EXHAUSTED</span>');

        badgeContainer.innerHTML = `<div class="status-grid">${badges.join('')}</div>`;
        
        drawPersonalityPentagon(agent.traits);
    } else {
        biometricPanel.style.display = 'none';
        signalPanel.innerHTML = `
            <div class="placeholder-text">
                <div class="hologram-effect"></div>
                <div class="glitch-signal">NO SIGNAL</div>
                <div style="font-size: 0.7em; opacity: 0.5; margin-top: 10px; letter-spacing: 2px;">
                    <span style="color: var(--accent);">[ STATUS: STANDBY ]</span><br>
                    SELECT UNIT TO INTERFACE
                </div>
            </div>
        `;
    }
}

function drawPersonalityPentagon(traits) {
    const pCanvas = document.getElementById('personality-canvas');
    if (!pCanvas) return;
    const pCtx = pCanvas.getContext('2d');
    
    pCanvas.width = 180;
    pCanvas.height = 150;
    const centerX = 90;
    const centerY = 75;
    const radius = 45;
    
    const traitKeys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const labels = ['OPN', 'CON', 'EXT', 'AGR', 'NEU'];
    
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    
    pCtx.strokeStyle = '#333';
    pCtx.lineWidth = 1;
    for (let r = 1; r <= 4; r++) {
        pCtx.beginPath();
        const subRadius = radius * (r / 4);
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const x = centerX + Math.cos(angle) * subRadius;
            const y = centerY + Math.sin(angle) * subRadius;
            if (i === 0) pCtx.moveTo(x, y);
            else pCtx.lineTo(x, y);
        }
        pCtx.closePath();
        pCtx.stroke();
    }
    
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        pCtx.beginPath();
        pCtx.moveTo(centerX, centerY);
        pCtx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
        pCtx.strokeStyle = '#2a2a30';
        pCtx.stroke();
        
        pCtx.fillStyle = '#888';
        pCtx.font = 'bold 9px monospace';
        const lx = centerX + Math.cos(angle) * (radius + 15);
        const ly = centerY + Math.sin(angle) * (radius + 15);
        pCtx.fillText(labels[i], lx, ly + 3);
    }
    
    pCtx.fillStyle = 'rgba(212, 175, 55, 0.2)'; 
    pCtx.strokeStyle = '#d4af37';
    pCtx.lineWidth = 2;
    pCtx.beginPath();
    
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const val = traits[traitKeys[i]];
        const x = centerX + Math.cos(angle) * (radius * val);
        const y = centerY + Math.sin(angle) * (radius * val);
        if (i === 0) pCtx.moveTo(x, y);
        else pCtx.lineTo(x, y);
    }
    
    pCtx.closePath();
    pCtx.fill();
    pCtx.stroke();
    
    pCtx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const val = traits[traitKeys[i]];
        pCtx.beginPath();
        pCtx.arc(centerX + Math.cos(angle) * (radius * val), centerY + Math.sin(angle) * (radius * val), 2, 0, Math.PI * 2);
        pCtx.fill();
    }
}

function getActionDescription(agent) {
    if (!agent) return "OFFLINE";
    if (agent.state.isDowned) return "CRITICAL_FAILURE";
    if (agent.state.reloadingUntil > Date.now()) return "ERROR_AMMO_DEPLETED";
    
    const action = agent.currentAction;
    if (!action) return "AWAITING_INSTRUCTION";
    
    if (action.description) return action.description.toUpperCase().replace(/ /g, "_");

    switch(action.type) {
        case 'IDLE': return "SCANNING_SECTOR";
        case 'MOVE': return "RELOCATING";
        case 'ATTACK': return "ENGAGING_TARGET";
        case 'SUPPRESS': return "SUPPRESSING_FIRE";
        case 'RETREAT': return "TACTICAL_RETREAT";
        case 'LOOT': return "SECURING_ASSETS";
        case 'THROW': return "DEPLOYING_ORDNANCE";
        case 'RESUPPLY': return "RESUPPLYING_ALLY";
        default: return action.type.toUpperCase();
    }
}

// --- PLAYER HUD (Minimal overlay for HUMAN mode) ---
function drawPlayerHUD() {
    if (!world || !world.playerAgent || gameMode !== 'HUMAN') return;
    const agent = world.playerAgent;
    if (agent.state.isDead) return;

    const w = canvas.width;
    const h = canvas.height;
    const weapon = agent.state.inventory.weapon;

    ctx.save();
    // Reset transform to screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Reloading indicator
    if (agent.state.reloadingUntil > Date.now()) {
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#ff69b4';
        ctx.textAlign = 'center';
        ctx.fillText('RELOADING', w / 2, h - 30);
    }

    // --- Crosshair (center) ---
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    const gap = 6;
    const len = 12;
    ctx.beginPath();
    ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
    ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
    ctx.stroke();
    // Center dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function loop(timestamp) {
    if (!world || isGameOver) return;
    
    const dt = Math.min(100, timestamp - lastTime);
    lastTime = timestamp;

    // --- PLAYER INPUT (before world update) ---
    if (gameMode === 'HUMAN' && playerInput && world.playerAgent && !world.playerAgent.state.isDead) {
        playerInput.applyToAgent(world.playerAgent, dt, world, renderer.camera);
    }

    world.update(dt);
    renderer.render();
    updateInspector();

    // --- PLAYER CAMERA FOLLOW ---
    if (gameMode === 'HUMAN' && world.playerAgent) {
        const p = world.playerAgent;
        // Smooth camera follow
        renderer.camera.x += (p.pos.x - renderer.camera.x) * 0.1;
        renderer.camera.y += (p.pos.y - renderer.camera.y) * 0.1;
    }

    checkWinCondition();

    animationId = requestAnimationFrame(loop);
}

function checkWinCondition() {
    let alphaAlive = false;
    let bravoAlive = false;
    
    for (const agent of world.agents) {
        if (!agent.state.isDead) {
            if (agent.team === 0) alphaAlive = true;
            if (agent.team === 1) bravoAlive = true;
        }
    }
    
    if (!alphaAlive || !bravoAlive) {
        isGameOver = true;
        
        const gameOverScreen = document.getElementById('game-over-screen');
        const victoryText = document.getElementById('victory-text');
        
        if (!alphaAlive && !bravoAlive) {
            victoryText.innerText = "MUTUAL ANNIHILATION";
            victoryText.style.color = "white";
        } else if (alphaAlive) {
            if (gameMode === 'HUMAN') {
                victoryText.innerText = "MISSION COMPLETE";
                victoryText.style.color = "#4ae24a";
            } else {
                victoryText.innerText = "ALPHA TEAM WINS";
                victoryText.style.color = "#4a90e2";
            }
        } else {
            if (gameMode === 'HUMAN') {
                victoryText.innerText = "KIA — MISSION FAILED";
                victoryText.style.color = "#e24a4a";
            } else {
                victoryText.innerText = "BRAVO TEAM WINS";
                victoryText.style.color = "#e24a4a";
            }
        }
        
        gameOverScreen.style.display = 'flex';
    }
}

document.getElementById('btn-restart').onclick = () => {
    document.getElementById('game-over-screen').style.display = 'none';
    isGameOver = false;
    selectedAgent = null;
    startGame(mapData);
};
