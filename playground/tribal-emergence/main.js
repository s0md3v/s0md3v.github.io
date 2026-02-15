import { World } from './modules/World.js';
import { Renderer } from './modules/Renderer.js';
import { Utils } from './modules/Utils.js';
import { AudioController } from './modules/AudioController.js';

let selectedAgent = null;

// Initialize Audio
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

// Resize canvas to fill available space dynamically
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function startGame(mapData = null) {
    world = new World(canvas.width, canvas.height, audioController, mapData);
    renderer = new Renderer(ctx, world);

    // Initial Zoom: Scale to ensure a consistent view regardless of screen resolution
    // Standard RTS view: roughly 1500 world units wide
    renderer.camera.zoom = Math.max(0.5, canvas.width / 1500);
    
    // Wire up Debug Toggles
    const updateDebug = () => {
        renderer.debugOptions.showVision = document.getElementById('toggle-vision').checked;
        renderer.debugOptions.showTrust = document.getElementById('toggle-trust').checked;
        renderer.debugOptions.showComm = document.getElementById('toggle-comm').checked;
        renderer.debugOptions.showHeatmap = document.getElementById('toggle-heatmap').checked;
    };
    
    document.getElementById('toggle-vision').onchange = updateDebug;
    document.getElementById('toggle-trust').onchange = updateDebug;
    document.getElementById('toggle-comm').onchange = updateDebug;
    document.getElementById('toggle-heatmap').onchange = updateDebug;
    updateDebug(); // Init

    // Hide Menu
    document.getElementById('start-menu').style.display = 'none';

    // Start Loop
    lastTime = performance.now();
    loop(lastTime);
}

// Menu Handlers
document.getElementById('btn-random').onclick = () => {
    resumeAudio();
    startGame(null);
};

document.getElementById('btn-start').onclick = () => {
    const fileInput = document.getElementById('map-select');
    const file = fileInput.files[0];
    
    resumeAudio();

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                startGame(json);
            } catch (err) {
                alert("Invalid Map File");
                console.error(err);
            }
        };
        reader.readAsText(file);
    } else {
        alert("Please select a map file or choose Random.");
    }
};


// Camera Controls
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('mousedown', (e) => {
    if (!renderer) return;
    
    // Middle Mouse or Alt+Click for Panning
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault();
        return;
    }

    if (!world) return;
    const rect = canvas.getBoundingClientRect();
    
    // Transform Screen to World
    const screenX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const screenY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    
    const cam = renderer.camera;
    const worldX = (screenX - canvas.width / 2) / cam.zoom + cam.x;
    const worldY = (screenY - canvas.height / 2) / cam.zoom + cam.y;
    
    // Wider search radius for mobile/easy clicking
    selectedAgent = world.agents.find(a => Utils.distance(a.pos, {x: worldX, y: worldY}) < a.radius + 15);
});

