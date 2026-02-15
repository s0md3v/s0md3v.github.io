import { World } from './modules/World.js';
import { Renderer } from './modules/Renderer.js';
import { Utils } from './modules/Utils.js';

let selectedAgent = null;


const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');

// Resize canvas to fill available space dynamically
function resizeCanvas() {
    // Set internal resolution to match display size
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const world = new World(canvas.width, canvas.height);
const renderer = new Renderer(ctx, world);

// Debug toggle handlers
document.getElementById('toggle-vision').addEventListener('change', (e) => {
    renderer.debugOptions.showVision = e.target.checked;
});
document.getElementById('toggle-trust').addEventListener('change', (e) => {
    renderer.debugOptions.showTrust = e.target.checked;
});
document.getElementById('toggle-comm').addEventListener('change', (e) => {
    renderer.debugOptions.showComm = e.target.checked;
});
document.getElementById('toggle-heatmap').addEventListener('change', (e) => {
    renderer.debugOptions.showHeatmap = e.target.checked;
});

// Inspector click handler
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    
    // Wider search radius for mobile/easy clicking
    selectedAgent = world.agents.find(a => Utils.distance(a.pos, {x, y}) < a.radius + 15);
});

function updateInspector() {
    const inspector = document.getElementById('agent-details');
    const chartContainer = document.getElementById('personality-chart-container');
    const agent = selectedAgent;

    if (agent) {
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
                            <span>/${weapon.maxAmmo}</span>
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
    const dt = Math.min(100, timestamp - lastTime);
    lastTime = timestamp;

    world.update(dt);
    renderer.render();
    updateInspector();

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
