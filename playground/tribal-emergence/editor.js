
import { AssetManifest } from './assets/AssetManifest.js';
import { Config } from './modules/Config.js';

const TILE_SIZE = 16;
const COLLISION_RESOLUTION = 4; // Physical resolution (4x4px per tile)
const DEFAULT_WIDTH = 64;
const DEFAULT_HEIGHT = 48;

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const assetBrowser = document.getElementById('asset-browser');

// State
let mapData = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    tileSize: TILE_SIZE,
    layers: [
        {}, // Layer 0: Ground (sparse map: "x,y" -> imagePath)
        {}, // Layer 1: Objects ("x,y" -> imagePath)
        {} // Layer 2: Meta (collision/logic) ("x,y" -> int type)
    ]
};

let currentTool = 'brush'; // brush, eraser, fill
let currentLayer = 1;
let currentAsset = null; // Path to selected image
let currentMetaType = 1; // Wall by default
let isDrawing = false;
let camera = { x: 0, y: 0, zoom: 2 }; 
let selectedTile = null; // { x, y, layer, w, h } - Bounding box of selection
let selectedObjectKey = null; // Key of the object in map data (top-left)
let autoCollision = true;
let movingObject = null; // { data, originalKey, offsetX, offsetY }
let lastX = 0, lastY = 0; // Mouse grid pos for ghost rendering
let layerVisibility = [true, true, true];
let history = [];
let redoStack = [];
const MAX_HISTORY = 50;
let isPanning = false;
let lastMouseX = 0, lastMouseY = 0;

// Asset Cache
const images = {};

// Colors for Meta Layer
const META_COLORS = {
    0: 'rgba(0, 0, 0, 0)', // Walkable
    1: 'rgba(255, 0, 0, 0.5)', // Wall
    2: 'rgba(0, 255, 0, 0.5)', // Bush
    3: 'rgba(0, 0, 255, 0.5)', // Cover Low
    4: 'rgba(0, 255, 255, 0.5)', // Cover High
    5: 'rgba(255, 255, 0, 0.5)', // Spawn Point (Team 1)
    6: 'rgba(255, 0, 255, 0.5)'  // Spawn Point (Team 2)
};

const RES_FACTOR = TILE_SIZE / COLLISION_RESOLUTION; // e.g. 16/4 = 4

// Initialization
function init() {
    resizeCanvas();
    loadAssets();
    setupEvents();
    requestAnimationFrame(loop);
}

function resizeCanvas() {
    canvas.width = mapData.width * TILE_SIZE * camera.zoom;
    canvas.height = mapData.height * TILE_SIZE * camera.zoom;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
}

function loadAssets() {
    for (const [category, assets] of Object.entries(AssetManifest.categories)) {
        const catDiv = document.createElement('div');
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerText = category;
        header.onclick = () => listDiv.style.display = listDiv.style.display === 'none' ? 'flex' : 'none';
        
        const listDiv = document.createElement('div');
        listDiv.className = 'asset-list';
        
        assets.forEach(asset => {
            const img = new Image();
            img.src = asset.path;
            img.className = 'asset-item';
            img.title = `${asset.name} (${asset.tiles_x}x${asset.tiles_y} tiles)`;
            img.onclick = () => selectAsset(asset, img);
            
            // Preload
            if (!images[asset.path]) {
                const cacheImg = new Image();
                cacheImg.src = asset.path;
                images[asset.path] = cacheImg;
            }

            listDiv.appendChild(img);
        });

        catDiv.appendChild(header);
        catDiv.appendChild(listDiv);
        assetBrowser.appendChild(catDiv);
    }
}

function selectAsset(asset, el) {
    currentAsset = asset;
    document.querySelectorAll('.asset-item').forEach(e => e.classList.remove('selected'));
    if (el) el.classList.add('selected');

    // AUTO-SELECT PROPERTIES BASED ON FOLDER
    const path = asset.path.toLowerCase();
    if (path.includes('/terrain/')) {
        currentLayer = 0;
        currentMetaType = 0; // Walkable
    } else if (path.includes('/wall/')) {
        currentLayer = 1;
        currentMetaType = 1; // Wall
    } else if (path.includes('/bush/')) {
        currentLayer = 1;
        currentMetaType = 2; // Bush
    } else if (path.includes('/cover/')) {
        currentLayer = 1;
        currentMetaType = 3; // Default to Low Cover
    } else {
        // Fallbacks for miscellaneous project assets
        if (path.includes('grass') || path.includes('dirt') || path.includes('sand')) {
            currentLayer = 0;
            currentMetaType = 0;
        } else {
            currentLayer = 1;
            currentMetaType = 1;
        }
    }
}

