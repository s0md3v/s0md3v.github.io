import { Config } from './Config.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';
import { AssetManifest } from '../assets/AssetManifest.js?v=field-console-14';

export class Renderer {
    constructor(ctx, world) {
        this.ctx = ctx;
        this.world = world;
        this.camera = { x: world.width / 2, y: world.height / 2, zoom: 1 };
        
        this.debugOptions = {
            showVision: false,
            showTrust: false,
            showComm: false,
            showHeatmap: false,
            showTargets: true
        };

        this.selectedAgent = null;
        this.barOffsetMap = new Map();
        this.gameMode = 'AI_VS_AI';

        this.fogCanvas = null;
        this.fogCtx = null;
        this.exploredCanvas = null;
        this.exploredCtx = null;
        this.playerVisionPoly = [];
        this.playerPeripheralRadius = Config.SENSORY.PERIPHERAL_DIST;
        this.playerVisionRange = Config.AGENT.VISION_RADIUS;
        
        this.fps = 0;
        this.frameTimes = [];
        this.lastFrameTime = performance.now();
        
        this.mapCanvas = document.createElement('canvas');
        this.mapCtx = this.mapCanvas.getContext('2d');
        this.mapBaked = false;

        this.heatCanvas = document.createElement('canvas');
        this.heatCtx = this.heatCanvas.getContext('2d');
        this.lastBufferedAgentId = null;
        this.lastHeatBufferTime = 0;

        this.visionCache = new Map(); // agentId -> { rayDistances, lastX, lastY, lastAngle, frameCounter }

        this.sprites = {
            blue: {
                normal: new Image(),
                flash: new Image(),
                death: [],
                legs: []
            },
            yellow: {
                normal: new Image(),
                flash: new Image(),
                death: [],
                legs: []
            },
            icon_hp: new Image(),
            icon_ammo: new Image(),
            bullets: { rifle: [], lmg: [], pistol: [] },
            grenadeExplosion: []
        };

        this.sprites.blue.normal.src = './assets/sprites/body/blue_normal.png';
        this.sprites.blue.flash.src = './assets/sprites/body/blue_flash.png';
        this.sprites.yellow.normal.src = './assets/sprites/body/yellow_normal.png';
        this.sprites.yellow.flash.src = './assets/sprites/body/yellow_flash.png';

        for (let i = 1; i <= 3; i++) {
            const bD = new Image(); bD.src = `./assets/sprites/body/blue_death_${i}.png`;
            this.sprites.blue.death.push(bD);
            const yD = new Image(); yD.src = `./assets/sprites/body/yellow_death_${i}.png`;
            this.sprites.yellow.death.push(yD);
        }

        for (let i = 1; i <= 7; i++) {
            const bL = new Image(); bL.src = `./assets/sprites/legs/blue/legs${i}.png`;
            this.sprites.blue.legs.push(bL);
            const yL = new Image(); yL.src = `./assets/sprites/legs/yellow/legs${i}.png`;
            this.sprites.yellow.legs.push(yL);
        }

        this.sprites.icon_hp.src = './assets/icons/HP.png';
        this.sprites.icon_ammo.src = './assets/icons/Ammo.png';

        ['rifle', 'lmg', 'pistol'].forEach(type => {
            for(let i=1; i<=3; i++) {
                const img = new Image();
                img.src = `./assets/frames/${type}/${i}.png`;
                this.sprites.bullets[type].push(img);
            }
        });

        this.sprites.grenadeExplosion = [];
        for (let i = 1; i <= 10; i++) {
            const img = new Image();
            img.src = `./assets/frames/grenade/Explosion3_${i}.png`;
            this.sprites.grenadeExplosion.push(img);
        }
        
        this.tileCache = {};
    }

    render() {
        if (!this.mapBaked) {
            this.bakeMap();
        }

        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        this.ctx.save();
        
        this.ctx.translate(this.ctx.canvas.width / 2, this.ctx.canvas.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        this.ctx.imageSmoothingEnabled = false; 
        this.drawVisualLayers(); 
        this.ctx.imageSmoothingEnabled = true;

        // Human visibility is calculated before dynamic objects are drawn so
        // enemies and supplies never flash through the fog for a frame.
        if (this.gameMode === 'HUMAN') this._computePlayerVisionPoly();

        if (this.debugOptions.showVision) {
            this.drawObstacleMap();
            this.drawCovers();
            this.drawBushes();
        }

        this.drawSmokes();
        this.drawLoot();
        this.drawCorpses();
        this.drawAgents();
        this.drawProjectiles();
        this.drawHeatmap();
        this.drawEffects();
        this.drawTargets();
        this.drawBarks();
        this.drawSelectionIndicator();
        this.drawDebug();

        if (this.gameMode === 'HUMAN' && this.fogCanvas) {
            this._updateFog();
            this.ctx.drawImage(this.fogCanvas, 0, 0);
        }
        
        this.ctx.restore();

        this.updateFPS();
        this.drawFPS();
    }

    updateFPS() {
        const now = performance.now();
        const dt = now - this.lastFrameTime;
        this.lastFrameTime = now;
        
        this.frameTimes.push(dt);
        if (this.frameTimes.length > 60) this.frameTimes.shift();
        
        const avgDt = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.fps = Math.round(1000 / avgDt);
    }

    drawFPS() {
        this.ctx.save();
        this.ctx.font = 'bold 14px monospace';
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(10, 10, 70, 25);
        
        this.ctx.fillStyle = this.fps >= 50 ? '#0f0' : (this.fps >= 30 ? '#ff0' : '#f00');
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`FPS: ${this.fps}`, 15, 15);
        this.ctx.restore();
    }

