
import { AssetManifest } from './assets/AssetManifest.js';
import { Config } from './modules/Config.js';

const TILE_SIZE = 16;
const COLLISION_RESOLUTION = 2; // Physical resolution (2x2px per tile)
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
        {}, // Layer 2: Deco ("x,y" -> imagePath)
        [], // Layer 3: Vector Colliders
        {}  // Layer 4: Spawns ("x,y" -> {spawnType})
    ]
};

let currentTool = 'brush'; // brush, eraser, fill
let currentLayer = 1;
let currentAsset = null; // Path to selected image
let currentMetaType = 1; // Unused for now
// State
let lastX = 0, lastY = 0; // Mouse grid pos for ghost rendering
let activeBoundary = null; // { points: [] } during drawing
let currentVectorType = null;
let isDrawing = false;
let camera = { x: 0, y: 0, zoom: 2 }; 
let selectedTile = null; // { x, y, layer, w, h } - Bounding box of selection
let selectedObjectKey = null; // Key of the object in map data (top-left)
let autoCollision = true;
let movingObject = null; // { data, originalKey, offsetX, offsetY }
let layerVisibility = [true, true, true, true, true];
let history = [];
let redoStack = [];
const MAX_HISTORY = 50;
let isPanning = false;
let lastMouseX = 0, lastMouseY = 0;
let activeHandle = null; // 'nw', 'ne', 'sw', 'se', 'rot'
let originalTransform = null; // Store state when starting a transform

// Asset Cache
const images = {};

function resizeVector(delta) {
    if (selectedObjectKey === null || selectedTile.layer !== 3) return;
    saveHistory();
    const v = mapData.layers[3][selectedObjectKey];
    if (v.type === 'rect') {
        // Resize from center
        v.w = Math.max(8, v.w + delta * 2);
        v.h = Math.max(8, v.h + delta * 2);
        selectedTile.w = v.w; selectedTile.h = v.h; // Just for feedback
    } else if (v.type === 'circle') {
        v.radius = Math.max(4, v.radius + delta * 2);
    }
}

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