window.addEventListener('mousemove', (e) => {
    if (isDragging && renderer) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        
        renderer.camera.x -= dx / renderer.camera.zoom;
        renderer.camera.y -= dy / renderer.camera.zoom;
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

canvas.addEventListener('wheel', (e) => {
    if (!renderer) return;
    e.preventDefault();
    
    const zoomSpeed = 0.001;
    renderer.camera.zoom -= e.deltaY * zoomSpeed;
    renderer.camera.zoom = Math.max(0.1, Math.min(5.0, renderer.camera.zoom));
}, { passive: false });

function updateInspector() {
    if (!world) return;
    const inspector = document.getElementById('agent-details');
    const chartContainer = document.getElementById('personality-chart-container');
    const agent = selectedAgent;

    if (agent && !agent.state.isDead) { // Only show alive agents or recently dead?
        // ... (existing logic)
        const weapon = agent.state.inventory.weapon;
        const hpPercent = (agent.state.hp / agent.state.maxHp) * 100;
        const stressPercent = agent.state.stress;
        const moralePercent = agent.state.morale;
        const staminaPercent = (agent.state.stamina / 100) * 100;
        const ammoPercent = (weapon.ammo / weapon.maxAmmo) * 100;

        // Status Badges
        const badges = [];
        if (agent.rank === 1) badges.push('<span class="status-badge active buff">SQUAD LEADER</span>');
        if (agent.state.isDowned) badges.push('<span class="status-badge active">CRITICAL</span>');
        if (agent.state.isPinned) badges.push('<span class="status-badge active">PINNED</span>');
        else if (agent.state.suppression > 50) badges.push('<span class="status-badge active">SUPPRESSED</span>');
        
        if (agent.state.reloadingUntil > Date.now()) badges.push('<span class="status-badge active buff">RELOADING</span>');
        if (agent.state.stress > 80) badges.push('<span class="status-badge active">PANIC</span>');
        if (agent.state.fatigue > 50) badges.push('<span class="status-badge active">EXHAUSTED</span>');

        const roleIcon = agent.role === 'MEDIC' ? '✚' : agent.role === 'MARKSMAN' ? '⌖' : '⚔';

        inspector.innerHTML = `
            <div class="identity-header">
                <div>
                    <div class="agent-id">UNIT #${agent.id.toString().padStart(3, '0')}</div>
                    <div class="role-info">
                        ${agent.rank === 1 ? '<span class="captain-star">★</span>' : ''}
                        <span>${roleIcon} ${agent.role}</span>
                    </div>
                </div>
                <div class="squad-badge team-${agent.team === 0 ? 'blue' : 'red'}">
                    ${agent.team === 0 ? 'ALPHA' : 'BRAVO'}
                </div>
            </div>

            <div class="intent-box">
                <div class="intent-label">CURRENT PROTOCOL</div>
                <div class="intent-text">
                    > ${getActionDescription(agent)}
                </div>
            </div>

            <div class="hud-container">
                
                <!-- 1. Vitals (Integrity) -->
                <div class="hud-vitals-group">
                    <div class="hud-label-row">
                        <span>Integrity</span>
                        <span class="hud-value-text">${Math.ceil(agent.state.hp)} / ${agent.state.maxHp}</span>
                    </div>
                    <div class="hud-bar-track">
                        <div class="hud-bar-fill fill-hp" style="width: ${hpPercent}%"></div>
                    </div>
                </div>

                <!-- 2. Combat Grid (Ammo vs Stress) -->
                <div class="hud-combat-grid">
                    <!-- Ammo (Left) -->
                    <div class="hud-ammo-block">
                        <div class="hud-ammo-value">${weapon.ammo}</div>
                        <div class="hud-ammo-meta">
                            <span>/ ${weapon.carriedAmmo}</span>
                            <span>${weapon.type.toUpperCase()}</span>
                        </div>
                    </div>

                    <!-- Stress (Right) -->
                    <div class="hud-stress-block">
                        <div class="hud-stress-label">
                            <span class="hud-stress-title">STRESS</span>
                            <span class="hud-stress-status">${agent.state.stress > 80 ? 'CRIT' : agent.state.stress > 50 ? 'HIGH' : 'NORM'}</span>
                        </div>
                        <div class="hud-stress-circle" style="background: conic-gradient(var(--color-stress) ${stressPercent}%, #333 0deg);">
                            <div class="hud-stress-val">${Math.ceil(agent.state.stress)}</div>
                        </div>
                    </div>
                </div>

                <!-- 3. Physical / Morale Stack -->
                <div class="hud-secondary-stack">
                    <!-- Stamina -->
                    <div class="hud-vitals-group">
                         <div class="hud-label-row">
                            <span>Stamina</span>
                            <span class="hud-value-text" style="font-size: 0.8rem">${Math.ceil(agent.state.stamina)}%</span>
                        </div>
                        <div class="hud-bar-track" style="height: 3px;">
                            <div class="hud-bar-fill fill-stamina" style="width: ${staminaPercent}%"></div>
                        </div>
                    </div>

                    <!-- Morale -->
                    <div class="hud-vitals-group">
                         <div class="hud-label-row">
                            <span>Morale</span>
                            <span class="hud-value-text" style="font-size: 0.8rem">${Math.ceil(agent.state.morale)}%</span>
                        </div>
                        <div class="hud-bar-track" style="height: 3px;">
                            <div class="hud-bar-fill fill-morale" style="width: ${moralePercent}%"></div>
                        </div>
                    </div>
                </div>

            </div>

            <div class="status-grid">
                ${badges.join('')}
            </div>
        `;
        
        chartContainer.style.display = 'flex';
        drawPersonalityPentagon(agent.traits);
    } else {
        inspector.innerHTML = `
            <div class="placeholder-text">
                NO SIGNAL<br>
                <span style="font-size: 0.7em; opacity: 0.5;">SELECT UNIT TO INTERFACE</span>
            </div>
        `;
        chartContainer.style.display = 'none';
        const pCanvas = document.getElementById('personality-canvas');
        if (pCanvas) {
            const pCtx = pCanvas.getContext('2d');
            pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
        }
    }
}


function drawPersonalityPentagon(traits) {
    const pCanvas = document.getElementById('personality-canvas');
    if (!pCanvas) return;
    const pCtx = pCanvas.getContext('2d');
    
    // Set size
    pCanvas.width = 240;
    pCanvas.height = 200;
    const centerX = 120;
    const centerY = 100;
    const radius = 60;
    
    const traitKeys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const labels = ['OPN', 'CON', 'EXT', 'AGR', 'NEU'];
    
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    
    // Title
    pCtx.fillStyle = '#666';
    pCtx.font = '10px monospace';
    pCtx.textAlign = 'center';
    pCtx.fillText("- PSYCHOMETRIC PROFILE -", centerX, 10);
    
    // 1. Draw Background Web
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
    
    // 2. Draw Axis Lines
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        pCtx.beginPath();
        pCtx.moveTo(centerX, centerY);
        pCtx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
        pCtx.strokeStyle = '#2a2a30';
        pCtx.stroke();
        
        // Labels
        pCtx.fillStyle = '#888';
        pCtx.font = 'bold 9px monospace';
        const lx = centerX + Math.cos(angle) * (radius + 15);
        const ly = centerY + Math.sin(angle) * (radius + 15);
        pCtx.fillText(labels[i], lx, ly + 3);
    }
    
    // 3. Draw Trait Polygon
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
    
    // Points
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

let lastTime = performance.now();
function loop(timestamp) {
    if (!world) return;
    
    const dt = Math.min(100, timestamp - lastTime);
    lastTime = timestamp;

    world.update(dt);
    renderer.render();
    updateInspector();

    animationId = requestAnimationFrame(loop);
}
