
import { AssetManifest } from './assets/AssetManifest.js?v=field-console-13';
import { Config } from './modules/Config.js?v=field-console-13';

const TILE_SIZE = 16;
const COLLISION_RESOLUTION = 2; // Physical resolution (2x2px per tile)
const DEFAULT_WIDTH = 64;
const DEFAULT_HEIGHT = 48;

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const assetBrowser = document.getElementById('asset-browser');

function createBlankMap() {
    return {
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
}

let mapData = createBlankMap();

let currentTool = 'brush'; // brush, eraser, fill
let currentLayer = 1;
let currentAsset = null;
let currentMetaType = 1;
let lastX = 0, lastY = 0;
let activeBoundary = null; // { points: [] } during drawing
let currentVectorType = null;
let isDrawing = false;
let camera = { x: 0, y: 0, zoom: 2 }; 
let selectedTile = null; // { x, y, layer, w, h } - Bounding box of selection
let selectedObjectKey = null;
let movingObject = null; // { data, originalKey, offsetX, offsetY }
let layerVisibility = [true, true, true, true, true];
let history = [];
let redoStack = [];
const MAX_HISTORY = 50;
let isPanning = false;
let isSpacePressed = false;
let lastMouseX = 0, lastMouseY = 0;
let activeHandle = null; // 'nw', 'ne', 'sw', 'se', 'rot'
let originalTransform = null;
let mapLoadVersion = 0;

const images = {};

function resizeVector(delta) {
    if (selectedObjectKey === null || selectedTile.layer !== 3) return;
    saveHistory();
    const v = mapData.layers[3][selectedObjectKey];
    if (v.type === 'rect') {
        v.w = Math.max(8, v.w + delta * 2);
        v.h = Math.max(8, v.h + delta * 2);
        selectedTile.w = v.w; selectedTile.h = v.h;
    } else if (v.type === 'circle') {
        v.radius = Math.max(4, v.radius + delta * 2);
    }
}

const META_COLORS = {
    0: 'rgba(0, 0, 0, 0)', // Walkable
    1: 'rgba(255, 0, 0, 0.5)', // Wall
    2: 'rgba(0, 255, 0, 0.5)', // Bush
    3: 'rgba(0, 0, 255, 0.5)', // Cover Low
    4: 'rgba(0, 255, 255, 0.5)', // Cover High
    5: 'rgba(255, 255, 0, 0.5)', // Spawn Point (Team 1)
    6: 'rgba(255, 0, 255, 0.5)'  // Spawn Point (Team 2)
};

const RES_FACTOR = TILE_SIZE / COLLISION_RESOLUTION;

let fillStart = null; 

function init() {
    resizeCanvas();
    loadAssets();
    setupEvents();
    requestAnimationFrame(loop);
    loadDefaultMap();
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
        currentLayer = 2;
    } else {
        if (path.includes('grass') || path.includes('dirt')) {
            currentLayer = 0;
        } else {
            currentLayer = 1;
        }
    }
}

function isFormControl(target) {
    return target instanceof Element && Boolean(
        target.closest('input, select, textarea, button, [contenteditable="true"]')
    );
}

