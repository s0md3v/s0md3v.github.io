import { Config } from './Config.js';

export class Renderer {
    constructor(ctx, world) {
        this.ctx = ctx;
        this.world = world;
        this.debugOptions = {
            showVision: false,
            showTrust: false,
            showComm: false,
            showHeatmap: false
        };
    }

    render() {
        // Clear background
        this.ctx.fillStyle = '#252525';
        this.ctx.fillRect(0, 0, this.world.width, this.world.height);

        this.drawMap();
        this.drawCovers();
        this.drawBushes();
        this.drawSmokes();
        this.drawLoot();
        this.drawAgents();
        this.drawProjectiles();
        this.drawHeatmap();
        this.drawObstacleMap();
        this.drawEffects();
        this.drawBarks();
        this.drawDebug();
    }

    drawBarks() {
        this.ctx.font = 'bold 14px monospace';
        this.ctx.textAlign = 'center';
        
        for (const agent of this.world.agents) {
            if (!agent.barks) continue;
            
            agent.barks.forEach((bark, i) => {
                const lifeRatio = bark.life / 2000;
                const alpha = Math.min(1.0, lifeRatio * 2); 
                const yOffset = (1 - lifeRatio) * 30; // Float up 30px
                
                this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                this.ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
                this.ctx.lineWidth = 3;
                
                const by = agent.pos.y - 40 - yOffset - (i * 15); // Stack if multiple
                
                this.ctx.strokeText(bark.text, agent.pos.x, by);
                this.ctx.fillText(bark.text, agent.pos.x, by);
            });
        }
    }

