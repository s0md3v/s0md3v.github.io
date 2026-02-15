import { Config } from './Config.js';

export class Renderer {
    constructor(ctx, world) {
        this.ctx = ctx;
        this.world = world;
        this.camera = { x: world.width / 2, y: world.height / 2, zoom: 1 };
        
        this.debugOptions = {
            showVision: false,
            showTrust: false,
            showComm: false,
            showHeatmap: false
        };
        
        // Load Sprites
        this.sprites = {
            blue_alive: new Image(),
            blue_down: new Image(),
            red_alive: new Image(),
            red_down: new Image(),
            icon_hp: new Image(),
            icon_ammo: new Image(),
            bullets: { rifle: [], lmg: [], pistol: [] }
        };
        this.sprites.blue_alive.src = './assets/blue_alive.bmp';
        this.sprites.blue_down.src = './assets/blue_down.bmp';
        this.sprites.red_alive.src = './assets/red_alive.bmp';
        this.sprites.red_down.src = './assets/red_down.bmp';

        this.sprites.icon_hp.src = './assets/icons/HP.png';
        this.sprites.icon_ammo.src = './assets/icons/Ammo.png';

        ['rifle', 'lmg', 'pistol'].forEach(type => {
            for(let i=1; i<=3; i++) {
                const img = new Image();
                img.src = `./assets/frames/${type}/${i}.png`;
                this.sprites.bullets[type].push(img);
            }
        });
        
        this.tileCache = {};
    }