function setupEvents() {
    canvas.addEventListener('mousedown', (e) => {
        const wantsPan = e.button === 1 || (e.button === 0 && isSpacePressed);
        if (wantsPan) {
            isPanning = true;
            isDrawing = false;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            e.preventDefault();
            return;
        }

        // Keep secondary-click erase as a single action; only the primary
        // button can begin a continuous drawing gesture.
        if (e.button === 2) {
            isDrawing = true;
            handleDraw(e);
            isDrawing = false;
            return;
        }
        if (e.button !== 0) return;
        isDrawing = true;
        handleDraw(e);
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

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !isFormControl(e.target)) {
            isSpacePressed = true;
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') isSpacePressed = false;
    });
    window.addEventListener('blur', () => {
        isSpacePressed = false;
        isPanning = false;
        isDrawing = false;
    });

    document.getElementById('btn-save').onclick = saveMap;
    document.getElementById('btn-load').onclick = () => document.getElementById('file-load').click();
    document.getElementById('file-load').onchange = loadMap;
    
    document.querySelectorAll('.spawn-brush').forEach(btn => {
        btn.onclick = () => {
            currentAsset = null;
            currentLayer = 4;
            currentMetaType = parseInt(btn.dataset.type);
            document.querySelectorAll('.asset-item').forEach(e => e.classList.remove('selected'));
            btn.classList.add('selected');
            
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
            currentVectorType = btn.dataset.type;
            
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
            if (movingObject) {
                if (movingObject.layer !== 3) {
                    mapData.layers[movingObject.layer][movingObject.originalKey] = movingObject.data;
                }
                movingObject = null;
            }

            currentTool = btn.dataset.tool;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

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

    window.addEventListener('keydown', (e) => {
        if (isFormControl(e.target)) return;

        const key = e.key.toLowerCase();
        
        if (e.ctrlKey && key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && key === 'y') { e.preventDefault(); redo(); }

        if (key === 'r') rotateSelection();
        if (key === 'enter' && activeBoundary) finalizeBoundary();
        if (key === 'm') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'move' }));
        if (key === 'b') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'brush' }));
        if (key === 'f') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'fill' }));
        if (key === 'e') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'eraser' }));
        if (key === 's') canvas.dispatchEvent(new CustomEvent('switchTool', { detail: 'select' }));
        
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
    redoStack = [];
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
    
    document.getElementById('zoom-display').innerText = Math.round(camera.zoom * 100) + '%';
    resizeCanvas();
}

function handleDraw(e) {
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - camera.x) / camera.zoom;
    const worldY = (e.clientY - rect.top - camera.y) / camera.zoom;
    
    let x, y;
    if (currentLayer === 3) {
        const snap = e.shiftKey ? 1 : COLLISION_RESOLUTION;
        x = Math.round(worldX / snap) * snap;
        y = Math.round(worldY / snap) * snap;
    } else {
        x = Math.floor(worldX / TILE_SIZE);
        y = Math.floor(worldY / TILE_SIZE);
    }
    
    lastX = x; lastY = y;
    
    let maxW, maxH;
    if (currentLayer === 3) {
        maxW = mapData.width * TILE_SIZE;
        maxH = mapData.height * TILE_SIZE;
    } else {
        maxW = mapData.width;
        maxH = mapData.height;
    }

    if (x < 0 || y < 0 || x >= maxW || y >= maxH) return;

    if (e.button === 2 && isDrawing) {
        removeFromLayer(x, y);
        return;
    }

    if ((currentTool === 'brush' || currentTool === 'eraser') && e.type === 'mousedown') {
        saveHistory();
    }

    if (currentTool === 'brush') {
        if (isDrawing) {
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
            if (!checkHandles(worldX, worldY)) {
                handleSelect(x, y);
            }
        }
    } else if (currentTool === 'move') {
        handleMove(x, y, e.type);
    }
    
    updateStatusBar(x, y);
}

canvas.oncontextmenu = (e) => e.preventDefault();

function updateStatusBar(x, y) {
    document.getElementById('coord-display').innerText = `X: ${x}, Y: ${y}`;
    const info = selectedObjectKey ? `Selected: ${selectedObjectKey}` : "";
    document.getElementById('selected-info').innerText = info;
}

