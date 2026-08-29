import { World } from './modules/World.js?v=field-console-14';
import { Renderer } from './modules/Renderer.js?v=field-console-14';
import { Utils } from './modules/Utils.js?v=field-console-14';
import { AudioController } from './modules/AudioController.js?v=field-console-14';
import { PlayerInput } from './modules/PlayerInput.js?v=field-console-14';

const byId = id => document.getElementById(id);
const elements = {
    simulation: byId('simulation-container'),
    canvas: byId('sim-canvas'),
    startMenu: byId('start-menu'),
    startDescription: byId('start-description'),
    startAi: byId('btn-start-ai'),
    startHuman: byId('btn-start-human'),
    info: byId('info-modal'),
    infoOpen: byId('btn-info'),
    infoClose: byId('btn-close-info'),
    pauseScreen: byId('pause-screen'),
    gameOverScreen: byId('game-over-screen'),
    victoryText: byId('victory-text'),
    gameOverSummary: byId('game-over-summary'),
    pause: byId('btn-pause'),
    fit: byId('btn-fit'),
    mute: byId('btn-mute'),
    menu: byId('btn-menu'),
    inspectorButton: byId('btn-inspector'),
    inspector: byId('inspector-sidebar'),
    resume: byId('btn-resume'),
    pauseRestart: byId('btn-pause-restart'),
    pauseMenu: byId('btn-pause-menu'),
    restart: byId('btn-restart'),
    gameOverMenu: byId('btn-game-over-menu'),
    matchMode: byId('match-mode'),
    alphaCount: byId('alpha-count'),
    bravoCount: byId('bravo-count'),
    matchTimer: byId('match-timer'),
    canvasSummary: byId('canvas-summary'),
    observerHint: byId('observer-hint'),
    eventFeed: byId('event-feed'),
    playerHud: byId('player-hud'),
    playerHp: byId('player-hp'),
    playerAmmo: byId('player-ammo'),
    playerReserve: byId('player-reserve'),
    touchControls: byId('touch-controls'),
    emptySpaceHint: byId('empty-space-hint'),
    signalHeader: byId('signal-header'),
    biometricStats: byId('biometric-stats'),
    statsHud: byId('stats-hud'),
    personalityChart: byId('personality-chart'),
    badges: byId('status-badges-container')
};

const ctx = elements.canvas.getContext('2d');
const audioController = new AudioController();
const coarsePointer = window.matchMedia('(pointer: coarse)');

let mapData = null;
let mapPromise = null;
let world = null;
let renderer = null;
let playerInput = null;
let selectedAgent = null;
let gameMode = 'AI_VS_AI';
let animationId = null;
let isPaused = false;
let isGameOver = false;
let lastTime = performance.now();
let matchElapsed = 0;
let lastUiUpdate = 0;
let lastInspectorUpdate = 0;
let lastSummaryUpdate = 0;
let cameraIsFitted = true;
let observerHintTimer = null;
let previousDialogFocus = null;
let lastTraitAgentId = null;

const defaultDescription = elements.startDescription.textContent;

function setStartButtonsEnabled(enabled) {
    [elements.startAi, elements.startHuman].forEach(button => {
        button.disabled = !enabled;
        button.setAttribute('aria-disabled', String(!enabled));
    });
}

async function loadMap() {
    if (mapData) return mapData;
    if (mapPromise) return mapPromise;

    setStartButtonsEnabled(false);
    elements.startDescription.textContent = 'Loading the map and unit behavior…';
    mapPromise = fetch('./assets/maps/map.json', { cache: 'no-cache' })
        .then(response => {
            if (!response.ok) throw new Error(`Map request failed (${response.status})`);
            return response.json();
        })
        .then(data => {
            if (!data || !Array.isArray(data.layers)) throw new Error('Map data is malformed.');
            mapData = data;
            elements.startDescription.textContent = defaultDescription;
            setStartButtonsEnabled(true);
            return data;
        })
        .catch(error => {
            console.error('Unable to initialize Red Is Pain:', error);
            elements.startDescription.textContent = 'The field map could not be loaded. Refresh the page to try again.';
            setStartButtonsEnabled(false);
            mapPromise = null;
            throw error;
        });
    return mapPromise;
}

function resumeAudio() {
    if (audioController.context?.state === 'suspended') {
        audioController.context.resume().catch(error => console.warn('Audio resume failed:', error));
    }
}

window.addEventListener('pointerdown', resumeAudio, { once: true });
window.addEventListener('keydown', resumeAudio, { once: true });