    setSelectedAgent(agent) {
        this.selectedAgent = agent;
    }

    drawSelectionIndicator() {
        if (!this.selectedAgent || this.selectedAgent.state.isDead) return;

        const agent = this.selectedAgent;
        const radius = agent.radius * 2.0;
        
        this.ctx.save();
        this.ctx.translate(agent.pos.x, agent.pos.y);
        
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00f7ff';
        
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = 'rgba(0, 247, 255, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius - 4, 0, Math.PI * 2);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    bakeMap() {
        this.mapCanvas.width = this.world.width;
        this.mapCanvas.height = this.world.height;
        
        this.mapCtx.imageSmoothingEnabled = false;

        this.mapCtx.fillStyle = '#252525';
        this.mapCtx.fillRect(0, 0, this.world.width, this.world.height);

        const originalCtx = this.ctx;
        this.ctx = this.mapCtx;
        this.drawMap();

        const allTilesLoaded = this.drawVisualLayers(true); 
        
        this.ctx = originalCtx;

        if (allTilesLoaded && this.world.visualLayers.length > 0) {
            this.mapBaked = true;
        }
    }

    drawVisualLayers(isBaking = false) {
        if (!this.world.visualLayers) return true;
        
        if (!isBaking && this.mapBaked) {
            this.ctx.drawImage(this.mapCanvas, 0, 0);
            return true;
        }

        let allLoaded = true;

        if (!this._manifestLookup) {
            this._manifestLookup = {};
            for (const category of Object.values(AssetManifest.categories)) {
                category.forEach(item => {
                    this._manifestLookup[item.path] = item;
                });
            }
        }

        this.world.visualLayers.forEach(layer => {
            if (!layer) return;
            for (const [key, data] of Object.entries(layer)) {
                const [gx, gy] = key.split(',').map(Number);
                const x = gx * Config.WORLD.VISUAL_GRID_SIZE;
                const y = gy * Config.WORLD.VISUAL_GRID_SIZE;

                const path = typeof data === 'string' ? data : (data ? data.path : null);
                if (!path) continue; 
                
                let tx = data.tx;
                let ty = data.ty;
                let rot = data.rot || 0;

                if (tx === undefined || ty === undefined) {
                    const meta = this._manifestLookup[path];
                    if (meta) {
                        tx = tx ?? meta.tiles_x;
                        ty = ty ?? meta.tiles_y;
                    } else {
                        tx = tx ?? 1;
                        ty = ty ?? 1;
                    }
                }
                
                let img = this.tileCache[path];
                if (!img) {
                    img = new Image();
                    img.src = path;
                    this.tileCache[path] = img;
                }
                
                if (img.complete && img.naturalWidth > 0) {
                    const w = tx * Config.WORLD.VISUAL_GRID_SIZE;
                    const h = ty * Config.WORLD.VISUAL_GRID_SIZE;
                    
                    if (rot !== 0) {
                        const cx = x + w / 2;
                        const cy = y + h / 2;
                        
                        this.ctx.save();
                        this.ctx.translate(cx, cy);
                        this.ctx.rotate(rot); 
                        this.ctx.drawImage(img, -w/2, -h/2, w, h);
                        this.ctx.restore();
                    } else {
                        this.ctx.drawImage(img, x, y, w, h);
                    }
                } else if (img.complete && img.naturalWidth === 0) {
                } else {
                    allLoaded = false;
                }
            }
        });

        return allLoaded;
    }

    drawMap() {
        this.ctx.fillStyle = '#444';
        for (const wall of this.world.walls) {
            if (wall.points) {
                this.ctx.beginPath();
                wall.points.forEach((p, i) => {
                    if (i === 0) this.ctx.moveTo(p.x, p.y);
                    else this.ctx.lineTo(p.x, p.y);
                });
                if (wall.closed) this.ctx.closePath();
                this.ctx.fill();
            } else {
                this.ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
            }
        }
    }