let fillStart = null; 

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

    const path = asset.path.toLowerCase();
    if (path.includes('/terrain/')) {
        currentLayer = 0;
    } else if (path.includes('/wall/') || path.includes('/bush/') || path.includes('/cover/')) {
        currentLayer = 1;
    } else if (path.includes('/deco/')) {
        currentLayer = 2; // Decoration Layer
    } else {
        // Fallbacks
        if (path.includes('grass') || path.includes('dirt')) {
            currentLayer = 0;
        } else {
            currentLayer = 1;
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
        
        if (activeHandle) {
            handleTransform(e);
            return;
        }

        handleDraw(e);
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
            currentLayer = 4; // Target Spawns Layer
            currentMetaType = parseInt(btn.dataset.type);
            document.querySelectorAll('.asset-item').forEach(e => e.classList.remove('selected'));
            btn.classList.add('selected');
            
            // Auto-switch to brush tool
            currentTool = 'brush';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const brushBtn = document.querySelector('.tool-btn[data-tool="brush"]');
            if (brushBtn) brushBtn.classList.add('active');
        };
    });
    document.querySelectorAll('.collision-tool').forEach(btn => {
        btn.onclick = () => {
            currentAsset = null;
            currentLayer = 3; 
            currentVectorType = btn.dataset.type; // 'boundary_wall', 'boundary_cover', 'boundary_bush'
            
            // Auto-switch to brush tool
            currentTool = 'brush';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const brushBtn = document.querySelector('.tool-btn[data-tool="brush"]');
            if (brushBtn) brushBtn.classList.add('active');

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
            // Fix: Cancel move if active to prevent state corruption
            if (movingObject) {
                 mapData.layers[movingObject.layer][movingObject.originalKey] = movingObject.data;
                 movingObject = null;
            }

            currentTool = btn.dataset.tool;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    // Fix: Listen for tool switch events from keyboard shortcuts
    canvas.addEventListener('switchTool', (e) => {
        const tool = e.detail;
        const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
        if (btn) btn.click();
    });

    document.querySelectorAll('.icon-btn').forEach(btn => {
        btn.onclick = () => {
            const layer = parseInt(btn.dataset.layer);
            layerVisibility[layer] = !layerVisibility[layer];
            btn.classList.toggle('active', layerVisibility[layer]);
        };
    });

    // document.getElementById('btn-rotate').onclick = rotateSelection; // Removed as requested
    
    // Keybinds
    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        // Undo/Redo
        if (e.ctrlKey && key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && key === 'y') { e.preventDefault(); redo(); }

        if (key === 'r') rotateSelection();
        if (key === 'enter' && activeBoundary) finalizeBoundary();
        if (key === 'm') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'move' }));
        if (key === 'b') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'brush' }));
        if (key === 'f') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'fill' }));
        if (key === 'e') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'eraser' }));
        if (key === 's') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'select' }));
        
        // Layer quick switch
        if (key === '1') setLayer(0);
        if (key === '2') setLayer(1);
        if (key === '3') setLayer(2);
        if (key === '4') setLayer(3);
        if (key === '5') setLayer(4);

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
    if (currentLayer === 3) {
        // Snap to collision resolution (4px) by default, or 1px if Shift is held
        const snap = e.shiftKey ? 1 : COLLISION_RESOLUTION;
        x = Math.round(worldX / snap) * snap;
        y = Math.round(worldY / snap) * snap;
    } else {
        // Layers 0, 1, 2 are all grid-based visual layers (16px tiles)
        x = Math.floor(worldX / TILE_SIZE);
        y = Math.floor(worldY / TILE_SIZE);
    }
    
    lastX = x; lastY = y;
    
    // Bounds check
    let maxW, maxH;
    if (currentLayer === 3) {
        maxW = mapData.width * TILE_SIZE;
        maxH = mapData.height * TILE_SIZE;
    } else {
        // Layers 0, 1, 2 are tile grid
        maxW = mapData.width;
        maxH = mapData.height;
    }

    if (x < 0 || y < 0 || x >= maxW || y >= maxH) return;

    if (e.button === 2 && isDrawing) { // Right click erase
        removeFromLayer(x, y);
        return;
    }

    if ((currentTool === 'brush' || currentTool === 'eraser') && e.type === 'mousedown') {
        saveHistory();
    }

    if (currentTool === 'brush') {
        if (isDrawing) {
            // Prevent multiple vector spawns while dragging - spawn only on mousedown
            if (currentLayer !== 3 || e.type === 'mousedown') {
                addToLayer(x, y);
            }
        }
    } else if (currentTool === 'fill') {
        if (e.type === 'mousedown') fillStart = {x, y};
        else if (e.type === 'mouseup' && fillStart) {
            handleRectangleFill(fillStart.x, fillStart.y, x, y);
            fillStart = null;
        }
    } else if (currentTool === 'eraser') {
        if (isDrawing) removeFromLayer(x, y);
    } else if (currentTool === 'select') {
        if (e.type === 'mousedown') {
            // First check handles if something is already selected
            if (!checkHandles(worldX, worldY)) {
                handleSelect(x, y);
            }
        }
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
    if (layerIndex === 3) {
        // Vector Hit Test (Reverse iterate for top-most)
        const vectors = mapData.layers[3] || [];
        for (let i = vectors.length - 1; i >= 0; i--) {
            const v = vectors[i];
            if (!v) continue;
            let hit = false;
            
            // Note: input x,y are in World Pixels for Layer 3 context, but this function tends to be called with Grid coords?
            // Actually handleDraw calculates x/y based on TILE_SIZE for most layers.
            // For Layer 3 we set x/y to be pixel coords in handleDraw.
            // So x,y here are accurate world pixels.

            if (!v || !v.points || v.points.length < 2) continue;
            
            // Transform cursor into local space of polygon if it has pos/rot
            // For now, polygons are world-space points. Let's simplify.
            const pts = v.points;
            
            // Hit test: either inside (if closed) OR near a segment (if open or closed)
            
            // 1. Point in Polygon (Ray casting for closed shapes)
            if (v.closed) {
                let inside = false;
                for (let j = 0, k = pts.length - 1; j < pts.length; k = j++) {
                    if (((pts[j].y > y) !== (pts[k].y > y)) &&
                        (x < (pts[k].x - pts[j].x) * (y - pts[j].y) / (pts[k].y - pts[j].y) + pts[j].x)) {
                        inside = !inside;
                    }
                }
                if (inside) hit = true;
            }

            // 2. Proximity to segments (for open lines or edges)
            if (!hit) {
                const threshold = 10 / camera.zoom;
                for (let j = 0; j < pts.length - 1; j++) {
                    if (distToSegment({x, y}, pts[j], pts[j+1]) < threshold * threshold) {
                        hit = true;
                        break;
                    }
                }
            }
            
            if (hit) {
                // Return bounding box for selection UI
                let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
                pts.forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                return { key: i, data: v, x: minX, y: minY, w: maxX - minX, h: maxY - minY, rot: 0, layer: 3 };
            }
        }
        return null;
    }

    // Default Object Logic (Layers 0, 1, 2)
    const layer = mapData.layers[layerIndex];
    if (!layer) return null; // Safety

    for (const [key, data] of Object.entries(layer)) {
        // For Visual layers (Standard Hit Test)
        const [ox, oy] = key.split(',').map(Number);
        
        const path = typeof data === 'string' ? data : data.path;
        const baseTx = (typeof data === 'string') ? 1 : (data.tx || 1);
        const baseTy = (typeof data === 'string') ? 1 : (data.ty || 1);
        const rot = (typeof data === 'string') ? 0 : (data.rot || 0);

        // Selection aware of continuous rotation
        const cx = (ox + baseTx / 2) * TILE_SIZE;
        const cy = (oy + baseTy / 2) * TILE_SIZE;
        // For grid-based layers, we check if the center of the clicked tile is inside the object's footprint
        const worldX = (x + 0.5) * TILE_SIZE; 
        const worldY = (y + 0.5) * TILE_SIZE;
        
        const dx = worldX - cx;
        const dy = worldY - cy;
        const s = Math.sin(-rot);
        const c = Math.cos(-rot);
        
        const rx = Math.abs(dx * c - dy * s);
        const ry = Math.abs(dx * s + dy * c);

        // Selection with small 2px margin of error for resized/rotated objects
        const margin = 2;
        if (rx < (baseTx * TILE_SIZE) / 2 + margin && ry < (baseTy * TILE_SIZE) / 2 + margin) {
            return { key, data, x: ox, y: oy, w: baseTx, h: baseTy, rot: rot };
        }
    }
    return null;
}