function setupEvents() {
    // Canvas Mouse Events
    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        handleDraw(e);
    });
    
    window.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.spaceKey)) {
            isPanning = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            e.preventDefault();
        }
    });

    window.addEventListener('mouseup', () => {
        isDrawing = false;
        isPanning = false;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (isPanning) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            camera.x += dx;
            camera.y += dy;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
        }
        if (isDrawing) handleDraw(e);
    });

    // Spacebar for panning
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') e.preventDefault();
    });

    // Toolbar Events
    document.getElementById('btn-save').onclick = saveMap;
    document.getElementById('btn-load').onclick = () => document.getElementById('file-load').click();
    document.getElementById('file-load').onchange = loadMap;
    
    // Spawn Brushes
    document.querySelectorAll('.spawn-brush').forEach(btn => {
        btn.onclick = () => {
            currentAsset = null;
            currentLayer = 2;
            currentMetaType = parseInt(btn.dataset.type);
            document.querySelectorAll('.asset-item').forEach(e => e.classList.remove('selected'));
            btn.classList.add('selected');
        };
    });

    document.getElementById('btn-resize').onclick = () => {
        const w = parseInt(document.getElementById('map-width').value);
        const h = parseInt(document.getElementById('map-height').value);
        if (w > 0 && h > 0) {
            mapData.width = w;
            mapData.height = h;
            resizeCanvas();
        }
    };

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.onclick = () => {
            currentTool = btn.dataset.tool;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    document.querySelectorAll('.icon-btn').forEach(btn => {
        btn.onclick = () => {
            const layer = parseInt(btn.dataset.layer);
            layerVisibility[layer] = !layerVisibility[layer];
            btn.classList.toggle('active', layerVisibility[layer]);
        };
    });

    document.getElementById('btn-rotate').onclick = rotateSelection;
    
    // Keybinds
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        // Undo/Redo
        if (e.ctrlKey && key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && key === 'y') { e.preventDefault(); redo(); }

        if (key === 'r') rotateSelection();
        if (key === 'm') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'move' }));
        if (key === 'b') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'brush' }));
        if (key === 'e') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'eraser' }));
        if (key === 's') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'select' }));
        
        // Layer quick switch
        if (key === '1') setLayer(0);
        if (key === '2') setLayer(1);
        if (key === '3') setLayer(2);

        if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
    });

    canvas.addEventListener('wheel', handleZoom, { passive: false });
}

function setLayer(index) {
    currentLayer = index;
}

function saveHistory() {
    history.push(JSON.stringify(mapData));
    if (history.length > MAX_HISTORY) history.shift();
    redoStack = []; // Clear redo on new action
}

function undo() {
    if (history.length === 0) return;
    redoStack.push(JSON.stringify(mapData));
    mapData = JSON.parse(history.pop());
    syncUIWithData();
}

function redo() {
    if (redoStack.length === 0) return;
    history.push(JSON.stringify(mapData));
    mapData = JSON.parse(redoStack.pop());
    syncUIWithData();
}

function syncUIWithData() {
    document.getElementById('map-width').value = mapData.width;
    document.getElementById('map-height').value = mapData.height;
    resizeCanvas();
}

function handleZoom(e) {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const oldZoom = camera.zoom;
    camera.zoom = Math.max(0.5, Math.min(10, camera.zoom + delta));
    
    // Update display
    document.getElementById('zoom-display').innerText = Math.round(camera.zoom * 100) + '%';
    resizeCanvas();
}