function resizeCanvas() {
    const width = Math.max(1, Math.round(elements.canvas.clientWidth));
    const height = Math.max(1, Math.round(elements.canvas.clientHeight));
    syncInspectorAccessibility();
    if (elements.canvas.width === width && elements.canvas.height === height) return;
    elements.canvas.width = width;
    elements.canvas.height = height;
    if (renderer?.mapBaked) renderer.mapBaked = false;
    if (world && renderer && cameraIsFitted && gameMode === 'AI_VS_AI') fitCamera();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function cancelLoop() {
    if (animationId !== null) cancelAnimationFrame(animationId);
    animationId = null;
}

function destroyPlayerInput() {
    playerInput?.destroy();
    playerInput = null;
}

function fitCamera() {
    if (!world || !renderer) return;
    resizeCanvas();
    const zoomX = elements.canvas.width / world.width;
    const zoomY = elements.canvas.height / world.height;
    renderer.camera.zoom = Utils.clamp(Math.min(zoomX, zoomY) * 0.94, 0.15, 5);
    renderer.camera.x = world.width / 2;
    renderer.camera.y = world.height / 2;
    cameraIsFitted = true;
}

function setInspectorOpen(open) {
    elements.inspector.classList.toggle('is-open', open);
    elements.inspector.dataset.open = String(open);
    elements.inspectorButton.setAttribute('aria-expanded', String(open));
    elements.inspectorButton.setAttribute('aria-label', open ? 'Close unit details' : 'Open unit details');
    syncInspectorAccessibility();
}

function syncInspectorAccessibility() {
    const inspectorUnavailable = elements.inspector.hidden
        || elements.simulation.classList.contains('is-human-mode');
    const isClosedDrawer = inspectorUnavailable || (
        window.innerWidth <= 800
        && elements.inspectorButton.getAttribute('aria-expanded') !== 'true'
    );
    elements.inspector.toggleAttribute('inert', isClosedDrawer);
    if (isClosedDrawer) elements.inspector.setAttribute('aria-hidden', 'true');
    else elements.inspector.removeAttribute('aria-hidden');
}

function resetMatchSurfaces() {
    elements.pauseScreen.hidden = true;
    elements.gameOverScreen.hidden = true;
    elements.eventFeed.hidden = true;
    elements.eventFeed.replaceChildren();
    elements.playerHud.hidden = true;
    elements.touchControls.hidden = true;
    elements.observerHint.hidden = true;
    elements.emptySpaceHint.style.display = 'none';
    elements.simulation.classList.remove('is-human-mode');
    elements.inspector.hidden = false;
    elements.inspectorButton.hidden = false;
    elements.alphaCount.textContent = '—';
    elements.bravoCount.textContent = '—';
    elements.matchTimer.textContent = '00:00';
    elements.matchTimer.dateTime = 'PT0S';
    elements.matchMode.textContent = 'READY';
    elements.canvasSummary.textContent = 'Ready. Choose a mode to begin.';
    setInspectorOpen(false);
    clearTimeout(observerHintTimer);
    observerHintTimer = null;
}

function showMainMenu() {
    cancelLoop();
    destroyPlayerInput();
    clearTimeout(observerHintTimer);
    observerHintTimer = null;
    world = null;
    renderer = null;
    selectedAgent = null;
    isPaused = false;
    isGameOver = false;
    lastTraitAgentId = null;
    resetMatchSurfaces();
    elements.info.hidden = true;
    elements.startMenu.hidden = false;
    elements.startMenu.inert = false;
    elements.simulation.setAttribute('inert', '');
    elements.canvas.style.cursor = 'default';
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    elements.startAi.focus({ preventScroll: true });
}

function setupDebugControls() {
    const controls = [
        ['toggle-vision', 'showVision'],
        ['toggle-trust', 'showTrust'],
        ['toggle-heatmap', 'showHeatmap'],
        ['toggle-targets', 'showTargets']
    ];
    const update = () => {
        if (!renderer) return;
        controls.forEach(([id, option]) => {
            renderer.debugOptions[option] = byId(id).checked;
        });
    };
    controls.forEach(([id]) => { byId(id).onchange = update; });
    update();
}

function teamLabel(team) {
    return team === 0 ? 'Alpha' : 'Bravo';
}

function roleLabel(role) {
    return String(role || 'unit')
        .toLowerCase()
        .replace(/(^|_)\w/g, match => match.replace('_', ' ').toUpperCase());
}

function addEvent(message) {
    const item = document.createElement('li');
    item.textContent = message;
    elements.eventFeed.prepend(item);
    while (elements.eventFeed.children.length > 4) elements.eventFeed.lastElementChild.remove();
}

function bindWorldEvents() {
    world.events.on('death', ({ agent }) => {
        const rank = agent.rank === 1 ? ' captain' : '';
        addEvent(`${teamLabel(agent.team)}${rank} #${String(agent.id).padStart(3, '0')} is down`);
    });
    world.events.on('leaderDeath', ({ team }) => addEvent(`${teamLabel(team)} lost its squad leader`));
    world.events.on('explosion', () => addEvent('A fragmentation grenade exploded'));
    world.events.on('coverDestroyed', () => addEvent('Cover was destroyed'));
    world.events.on('areaFire', ({ agent, description }) => {
        const message = `${teamLabel(agent.team)} #${String(agent.id).padStart(3, '0')} ${description}`;
        const alreadyVisible = [...elements.eventFeed.children]
            .some(item => item.textContent === message);
        if (!alreadyVisible) addEvent(message);
    });
}

async function startGame(mode = gameMode) {
    const data = await loadMap().catch(() => null);
    if (!data) return;

    cancelLoop();
    destroyPlayerInput();
    clearTimeout(observerHintTimer);
    gameMode = mode;
    elements.simulation.classList.toggle('is-human-mode', gameMode === 'HUMAN');
    elements.inspector.hidden = gameMode === 'HUMAN';
    elements.inspectorButton.hidden = gameMode === 'HUMAN';
    resizeCanvas();

    selectedAgent = null;
    isPaused = false;
    isGameOver = false;
    setPauseButton(false);
    matchElapsed = 0;
    lastUiUpdate = 0;
    lastInspectorUpdate = 0;
    lastSummaryUpdate = 0;
    lastTraitAgentId = null;
    elements.eventFeed.replaceChildren();

    try {
        world = new World(elements.canvas.width, elements.canvas.height, audioController, data, gameMode);
        renderer = new Renderer(ctx, world);
    } catch (error) {
        console.error('Unable to start the match:', error);
        elements.startDescription.textContent = 'The simulation failed to initialize. Refresh the page to try again.';
        showMainMenu();
        return;
    }

    renderer.gameMode = gameMode;
    bindWorldEvents();
    setupDebugControls();
    fitCamera();

    if (gameMode === 'HUMAN' && world.playerAgent) {
        playerInput = new PlayerInput(elements.canvas);
        selectedAgent = world.playerAgent;
        renderer.setSelectedAgent(selectedAgent);
        renderer.camera.x = selectedAgent.pos.x;
        renderer.camera.y = selectedAgent.pos.y;
        renderer.camera.zoom = coarsePointer.matches ? 1.55 : 2;
        renderer.initFogOfWar(world.width, world.height);
        elements.playerHud.hidden = false;
        elements.touchControls.hidden = !coarsePointer.matches;
        elements.emptySpaceHint.style.display = 'none';
        elements.canvas.style.cursor = 'none';
        elements.matchMode.textContent = 'PLAYING';
    } else {
        selectedAgent = world.agents.find(agent => agent.team === 0 && agent.rank === 1) || world.agents[0] || null;
        renderer.setSelectedAgent(selectedAgent);
        elements.observerHint.hidden = false;
        observerHintTimer = setTimeout(() => { elements.observerHint.hidden = true; }, 7000);
        elements.canvas.style.cursor = 'crosshair';
        elements.matchMode.textContent = 'WATCHING';
    }

    elements.startMenu.hidden = true;
    elements.startMenu.inert = true;
    elements.pauseScreen.hidden = true;
    elements.gameOverScreen.hidden = true;
    elements.eventFeed.hidden = false;
    elements.simulation.removeAttribute('inert');
    addEvent(gameMode === 'HUMAN' ? 'You joined Alpha squad' : 'AI battle started');

    lastTime = performance.now();
    updateMatchUi(true);
    updateInspector(true);
    animationId = requestAnimationFrame(loop);
    elements.canvas.focus({ preventScroll: true });
}

function setPauseButton(paused) {
    const icon = elements.pause.querySelector('.command-button__icon');
    const label = elements.pause.querySelector('.command-button__label');
    if (icon) icon.textContent = paused ? '▶' : 'Ⅱ';
    if (label) label.textContent = paused ? 'Resume' : 'Pause';
    elements.pause.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    elements.pause.title = paused ? 'Resume simulation' : 'Pause simulation';
}

function pauseGame() {
    if (!world || isPaused || isGameOver) return;
    isPaused = true;
    cancelLoop();
    elements.simulation.setAttribute('inert', '');
    elements.pauseScreen.hidden = false;
    setPauseButton(true);
    previousDialogFocus = document.activeElement;
    elements.resume.focus({ preventScroll: true });
}

function resumeGame() {
    if (!world || !isPaused || isGameOver) return;
    isPaused = false;
    elements.pauseScreen.hidden = true;
    elements.simulation.removeAttribute('inert');
    setPauseButton(false);
    lastTime = performance.now();
    animationId = requestAnimationFrame(loop);
    (previousDialogFocus || elements.canvas).focus({ preventScroll: true });
    previousDialogFocus = null;
}

function togglePause() {
    if (isPaused) resumeGame();
    else pauseGame();
}

function formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateMatchUi(force = false) {
    if (!world) return;
    const now = performance.now();
    if (!force && now - lastUiUpdate < 125) return;
    lastUiUpdate = now;

    const alpha = world.agents.filter(agent => agent.team === 0 && !agent.state.isDead).length;
    const bravo = world.agents.filter(agent => agent.team === 1 && !agent.state.isDead).length;
    elements.alphaCount.textContent = String(alpha);
    elements.bravoCount.textContent = String(bravo);
    elements.matchTimer.textContent = formatTime(matchElapsed);
    elements.matchTimer.dateTime = `PT${Math.floor(matchElapsed / 1000)}S`;

    if (gameMode === 'HUMAN' && world.playerAgent) {
        const player = world.playerAgent;
        const weapon = player.state.inventory.weapon;
        elements.playerHp.textContent = `${Math.ceil(player.state.hp)} / ${player.state.maxHp}`;
        elements.playerAmmo.textContent = String(weapon.ammo);
        elements.playerReserve.textContent = String(weapon.carriedAmmo);
    }

    if (force || now - lastSummaryUpdate > 2000) {
        const selection = gameMode === 'AI_VS_AI' && selectedAgent && !selectedAgent.state.isDead
            ? ` Selected ${teamLabel(selectedAgent.team)} unit ${selectedAgent.id} is ${getActionDescription(selectedAgent)}.`
            : '';
        elements.canvasSummary.textContent = `Alpha ${alpha} active. Bravo ${bravo} active. Match time ${formatTime(matchElapsed)}.${selection}`;
        lastSummaryUpdate = now;
    }
}

function speedometer(label, value, stress = false) {
    const safeValue = Utils.clamp(Number(value) || 0, 0, 100);
    return `<div class="speedo-container">
        <div class="speedo-label">${label}</div>
        <div class="speedo-gauge" aria-hidden="true">
            <div class="speedo-bg ${stress ? 'speedo-bg-stress' : 'speedo-bg-good'}"></div>
            <div class="speedo-mask"></div>
            <div class="speedo-needle" style="transform: rotate(${safeValue * 1.8}deg)"></div>
            <div class="speedo-center"></div>
        </div>
        <div class="speedo-val">${Math.round(safeValue)}</div>
    </div>`;
}

function updateInspector(force = false) {
    if (!world) return;
    if (gameMode === 'HUMAN') return;
    const now = performance.now();
    if (!force && now - lastInspectorUpdate < 125) return;
    lastInspectorUpdate = now;
    const agent = selectedAgent;

    if (!agent || agent.state.isDead) {
        elements.biometricStats.style.display = 'none';
        elements.signalHeader.innerHTML = `<div class="placeholder-text">
            <div class="hologram-effect" aria-hidden="true"></div>
            <div class="glitch-signal">${agent?.state.isDead ? 'Unit lost' : 'No unit selected'}</div>
            <p>${agent?.state.isDead ? 'Select a living unit to continue.' : 'Select a unit on the map to see its details.'}</p>
        </div>`;
        lastTraitAgentId = null;
        return;
    }

    const weapon = agent.state.inventory.weapon;
    const hpPercent = Utils.clamp(agent.state.hp / agent.state.maxHp * 100, 0, 100);
    const ammoPercent = Utils.clamp(weapon.ammo / Math.max(1, weapon.maxAmmo) * 100, 0, 100);
    const teamClass = agent.team === 0 ? 'team-blue' : 'team-red';
    const roleIcon = agent.role === 'MEDIC' ? '✚' : agent.role === 'MARKSMAN' ? '⌖' : '◆';
    elements.signalHeader.innerHTML = `<div class="identity-header">
        <div>
            <div class="agent-id">Unit ${String(agent.id).padStart(3, '0')}</div>
            <div class="role-info">${agent.rank === 1 ? '<span class="captain-star">★</span>' : ''}<span>${roleIcon} ${roleLabel(agent.role)}</span></div>
        </div>
        <span class="squad-badge ${teamClass}">${teamLabel(agent.team)}</span>
    </div>
    <div class="intent-text">${getActionDescription(agent)}</div>`;

    elements.biometricStats.style.display = 'block';
    elements.statsHud.innerHTML = `<div class="hud-container">
        <div class="hud-combat-grid">
            <div class="hud-vitals-group">
                <div class="hud-label-row"><span>Health</span><span class="hud-value-text">${Math.ceil(agent.state.hp)} / ${agent.state.maxHp}</span></div>
                <div class="hud-bar-track"><div class="hud-bar-fill fill-hp" style="width:${hpPercent}%"></div></div>
            </div>
            <div class="hud-vitals-group">
                <div class="hud-label-row"><span>Ammo</span><span class="hud-value-text">${weapon.ammo} / ${weapon.carriedAmmo}</span></div>
                <div class="hud-bar-track"><div class="hud-bar-fill fill-ammo" style="width:${ammoPercent}%"></div></div>
            </div>
        </div>
        <div class="speedo-row">
            ${speedometer('Stamina', agent.state.stamina)}
            ${speedometer('Morale', agent.state.morale)}
            ${speedometer('Stress', agent.state.stress, true)}
        </div>
    </div>`;

    const badges = [];
    if (agent.state.busyReason === 'reload') badges.push('<span class="status-badge active buff">Reloading</span>');
    if (agent.state.inBush) badges.push('<span class="status-badge active buff">Concealed</span>');
    if (agent.state.inSmoke) badges.push('<span class="status-badge active">In smoke</span>');
    if (agent.state.isPinned) badges.push('<span class="status-badge active">Pinned</span>');
    else if (agent.state.suppression > 50) badges.push('<span class="status-badge active">Suppressed</span>');
    if (agent.state.stress > 80) badges.push('<span class="status-badge active">Panicked</span>');
    if (agent.state.isHeroic) badges.push('<span class="status-badge active buff">Heroic</span>');
    if (agent.state.isBroken) badges.push('<span class="status-badge active">Broken</span>');
    elements.badges.innerHTML = badges.length ? `<div class="status-grid">${badges.join('')}</div>` : '';

    if (force || lastTraitAgentId !== agent.id) {
        renderPersonalityTraits(agent.traits);
        lastTraitAgentId = agent.id;
    }
}

function renderPersonalityTraits(traits) {
    const definitions = [
        ['openness', 'Openness'],
        ['conscientiousness', 'Conscientiousness'],
        ['extraversion', 'Extraversion'],
        ['agreeableness', 'Agreeableness'],
        ['neuroticism', 'Neuroticism']
    ];
    const values = definitions.map(([key, label]) => ({
        label,
        value: Utils.clamp(traits[key], 0, 1)
    }));
    const chart = elements.personalityChart;
    const chartCtx = chart.getContext('2d');
    const center = { x: chart.width / 2, y: 126 };
    const radius = 78;
    const angles = values.map((_, index) => -Math.PI / 2 + index * Math.PI * 2 / values.length);
    const pointAt = (angle, distance) => ({
        x: center.x + Math.cos(angle) * distance,
        y: center.y + Math.sin(angle) * distance
    });

    chartCtx.clearRect(0, 0, chart.width, chart.height);
    chartCtx.lineJoin = 'round';

    for (let level = 1; level <= 4; level++) {
        chartCtx.beginPath();
        angles.forEach((angle, index) => {
            const point = pointAt(angle, radius * level / 4);
            if (index === 0) chartCtx.moveTo(point.x, point.y);
            else chartCtx.lineTo(point.x, point.y);
        });
        chartCtx.closePath();
        chartCtx.strokeStyle = level === 4 ? 'rgba(214, 180, 90, 0.34)' : 'rgba(255, 255, 255, 0.11)';
        chartCtx.lineWidth = 1;
        chartCtx.stroke();
    }

    angles.forEach(angle => {
        const point = pointAt(angle, radius);
        chartCtx.beginPath();
        chartCtx.moveTo(center.x, center.y);
        chartCtx.lineTo(point.x, point.y);
        chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        chartCtx.stroke();
    });

    chartCtx.beginPath();
    values.forEach(({ value }, index) => {
        const point = pointAt(angles[index], Math.max(3, radius * value));
        if (index === 0) chartCtx.moveTo(point.x, point.y);
        else chartCtx.lineTo(point.x, point.y);
    });
    chartCtx.closePath();
    chartCtx.fillStyle = 'rgba(214, 180, 90, 0.22)';
    chartCtx.strokeStyle = '#d6b45a';
    chartCtx.lineWidth = 2;
    chartCtx.fill();
    chartCtx.stroke();

    values.forEach(({ value }, index) => {
        const point = pointAt(angles[index], Math.max(3, radius * value));
        chartCtx.beginPath();
        chartCtx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        chartCtx.fillStyle = '#f2d98e';
        chartCtx.fill();
    });

    const labels = [
        { x: center.x, y: 18, align: 'center' },
        { x: chart.width - 10, y: 84, align: 'right' },
        { x: chart.width - 10, y: 224, align: 'right' },
        { x: 10, y: 224, align: 'left' },
        { x: 10, y: 84, align: 'left' }
    ];
    chartCtx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    chartCtx.textBaseline = 'middle';
    values.forEach(({ label }, index) => {
        const position = labels[index];
        chartCtx.textAlign = position.align;
        chartCtx.fillStyle = '#d9dee2';
        chartCtx.fillText(label, position.x, position.y);
    });

    const summary = values.map(({ label, value }) => `${label}: ${Math.round(value * 100)} percent`).join('. ');
    chart.setAttribute('aria-label', `Personality distribution. ${summary}.`);
}

function getActionDescription(agent) {
    if (!agent) return 'offline';
    if (agent.state.isDead) return 'unit lost';
    if (agent.state.busyReason === 'reload') return 'reloading';
    if (agent.state.busyReason === 'switch') return 'switching weapon';
    if (agent.isPlayer) return 'under direct control';
    const action = agent.currentAction;
    if (!action) return 'scanning sector';
    if (action.description) return String(action.description).toLowerCase();
    const descriptions = {
        IDLE: 'scanning the area',
        HOLD: 'holding position',
        MOVE: 'relocating',
        ATTACK: 'firing at an enemy',
        SUPPRESS: 'firing at a suspected enemy position',
        RETREAT: 'retreating',
        LOOT: 'collecting supplies',
        THROW: 'throwing a grenade',
        RESUPPLY: 'resupplying ally',
        HEAL: 'treating ally',
        SELF_HEAL: 'self aid'
    };
    return descriptions[action.type] || String(action.type || 'scanning').toLowerCase();
}

function drawPlayerOverlay() {
    if (!world?.playerAgent || !playerInput || gameMode !== 'HUMAN') return;
    const agent = world.playerAgent;
    if (agent.state.isDead) return;
    const aim = playerInput.getAimScreenPosition(agent, renderer.camera);
    const spread = 6 + agent.state.stress * 0.055 + agent.state.suppression * 0.04;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (agent.state.hp < agent.state.maxHp || agent.state.suppression > 25) {
        const intensity = Utils.clamp((1 - agent.state.hp / agent.state.maxHp) * 0.45 + agent.state.suppression / 500, 0, 0.48);
        const vignette = ctx.createRadialGradient(
            elements.canvas.width / 2,
            elements.canvas.height / 2,
            Math.min(elements.canvas.width, elements.canvas.height) * 0.18,
            elements.canvas.width / 2,
            elements.canvas.height / 2,
            Math.max(elements.canvas.width, elements.canvas.height) * 0.7
        );
        vignette.addColorStop(0, 'rgba(120, 0, 0, 0)');
        vignette.addColorStop(1, `rgba(120, 0, 0, ${intensity})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
    }

    ctx.strokeStyle = agent.state.busyReason === 'reload' ? 'rgba(214, 180, 90, 0.85)' : 'rgba(255, 255, 255, 0.75)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(aim.x - spread - 9, aim.y); ctx.lineTo(aim.x - spread, aim.y);
    ctx.moveTo(aim.x + spread, aim.y); ctx.lineTo(aim.x + spread + 9, aim.y);
    ctx.moveTo(aim.x, aim.y - spread - 9); ctx.lineTo(aim.x, aim.y - spread);
    ctx.moveTo(aim.x, aim.y + spread); ctx.lineTo(aim.x, aim.y + spread + 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 1.5, 0, Math.PI * 2);
    ctx.fill();

    if (agent.state.busyReason === 'reload' && agent.state.reloadingUntil > Date.now()) {
        const duration = Math.max(1, agent.state.reloadingUntil - agent.state.busyStartedAt);
        const progress = Utils.clamp((Date.now() - agent.state.busyStartedAt) / duration, 0, 1);
        ctx.beginPath();
        ctx.arc(aim.x, aim.y, spread + 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = '#d6b45a';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.restore();
}

function checkWinCondition() {
    if (!world || isGameOver) return false;
    const alpha = world.agents.some(agent => agent.team === 0 && !agent.state.isDead);
    const bravo = world.agents.some(agent => agent.team === 1 && !agent.state.isDead);
    if (alpha && bravo) return false;

    isGameOver = true;
    cancelLoop();
    updateMatchUi(true);
    elements.simulation.setAttribute('inert', '');
    let title;
    if (!alpha && !bravo) title = 'MUTUAL ANNIHILATION';
    else if (alpha) title = gameMode === 'HUMAN' ? 'YOU WIN' : 'ALPHA WINS';
    else title = gameMode === 'HUMAN' ? 'YOU WERE DEFEATED' : 'BRAVO WINS';

    const casualties = [...world.corpses, ...world.agents.filter(agent => agent.state.isDead)];
    const alphaLosses = casualties.filter(agent => agent.team === 0).length;
    const bravoLosses = casualties.filter(agent => agent.team === 1).length;
    elements.victoryText.textContent = title;
    elements.gameOverSummary.textContent = `${formatTime(matchElapsed)} elapsed · Alpha lost ${alphaLosses} · Bravo lost ${bravoLosses}`;
    elements.gameOverScreen.hidden = false;
    previousDialogFocus = document.activeElement;
    elements.restart.focus({ preventScroll: true });
    return true;
}

function loop(timestamp) {
    animationId = null;
    if (!world || isPaused || isGameOver) return;

    const dt = Math.min(75, Math.max(0, timestamp - lastTime));
    lastTime = timestamp;
    matchElapsed += dt;

    if (gameMode === 'HUMAN' && playerInput && world.playerAgent && !world.playerAgent.state.isDead) {
        playerInput.applyToAgent(world.playerAgent, dt, world, renderer.camera);
    }

    world.update(dt);
    if (gameMode === 'HUMAN' && world.playerAgent) {
        renderer.camera.x += (world.playerAgent.pos.x - renderer.camera.x) * 0.12;
        renderer.camera.y += (world.playerAgent.pos.y - renderer.camera.y) * 0.12;
    }
    renderer.render();
    drawPlayerOverlay();
    updateMatchUi();
    updateInspector();
    if (!checkWinCondition()) animationId = requestAnimationFrame(loop);
}

function canvasPoint(event) {
    const rect = elements.canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) / rect.width * elements.canvas.width,
        y: (event.clientY - rect.top) / rect.height * elements.canvas.height
    };
}

function worldPoint(event) {
    const point = canvasPoint(event);
    return {
        x: (point.x - elements.canvas.width / 2) / renderer.camera.zoom + renderer.camera.x,
        y: (point.y - elements.canvas.height / 2) / renderer.camera.zoom + renderer.camera.y
    };
}

function selectAt(event) {
    if (!world || !renderer || gameMode === 'HUMAN') return;
    const point = worldPoint(event);
    selectedAgent = world.agents
        .filter(agent => !agent.state.isDead)
        .sort((a, b) => Utils.distance(a.pos, point) - Utils.distance(b.pos, point))
        .find(agent => Utils.distance(agent.pos, point) < agent.radius + 14) || null;
    renderer.setSelectedAgent(selectedAgent);
    updateInspector(true);
    updateMatchUi(true);
    if (selectedAgent && window.innerWidth <= 800) setInspectorOpen(true);
}

let dragState = null;
elements.canvas.addEventListener('pointerdown', event => {
    if (!renderer || isPaused || isGameOver || gameMode === 'HUMAN') return;
    const canPan = event.button === 1 || (event.button === 0 && event.altKey) || event.pointerType === 'touch';
    if (canPan) {
        dragState = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
        elements.canvas.setPointerCapture?.(event.pointerId);
        elements.canvas.style.cursor = 'grabbing';
        event.preventDefault();
    } else if (event.button === 0) {
        selectAt(event);
    }
});

elements.canvas.addEventListener('pointermove', event => {
    const rect = elements.canvas.getBoundingClientRect();
    if (playerInput) playerInput.setMouseScreenPos(event.clientX - rect.left, event.clientY - rect.top);
    if (!dragState || dragState.id !== event.pointerId || !renderer) return;

    const dx = (event.clientX - dragState.x) * elements.canvas.width / rect.width;
    const dy = (event.clientY - dragState.y) * elements.canvas.height / rect.height;
    renderer.camera.x -= dx / renderer.camera.zoom;
    renderer.camera.y -= dy / renderer.camera.zoom;
    dragState.x = event.clientX;
    dragState.y = event.clientY;
    dragState.moved ||= Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 5;
    cameraIsFitted = false;
    event.preventDefault();
});

function endDrag(event) {
    if (!dragState || dragState.id !== event.pointerId) return;
    const shouldSelect = event.pointerType === 'touch' && !dragState.moved;
    dragState = null;
    elements.canvas.style.cursor = gameMode === 'HUMAN' ? 'none' : 'crosshair';
    if (shouldSelect) selectAt(event);
}

elements.canvas.addEventListener('pointerup', endDrag);
elements.canvas.addEventListener('pointercancel', endDrag);

elements.canvas.addEventListener('wheel', event => {
    if (!renderer || isPaused || isGameOver) return;
    event.preventDefault();
    const point = canvasPoint(event);
    const before = {
        x: (point.x - elements.canvas.width / 2) / renderer.camera.zoom + renderer.camera.x,
        y: (point.y - elements.canvas.height / 2) / renderer.camera.zoom + renderer.camera.y
    };
    const factor = Math.exp(-event.deltaY * 0.0015);
    renderer.camera.zoom = Utils.clamp(renderer.camera.zoom * factor, 0.15, 5);
    renderer.camera.x = before.x - (point.x - elements.canvas.width / 2) / renderer.camera.zoom;
    renderer.camera.y = before.y - (point.y - elements.canvas.height / 2) / renderer.camera.zoom;
    cameraIsFitted = false;
}, { passive: false });

function openInfo() {
    previousDialogFocus = document.activeElement;
    elements.startMenu.inert = true;
    elements.info.hidden = false;
    elements.infoClose.focus({ preventScroll: true });
}

function closeInfo() {
    elements.info.hidden = true;
    elements.startMenu.inert = false;
    (previousDialogFocus || elements.infoOpen).focus({ preventScroll: true });
    previousDialogFocus = null;
}

function trapDialogFocus(event, dialog) {
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

document.addEventListener('keydown', event => {
    const openDialog = !elements.info.hidden
        ? elements.info
        : !elements.pauseScreen.hidden
            ? elements.pauseScreen
            : !elements.gameOverScreen.hidden
                ? elements.gameOverScreen
                : null;
    if (event.key === 'Tab' && openDialog) {
        trapDialogFocus(event, openDialog);
        return;
    }
    if (event.key === 'Escape') {
        if (!elements.info.hidden) closeInfo();
        else if (world && !isGameOver) togglePause();
        return;
    }
    if (!world || isGameOver || !elements.pauseScreen.hidden) return;
    if ((event.code === 'Space' && gameMode === 'AI_VS_AI') || event.code === 'KeyP') {
        if (!['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            event.preventDefault();
            togglePause();
        }
    } else if (event.code === 'KeyF') {
        fitCamera();
    } else if (event.code === 'KeyI') {
        setInspectorOpen(elements.inspectorButton.getAttribute('aria-expanded') !== 'true');
    }
});

elements.startAi.addEventListener('click', () => startGame('AI_VS_AI'));
elements.startHuman.addEventListener('click', () => startGame('HUMAN'));
elements.infoOpen.addEventListener('click', openInfo);
elements.infoClose.addEventListener('click', closeInfo);
elements.info.addEventListener('pointerdown', event => {
    if (event.target === elements.info) closeInfo();
});
elements.pause.addEventListener('click', togglePause);
elements.fit.addEventListener('click', fitCamera);
elements.mute.addEventListener('click', () => {
    audioController.muted = !audioController.muted;
    elements.mute.setAttribute('aria-pressed', String(audioController.muted));
    elements.mute.setAttribute('aria-label', audioController.muted ? 'Unmute audio' : 'Mute audio');
    elements.mute.title = audioController.muted ? 'Unmute audio' : 'Mute audio';
    const label = elements.mute.querySelector('.command-button__label');
    if (label) label.textContent = audioController.muted ? 'Muted' : 'Audio';
});
elements.menu.addEventListener('click', showMainMenu);
elements.inspectorButton.addEventListener('click', () => {
    setInspectorOpen(elements.inspectorButton.getAttribute('aria-expanded') !== 'true');
});
elements.resume.addEventListener('click', resumeGame);
elements.pauseRestart.addEventListener('click', () => startGame(gameMode));
elements.pauseMenu.addEventListener('click', showMainMenu);
elements.restart.addEventListener('click', () => startGame(gameMode));
elements.gameOverMenu.addEventListener('click', showMainMenu);

document.addEventListener('visibilitychange', () => {
    if (document.hidden && world && !isPaused && !isGameOver) pauseGame();
});

coarsePointer.addEventListener?.('change', () => {
    if (world && gameMode === 'HUMAN') elements.touchControls.hidden = !coarsePointer.matches;
});

resetMatchSurfaces();
elements.info.hidden = true;
elements.gameOverScreen.hidden = true;
elements.startMenu.hidden = false;
elements.simulation.setAttribute('inert', '');
setPauseButton(false);
loadMap().catch(() => {});