function findObjectUnderCursor(x, y, layerIndex) {
    if (layerIndex === 3) {
        const vectors = mapData.layers[3] || [];
        for (let i = vectors.length - 1; i >= 0; i--) {
            const v = vectors[i];
            if (!v) continue;
            let hit = false;
            
            if (!v || !v.points || v.points.length < 2) continue;
            
            const pts = v.points;
            
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

    const layer = mapData.layers[layerIndex];
    if (!layer) return null;

    for (const [key, data] of Object.entries(layer)) {
        const [ox, oy] = key.split(',').map(Number);
        
        const path = typeof data === 'string' ? data : data.path;
        const baseTx = (typeof data === 'string') ? 1 : (data.tx || 1);
        const baseTy = (typeof data === 'string') ? 1 : (data.ty || 1);
        const rot = (typeof data === 'string') ? 0 : (data.rot || 0);

        const cx = (ox + baseTx / 2) * TILE_SIZE;
        const cy = (oy + baseTy / 2) * TILE_SIZE;
        const worldX = (x + 0.5) * TILE_SIZE; 
        const worldY = (y + 0.5) * TILE_SIZE;
        
        const dx = worldX - cx;
        const dy = worldY - cy;
        const s = Math.sin(-rot);
        const c = Math.cos(-rot);
        
        const rx = Math.abs(dx * c - dy * s);
        const ry = Math.abs(dx * s + dy * c);

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
            saveHistory();
            movingObject = {
                data: JSON.parse(JSON.stringify(mapData.layers[currentLayer][obj.key])),
                originalKey: obj.key,
                offsetX: x - obj.x,
                offsetY: y - obj.y,
                initialX: obj.x,
                initialY: obj.y,
                layer: currentLayer
            };
            // Object layers use sparse keys, so remove their original while the
            // ghost moves. Vector arrays retain their slot and are hidden while
            // dragging so a move never creates a hole or changes draw order.
            if (currentLayer !== 3) {
                delete mapData.layers[currentLayer][obj.key];
            }
            selectedTile = null; 
        }
    } else if (eventType === 'mousemove' && isDrawing && movingObject) {
    } else if (eventType === 'mouseup' && movingObject) {
    }
}

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
                 
                 movingObject.data.points.forEach(p => {
                     p.x += dx;
                     p.y += dy;
                 });
                 
                 mapData.layers[3][movingObject.originalKey] = movingObject.data;
                 selectedObjectKey = movingObject.originalKey;
                 
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
                 selectedObjectKey = movingObject.originalKey;
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
        
        obj.rot = ((obj.rot || 0) + Math.PI / 2) % (Math.PI * 2);
        layer[selectedObjectKey] = obj;
        
        const temp = selectedTile.w;
        selectedTile.w = selectedTile.h;
        selectedTile.h = temp;
        selectedTile.rot = obj.rot;
    } else if (selectedObjectKey !== null && selectedTile.layer === 3) {
        const v = mapData.layers[3][selectedObjectKey];
        if (v.type === 'rect') {
             v.rot = ((v.rot || 0) + 1) % 4;
             selectedTile.rot = v.rot;
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
            const type = currentVectorType || 'boundary_wall';
            activeBoundary = { points: [{x, y}], type: type };
        } else {
            const start = activeBoundary.points[0];
            const dist = Math.hypot(x - start.x, y - start.y);
            if (dist < 10 && activeBoundary.points.length >= 2) {
                finalizeBoundary(true);
            } else {
                activeBoundary.points.push({x, y});
            }
        }
    } else if (currentAsset) {
        const key = `${x},${y}`;
        mapData.layers[currentLayer][key] = {
            path: currentAsset.path,
            tx: currentAsset.tiles_x,
            ty: currentAsset.tiles_y,
            rot: 0
        };
    } else if (currentLayer === 4) {
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
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

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

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, gridW, gridH);

    if (layerVisibility[0]) renderVisualLayer(0);
    if (layerVisibility[1]) renderVisualLayer(1);
    if (layerVisibility[2]) renderVisualLayer(2);
    
    if (layerVisibility[3] || currentLayer === 3) {
       renderVectorLayer();
    }

    if (layerVisibility[4] || currentLayer === 4) {
       renderSpawnLayer();
    }

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

    if (movingObject) {
        ctx.globalAlpha = 0.5;
        const gx = lastX - movingObject.offsetX;
        const gy = lastY - movingObject.offsetY;
        
        if (movingObject.layer === 3) {
            const dx = gx - movingObject.initialX;
            const dy = gy - movingObject.initialY;
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

    if (currentTool === 'fill' && fillStart && isDrawing) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        const x1 = Math.min(fillStart.x, lastX);
        const y1 = Math.min(fillStart.y, lastY);
        const x2 = Math.max(fillStart.x, lastX);
        const y2 = Math.max(fillStart.y, lastY);
        ctx.strokeRect(x1 * TILE_SIZE, y1 * TILE_SIZE, (x2 - x1 + 1) * TILE_SIZE, (y2 - y1 + 1) * TILE_SIZE);
    }
    
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
        if (movingObject && movingObject.layer === 3 && movingObject.originalKey === index) return;
        const isSelected = (selectedTile && selectedTile.layer === 3 && selectedObjectKey == index); 
        renderVectorObject(v, isSelected);
    });
}