function handleDraw(e) {
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - camera.x) / camera.zoom;
    const worldY = (e.clientY - rect.top - camera.y) / camera.zoom;
    
    // Grid alignment depends on layer
    let x, y;
    if (currentLayer === 2) {
        x = Math.floor(worldX / COLLISION_RESOLUTION);
        y = Math.floor(worldY / COLLISION_RESOLUTION);
    } else {
        x = Math.floor(worldX / TILE_SIZE);
        y = Math.floor(worldY / TILE_SIZE);
    }
    
    lastX = x; lastY = y;
    
    // Bounds check
    const maxW = currentLayer === 2 ? mapData.width * RES_FACTOR : mapData.width;
    const maxH = currentLayer === 2 ? mapData.height * RES_FACTOR : mapData.height;

    if (x < 0 || y < 0 || x >= maxW || y >= maxH) return;

    if (e.button === 2) { // Right click erase
        removeFromLayer(x, y);
        return;
    }

    if (currentTool === 'brush' || currentTool === 'eraser') {
        saveHistory();
    }

    if (currentTool === 'brush') {
        addToLayer(x, y);
    } else if (currentTool === 'eraser') {
        removeFromLayer(x, y);
    } else if (currentTool === 'select') {
        handleSelect(x, y);
    } else if (currentTool === 'move') {
        handleMove(x, y, e.type);
    }
    
    // Status Bar update
    updateStatusBar(x, y);
}

// Prevent context menu
canvas.oncontextmenu = (e) => e.preventDefault();

function updateStatusBar(x, y) {
    document.getElementById('coord-display').innerText = `X: ${x}, Y: ${y}`;
    const info = selectedObjectKey ? `Selected: ${selectedObjectKey}` : "";
    document.getElementById('selected-info').innerText = info;
}

function findObjectUnderCursor(x, y, layerIndex) {
    // Iterate all objects in layer to find if (x,y) is within their bounds
    // This is O(N) but map size N is small enough for editor
    const layer = mapData.layers[layerIndex];
    
    for (const [key, data] of Object.entries(layer)) {
        // If meta layer (type 2), data is just int. It's single tile.
        if (layerIndex === 2) {
             const [ox, oy] = key.split(',').map(Number);
             if (ox === x && oy === y) return { key, data, x: ox, y: oy, w: 1, h: 1 };
             continue;
        }

        // For visual layers
        const [ox, oy] = key.split(',').map(Number);
        
        // Handle rotation for dimensions
        const path = typeof data === 'string' ? data : data.path;
        const baseTx = (typeof data === 'string') ? 1 : (data.tx || 1);
        const baseTy = (typeof data === 'string') ? 1 : (data.ty || 1);
        const rot = (typeof data === 'string') ? 0 : (data.rot || 0);

        // Effective dimensions
        let w = baseTx;
        let h = baseTy;
        if (rot % 2 !== 0) { // 90 or 270 deg
            w = baseTy;
            h = baseTx;
        }

        if (x >= ox && x < ox + w && y >= oy && y < oy + h) {
            return { key, data, x: ox, y: oy, w, h };
        }
    }
    return null;
}

function handleSelect(x, y) {
    const obj = findObjectUnderCursor(x, y, currentLayer);
    
    if (obj) {
        selectedTile = { x: obj.x, y: obj.y, w: obj.w, h: obj.h, layer: currentLayer };
        selectedObjectKey = obj.key;
    } else {
        selectedTile = null;
        selectedObjectKey = null;
    }
}

function handleMove(x, y, eventType) {
    if (eventType === 'mousedown') {
        const obj = findObjectUnderCursor(x, y, currentLayer);
        if (obj) {
            movingObject = {
                data: JSON.parse(JSON.stringify(mapData.layers[currentLayer][obj.key])), // Deep copy
                originalKey: obj.key,
                offsetX: x - obj.x,
                offsetY: y - obj.y
            };
            // Remove original temporarily (visual feedback)
            delete mapData.layers[currentLayer][obj.key];
            selectedTile = null; 
        }
    } else if (eventType === 'mousemove' && isDrawing && movingObject) {
        // Just visual? The render loop handles visual.
        // We could show ghost. For now simple.
    } else if (eventType === 'mouseup' && movingObject) { // Actually mouseup is handled by window, but handleDraw is called?
        // Wait, handleDraw is called on mousedown and mousemove.
        // We need a specific 'mouseup' logic?
        // editor.js structure calls handleDraw on mousedown/move. 
        // window.mouseup sets isDrawing=false.
        // Let's rely on 'isDrawing' check in the loop or similar?
        // Actually, handleDraw isn't triggered on mouseup. 
        // We check isDrawing in mousemove.
    }
}