    drawCovers() {
        this.ctx.lineWidth = 1;
        for (const cover of this.world.covers) {
            const hpRatio = cover.hp / cover.maxHp;
            const r = Math.floor(255 * (1 - hpRatio));
            const g = Math.floor(255 * hpRatio);
            
            this.ctx.fillStyle = `rgba(${r}, ${g}, 114, 0.4)`;
            this.ctx.strokeStyle = `rgba(${r}, ${g}, 114, 0.8)`;
            
            if (cover.points) {
                this.ctx.beginPath();
                cover.points.forEach((p, i) => {
                    if (i === 0) this.ctx.moveTo(p.x, p.y);
                    else this.ctx.lineTo(p.x, p.y);
                });
                if (cover.closed) this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                this.ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
                this.ctx.strokeRect(cover.x, cover.y, cover.w, cover.h);
            }
        }
    }

    drawBushes() {
        for (const b of this.world.bushes) {
            this.ctx.fillStyle = 'rgba(34, 139, 34, 0.6)';
            this.ctx.strokeStyle = 'rgba(0, 100, 0, 0.6)';
            this.ctx.lineWidth = 1;
            
            if (b.points) {
                this.ctx.beginPath();
                b.points.forEach((p, i) => {
                    if (i === 0) this.ctx.moveTo(p.x, p.y);
                    else this.ctx.lineTo(p.x, p.y);
                });
                if (b.closed) this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                this.ctx.beginPath();
                this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();

                this.ctx.fillStyle = 'rgba(0, 80, 0, 0.3)';
                if (b.details) {
                    for (const d of b.details) {
                        const lx = b.x + Math.cos(d.angle) * d.dist;
                        const ly = b.y + Math.sin(d.angle) * d.dist;
                        this.ctx.beginPath();
                        this.ctx.arc(lx, ly, b.radius * 0.3, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }
            }
        }
    }

    drawSmokes() {
        for (const s of this.world.smokes) {
            if (this.gameMode === 'HUMAN' && !this._isInPlayerVision(s)) continue;
            const lifeRatio = s.life / Config.PHYSICS.SMOKE_DURATION;
            const alpha = Math.min(0.6, lifeRatio * 1.5);
            
            this.ctx.save();
            if (!isFinite(s.x) || !isFinite(s.y) || !isFinite(s.radius)) continue;
            const gradient = this.ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius);
            gradient.addColorStop(0, `rgba(220, 220, 220, ${alpha})`);
            gradient.addColorStop(0.6, `rgba(180, 180, 180, ${alpha * 0.7})`);
            gradient.addColorStop(1, `rgba(140, 140, 140, 0)`);
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            this.ctx.fill();

            const detailCount = 5;
            for (let i = 0; i < detailCount; i++) {
                const angle = (i / detailCount) * Math.PI * 2 + (Date.now() / 3000);
                const distMult = 0.3 + Math.sin(Date.now() / 1000 + i) * 0.1;
                const ox = Math.cos(angle) * s.radius * distMult;
                const oy = Math.sin(angle) * s.radius * distMult;
                const r = s.radius * (0.4 + Math.sin(Date.now() / 600 + i) * 0.05);
                
                this.ctx.fillStyle = `rgba(210, 210, 210, ${alpha * 0.25})`;
                this.ctx.beginPath();
                this.ctx.arc(s.x + ox, s.y + oy, r, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.restore();
        }
    }

    drawLoot() {
        for (const item of this.world.loot) {
            if (this.gameMode === 'HUMAN' && !this._isInPlayerVision(item)) continue;
            let img = null;
            if (item.type === 'Medkit' && this.sprites.icon_hp.complete) img = this.sprites.icon_hp;
            else if ((item.type === 'AmmoCrate' || item.type === 'WeaponCrate') && this.sprites.icon_ammo.complete) img = this.sprites.icon_ammo;

            if (img && img.width > 0) {
                 const size = 14; 
                 this.ctx.drawImage(img, item.x - size/2, item.y - size/2, size, size);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
                if (item.type === 'WeaponCrate') this.ctx.fillStyle = '#d4af37';
                else if (item.type === 'Medkit') this.ctx.fillStyle = '#ff69b4';
                else if (item.type === 'AmmoCrate') this.ctx.fillStyle = '#4ae24a'; 
                this.ctx.fill();
                this.ctx.strokeStyle = '#fff';
                this.ctx.stroke();
            }
        }
    }


    drawAgents() {
        const now = Date.now();
        this.barOffsetMap.clear();

        const isHumanMode = this.gameMode === 'HUMAN';

        for (const agent of this.world.agents) {
            if (isHumanMode && agent.team !== 0 && !this._isInPlayerVision(agent.pos)) {
                continue;
            }

            this.ctx.save();
            this.ctx.translate(agent.pos.x, agent.pos.y);

            const team = agent.team === 0 ? 'blue' : 'yellow';
            const sprites = this.sprites[team];

            const isMoving = agent.isMoving && agent.motor.calculateCurrentSpeed(this.world) > 10;
            let targetMoveAngle = agent.angle;
            
            if (!agent.legFrame) agent.legFrame = 0;
            if (isMoving) {
                if (agent.motor.smoothedMoveAngle !== undefined) targetMoveAngle = agent.motor.smoothedMoveAngle;
                
                const speed = agent.motor.calculateCurrentSpeed(this.world);
                agent.legFrame = (agent.legFrame + (speed * 0.004)) % 7; 
            } else {
                agent.legFrame = 0;
            }

            if (agent.visualLegAngle === undefined) agent.visualLegAngle = targetMoveAngle;
            const diff = (targetMoveAngle - agent.visualLegAngle + Math.PI) % (Math.PI * 2) - Math.PI;
            const normalizedDiff = diff < -Math.PI ? diff + Math.PI * 2 : diff;
            agent.visualLegAngle += normalizedDiff * 0.1;

            this.ctx.save();
            this.ctx.rotate(agent.visualLegAngle + Math.PI / 2);
            const legSprite = sprites.legs[Math.floor(agent.legFrame)];
            if (legSprite && legSprite.complete) {
                const size = agent.radius * 1.5; 
                this.ctx.drawImage(legSprite, -size/2, -size/2, size, size);
            }
            this.ctx.restore();

            this.ctx.save();
            
            this.ctx.shadowBlur = 4;
            this.ctx.shadowColor = 'rgba(0,0,0,0.6)';
            this.ctx.shadowOffsetY = 2;
            
            this.ctx.rotate(agent.angle - Math.PI / 2); 
            
            const isFlashing = (now - (agent.state.lastFireTime || 0)) < 60;
            const bodySprite = isFlashing ? sprites.flash : sprites.normal;

            if (bodySprite.complete) {
                const size = agent.radius * 3.2; 
                this.ctx.drawImage(bodySprite, -size/2, -size/2, size, size);
            }
            this.ctx.restore();
            this.ctx.restore();
        }

        for (const agent of this.world.agents) {
            if (isHumanMode && agent.team !== 0) {
                continue;
            }

            const yOffset = 22;

            if (this.selectedAgent === agent) {
                this.ctx.fillStyle = 'rgba(0, 247, 255, 0.15)';
                this.ctx.fillRect(agent.pos.x - 9, agent.pos.y - yOffset - 2, 18, 10);
            }

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(agent.pos.x - 7, agent.pos.y - yOffset, 14, 3);
            
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(agent.pos.x - 7, agent.pos.y - yOffset, 14, 3);
            
            const hpRatio = agent.state.hp / agent.state.maxHp;
            const hpColor = hpRatio > 0.6 ? '#4ae24a' : hpRatio > 0.3 ? '#ffeb3b' : '#ff4444';
            this.ctx.fillStyle = hpColor;
            this.ctx.fillRect(agent.pos.x - 7, agent.pos.y - yOffset, 14 * hpRatio, 3);

            if (agent.rank === 1 && (this.camera.zoom > 1.1 || this.selectedAgent === agent)) {
                this.ctx.font = `bold ${this.selectedAgent === agent ? 4.5 : 3.5}px monospace`;
                this.ctx.fillStyle = agent.team === 0 ? '#5599ff' : '#ff5555';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('CAPTAIN', agent.pos.x, agent.pos.y - yOffset - 3);
            }

            if (agent.state.reloadingUntil > Date.now()) {
                this.ctx.font = 'bold 3.5px monospace';
                this.ctx.fillStyle = '#ff69b4';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('RELOADING', agent.pos.x, agent.pos.y - yOffset + 9);
            }
        }
    }

    drawCorpses() {
        const now = Date.now();
        for (const corpse of this.world.corpses) {
            if (this.gameMode === 'HUMAN' && corpse.team !== 0 && !this._isInPlayerVision(corpse.pos)) continue;
            this.ctx.save();
            this.ctx.translate(corpse.pos.x, corpse.pos.y);

            if (corpse.bloodSplatter) {
                this.ctx.fillStyle = 'rgba(150, 0, 0, 0.6)';
                for (const drop of corpse.bloodSplatter) {
                    this.ctx.beginPath();
                    const ox = Math.cos(drop.angle) * drop.dist;
                    const oy = Math.sin(drop.angle) * drop.dist;
                    this.ctx.arc(ox, oy, drop.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }

            const team = corpse.team === 0 ? 'blue' : 'yellow';
            const sprites = this.sprites[team];

            if (!corpse.deathStartTime) corpse.deathStartTime = now;
            const elapsed = now - corpse.deathStartTime;
            const frameIndex = Math.min(2, Math.floor(elapsed / 150)); 
            const deathSprite = sprites.death[frameIndex];

            if (deathSprite.complete) {
                this.ctx.rotate(corpse.angle - Math.PI / 2); 
                const size = corpse.radius * 3.2; 
                this.ctx.drawImage(deathSprite, -size/2, -size/2, size, size);
            }

            this.ctx.restore();
        }
    }

    drawProjectiles() {
        for (const p of this.world.projectiles) {
            if (this.gameMode === 'HUMAN' && p.team !== 0 && !this._isInPlayerVision(p.pos)) continue;
            this.ctx.save();
            this.ctx.translate(p.pos.x, p.pos.y);
            
            if (p.type === 'GRENADE') {
                this.ctx.fillStyle = '#2c3e50';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#34495e';
                this.ctx.stroke();

                const pulse = (Math.sin(Date.now() / 50) + 1) / 2;
                this.ctx.fillStyle = `rgba(255, 100, 0, ${0.5 + pulse * 0.5})`;
                this.ctx.beginPath();
                this.ctx.arc(p.radius * 0.5, -p.radius * 0.5, 2, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.type === 'SMOKE') {
                this.ctx.fillStyle = '#95a5a6';
                if (p.angle !== undefined) this.ctx.rotate(p.angle);
                this.ctx.fillRect(-p.radius, -p.radius * 1.5, p.radius * 2, p.radius * 3);
                this.ctx.strokeStyle = '#7f8c8d';
                this.ctx.strokeRect(-p.radius, -p.radius * 1.5, p.radius * 2, p.radius * 3);
            } else {
                 const visualType = p.visualType || 'pistol';
                 const frames = this.sprites.bullets[visualType];

                 if (frames && frames.length > 0) {
                     this.ctx.rotate(p.angle + Math.PI/2); 
                     
                     let frameIndex = 1;
                     if (p.elapsed < 50) frameIndex = 0;
                     
                     const img = frames[frameIndex];
                     if (img && img.complete && img.width > 0) {
                         const scale = 0.5;
                         const w = img.width * scale;
                         const h = img.height * scale;
                         this.ctx.drawImage(img, -w/2, -h/2, w, h);
                     } else {
                         this.ctx.fillStyle = '#fff';
                         this.ctx.beginPath();
                         this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                         this.ctx.fill();
                     }
                 } else {
                     this.ctx.fillStyle = '#fff';
                     this.ctx.beginPath();
                     this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                     this.ctx.fill();
                 }
            }
            
            this.ctx.restore();
        }
    }

    drawHeatmap() {
        if (!this.debugOptions.showHeatmap) return;
        if (!this.selectedAgent) return;

        const agent = this.selectedAgent;
        const mem = agent.memory;
        
        const now = Date.now();
        const needsUpdate = this.lastBufferedAgentId !== agent.id || (now - this.lastHeatBufferTime) > 200;

        if (needsUpdate) {
            this.lastBufferedAgentId = agent.id;
            this.lastHeatBufferTime = now;

            const rows = mem.gridRows;
            const cols = mem.gridCols;
            
            if (this.heatCanvas.width !== cols) {
                this.heatCanvas.width = cols;
                this.heatCanvas.height = rows;
            }

            this.heatCtx.clearRect(0, 0, cols, rows);

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const cx = (x + 0.5) * (this.world.width / cols);
                    const cy = (y + 0.5) * (this.world.height / rows);
                    if (this.world.isWallAt(cx, cy)) continue;

                    const heat = mem.heatmap[y][x];
                    if (heat > 0.05) {
                        this.heatCtx.fillStyle = `rgba(255, 0, 0, ${heat / 10})`; 
                        this.heatCtx.fillRect(x, y, 1, 1);
                    }

                    const control = mem.controlMap[y][x];
                    if (control > 0.05) {
                        this.heatCtx.fillStyle = `rgba(0, 255, 100, ${control / 10})`; 
                        this.heatCtx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }

        this.ctx.save();
        this.ctx.globalAlpha = 0.5;
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.drawImage(this.heatCanvas, 0, 0, this.world.width, this.world.height);
        this.ctx.restore();
    }

    drawObstacleMap() {
        if (!this.debugOptions.showHeatmap) return; 
        if (!this.selectedAgent) return;

        const agent = this.selectedAgent;
        const grid = agent.memory.obstacleMap;
        const rows = agent.memory.gridRows;
        const cols = agent.memory.gridCols;
        const cellW = this.world.width / cols;
        const cellH = this.world.height / rows;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const type = grid[y][x];
                if (type === 1) {
                    this.ctx.fillStyle = `rgba(255, 255, 255, 0.15)`; 
                    this.ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
                } else if (type === 0) {
                    this.ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`; 
                    this.ctx.strokeRect(x * cellW, y * cellH, cellW, cellH);
                }
            }
        }
    }

    drawEffects() {
        this.ctx.fillStyle = 'rgba(255, 100, 50, 0.6)';
        for (const e of this.world.effects) {
            if (this.gameMode === 'HUMAN' && !this._isInPlayerVision(e)) continue;
            if (e.type === 'EXPLOSION') {
                 const totalLife = 600; 
                 const lifeRatio = e.life / totalLife; 
                 const t = 1 - lifeRatio; 

                 const frames = this.sprites.grenadeExplosion;
                 if (frames && frames.length > 0) {
                     const frameIndex = Math.floor(t * frames.length);
                     const img = frames[Math.min(frameIndex, frames.length - 1)];
                     
                     if (img.complete && img.naturalWidth > 0) {
                         const size = e.radius * 2;
                         this.ctx.drawImage(img, e.x - size/2, e.y - size/2, size, size);
                         continue; 
                     }
                 }
            }
        }
    }

    drawTargets() {
        if (!this.debugOptions.showTargets) return;
        if (this.gameMode === 'HUMAN') return;

        this.ctx.save();
        for (const agent of this.world.agents) {
            if (agent.state.isDead) continue;
            if (!agent.path || agent.path.length === 0) continue;

            const color = agent.team === 0 ? 'rgba(74, 144, 226, 0.3)' : 'rgba(226, 74, 74, 0.3)';
            this.ctx.strokeStyle = color;
            this.ctx.setLineDash([2, 5]);
            this.ctx.lineWidth = 1;

            let currentX = agent.pos.x;
            let currentY = agent.pos.y;
            
            for (const p of agent.path) {
                const start = { x: currentX, y: currentY };
                const dx = p.x - currentX;
                const dy = p.y - currentY;
                const angle = Math.atan2(dy, dx);
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                const visibleDist = this.world.getRayDistance(start, angle, dist);
                
                this.ctx.beginPath();
                this.ctx.moveTo(currentX, currentY);
                this.ctx.lineTo(currentX + Math.cos(angle) * visibleDist, currentY + Math.sin(angle) * visibleDist);
                this.ctx.stroke();
                
                if (visibleDist < dist - 1) break; 
                
                currentX = p.x;
                currentY = p.y;
            }

            const target = agent.path[agent.path.length - 1];
            this.ctx.setLineDash([]);
            this.ctx.beginPath();
            this.ctx.arc(target.x, target.y, 3, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawBarks() {
        this.ctx.font = 'bold 6px monospace';
        this.ctx.textAlign = 'center';
        
        for (const agent of this.world.agents) {
            if (!agent.barks) continue;
            if (this.gameMode === 'HUMAN' && agent.team !== 0) continue;
            
            agent.barks.forEach((bark, i) => {
                const lifeRatio = bark.life / 2000;
                const alpha = Math.min(1.0, lifeRatio * 2); 
                const yOffset = (1 - lifeRatio) * 30; 
                
                this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                this.ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
                this.ctx.lineWidth = 0.5;
                
                const by = agent.pos.y - 15 - yOffset - (i * 4); 
                
                this.ctx.strokeText(bark.text, agent.pos.x, by);
                this.ctx.fillText(bark.text, agent.pos.x, by);
            });
        }
    }

    drawDebug() {
        const now = Date.now();

        const agentMap = new Map();
        for (const agent of this.world.agents) {
            agentMap.set(agent.id, agent);
        }

        for (const agent of this.world.agents) {
            if (this.gameMode === 'HUMAN' && agent.team !== 0) continue;
            const baseAlpha = this.debugOptions.showVision ? 0.26 : 0.075;
            const teamColor = agent.team === 0 ? '74, 144, 226' : '226, 74, 74';
            
            const baseFOV = Config.AGENT.FOV;
            const fov = (agent.state && agent.state.inBush) ? baseFOV * 0.7 : baseFOV;
            
            const range = agent.state.inventory.weapon.range;
            const fovea = Config.SENSORY.FOVEA_ANGLE * 2;
            const peripheralDist = Config.SENSORY.PERIPHERAL_DIST;

            if (this.debugOptions.showVision) {
                const pGrad = this.ctx.createRadialGradient(agent.pos.x, agent.pos.y, 0, agent.pos.x, agent.pos.y, peripheralDist);
                pGrad.addColorStop(0, `rgba(${teamColor}, 0.075)`);
                pGrad.addColorStop(1, `rgba(${teamColor}, 0)`);
                this.ctx.fillStyle = pGrad;
                this.ctx.beginPath();
                this.ctx.arc(agent.pos.x, agent.pos.y, peripheralDist, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.drawOccludedCone(agent.pos, agent.angle, fov, range, teamColor, baseAlpha, agent.id);

            if (this.debugOptions.showVision) {
                this.drawOccludedCone(agent.pos, agent.angle, fovea, range, teamColor, baseAlpha * 0.4, agent.id + '_fovea');
            }

            agent.memory.detectionMeters.forEach((val, targetId) => {
                const target = agentMap.get(targetId);
                if (target && target.team !== agent.team) {
                    const dist = Math.hypot(target.pos.x - agent.pos.x, target.pos.y - agent.pos.y);
                    if (dist < range * 1.5) {
                        const meterW = 20;
                        const meterH = 3;
                        const mx = target.pos.x - meterW/2;
                        const my = target.pos.y + 15;
                        
                        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        this.ctx.fillRect(mx, my, meterW, meterH);
                        
                        const pct = Math.min(1.0, val / Config.SENSORY.DETECTION_THRESHOLD);
                        this.ctx.fillStyle = pct >= 1.0 ? '#ff0' : '#fff';
                        this.ctx.fillRect(mx, my, meterW * pct, meterH);
                    }
                }
            });

            if (agent.showShoutUntil > now) {
                const remaining = (agent.showShoutUntil - now) / 500;
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * remaining})`;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(agent.pos.x, agent.pos.y, 30 + (1 - remaining) * 200, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        if (this.debugOptions.showTrust) {
            this.ctx.lineWidth = 1;
            for (const agent of this.world.agents) {
                agent.memory.socialCredit.forEach((trust, id) => {
                    if (trust > 0.4) {
                        const target = agentMap.get(id);
                        if (target) {
                            this.ctx.strokeStyle = `rgba(0, 255, 0, ${trust * 0.4})`;
                            
                            const dx = target.pos.x - agent.pos.x;
                            const dy = target.pos.y - agent.pos.y;
                            const angle = Math.atan2(dy, dx);
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            const visibleDist = this.world.getRayDistance(agent.pos, angle, dist);

                            this.ctx.beginPath();
                            this.ctx.moveTo(agent.pos.x, agent.pos.y);
                            this.ctx.lineTo(agent.pos.x + Math.cos(angle) * visibleDist, agent.pos.y + Math.sin(angle) * visibleDist);
                            this.ctx.stroke();
                        }
                    }
                });
            }
        }

        if (this.debugOptions.showComm) {
            this.ctx.lineWidth = 1.5;
            for (const agent of this.world.agents) {
                if (!agent.commLinks) continue;
                agent.commLinks.forEach(link => {
                    const elapsed = now - link.timestamp;
                    if (elapsed < 2000) {
                        const target = agentMap.get(link.targetId);
                        if (target) {
                            const alpha = 1 - (elapsed / 2000);
                            this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                            this.ctx.setLineDash([5, 5]); 
                            
                            const dx = target.pos.x - agent.pos.x;
                            const dy = target.pos.y - agent.pos.y;
                            const angle = Math.atan2(dy, dx);
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            const visibleDist = this.world.getRayDistance(agent.pos, angle, dist);

                            this.ctx.beginPath();
                            this.ctx.moveTo(agent.pos.x, agent.pos.y);
                            this.ctx.lineTo(agent.pos.x + Math.cos(angle) * visibleDist, agent.pos.y + Math.sin(angle) * visibleDist);
                            this.ctx.stroke();
                            this.ctx.setLineDash([]);
                        }
                    }
                });
            }
        }
    }

    drawOccludedCone(pos, angle, fov, range, color, alpha, agentId = null) {
        range = range || 400; 
        const rayCount = 30; 
        
        const hasAgentId = agentId !== null && agentId !== undefined;
        let cache = hasAgentId ? this.visionCache.get(agentId) : null;
        const nowFrame = Math.floor(performance.now() / 16.6);

        let needsRecalc = !cache;
        if (cache) {
            const moved = Math.hypot(pos.x - cache.lastX, pos.y - cache.lastY) > 2;
            const turned = Math.abs(Utils.angleDiff(angle, cache.lastAngle)) > 0.05;
            const timedOut = (nowFrame - cache.frameCounter) >= 4;
            
            if (moved || turned || timedOut) {
                needsRecalc = true;
            }
        }

        if (needsRecalc) {
            const rayDistances = [];
            for (let i = 0; i <= rayCount; i++) {
                const rayAngle = angle - fov / 2 + (fov * i) / rayCount;
                const dist = this.world.getRayDistance(pos, rayAngle, range);
                rayDistances.push(dist);
            }
            
            cache = {
                rayDistances,
                lastX: pos.x,
                lastY: pos.y,
                lastAngle: angle,
                frameCounter: nowFrame
            };
            if (hasAgentId) this.visionCache.set(agentId, cache);
        }

        // Points are rebuilt from the current pos/angle so the cone doesn't lag during fast rotation.
        const points = [pos];
        for (let i = 0; i <= rayCount; i++) {
            const angleOffset = -fov / 2 + (fov * i) / rayCount;
            const currentRayAngle = angle + angleOffset;
            const dist = cache.rayDistances[i];
            
            points.push({
                x: pos.x + Math.cos(currentRayAngle) * dist,
                y: pos.y + Math.sin(currentRayAngle) * dist
            });
        }

        const grad = this.ctx.createRadialGradient(pos.x, pos.y, range * 0.1, pos.x, pos.y, range);
        grad.addColorStop(0, `rgba(${color}, ${alpha})`);
        grad.addColorStop(1, `rgba(${color}, 0)`);

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.closePath();
        this.ctx.fill();
    }

    initFogOfWar(worldW, worldH) {
        this.fogCanvas = document.createElement('canvas');
        this.fogCanvas.width = worldW;
        this.fogCanvas.height = worldH;
        this.fogCtx = this.fogCanvas.getContext('2d');

        // White = explored, transparent = unexplored
        this.exploredCanvas = document.createElement('canvas');
        this.exploredCanvas.width = worldW;
        this.exploredCanvas.height = worldH;
        this.exploredCtx = this.exploredCanvas.getContext('2d');
        this.exploredCtx.clearRect(0, 0, worldW, worldH);
    }

    _updateFog() {
        const player = this.world.playerAgent;
        if (!player || player.state.isDead) return;

        const w = this.fogCanvas.width;
        const h = this.fogCanvas.height;
        const fCtx = this.fogCtx;
        const eCtx = this.exploredCtx;

        const poly = this.playerVisionPoly;
        if (poly.length > 2) {
            eCtx.fillStyle = '#fff';
            eCtx.beginPath();
            eCtx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
                eCtx.lineTo(poly[i].x, poly[i].y);
            }
            eCtx.closePath();
            eCtx.fill();

            eCtx.beginPath();
            eCtx.arc(player.pos.x, player.pos.y, this.playerPeripheralRadius, 0, Math.PI * 2);
            eCtx.fill();
        }

        fCtx.globalCompositeOperation = 'source-over';
        fCtx.clearRect(0, 0, w, h);
        fCtx.fillStyle = 'rgba(3, 6, 8, 0.58)';
        fCtx.fillRect(0, 0, w, h);

        fCtx.globalCompositeOperation = 'destination-out';
        fCtx.globalAlpha = 0.52;
        fCtx.drawImage(this.exploredCanvas, 0, 0);
        fCtx.globalAlpha = 1.0;

        if (poly.length > 2) {
            fCtx.globalCompositeOperation = 'destination-out';
            fCtx.fillStyle = '#fff';
            fCtx.beginPath();
            fCtx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
                fCtx.lineTo(poly[i].x, poly[i].y);
            }
            fCtx.closePath();
            fCtx.fill();

            const peripheralGradient = fCtx.createRadialGradient(
                player.pos.x, player.pos.y, this.playerPeripheralRadius * 0.72,
                player.pos.x, player.pos.y, this.playerPeripheralRadius
            );
            peripheralGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            peripheralGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            fCtx.fillStyle = peripheralGradient;
            fCtx.beginPath();
            fCtx.arc(player.pos.x, player.pos.y, this.playerPeripheralRadius, 0, Math.PI * 2);
            fCtx.fill();
        }

        fCtx.globalCompositeOperation = 'source-over';
    }

    _computePlayerVisionPoly() {
        const player = this.world.playerAgent;
        if (!player || player.state.isDead) {
            this.playerVisionPoly = [];
            return;
        }

        const pos = player.pos;
        const angle = player.angle;
        const fov = player.state.inBush ? Config.AGENT.FOV * 0.7 : Config.AGENT.FOV;
        const range = Math.max(Config.AGENT.VISION_RADIUS, player.traits.visionRadius || 0);
        this.playerVisionRange = range;
        const rayCount = 90;

        const points = [{ x: pos.x, y: pos.y }];

        for (let i = 0; i <= rayCount; i++) {
            const rayAngle = angle - fov / 2 + (fov * i) / rayCount;
            const dist = this.world.getRayDistance(pos, rayAngle, range, true); // true = ignore covers
            points.push({
                x: pos.x + Math.cos(rayAngle) * dist,
                y: pos.y + Math.sin(rayAngle) * dist
            });
        }

        this.playerVisionPoly = points;
    }

    _isInPlayerVision(testPos) {
        const player = this.world.playerAgent;
        if (!player || player.state.isDead) return false;
        if (Utils.distance(player.pos, testPos) <= this.playerPeripheralRadius) {
            return this.world.hasVisualLine(player.pos, testPos, this.playerPeripheralRadius);
        }

        const poly = this.playerVisionPoly;
        if (!poly || poly.length < 3) return false;

        let inside = false;
        const x = testPos.x;
        const y = testPos.y;

        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y;
            const xj = poly[j].x, yj = poly[j].y;

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside && this.world.hasVisualLine(player.pos, testPos, this.playerVisionRange);
    }
}