function renderVectorObject(v, isSelected) {
    if (!v.points || v.points.length < 2) return;

    ctx.strokeStyle = isSelected ? '#00ffff' : '#ff00ff';
    ctx.fillStyle = isSelected ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255, 0, 255, 0.1)';
    
    const type = v.tag || v.type || 'boundary_wall';
    if (!isSelected) {
        if (type.includes('wall')) {
            ctx.strokeStyle = '#FF0000';
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        } else if (type.includes('cover')) {
            ctx.strokeStyle = '#800080';
            ctx.fillStyle = 'rgba(128, 0, 128, 0.3)';
        } else if (type.includes('bush')) {
            ctx.strokeStyle = '#00FF00';
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

    const img = images[path];
    if (img && img.complete) {
        ctx.save();
        ctx.translate(x * TILE_SIZE + (tx * TILE_SIZE) / 2, y * TILE_SIZE + (ty * TILE_SIZE) / 2);
        ctx.rotate(rot);
        ctx.drawImage(img, -(tx * TILE_SIZE) / 2, -(ty * TILE_SIZE) / 2, tx * TILE_SIZE, ty * TILE_SIZE);
        ctx.restore();
    }
}

function createExportData() {
    const data = JSON.parse(JSON.stringify(mapData));
    if (!Array.isArray(data.layers[3])) data.layers[3] = [];
    data.layers[3] = data.layers[3].filter(vector => vector !== null);
    return data;
}

function saveMap() {
    // Layer 2 is a visual/decor layer in the current runtime schema. Export a
    // clean snapshot without regenerating the legacy numeric collision raster.
    const json = JSON.stringify(createExportData(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'map.json';
    a.click();
    URL.revokeObjectURL(url);
}

function processAutoCollision() {
    for (const key in mapData.layers[2]) {
        const type = mapData.layers[2][key];
        if (type >= 1 && type <= 4) {
            delete mapData.layers[2][key];
        }
    }

    for (const [key, data] of Object.entries(mapData.layers[1])) {
        const path = typeof data === 'string' ? data : data.path;
        const tx = (typeof data === 'string') ? 1 : (data.tx || 1);
        const ty = (typeof data === 'string') ? 1 : (data.ty || 1);
        const rot = (typeof data === 'string') ? 0 : (data.rot || 0);
        const [x, y] = key.split(',').map(Number);
        
        if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) continue;

        let metaType = 1;
        const lPath = path.toLowerCase();
        if (lPath.includes('/bush/')) metaType = 2;
        if (lPath.includes('/cover/')) metaType = 3;

        const objectWalls = new Set();
        generateCollisionForObject(x, y, path, tx, ty, rot, objectWalls);
        
        postProcessCollision(objectWalls);

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
    
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate(rot * Math.PI / 2);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();

    const pixels = ctx.getImageData(0, 0, canvasW, canvasH).data;
    const opacityThreshold = 100;

    for (let py = 0; py < canvasH; py += COLLISION_RESOLUTION) {
        for (let px = 0; px < canvasW; px += COLLISION_RESOLUTION) {
            let hitCount = 0;
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
    
    const toAdd = new Set();
    const bounds = { minX:0, minY:0, maxX: mapData.width * RES_FACTOR, maxY: mapData.height * RES_FACTOR };
    
    for (let y = 1; y < bounds.maxY - 1; y++) {
        for (let x = 1; x < bounds.maxX - 1; x++) {
            const key = `${x},${y}`;
            if (!walls.has(key)) {
                let n = 0;
                neighborOffsets.forEach(([dx, dy]) => {
                    if (walls.has(`${x+dx},${y+dy}`)) n++;
                });
                if (n >= 3) toAdd.add(key);
            }
        }
    }
    toAdd.forEach(k => walls.add(k));
    
    const toRemove = new Set();
    walls.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        let n = 0;
        neighborOffsets.forEach(([dx, dy]) => {
            if (walls.has(`${x+dx},${y+dy}`)) n++;
        });
        if (n <= 0) toRemove.add(key);
    });
    toRemove.forEach(k => walls.delete(k));
}

function isSparseLayer(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLoadedMap(data) {
    const width = Number(data && data.width);
    const height = Number(data && data.height);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
        throw new Error('Map dimensions must be positive integers.');
    }
    if (!Array.isArray(data.layers)) {
        throw new Error('Map layers must be an array.');
    }

    const layers = data.layers.slice();
    while (layers.length < 5) {
        layers.push(layers.length === 3 ? [] : {});
    }

    for (let index = 0; index <= 2; index++) {
        if (!isSparseLayer(layers[index])) layers[index] = {};
    }
    if (!Array.isArray(layers[3])) layers[3] = [];
    layers[3] = layers[3].filter(vector => vector !== null);
    if (!isSparseLayer(layers[4])) layers[4] = {};

    return {
        ...data,
        width,
        height,
        tileSize: TILE_SIZE,
        layers
    };
}

function resetEditorState() {
    selectedTile = null;
    selectedObjectKey = null;
    activeBoundary = null;
    movingObject = null;
    activeHandle = null;
    originalTransform = null;
    fillStart = null;
    isDrawing = false;
    isPanning = false;
    isSpacePressed = false;
    lastX = 0;
    lastY = 0;
    history = [];
    redoStack = [];
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 2;

    document.getElementById('selected-info').innerText = '';
    document.getElementById('coord-display').innerText = 'X: 0, Y: 0';
    document.getElementById('zoom-display').innerText = '200%';
}

function applyLoadedMap(data) {
    mapData = normalizeLoadedMap(data);
    resetEditorState();
    syncUIWithData();
}

async function loadDefaultMap() {
    const version = ++mapLoadVersion;
    try {
        const response = await fetch('assets/maps/map.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Map request failed with ${response.status}.`);
        const data = await response.json();
        if (version !== mapLoadVersion) return;
        applyLoadedMap(data);
    } catch (err) {
        if (version !== mapLoadVersion) return;
        console.warn('Could not load the shipped map; using a blank map.', err);
        applyLoadedMap(createBlankMap());
    }
}

function loadMap(e) {
    const file = e.target.files[0];
    if (!file) return;

    const version = ++mapLoadVersion;
    const reader = new FileReader();
    reader.onload = (event) => {
        if (version !== mapLoadVersion) return;
        try {
            applyLoadedMap(JSON.parse(event.target.result));
        } catch (err) {
            console.error(err);
            alert('Invalid map file');
        } finally {
            e.target.value = '';
        }
    };
    reader.onerror = () => {
        console.error(reader.error);
        alert('Could not read map file');
        e.target.value = '';
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

    const cx = isVector ? selectedTile.x : (selectedTile.x + selectedTile.w / 2) * unit;
    const cy = isVector ? selectedTile.y : (selectedTile.y + selectedTile.h / 2) * unit;
    const cw = selectedTile.w * unit;
    const ch = selectedTile.h * unit;
    
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
    
    const pts = activeBoundary.points;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    
    const isClosed = forceClosed || (dist < 10 && pts.length >= 3);
    
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
        const snap = e.shiftKey ? (Math.PI / 180) : (Math.PI / 12);
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

    const isCorner = ['nw', 'ne', 'sw', 'se'].includes(activeHandle);
    const aspect = originalTransform.w / originalTransform.h;

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
        
        let minX = v.points[0].x, maxX = v.points[0].x, minY = v.points[0].y, maxY = v.points[0].y;
        v.points.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        selectedTile.x = minX; selectedTile.y = minY;
        selectedTile.w = maxX - minX; selectedTile.h = maxY - minY;
        
        originalTransform = JSON.parse(JSON.stringify(selectedTile));
    }
}

window.addEventListener('mouseup', () => {
    activeHandle = null;
    isDrawing = false;
    isPanning = false;
});

function distToSegment(p, v, w) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 == 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

init();