// Global mouse up handler needs to finish move
window.addEventListener('mouseup', (e) => {
    if (movingObject) {
         const rect = canvas.getBoundingClientRect();
         const cx = Math.floor((e.clientX - rect.left) / (TILE_SIZE * camera.zoom));
         const cy = Math.floor((e.clientY - rect.top) / (TILE_SIZE * camera.zoom));
         
         // Place object
         const finalX = cx - movingObject.offsetX;
         const finalY = cy - movingObject.offsetY;
         
         // Validate bounds? Or just let it place
         const key = `${finalX},${finalY}`;
         mapData.layers[currentLayer][key] = movingObject.data;
         
         // Select it
         selectedTile = { 
             x: finalX, y: finalY, 
             w: (movingObject.data.rot % 2 !== 0 ? movingObject.data.ty : movingObject.data.tx) || 1,
             h: (movingObject.data.rot % 2 !== 0 ? movingObject.data.tx : movingObject.data.ty) || 1,
             layer: currentLayer 
         };
         selectedObjectKey = key;
         
         movingObject = null;
    }
    isDrawing = false;
});


function rotateSelection() {
    if (!selectedObjectKey || selectedTile.layer === 2) return; // Can't rotate meta tiles easily individually (they are single ints)
    
    const layer = mapData.layers[selectedTile.layer];
    const data = layer[selectedObjectKey];
    
    if (data) {
        let obj = (typeof data === 'string') ? { path: data, tx: 1, ty: 1, rot: 0 } : data;
        
        // Rotate
        obj.rot = ((obj.rot || 0) + 1) % 4;
        layer[selectedObjectKey] = obj;
        
        // Update selection box dimensions
        const temp = selectedTile.w;
        selectedTile.w = selectedTile.h;
        selectedTile.h = temp;
    }
}

function deleteSelection() {
    if (!selectedObjectKey) return;
    saveHistory();
    delete mapData.layers[selectedTile.layer][selectedObjectKey];
    selectedTile = null;
    selectedObjectKey = null;
}

function addToLayer(x, y) {
    if (currentLayer === 2) {
        // Meta Layer - can be stamped with asset footprint or single cell
        let tx = currentAsset ? currentAsset.tiles_x : 1;
        let ty = currentAsset ? currentAsset.tiles_y : 1;
        
        // If placing meta using a visual asset brush, scale up the footprint
        if (currentAsset) {
            tx = Math.ceil(tx * RES_FACTOR);
            ty = Math.ceil(ty * RES_FACTOR);
        }

        for (let i = 0; i < tx; i++) {
            for (let j = 0; j < ty; j++) {
                const nx = x + i;
                const ny = y + j;
                if (nx < mapData.width * RES_FACTOR && ny < mapData.height * RES_FACTOR) {
                    mapData.layers[2][`${nx},${ny}`] = currentMetaType;
                }
            }
        }
    } else if (currentAsset) { // Visual Layers
        const key = `${x},${y}`;
        mapData.layers[currentLayer][key] = {
            path: currentAsset.path,
            tx: currentAsset.tiles_x,
            ty: currentAsset.tiles_y,
            rot: 0
        };
    }
}

function removeFromLayer(x, y) {
    // Old logic: just key delete. New logic: find object.
    const obj = findObjectUnderCursor(x, y, currentLayer);
    if (obj) {
        delete mapData.layers[currentLayer][obj.key];
        if (selectedObjectKey === obj.key) {
            selectedTile = null;
            selectedObjectKey = null;
        }
    }
}

function loop() {
    render();
    requestAnimationFrame(loop);
}