    drawSmokes() {
        for (const s of this.world.smokes) {
            const alpha = Math.min(0.4, s.life / 2000); // Fade out at the end
            this.ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Inner "thick" part
            this.ctx.fillStyle = `rgba(150, 150, 150, ${alpha * 0.5})`;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.radius * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
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

    drawEffects() {
        this.ctx.fillStyle = 'rgba(255, 100, 50, 0.6)';
        for (const e of this.world.effects) {
            if (e.type === 'EXPLOSION') {
                 this.ctx.beginPath();
                 this.ctx.arc(e.x, e.y, e.radius * (1 - e.life/300), 0, Math.PI * 2);
                 this.ctx.fill();
            }
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
        const rows = agent.memory.gridSize;
        const cols = agent.memory.gridSize;
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
        if (!this.debugOptions.showHeatmap) return; // Share toggle for now or add new one

        const inspector = document.getElementById('agent-details');
        if (!inspector) return;
        
        const agentIdMatch = inspector.innerHTML.match(/UNIT #(\d+)/);
        if (!agentIdMatch) return;
        
        const agentId = parseInt(agentIdMatch[1]);
        const agent = this.world.agents.find(a => a.id === agentId);
        if (!agent) return;

        const grid = agent.memory.obstacleMap;
        const rows = 16;
        const cols = 16;
        const cellW = this.world.width / cols;
        const cellH = this.world.height / rows;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const type = grid[y][x];
                if (type === 1) {
                    this.ctx.fillStyle = `rgba(255, 255, 255, 0.15)`; // Discovered wall
                    this.ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
                } else if (type === 0) {
                    this.ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`; // Discovered empty
                    this.ctx.strokeRect(x * cellW, y * cellH, cellW, cellH);
                }
            }
        }
    }

    drawProjectiles() {
        this.ctx.fillStyle = '#fff';
        for (const p of this.world.projectiles) {
            this.ctx.beginPath();
            this.ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawLoot() {
        for (const item of this.world.loot) {
            this.ctx.beginPath();
            this.ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
            if (item.type === 'WeaponCrate') this.ctx.fillStyle = '#d4af37';
            else if (item.type === 'Medkit') this.ctx.fillStyle = '#ff69b4';
            else if (item.type === 'AmmoCrate') this.ctx.fillStyle = '#4ae24a'; // Green
            
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
            this.ctx.stroke();
        }
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

    drawAgents() {
        for (const agent of this.world.agents) {
            this.ctx.save();
            this.ctx.translate(agent.pos.x, agent.pos.y);
            this.ctx.rotate(agent.angle);

            // Body
            this.ctx.beginPath();
            if (agent.state.isDowned) {
                this.ctx.ellipse(0, 0, agent.radius * 1.5, agent.radius * 0.7, 0, 0, Math.PI * 2);
            } else {
                this.ctx.arc(0, 0, agent.radius, 0, Math.PI * 2);
            }
            this.ctx.fillStyle = agent.team === 0 ? '#4a90e2' : '#e24a4a'; // Blue vs Red
            this.ctx.fill();
            this.ctx.strokeStyle = agent.state.inventory.weapon.type === 'Fast Gun' ? '#d4af37' : '#fff';
            this.ctx.lineWidth = agent.state.inventory.weapon.type === 'Fast Gun' ? 3 : 2;
            this.ctx.stroke();

            // Downed Effect (Bleeding pulse)
            if (agent.state.isDowned) {
                const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
                this.ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
                this.ctx.lineWidth = 3;
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
                 this.ctx.arc(0, 0, agent.radius + 4, 0, Math.PI * 2);
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
            const staminaRatio = agent.state.stamina / 100; // Config.AGENT.MAX_STAMINA is 100
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

    drawDebug() {
        const now = Date.now();

        // 1. Vision Cones (Overhauled for Smoothness & Performance)
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

            // --- B. Main FOV Cone (Smooth Arc) ---
            // Radial gradient handles the distance fall-off smoothly
            const coneGrad = this.ctx.createRadialGradient(agent.pos.x, agent.pos.y, range * 0.2, agent.pos.x, agent.pos.y, range);
            coneGrad.addColorStop(0, `rgba(${teamColor}, ${baseAlpha})`);
            coneGrad.addColorStop(0.6, `rgba(${teamColor}, ${baseAlpha * 0.4})`);
            coneGrad.addColorStop(1, `rgba(${teamColor}, 0)`);
            
            this.ctx.fillStyle = coneGrad;
            this.ctx.beginPath();
            this.ctx.moveTo(agent.pos.x, agent.pos.y);
            this.ctx.arc(agent.pos.x, agent.pos.y, range, agent.angle - fov/2, agent.angle + fov/2);
            this.ctx.closePath();
            this.ctx.fill();

            // --- C. Fovea (High Detail Zone - Smooth Focus) ---
            if (this.debugOptions.showVision) {
                const fovGrad = this.ctx.createRadialGradient(agent.pos.x, agent.pos.y, 0, agent.pos.x, agent.pos.y, range);
                fovGrad.addColorStop(0, `rgba(${teamColor}, ${baseAlpha * 0.8})`);
                fovGrad.addColorStop(1, `rgba(${teamColor}, 0)`);
                
                this.ctx.fillStyle = fovGrad;
                this.ctx.beginPath();
                this.ctx.moveTo(agent.pos.x, agent.pos.y);
                this.ctx.arc(agent.pos.x, agent.pos.y, range, agent.angle - fovea/2, agent.angle + fovea/2);
                this.ctx.closePath();
                this.ctx.fill();
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
                        
                        // Background
                        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        this.ctx.fillRect(mx, my, meterW, meterH);
                        
                        // Progress
                        const pct = Math.min(1.0, val / Config.SENSORY.DETECTION_THRESHOLD);
                        this.ctx.fillStyle = pct >= 1.0 ? '#ff0' : '#fff';
                        this.ctx.fillRect(mx, my, meterW * pct, meterH);
                    }
                }
            });

            // Shout Pulse (Existing)
            if (agent.showShoutUntil > now) {
                const remaining = (agent.showShoutUntil - now) / 500;
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * remaining})`;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(agent.pos.x, agent.pos.y, 30 + (1 - remaining) * 200, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        // 2. Trust Links (Existing)
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

        // 3. Comm Lines (Recent updates)
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
                            this.ctx.setLineDash([5, 5]); // Dashed line for data flow
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

        // 4. Dread Zones (Ghosts of War)
        if (this.debugOptions.showHeatmap) {
            const inspector = document.getElementById('agent-details');
            if (inspector) {
                const agentIdMatch = inspector.innerHTML.match(/UNIT #(\d+)/); 
                if (agentIdMatch) {
                    const agentId = parseInt(agentIdMatch[1]);
                    const agent = this.world.agents.find(a => a.id === agentId);
                    if (agent && agent.memory.dreadZones) {
                        this.ctx.fillStyle = 'rgba(100, 0, 100, 0.2)'; // Faint Purple
                        this.ctx.strokeStyle = 'rgba(150, 0, 150, 0.5)';
                        agent.memory.dreadZones.forEach(dread => {
                            this.ctx.beginPath();
                            this.ctx.arc(dread.x, dread.y, dread.radius, 0, Math.PI * 2);
                            this.ctx.fill();
                            this.ctx.stroke();
                            // Skull icon?
                            this.ctx.font = '12px serif';
                            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                            this.ctx.fillText('☠️', dread.x, dread.y);
                        });
                    }
                }
            }
        }
    }
}