    render() {
        // Clear background (Screen Space)
        this.ctx.fillStyle = '#111'; // Darker background for "void"
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

        this.ctx.save();
        
        // Apply Camera Transform
        // Center view on camera position
        this.ctx.translate(this.ctx.canvas.width / 2, this.ctx.canvas.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // Map Background (World Space)
        this.ctx.fillStyle = '#252525';
        this.ctx.fillRect(0, 0, this.world.width, this.world.height);

        this.drawVisualLayers(); 

        // Draw Map Walls if needed
        if (this.world.visualLayers.length === 0 || this.debugOptions.showVision) {
            this.drawMap();
        }

        // Only draw debug markers if vision debug is on
        if (this.debugOptions.showVision) {
            this.drawCovers();
            this.drawBushes();
            this.drawObstacleMap();
        }

        this.drawSmokes();
        this.drawLoot();
        this.drawAgents();
        this.drawProjectiles();
        this.drawHeatmap();
        this.drawEffects();
        this.drawBarks();
        this.drawDebug();
        
        this.ctx.restore();
    }

    drawVisualLayers() {
        if (!this.world.visualLayers) return;
        
        this.world.visualLayers.forEach(layer => {
            if (!layer) return;
            for (const [key, data] of Object.entries(layer)) {
                const [gx, gy] = key.split(',').map(Number);
                const x = gx * Config.WORLD.VISUAL_GRID_SIZE;
                const y = gy * Config.WORLD.VISUAL_GRID_SIZE;

                // Handle both old string format and new object format
                const path = typeof data === 'string' ? data : data.path;
                const tx = data.tx || 1;
                const ty = data.ty || 1;
                const rot = data.rot || 0;
                
                let img = this.tileCache[path];
                if (!img) {
                    img = new Image();
                    img.src = path;
                    this.tileCache[path] = img;
                }
                
                if (img.complete) {
                    const w = Config.WORLD.VISUAL_GRID_SIZE * tx;
                    const h = Config.WORLD.VISUAL_GRID_SIZE * ty;
                    
                    // Logic MUST match editor.js renderObject
                    let curW = w;
                    let curH = h;
                    if (rot % 2 !== 0) {
                        curW = h;
                        curH = w;
                    }

                    if (rot !== 0) {
                        const cx = x + curW/2;
                        const cy = y + curH/2;
                        
                        this.ctx.save();
                        this.ctx.translate(cx, cy);
                        this.ctx.rotate(rot * Math.PI / 2);
                        this.ctx.drawImage(img, -w/2, -h/2, w, h);
                        this.ctx.restore();
                    } else {
                        this.ctx.drawImage(img, x, y, w, h);
                    }
                }
            }
        });
    }

    drawMap() {
        this.ctx.fillStyle = '#444';
        for (const wall of this.world.walls) {
            this.ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        }
    }

    drawCovers() {
        this.ctx.fillStyle = 'rgba(74, 226, 114, 0.4)'; // Semi-transparent green
        this.ctx.strokeStyle = 'rgba(74, 226, 114, 0.8)';
        this.ctx.lineWidth = 1;
        for (const cover of this.world.covers) {
            // Color based on Health (Green -> Red)
            const hpRatio = cover.hp / cover.maxHp;
            const r = Math.floor(255 * (1 - hpRatio));
            const g = Math.floor(255 * hpRatio);
            
            this.ctx.fillStyle = `rgba(${r}, ${g}, 114, 0.4)`;
            this.ctx.strokeStyle = `rgba(${r}, ${g}, 114, 0.8)`;
            
            this.ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
            this.ctx.strokeRect(cover.x, cover.y, cover.w, cover.h);
        }
    }

    drawBushes() {
        for (const b of this.world.bushes) {
            this.ctx.fillStyle = 'rgba(34, 139, 34, 0.6)'; // Translucent Forest Green
            this.ctx.strokeStyle = 'rgba(0, 100, 0, 0.6)';
            this.ctx.lineWidth = 1;
            
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            // Draw leaves (noise details)
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

    drawSmokes() {
        for (const s of this.world.smokes) {
            const lifeRatio = s.life / Config.PHYSICS.SMOKE_DURATION;
            const alpha = Math.min(0.6, lifeRatio * 1.5);
            
            this.ctx.save();
            // Core cloud with radial gradient
            const gradient = this.ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius);
            gradient.addColorStop(0, `rgba(220, 220, 220, ${alpha})`);
            gradient.addColorStop(0.6, `rgba(180, 180, 180, ${alpha * 0.7})`);
            gradient.addColorStop(1, `rgba(140, 140, 140, 0)`);
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Bilowing "fluff" details
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
            let img = null;
            if (item.type === 'Medkit' && this.sprites.icon_hp.complete) img = this.sprites.icon_hp;
            else if ((item.type === 'AmmoCrate' || item.type === 'WeaponCrate') && this.sprites.icon_ammo.complete) img = this.sprites.icon_ammo;

            if (img && img.width > 0) {
                 const size = 24; 
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
        for (const agent of this.world.agents) {
            this.ctx.save();
            this.ctx.translate(agent.pos.x, agent.pos.y);
            this.ctx.rotate(agent.angle + Math.PI / 2); // Rotate sprite to match engine orientation

            // Select Sprite
            let sprite = null;
            if (agent.team === 0) {
                sprite = agent.state.isDowned ? this.sprites.blue_down : this.sprites.blue_alive;
            } else {
                sprite = agent.state.isDowned ? this.sprites.red_down : this.sprites.red_alive;
            }

            if (sprite && sprite.complete && sprite.naturalWidth > 0) {
                // Draw Sprite (Centered)
                // Scale slightly to match radius
                const size = agent.radius * 2.5; 
                this.ctx.drawImage(sprite, -size/2, -size/2, size, size);
            } else {
                // Fallback to primitive
                this.ctx.beginPath();
                if (agent.state.isDowned) {
                    this.ctx.ellipse(0, 0, agent.radius * 1.5, agent.radius * 0.7, 0, 0, Math.PI * 2);
                } else {
                    this.ctx.arc(0, 0, agent.radius, 0, Math.PI * 2);
                }
                this.ctx.fillStyle = agent.team === 0 ? '#4a90e2' : '#e24a4a'; 
                this.ctx.fill();
                this.ctx.strokeStyle = agent.state.inventory.weapon.type === 'Fast Gun' ? '#d4af37' : '#fff';
                this.ctx.lineWidth = agent.state.inventory.weapon.type === 'Fast Gun' ? 3 : 2;
                this.ctx.stroke();
            }

            // Downed Effect (Bleeding pulse)
            if (agent.state.isDowned) {
                const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
                this.ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
                this.ctx.lineWidth = 3;
                this.ctx.stroke(); // Stroke around sprite rect or circle? Maybe circle is better
                this.ctx.beginPath();
                this.ctx.arc(0, 0, agent.radius + 5, 0, Math.PI * 2);
                this.ctx.stroke();
            }

            // Rank Indicator (Star for Captain)
            if (agent.rank === 1 && !agent.state.isDowned) {
                this.ctx.fillStyle = '#FFD700'; // Gold
                this.ctx.beginPath();
                this.ctx.arc(0, -6, 4, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Pinned Status
            if (agent.state.isPinned) {
                 this.ctx.strokeStyle = '#FFFF00';
                 this.ctx.lineWidth = 2;
                 this.ctx.beginPath();
                 this.ctx.arc(0, 0, agent.radius + 8, 0, Math.PI * 2);
                 this.ctx.stroke();
            }

            this.ctx.restore();
            
            // HP bar (Billboarded - not rotated)
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            this.ctx.fillRect(agent.pos.x - 10, agent.pos.y - 22, 20, 3);
            this.ctx.fillStyle = '#4ae24a';
            const hpRatio = agent.state.hp / agent.state.maxHp;
            this.ctx.fillRect(agent.pos.x - 10, agent.pos.y - 22, 20 * hpRatio, 3);

            // Stamina bar
            this.ctx.fillStyle = 'rgba(50, 50, 50, 0.5)';
            this.ctx.fillRect(agent.pos.x - 10, agent.pos.y - 18, 20, 2);
            this.ctx.fillStyle = '#ffeb3b'; // Yellow
            const staminaRatio = agent.state.stamina / 100; 
            this.ctx.fillRect(agent.pos.x - 10, agent.pos.y - 18, 20 * staminaRatio, 2);
            
            // State Emoji
            if (agent.state.isFrozenUntil > Date.now()) {
                 this.ctx.font = '16px serif';
                 this.ctx.fillText('🥶', agent.pos.x - 8, agent.pos.y - 15);
            } else if (agent.state.stress > 80) {
                 this.ctx.font = '16px serif';
                 this.ctx.fillText('😱', agent.pos.x - 8, agent.pos.y - 15);
            }

            // Reloading Indicator
            if (agent.state.reloadingUntil > Date.now()) {
                this.ctx.font = 'bold 10px monospace';
                this.ctx.fillStyle = '#ff69b4';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('RELOADING', agent.pos.x, agent.pos.y - 25);
            }
        }
    }

    drawProjectiles() {
        for (const p of this.world.projectiles) {
            this.ctx.save();
            this.ctx.translate(p.pos.x, p.pos.y);
            
            if (p.type === 'GRENADE') {
                // Frag Grenade: Dark Sphere with a fuse spark
                this.ctx.fillStyle = '#2c3e50';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#34495e';
                this.ctx.stroke();

                // Fuse Spark
                const pulse = (Math.sin(Date.now() / 50) + 1) / 2;
                this.ctx.fillStyle = `rgba(255, 100, 0, ${0.5 + pulse * 0.5})`;
                this.ctx.beginPath();
                this.ctx.arc(p.radius * 0.5, -p.radius * 0.5, 2, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (p.type === 'SMOKE') {
                // Smoke Grenade: Gray canister
                this.ctx.fillStyle = '#95a5a6';
                if (p.angle !== undefined) this.ctx.rotate(p.angle);
                this.ctx.fillRect(-p.radius, -p.radius * 1.5, p.radius * 2, p.radius * 3);
                this.ctx.strokeStyle = '#7f8c8d';
                this.ctx.strokeRect(-p.radius, -p.radius * 1.5, p.radius * 2, p.radius * 3);
            } else {
                 // Bullet Logic (Frames)
                 const visualType = p.visualType || 'pistol'; // Default fallback
                 const frames = this.sprites.bullets[visualType];

                 if (frames && frames.length > 0) {
                     this.ctx.rotate(p.angle + Math.PI/2); 
                     
                     let frameIndex = 1; // Bullet in motion (2.png)
                     if (p.elapsed < 50) frameIndex = 0; // Muzzle Flash (1.png)
                     
                     const img = frames[frameIndex];
                     if (img && img.complete && img.width > 0) {
                         // Scale based on type? Rifles are longer?
                         const scale = 0.5;
                         const w = img.width * scale;
                         const h = img.height * scale;
                         this.ctx.drawImage(img, -w/2, -h/2, w, h);
                     } else {
                         // Image not ready fallback
                         this.ctx.fillStyle = '#fff';
                         this.ctx.beginPath();
                         this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                         this.ctx.fill();
                     }
                 } else {
                     // No frames fallback
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

        const inspector = document.getElementById('agent-details');
        if (!inspector) return;
        
        const agentIdMatch = inspector.innerHTML.match(/UNIT #(\d+)/); 
        if (!agentIdMatch) return;
        
        const agentId = parseInt(agentIdMatch[1]);
        const agent = this.world.agents.find(a => a.id === agentId);
        if (!agent) return;

        const grid = agent.memory.heatmap;
        const rows = agent.memory.gridRows;
        const cols = agent.memory.gridCols;
        const cellW = this.world.width / cols;
        const cellH = this.world.height / rows;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const heat = grid[y][x];
                if (heat > 0) {
                    this.ctx.fillStyle = `rgba(255, 0, 0, ${heat / 20})`; 
                    this.ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
                }
            }
        }
    }

    drawObstacleMap() {
        if (!this.debugOptions.showHeatmap) return; 

        const inspector = document.getElementById('agent-details');
        if (!inspector) return;
        
        const agentIdMatch = inspector.innerHTML.match(/UNIT #(\d+)/);
        if (!agentIdMatch) return;
        
        const agentId = parseInt(agentIdMatch[1]);
        const agent = this.world.agents.find(a => a.id === agentId);
        if (!agent) return;

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
            if (e.type === 'EXPLOSION') {
                 const lifeRatio = e.life / 300; // 0 to 1
                 const t = 1 - lifeRatio; // progress 0 to 1

                 this.ctx.save();

                 // 1. Shockwave Ring
                 this.ctx.strokeStyle = `rgba(255, 255, 255, ${lifeRatio * 0.5})`;
                 this.ctx.lineWidth = 2;
                 this.ctx.beginPath();
                 this.ctx.arc(e.x, e.y, e.radius * t * 1.2, 0, Math.PI * 2);
                 this.ctx.stroke();

                 // 2. Main Blast (Orange/Red Gradient)
                 const grad = this.ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius * t);
                 grad.addColorStop(0, `rgba(255, 255, 200, ${lifeRatio})`); // White-ish center
                 grad.addColorStop(0.3, `rgba(255, 150, 50, ${lifeRatio * 0.8})`); // Orange
                 grad.addColorStop(1, `rgba(200, 50, 0, 0)`); // Dissipating Red
                 
                 this.ctx.fillStyle = grad;
                 this.ctx.beginPath();
                 this.ctx.arc(e.x, e.y, e.radius * t, 0, Math.PI * 2);
                 this.ctx.fill();

                 // 3. Secondary Flashes (Debris simulation)
                 if (t < 0.5) {
                     this.ctx.fillStyle = `rgba(255, 255, 255, ${lifeRatio})`;
                     for(let i=0; i<4; i++) {
                         const ang = i * Math.PI/2 + (t * 2);
                         const dist = e.radius * 0.4 * t;
                         this.ctx.beginPath();
                         this.ctx.arc(e.x + Math.cos(ang)*dist, e.y + Math.sin(ang)*dist, 10 * lifeRatio, 0, Math.PI * 2);
                         this.ctx.fill();
                     }
                 }

                 this.ctx.restore();
            }
        }
    }

    drawBarks() {
        this.ctx.font = 'bold 14px monospace';
        this.ctx.textAlign = 'center';
        
        for (const agent of this.world.agents) {
            if (!agent.barks) continue;
            
            agent.barks.forEach((bark, i) => {
                const lifeRatio = bark.life / 2000;
                const alpha = Math.min(1.0, lifeRatio * 2); 
                const yOffset = (1 - lifeRatio) * 30; 
                
                this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                this.ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
                this.ctx.lineWidth = 3;
                
                const by = agent.pos.y - 40 - yOffset - (i * 15); 
                
                this.ctx.strokeText(bark.text, agent.pos.x, by);
                this.ctx.fillText(bark.text, agent.pos.x, by);
            });
        }
    }

    drawDebug() {
        const now = Date.now();

        // 1. Vision Cones
        for (const agent of this.world.agents) {
            const baseAlpha = this.debugOptions.showVision ? 0.175 : 0.05;
            const teamColor = agent.team === 0 ? '74, 144, 226' : '226, 74, 74';
            
            const fov = Config.AGENT.FOV;
            const range = agent.state.inventory.weapon.range;
            const fovea = Config.SENSORY.FOVEA_ANGLE * 2;
            const peripheralDist = Config.SENSORY.PERIPHERAL_DIST;

            // --- A. Peripheral Awareness (Smooth Pulse) ---
            if (this.debugOptions.showVision) {
                const pGrad = this.ctx.createRadialGradient(agent.pos.x, agent.pos.y, 0, agent.pos.x, agent.pos.y, peripheralDist);
                pGrad.addColorStop(0, `rgba(${teamColor}, 0.075)`);
                pGrad.addColorStop(1, `rgba(${teamColor}, 0)`);
                this.ctx.fillStyle = pGrad;
                this.ctx.beginPath();
                this.ctx.arc(agent.pos.x, agent.pos.y, peripheralDist, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // --- B. Main FOV Cone (Occluded by Walls) ---
            this.drawOccludedCone(agent.pos, agent.angle, fov, range, teamColor, baseAlpha);

            // --- C. Fovea (High Detail Zone) ---
            if (this.debugOptions.showVision) {
                this.drawOccludedCone(agent.pos, agent.angle, fovea, range, teamColor, baseAlpha * 0.4);
            }

            // --- D. Visualize Detection Meters for Hostiles ---
            agent.memory.detectionMeters.forEach((val, targetId) => {
                const target = this.world.agents.find(a => a.id === targetId);
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

            // Shout Pulse
            if (agent.showShoutUntil > now) {
                const remaining = (agent.showShoutUntil - now) / 500;
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * remaining})`;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(agent.pos.x, agent.pos.y, 30 + (1 - remaining) * 200, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        // 2. Trust Links
        if (this.debugOptions.showTrust) {
            this.ctx.lineWidth = 1;
            for (const agent of this.world.agents) {
                agent.memory.socialCredit.forEach((trust, id) => {
                    if (trust > 0.4) {
                        const target = this.world.agents.find(a => a.id === id);
                        if (target) {
                            this.ctx.strokeStyle = `rgba(0, 255, 0, ${trust * 0.4})`;
                            this.ctx.beginPath();
                            this.ctx.moveTo(agent.pos.x, agent.pos.y);
                            this.ctx.lineTo(target.pos.x, target.pos.y);
                            this.ctx.stroke();
                        }
                    }
                });
            }
        }

        // 3. Comm Lines
        if (this.debugOptions.showComm) {
            this.ctx.lineWidth = 1.5;
            for (const agent of this.world.agents) {
                if (!agent.commLinks) continue;
                agent.commLinks.forEach(link => {
                    const elapsed = now - link.timestamp;
                    if (elapsed < 2000) {
                        const target = this.world.agents.find(a => a.id === link.targetId);
                        if (target) {
                            const alpha = 1 - (elapsed / 2000);
                            this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                            this.ctx.setLineDash([5, 5]); 
                            this.ctx.beginPath();
                            this.ctx.moveTo(agent.pos.x, agent.pos.y);
                            this.ctx.lineTo(target.pos.x, target.pos.y);
                            this.ctx.stroke();
                            this.ctx.setLineDash([]);
                        }
                    }
                });
            }
        }
    }

    drawOccludedCone(pos, angle, fov, range, color, alpha) {
        range = range || 400; // Fallback
        const rayCount = 30; // Sufficient for debug visualization
        const points = [];
        points.push(pos);

        for (let i = 0; i <= rayCount; i++) {
            const rayAngle = angle - fov / 2 + (fov * i) / rayCount;
            const dist = this.world.getRayDistance(pos, rayAngle, range);
            points.push({
                x: pos.x + Math.cos(rayAngle) * dist,
                y: pos.y + Math.sin(rayAngle) * dist
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
}