function render() {
    // Clear
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // Grid (only draw inside map bounds)
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const gridW = mapData.width * TILE_SIZE;
    const gridH = mapData.height * TILE_SIZE;
    for (let x = 0; x <= mapData.width; x++) {
        ctx.moveTo(x * TILE_SIZE, 0);
        ctx.lineTo(x * TILE_SIZE, gridH);
    }
    for (let y = 0; y <= mapData.height; y++) {
        ctx.moveTo(0, y * TILE_SIZE);
        ctx.lineTo(gridW, y * TILE_SIZE);
    }
    ctx.stroke();

    // Map Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, gridW, gridH);

    // Layers
    // Layer 0: Ground
    if (layerVisibility[0]) renderVisualLayer(0);
    // Layer 1: Objects
    if (layerVisibility[1]) renderVisualLayer(1);

    // Brush Ghost
    if (currentTool === 'brush' && !movingObject) {
        if (currentAsset) {
            ctx.globalAlpha = 0.4;
            renderObject(lastX, lastY, {
                path: currentAsset.path,
                tx: currentAsset.tiles_x,
                ty: currentAsset.tiles_y,
                rot: 0
            });
            ctx.globalAlpha = 1.0;
        } else if (currentLayer === 2 && META_COLORS[currentMetaType]) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = META_COLORS[currentMetaType];
            ctx.fillRect(lastX * COLLISION_RESOLUTION, lastY * COLLISION_RESOLUTION, COLLISION_RESOLUTION, COLLISION_RESOLUTION);
            ctx.globalAlpha = 1.0;
        }
    }

    // Moving Ghost
    if (movingObject) {
        ctx.globalAlpha = 0.5;
        const gx = lastX - movingObject.offsetX;
        const gy = lastY - movingObject.offsetY;
        renderObject(gx, gy, movingObject.data);
        ctx.globalAlpha = 1.0;
    }
    
    // Layer 2: Meta (Overlay)
    if (currentLayer === 2 || layerVisibility[2]) {
        ctx.globalAlpha = 0.5;
        for (const [key, val] of Object.entries(mapData.layers[2])) {
            const [gx, gy] = key.split(',').map(Number);
            if (META_COLORS[val]) {
                ctx.fillStyle = META_COLORS[val];
                ctx.fillRect(gx * COLLISION_RESOLUTION, gy * COLLISION_RESOLUTION, COLLISION_RESOLUTION, COLLISION_RESOLUTION);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();
}

function renderVisualLayer(layerIndex) {
    const layers = mapData.layers[layerIndex];
    const isMeta = layerIndex === 2;
    const res = isMeta ? COLLISION_RESOLUTION : TILE_SIZE;

    for (const [key, data] of Object.entries(layers)) {
        const [gx, gy] = key.split(',').map(Number);
        renderObject(gx, gy, data);
    }

    // Highlight Selection
    if (selectedTile && selectedTile.layer === layerIndex) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(selectedTile.x * TILE_SIZE, selectedTile.y * TILE_SIZE, selectedTile.w * TILE_SIZE, selectedTile.h * TILE_SIZE);
    }
}

function renderObject(x, y, data) {
    const path = typeof data === 'string' ? data : data.path;
    const tx = data.tx || 1;
    const ty = data.ty || 1;
    const rot = data.rot || 0;

    let curW = tx;
    let curH = ty;
    if (rot % 2 !== 0) { curW = ty; curH = tx; }

    const img = images[path];
    if (img && img.complete) {
        ctx.save();
        ctx.translate(x * TILE_SIZE + (curW * TILE_SIZE) / 2, y * TILE_SIZE + (curH * TILE_SIZE) / 2);
        ctx.rotate(rot * Math.PI / 2);
        ctx.drawImage(img, -(tx * TILE_SIZE) / 2, -(ty * TILE_SIZE) / 2, tx * TILE_SIZE, ty * TILE_SIZE);
        ctx.restore();
    }
}

function saveMap() {
    if (autoCollision) {
        processAutoCollision();
    }
    const json = JSON.stringify(mapData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map.json';
    a.click();
}

function processAutoCollision() {
    // 1. Clear existing Walls (1), Bushes (2), Cover (3, 4)
    for (const key in mapData.layers[2]) {
        const type = mapData.layers[2][key];
        if (type >= 1 && type <= 4) {
            delete mapData.layers[2][key];
        }
    }

    // 2. Iterate all objects in Layer 1
    for (const [key, data] of Object.entries(mapData.layers[1])) {
        const path = typeof data === 'string' ? data : data.path;
        const tx = (typeof data === 'string') ? 1 : (data.tx || 1);
        const ty = (typeof data === 'string') ? 1 : (data.ty || 1);
        const rot = (typeof data === 'string') ? 0 : (data.rot || 0);
        const [x, y] = key.split(',').map(Number);
        
        if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) continue;

        // Determine Meta-Type from path (same as brush logic)
        let metaType = 1; // Wall
        const lPath = path.toLowerCase();
        if (lPath.includes('/bush/')) metaType = 2;
        if (lPath.includes('/cover/')) metaType = 3;

        const objectWalls = new Set();
        generateCollisionForObject(x, y, path, tx, ty, rot, objectWalls);
        
        // Post-process this specific object's mesh
        postProcessCollision(objectWalls);

        // Apply to Layer 2 at high resolution
        objectWalls.forEach(wKey => {
            if (!mapData.layers[2][wKey]) {
                mapData.layers[2][wKey] = metaType;
            }
        });
    }
}

function generateCollisionForObject(worldX, worldY, path, tx, ty, rot, walls) {
    const img = images[path];
    if (!img || !img.complete) return;

    const width = tx * TILE_SIZE;
    const height = ty * TILE_SIZE;
    
    // Fix: Swap canvas dimensions if rotated 90 or 270 degrees
    let canvasW = width;
    let canvasH = height;
    if (rot % 2 !== 0) {
        canvasW = height;
        canvasH = width;
    }

    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = canvasH;
    const ctx = c.getContext('2d');
    
    // Handle Rotation: Center in the possibly-swapped canvas
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate(rot * Math.PI / 2);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();

    const pixels = ctx.getImageData(0, 0, canvasW, canvasH).data;
    const opacityThreshold = 100;

    // Scan the object area at COLLISION_RESOLUTION (4px)
    for (let py = 0; py < canvasH; py += COLLISION_RESOLUTION) {
        for (let px = 0; px < canvasW; px += COLLISION_RESOLUTION) {
            let hitCount = 0;
            // Sample a few pixels in this 4x4 block for consistency
            for (let sy = 0; sy < COLLISION_RESOLUTION; sy += 2) {
                for (let sx = 0; sx < COLLISION_RESOLUTION; sx += 2) {
                    const alphaIdx = ((py + sy) * canvasW + (px + sx)) * 4 + 3;
                    if (pixels[alphaIdx] > opacityThreshold) hitCount++;
                }
            }
            
            if (hitCount > 0) {
                const finalX = Math.floor(worldX * RES_FACTOR + px / COLLISION_RESOLUTION);
                const finalY = Math.floor(worldY * RES_FACTOR + py / COLLISION_RESOLUTION);
                walls.add(`${finalX},${finalY}`);
            }
        }
    }
}

function postProcessCollision(walls) {
    const neighborOffsets = [
        [0, 1], [0, -1], [1, 0], [-1, 0]
    ];
    
    // Pass 1: Fill Holes (1-tile gaps)
    const toAdd = new Set();
    // Fix: Use high-res bounds
    const bounds = { minX:0, minY:0, maxX: mapData.width * RES_FACTOR, maxY: mapData.height * RES_FACTOR };
    
    // We iterate the bounding box of the map? Or just known walls?
    // Safe to iterate map for safety.
    /* Optimization: iterating 256x256 is 65k checks. Fast enough. */
    for (let y = 1; y < bounds.maxY - 1; y++) {
        for (let x = 1; x < bounds.maxX - 1; x++) {
            const key = `${x},${y}`;
            if (!walls.has(key)) {
                let n = 0;
                neighborOffsets.forEach(([dx, dy]) => {
                    if (walls.has(`${x+dx},${y+dy}`)) n++;
                });
                if (n >= 3) toAdd.add(key); // Fill if surrounded
            }
        }
    }
    toAdd.forEach(k => walls.add(k));
    
    // Pass 2: Smooth Singletons (Remove isolate pixels)
    const toRemove = new Set();
    walls.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        let n = 0;
        neighborOffsets.forEach(([dx, dy]) => {
            if (walls.has(`${x+dx},${y+dy}`)) n++;
        });
        if (n <= 0) toRemove.add(key); // Remove orphans
    });
    toRemove.forEach(k => walls.delete(k));
}

function loadMap(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.width && data.height && data.layers) {
                mapData = data;
                document.getElementById('map-width').value = mapData.width;
                document.getElementById('map-height').value = mapData.height;
                resizeCanvas();
                // Ensure Tile Size is correct 
                mapData.tileSize = TILE_SIZE; // Enforce 16
            }
        } catch (err) {
            console.error(err);
            alert("Invalid map file");
        }
    };
    reader.readAsText(file);
}

// Start
init();