function handleSelect(x, y) {
    const obj = findObjectUnderCursor(x, y, currentLayer);
    
    if (obj) {
        selectedTile = { x: obj.x, y: obj.y, w: obj.w, h: obj.h, rot: obj.rot || 0, layer: currentLayer };
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
            saveHistory(); // Save history before starting move
            movingObject = {
                data: JSON.parse(JSON.stringify(mapData.layers[currentLayer][obj.key])), // Deep copy
                originalKey: obj.key,
                offsetX: x - obj.x,
                offsetY: y - obj.y,
                initialX: obj.x,
                initialY: obj.y,
                layer: currentLayer // Store original layer
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
// Global mouse up handler needs to finish move
window.addEventListener('mouseup', (e) => {
    if (activeHandle || (currentTool === 'fill' && fillStart)) {
        handleDraw(e);
    }
    
     if (movingObject) {
         const rect = canvas.getBoundingClientRect();
         const worldX = (e.clientX - rect.left - camera.x) / camera.zoom;
         const worldY = (e.clientY - rect.top - camera.y) / camera.zoom;
         
         const isVector = movingObject.layer === 3;
         let cx, cy;
         
         if (isVector) {
             const snap = e.shiftKey ? 1 : COLLISION_RESOLUTION;
             cx = Math.round(worldX / snap) * snap;
             cy = Math.round(worldY / snap) * snap;
         } else {
             cx = Math.floor(worldX / TILE_SIZE);
             cy = Math.floor(worldY / TILE_SIZE);
         }
         
         const finalX = cx - movingObject.offsetX;
         const finalY = cy - movingObject.offsetY;
         
         const maxW = isVector ? mapData.width * TILE_SIZE : mapData.width;
         const maxH = isVector ? mapData.height * TILE_SIZE : mapData.height;

         if (finalX >= 0 && finalY >= 0 && (isVector || (finalX < maxW && finalY < maxH))) {
             if (isVector) {
                 const dx = finalX - movingObject.initialX;
                 const dy = finalY - movingObject.initialY;
                 
                 // Shift all points of the polygon
                 movingObject.data.points.forEach(p => {
                     p.x += dx;
                     p.y += dy;
                 });
                 
                 mapData.layers[3].push(movingObject.data);
                 selectedObjectKey = mapData.layers[3].length - 1;
                 
                 // Recalculate bounds for selection tile
                 let minX = movingObject.data.points[0].x, maxX = minX, minY = movingObject.data.points[0].y, maxY = minY;
                 movingObject.data.points.forEach(p => {
                     minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                     minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                 });
                 selectedTile = { x: minX, y: minY, w: maxX - minX, h: maxY - minY, rot: 0, layer: 3 };
             } else {
                 const key = `${finalX},${finalY}`;
                 mapData.layers[movingObject.layer][key] = movingObject.data;
                 selectedTile = { 
                     x: finalX, y: finalY, 
                     w: (movingObject.data.rot % 2 !== 0 ? movingObject.data.ty : movingObject.data.tx) || 1,
                     h: (movingObject.data.rot % 2 !== 0 ? movingObject.data.tx : movingObject.data.ty) || 1,
                     rot: movingObject.data.rot || 0,
                     layer: movingObject.layer 
                 };
                 selectedObjectKey = key;
             }
         } else {
             if (movingObject.layer === 3) {
                 mapData.layers[3].push(movingObject.data); 
                 selectedObjectKey = mapData.layers[3].length - 1;
             } else {
                 mapData.layers[movingObject.layer][movingObject.originalKey] = movingObject.data;
                 selectedObjectKey = movingObject.originalKey;
             }
             selectedTile = null; 
         }
         
         movingObject = null;
    }
    activeHandle = null;
    isDrawing = false;
    isPanning = false;
});

function rotateSelection() {
    if (selectedObjectKey === null) return; 
    
    saveHistory();
    const layer = mapData.layers[selectedTile.layer];
    const data = layer[selectedObjectKey];
    
    if (data) {
        let obj = (typeof data === 'string') ? { path: data, tx: 1, ty: 1, rot: 0 } : data;
        
        // Quick 90-degree step snapping for the R key
        obj.rot = ((obj.rot || 0) + Math.PI / 2) % (Math.PI * 2);
        layer[selectedObjectKey] = obj;
        
        // Update selection box dimensions
        const temp = selectedTile.w;
        selectedTile.w = selectedTile.h;
        selectedTile.h = temp;
        selectedTile.rot = obj.rot; // Update selectedTile's rotation
    } else if (selectedObjectKey !== null && selectedTile.layer === 3) {
        // Rotate Vector
        const v = mapData.layers[3][selectedObjectKey];
        if (v.type === 'rect') {
             v.rot = ((v.rot || 0) + 1) % 4;
             selectedTile.rot = v.rot; // Update selectedTile's rotation
        }
    }
}

function deleteSelection() {
    if (selectedObjectKey === null) return;
    saveHistory();
    
    if (selectedTile.layer === 3) {
         mapData.layers[3].splice(selectedObjectKey, 1);
         selectedTile = null; selectedObjectKey = null;
         return;
    }
    
    delete mapData.layers[selectedTile.layer][selectedObjectKey];
    selectedTile = null;
    selectedObjectKey = null;
}

function addToLayer(x, y) {
    if (currentLayer === 3) {
        if (!activeBoundary) {
            // Start new boundary with specific type
            const type = currentVectorType || 'boundary_wall'; // Default fallback
            activeBoundary = { points: [{x, y}], type: type };
        } else {
            // If clicking near first point, close it
            const start = activeBoundary.points[0];
            const dist = Math.hypot(x - start.x, y - start.y);
            if (dist < 10 && activeBoundary.points.length >= 2) {
                finalizeBoundary(true);
            } else {
                activeBoundary.points.push({x, y});
            }
        }
    } else if (currentAsset) { // Layers 0, 1, 2 (Visual)
        const key = `${x},${y}`;
        mapData.layers[currentLayer][key] = {
            path: currentAsset.path,
            tx: currentAsset.tiles_x,
            ty: currentAsset.tiles_y,
            rot: 0
        };
    } else if (currentLayer === 4) { // Spawns
        const key = `${x},${y}`;
        mapData.layers[4][key] = {
            spawnType: currentMetaType
        };
    }
}

function removeFromLayer(x, y) {
    saveHistory();
    if (currentLayer === 3) {
        const obj = findObjectUnderCursor(x, y, 3);
        if (obj) {
            mapData.layers[3].splice(obj.key, 1);
            if (selectedObjectKey === obj.key) {
                selectedTile = null;
                selectedObjectKey = null;
            }
        }
        return;
    }

    const obj = findObjectUnderCursor(x, y, currentLayer);
    if (obj) {
        delete mapData.layers[currentLayer][obj.key];
        if (selectedObjectKey === obj.key) {
            selectedTile = null;
            selectedObjectKey = null;
        }
    } else {
        // Fallback: if no object found but it's a grid layer, try direct key deletion for sparse tiles
        const key = `${x},${y}`;
        if (mapData.layers[currentLayer][key]) {
            delete mapData.layers[currentLayer][key];
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

    // Grid Overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= mapData.width; x++) {
        ctx.moveTo(x * TILE_SIZE, 0);
        ctx.lineTo(x * TILE_SIZE, mapData.height * TILE_SIZE);
    }
    for (let y = 0; y <= mapData.height; y++) {
        ctx.moveTo(0, y * TILE_SIZE);
        ctx.lineTo(mapData.width * TILE_SIZE, y * TILE_SIZE);
    }
    ctx.stroke();

    // Map Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, gridW, gridH);

    // Layers
    // Layer 0: Ground
    if (layerVisibility[0]) renderVisualLayer(0);
    // Layer 1: Objects (Main)
    if (layerVisibility[1]) renderVisualLayer(1);
    // Layer 2: Decoration
    if (layerVisibility[2]) renderVisualLayer(2);
    
    // Layer 3: Collisions (Vectors)
    if (layerVisibility[3] || currentLayer === 3) {
       renderVectorLayer();
    }

    // Layer 4: Spawns
    if (layerVisibility[4] || currentLayer === 4) {
       renderSpawnLayer();
    }

    // Brush Ghost

    // Brush Ghost
    // Brush Ghost
    if (currentTool === 'brush' && !movingObject) {
        ctx.globalAlpha = 0.4;
        if (currentAsset) {
            renderObject(lastX, lastY, {
                path: currentAsset.path,
                tx: currentAsset.tiles_x,
                ty: currentAsset.tiles_y,
                rot: 0
            });
        } else if (currentLayer === 4) {
             // Spawn Ghost
             const type = currentMetaType;
             ctx.fillStyle = type === 5 ? '#ffff00' : '#ff00ff';
             ctx.fillRect(lastX * TILE_SIZE, lastY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
             ctx.fillStyle = '#000';
             ctx.font = 'bold 8px Arial';
             ctx.textAlign = 'center';
             ctx.fillText(type === 5 ? 'T1' : 'T2', lastX * TILE_SIZE + TILE_SIZE/2, lastY * TILE_SIZE + 10);
        }
        ctx.globalAlpha = 1.0;
    }

    // Moving Ghost
    if (movingObject) {
        ctx.globalAlpha = 0.5;
        const gx = lastX - movingObject.offsetX;
        const gy = lastY - movingObject.offsetY;
        
        if (movingObject.layer === 3) {
            const dx = gx - movingObject.data.points[0].x;
            const dy = gy - movingObject.data.points[0].y;
            const ghostPoints = movingObject.data.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            renderVectorObject({ ...movingObject.data, points: ghostPoints }, false);
        } else if (movingObject.layer === 4) {
            ctx.fillStyle = movingObject.data.spawnType === 5 ? '#ffff00' : '#ff00ff';
            ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
            renderObject(gx, gy, movingObject.data);
        }
        ctx.globalAlpha = 1.0;
    }

    // Boundary Preview
    if (activeBoundary) {
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        activeBoundary.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.lineTo(lastX, lastY);
        ctx.stroke();
    }

    // Fill Rectangle Preview
    if (currentTool === 'fill' && fillStart && isDrawing) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        const x1 = Math.min(fillStart.x, lastX);
        const y1 = Math.min(fillStart.y, lastY);
        const x2 = Math.max(fillStart.x, lastX);
        const y2 = Math.max(fillStart.y, lastY);
        ctx.strokeRect(x1 * TILE_SIZE, y1 * TILE_SIZE, (x2 - x1 + 1) * TILE_SIZE, (y2 - y1 + 1) * TILE_SIZE);
    }
    
    // Layer 2 (Deco) is now rendered via renderVisualLayer(2) above
    // Removed old Meta (Overlay) rendering block

    // Transform Handels (UI Layer - non-transformed coordinates)
    renderHandles();

    ctx.restore();
}

function renderHandles() {
    if (!selectedTile) return;
    
    let rot = selectedTile.rot || 0;
    if (selectedObjectKey !== null) {
        const data = mapData.layers[selectedTile.layer][selectedObjectKey];
        if (data) rot = (typeof data === 'object') ? (data.rot || 0) : 0;
    }

    const x = selectedTile.x;
    const y = selectedTile.y;
    const w = selectedTile.w;
    const h = selectedTile.h;
    const isVector = selectedTile.layer === 3;
    const unit = isVector ? 1 : TILE_SIZE;

    ctx.save();
    // For vectors, x/y is already the center. For tiles, we calculate it.
    const cx = isVector ? x : (x + w/2) * unit;
    const cy = isVector ? y : (y + h/2) * unit;
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    ctx.strokeStyle = '#00ffff';
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(-w * unit / 2, -h * unit / 2, w * unit, h * unit);
    ctx.setLineDash([]);

    const handleSize = 6 / camera.zoom;
    ctx.fillStyle = '#fff';
    
    const cw = w * unit;
    const ch = h * unit;
    const handles = [
        [-cw/2, -ch/2], [0, -ch/2], [cw/2, -ch/2], // NW, N, NE
        [cw/2, 0], [cw/2, ch/2], [0, ch/2],         // E, SE, S
        [-cw/2, ch/2], [-cw/2, 0]                   // SW, W
    ];
    
    handles.forEach(([hx, hy]) => {
        ctx.fillRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
    });

    // Rotation Handle
    const rx = 0;
    const ry = -ch/2 - 20 / camera.zoom;
    ctx.beginPath();
    ctx.arc(rx, ry, handleSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx, -ch/2);
    ctx.lineTo(rx, ry);
    ctx.stroke();

    ctx.restore();
}

function renderVectorLayer() {
    const vectors = mapData.layers[3] || [];
    ctx.lineWidth = 2;
    
    vectors.forEach((v, index) => {
        if (!v) return;
        const isSelected = (selectedTile && selectedTile.layer === 3 && selectedObjectKey == index); 
        renderVectorObject(v, isSelected);
    });
}

function renderVectorObject(v, isSelected) {
    if (!v.points || v.points.length < 2) return;

    ctx.strokeStyle = isSelected ? '#00ffff' : '#ff00ff';
    ctx.fillStyle = isSelected ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255, 0, 255, 0.1)';
    
    // Type-specific Visuals
    const type = v.tag || v.type || 'boundary_wall'; // tag takes priority over generic type
    if (!isSelected) {
        if (type.includes('wall')) {
            ctx.strokeStyle = '#FF0000'; // Red
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        } else if (type.includes('cover')) {
            ctx.strokeStyle = '#800080'; // Purple
            ctx.fillStyle = 'rgba(128, 0, 128, 0.3)';
        } else if (type.includes('bush')) {
            ctx.strokeStyle = '#00FF00'; // Green
            ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
        }
    }
    
    ctx.save();
    ctx.beginPath();
    v.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    
    if (v.closed) {
        ctx.closePath();
        ctx.fill();
    }
    
    ctx.stroke();
    ctx.restore();
}
function renderSpawnLayer() {
    const spawns = mapData.layers[4] || {};
    for (const [key, data] of Object.entries(spawns)) {
        const [gx, gy] = key.split(',').map(Number);
        const type = data.spawnType;
        
        ctx.save();
        ctx.fillStyle = type === 5 ? 'rgba(255, 255, 0, 0.7)' : 'rgba(255, 0, 255, 0.7)';
        ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        ctx.fillStyle = '#000';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(type === 5 ? 'T1' : 'T2', gx * TILE_SIZE + TILE_SIZE/2, gy * TILE_SIZE + 10);
        ctx.restore();
    }
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
    const rot = data.rot || 0; // Now in radians

    // For arbitrary rotation, the "effective" grid footprint is less precise for rendering
    // but we use the base dimensions for the draw call.
    const img = images[path];
    if (img && img.complete) {
        ctx.save();
        // Translate to center of its grid footprint (tx, ty)
        ctx.translate(x * TILE_SIZE + (tx * TILE_SIZE) / 2, y * TILE_SIZE + (ty * TILE_SIZE) / 2);
        ctx.rotate(rot); // Use radians directly
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
                // Migration: Ensure all layers exist (Legacy maps might have fewer)
                while (data.layers.length < 5) {
                    // Decide if we are adding a vector array (3) or a sparse object (4)
                    if (data.layers.length === 3) data.layers.push([]); // Collision vectors
                    else data.layers.push({}); // Others are sparse objects
                }
                
                // Migration: If Layer 2 is using old integer markers (Meta), clear it or convert
                // For now, let's just ensure it's an object.
                if (Array.isArray(data.layers[2])) data.layers[2] = {};

                mapData = data;
                document.getElementById('map-width').value = mapData.width;
                document.getElementById('map-height').value = mapData.height;
                resizeCanvas();
                mapData.tileSize = TILE_SIZE; 
            }
        } catch (err) {
            console.error(err);
            alert("Invalid map file");
        }
    };
    reader.readAsText(file);
}

function handleFill(startX, startY) {
    if (currentLayer !== 0 || !currentAsset) return;
    
    const targetPath = mapData.layers[0][`${startX},${startY}`];
    const fillPath = currentAsset.path;
    
    if (targetPath === fillPath) return;
    
    saveHistory();
    
    const queue = [[startX, startY]];
    const visited = new Set();
    const key = (x, y) => `${x},${y}`;
    
    while (queue.length > 0) {
        const [x, y] = queue.shift();
        const k = key(x, y);
        
        if (visited.has(k)) continue;
        visited.add(k);
        
        if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) continue;
        
        const currentPath = mapData.layers[0][k];
        if (currentPath === targetPath) {
            mapData.layers[0][k] = fillPath;
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
}

function checkHandles(worldX, worldY) {
    if (!selectedTile) return false;
    
    const handleSize = 8 / camera.zoom;
    const isVector = selectedTile.layer === 3;
    const unit = isVector ? 1 : TILE_SIZE;
    const rot = selectedTile.rot || 0;

    // Center point logic: vectors are centered, tiles are top-left
    const cx = isVector ? selectedTile.x : (selectedTile.x + selectedTile.w / 2) * unit;
    const cy = isVector ? selectedTile.y : (selectedTile.y + selectedTile.h / 2) * unit;
    const cw = selectedTile.w * unit;
    const ch = selectedTile.h * unit;
    
    // 8 handles (relative to center)
    const handles = {
        nw: [-cw/2, -ch/2], n: [0, -ch/2], ne: [cw/2, -ch/2],
        e:  [cw/2, 0],     se: [cw/2, ch/2], s: [0, ch/2],
        sw: [-cw/2, ch/2], w:  [-cw/2, 0]
    };
    
    for (const [id, [hx, hy]] of Object.entries(handles)) {
        const s = Math.sin(rot);
        const c = Math.cos(rot);
        const rhx = cx + (hx * c - hy * s);
        const rhy = cy + (hx * s + hy * c);

        if (Math.abs(worldX - rhx) < handleSize && Math.abs(worldY - rhy) < handleSize) {
            saveHistory();
            activeHandle = id;
            originalTransform = JSON.parse(JSON.stringify(selectedTile));
            return true;
        }
    }
    
    const rx = 0;
    const ry = -ch/2 - 20 / camera.zoom;
    const rrx = cx + (rx * Math.cos(rot) - ry * Math.sin(rot));
    const rry = cy + (rx * Math.sin(rot) + ry * Math.cos(rot));

    if (Math.abs(worldX - rrx) < handleSize && Math.abs(worldY - rry) < handleSize) {
        saveHistory();
        activeHandle = 'rot';
        return true;
    }
    
    return false;
}

function handleRectangleFill(x1, y1, x2, y2) {
    if (currentLayer !== 0 || !currentAsset) return;
    saveHistory();
    
    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);
    const startY = Math.min(y1, y2);
    const endY = Math.max(y1, y2);
    
    for (let iy = startY; iy <= endY; iy++) {
        for (let ix = startX; ix <= endX; ix++) {
            if (ix >= 0 && iy >= 0 && ix < mapData.width && iy < mapData.height) {
                mapData.layers[0][`${ix},${iy}`] = currentAsset.path;
            }
        }
    }
}

function finalizeBoundary(forceClosed = false) {
    if (!activeBoundary || activeBoundary.points.length < 2) return;
    
    // Auto-detect closure if last point is near first point
    const pts = activeBoundary.points;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    
    // If it's already closed or we're forcing it (via click), or the last point is very close to start
    const isClosed = forceClosed || (dist < 10 && pts.length >= 3);
    
    // If auto-closing via Enter, we might want to pop the last point if it's a duplicate of the start
    if (!forceClosed && dist < 10 && pts.length >= 3) {
        pts.pop();
    }

    saveHistory();
    
    const obj = {
        type: 'poly',
        tag: activeBoundary.type || 'boundary_wall',
        points: pts,
        closed: isClosed,
        rot: 0
    };
    
    mapData.layers[3].push(obj);
    activeBoundary = null;
}

function handleTransform(e) {
    if (!selectedTile || !activeHandle) return;
    
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - camera.x) / camera.zoom;
    const worldY = (e.clientY - rect.top - camera.y) / camera.zoom;
    
    const isVector = selectedTile.layer === 3;
    const unit = isVector ? 1 : TILE_SIZE;
    
    const tx = Math.round(worldX / unit);
    const ty = Math.round(worldY / unit);
    
    if (activeHandle === 'rot') {
        const cx = (selectedTile.x + selectedTile.w / 2) * unit;
        const cy = (selectedTile.y + selectedTile.h / 2) * unit;
        const rawAngle = Math.atan2(worldY - cy, worldX - cx) + Math.PI/2;
        const snap = e.shiftKey ? (Math.PI / 180) : (Math.PI / 12); // 1 degree vs 15 degrees
        const angle = Math.round(rawAngle / snap) * snap;
        
        if (isVector) {
            mapData.layers[3][selectedObjectKey].rot = angle;
        } else {
            const obj = mapData.layers[selectedTile.layer][selectedObjectKey];
            if (typeof obj === 'object') obj.rot = angle;
            else mapData.layers[selectedTile.layer][selectedObjectKey] = { path: obj, tx: selectedTile.w, ty: selectedTile.h, rot: angle };
        }
        return;
    }

    // Aspect ratio locking for corners
    const isCorner = ['nw', 'ne', 'sw', 'se'].includes(activeHandle);
    const aspect = originalTransform.w / originalTransform.h;

    // Transform logic with deformation support
    if (activeHandle === 'se') {
        selectedTile.w = Math.max(isVector ? 8 : 1, tx - selectedTile.x);
        selectedTile.h = isCorner ? (selectedTile.w / aspect) : Math.max(isVector ? 8 : 1, ty - selectedTile.y);
    } else if (activeHandle === 'sw') {
        const dw = selectedTile.x - tx;
        if (selectedTile.w + dw > (isVector ? 8 : 1)) {
            selectedTile.x = tx;
            selectedTile.w += dw;
            if (isCorner) {
                const newH = selectedTile.w / aspect;
                selectedTile.h = newH;
            } else {
                selectedTile.h = Math.max(isVector ? 8 : 1, ty - selectedTile.y);
            }
        }
    } else if (activeHandle === 'ne') {
        selectedTile.w = Math.max(isVector ? 8 : 1, tx - selectedTile.x);
        const dh = selectedTile.y - ty;
        if (selectedTile.h + dh > (isVector ? 8 : 1)) {
            selectedTile.y = ty;
            selectedTile.h += dh;
            if (isCorner) selectedTile.w = selectedTile.h * aspect;
        }
    } else if (activeHandle === 'nw') {
        const dw = selectedTile.x - tx;
        const dh = selectedTile.y - ty;
        if (selectedTile.w + dw > (isVector ? 8 : 1) && selectedTile.h + dh > (isVector ? 8 : 1)) {
            selectedTile.x = tx;
            selectedTile.w += dw;
            selectedTile.y = ty;
            selectedTile.h += dh;
            if (isCorner) {
                // Lock to aspect ratio based on whichever changed most or just force it
                selectedTile.h = selectedTile.w / aspect;
            }
        }
    } else if (activeHandle === 'n') {
        const dh = selectedTile.y - ty;
        if (selectedTile.h + dh > (isVector ? 8 : 1)) {
            selectedTile.y = ty;
            selectedTile.h += dh;
        }
    } else if (activeHandle === 's') {
        selectedTile.h = Math.max(isVector ? 8 : 1, ty - selectedTile.y);
    } else if (activeHandle === 'w') {
        const dw = selectedTile.x - tx;
        if (selectedTile.w + dw > (isVector ? 8 : 1)) {
            selectedTile.x = tx;
            selectedTile.w += dw;
        }
    } else if (activeHandle === 'e') {
        selectedTile.w = Math.max(isVector ? 8 : 1, tx - selectedTile.x);
    }

    // Update map data... for polygons, we would need to scale points.
    // Simplifying: we'll store a translation/scale in the object.
    // For now, let's just update tiles. Polygons are world-space for now.
    if (!isVector) {
        const obj = mapData.layers[selectedTile.layer][selectedObjectKey];
        const newKey = `${selectedTile.x},${selectedTile.y}`;
        if (newKey !== selectedObjectKey) {
            delete mapData.layers[selectedTile.layer][selectedObjectKey];
            selectedObjectKey = newKey;
        }
        if (typeof obj === 'object') {
            obj.tx = selectedTile.w;
            obj.ty = selectedTile.h;
            mapData.layers[selectedTile.layer][newKey] = obj;
        } else {
            mapData.layers[selectedTile.layer][newKey] = { path: obj, tx: selectedTile.w, ty: selectedTile.h, rot: 0 };
        }
    } else {
        // Scaling polygons is a bit more complex, we shift points.
        const v = mapData.layers[3][selectedObjectKey];
        const oldW = originalTransform.w;
        const oldH = originalTransform.h;
        const scaleX = selectedTile.w / oldW;
        const scaleY = selectedTile.h / oldH;
        const ox = originalTransform.x;
        const oy = originalTransform.y;
        
        v.points.forEach(p => {
           p.x = ox + (p.x - ox) * scaleX;
           p.y = oy + (p.y - oy) * scaleY;
        });
        
        // Sync selectedTile to new bounds
        let minX = v.points[0].x, maxX = v.points[0].x, minY = v.points[0].y, maxY = v.points[0].y;
        v.points.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        selectedTile.x = minX; selectedTile.y = minY;
        selectedTile.w = maxX - minX; selectedTile.h = maxY - minY;
        
        // Update original to prevent feedback loop
        originalTransform = JSON.parse(JSON.stringify(selectedTile));
    }
}

window.addEventListener('mouseup', () => {
    activeHandle = null;
    isDrawing = false;
    isPanning = false;
});

// Utility for hit-testing lines
function distToSegment(p, v, w) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 == 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

// Start
init();
