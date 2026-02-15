import { Agent } from './Agent.js';
import { Utils } from './Utils.js';
import { Projectile } from './Projectile.js';
import { Config } from './Config.js';
import { MapGenerator } from './MapGenerator.js';
import { SpatialGrid } from './SpatialGrid.js';
import { EventBus } from './EventBus.js';

import { MapLoader } from './MapLoader.js';

export class World {
    constructor(width, height, audioController, mapData = null) {
        this.audio = audioController; // Store audio controller
        
        this.gridSize = Config.WORLD.GRID_SIZE;
        this.events = new EventBus();
        
        this.agents = [];
        this.projectiles = [];
        this.walls = []; 
        this.covers = [];
        this.bushes = []; // {x, y, radius}
        this.grid = []; 
        this.loot = [];
        this.effects = []; // Visual effects {x, y, radius, type, life}
        this.smokes = []; // {x, y, radius, life}
        this.commandChaos = { 0: 0, 1: 0 }; // team -> time remaining in chaos
        this.visualLayers = []; // [Layer0, Layer1] from map

        if (mapData) {
             // Load from Map
             const loader = new MapLoader();
             const loaded = loader.load(mapData);
             
             this.width = loaded.width;
             this.height = loaded.height;
             Config.WORLD.WIDTH = this.width;
             Config.WORLD.HEIGHT = this.height;

             this.grid = loaded.grid;
             this.naturalGrid = this.grid.map(row => [...row]); // Copy for safety
             this.walls = loaded.walls;
             this.bushes = loaded.bushes;
             this.covers = loaded.covers;
             this.spawns = loaded.spawns;
             this.visualLayers = loaded.visualLayers;

             // Initialize Spatial Grid with new dimensions
             this.spatial = new SpatialGrid(this.width, this.height, Config.WORLD.SPATIAL_GRID_SIZE);

             // Spawn Agents at map spawn points
             this.spawnAgentsFromMap();
             this.spawnLoot(); // Loot still random for now? Or adds loot points to map?
        } else {
            // Legacy Procedural Generation
            this.width = Math.max(1, width);
            this.height = Math.max(1, height);
            Config.WORLD.WIDTH = this.width;
            Config.WORLD.HEIGHT = this.height;
            this.spatial = new SpatialGrid(width, height, Config.WORLD.SPATIAL_GRID_SIZE);

            // 1. Map Generation
            const mapGen = new MapGenerator(width, height, this.gridSize);
            this.naturalGrid = mapGen.generate(); // 2D array of natural walls
            this.grid = this.naturalGrid.map(row => [...row]); // Copy for general pathfinding
            this.walls = mapGen.convertToWalls(this.grid); // Rects

            // 2. Decorators
            this.generateCovers();
            this.generateBushes();
            this.spawnAgents();
            this.spawnLoot();
        }

        // 3. Event Listeners
        this.events.on('sound', (data) => this.handleSound(data));
        this.events.on('death', (data) => this.handleDeath(data));
    }

    generateCovers() {
        // 1. Central Hub Reinforcement (Minimal)
        const hubX = this.width / 2;
        const hubY = this.height / 2;
        for (let i = 0; i < 4; i++) {
             const x = hubX + (Math.random() - 0.5) * 300;
             const y = hubY + (Math.random() - 0.5) * 300;
             this.spawnCoverCluster({ x, y });
        }

        // 2. Lane Covers (Leap-frogging points)
        // Sparsely placed along the 1/3 and 2/3 marks
        const markers = [this.width * 0.3, this.width * 0.6];
        const lanes = [this.height * 0.25, this.height * 0.5, this.height * 0.75];
        
        markers.forEach(x => {
            lanes.forEach(y => {
                if (Math.random() < 0.7) {
                    this.spawnCoverCluster({ x: x + (Math.random()-0.5)*50, y: y + (Math.random()-0.5)*50 });
                }
            });
        });

        // 3. Random Scattered Rubble (Reduced)
        for (let i = 0; i < 10; i++) {
            const pos = this.findSpawnPoint(150, 100, this.width - 150, this.height - 100);
            if (pos) this.spawnCoverCluster(pos);
        }
    }

    generateBushes() {
        for (let i = 0; i < 15; i++) { // 15 Bush clusters
            const pos = this.findSpawnPoint(100, 100, this.width - 100, this.height - 100);
            if (pos) {
                // Determine size
                const radius = 20 + Math.random() * 20; // 20-40px radius (1-2m)
                this.spawnBush(pos.x, pos.y, radius);
                
                // Chance for a partner bush
                if (Math.random() > 0.5) {
                    this.spawnBush(pos.x + (Math.random()-0.5)*30, pos.y + (Math.random()-0.5)*30, radius * 0.8);
                }
            }
        }
    }

    spawnBush(x, y, r) {
        const details = [];
        for (let i = 0; i < 5; i++) {
            details.push({
                angle: Math.random() * Math.PI * 2,
                dist: Math.random() * r * 0.7
            });
        }
        this.bushes.push({ x, y, radius: r, details });
        // Mark Grid (Val 2 = Bush)
        const startGx = Math.floor((x - r) / this.gridSize);
        const startGy = Math.floor((y - r) / this.gridSize);
        const endGx = Math.floor((x + r) / this.gridSize);
        const endGy = Math.floor((y + r) / this.gridSize);

        for (let gy = startGy; gy <= endGy; gy++) {
            for (let gx = startGx; gx <= endGx; gx++) {
                if (gy >= 0 && gy < this.grid.length && gx >= 0 && gx < this.grid[0].length) {
                    // Only mark empty space, don't overwrite walls/covers
                    if (this.grid[gy][gx] === 0) {
                        this.grid[gy][gx] = 2; // 2 = Bush (Vision Block, Walkable)
                    }
                }
            }
        }
    }

    spawnCoverCluster(pos) {
        const type = Math.random();
        const branchLength = 50; // Increased length (~2.5m)
        const thickness = 25; // Increased thickness (~1.25m)
        
        if (type < 0.5) {
            const isHorizontal = Math.random() > 0.5;
            const c = { x: pos.x, y: pos.y, w: isHorizontal ? branchLength : thickness, h: isHorizontal ? thickness : branchLength, hp: Config.PHYSICS.COVER_HP_STONE, maxHp: Config.PHYSICS.COVER_HP_STONE };
            this.covers.push(c);
            this.markGrid(c, 1);
        } else {
            // Simple L-shape
            const c1 = { x: pos.x, y: pos.y, w: branchLength, h: thickness, hp: Config.PHYSICS.COVER_HP_WOOD, maxHp: Config.PHYSICS.COVER_HP_WOOD };
            const c2 = { x: pos.x, y: pos.y, w: thickness, h: branchLength, hp: Config.PHYSICS.COVER_HP_WOOD, maxHp: Config.PHYSICS.COVER_HP_WOOD };
            this.covers.push(c1, c2);
            this.markGrid(c1, 1);
            this.markGrid(c2, 1);
        }
    }

    markGrid(rect, val) {
        const startGx = Math.floor(rect.x / this.gridSize);
        const startGy = Math.floor(rect.y / this.gridSize);
        const endGx = Math.floor((rect.x + rect.w) / this.gridSize);
        const endGy = Math.floor((rect.y + rect.h) / this.gridSize);

        for (let y = startGy; y <= endGy; y++) {
            for (let x = startGx; x <= endGx; x++) {
                if (y >= 0 && y < this.grid.length && x >= 0 && x < this.grid[0].length) {
                    this.grid[y][x] = val;
                }
            }
        }
    }

    spawnLoot() {
        // High-value loot in the Hub
        for (let i = 0; i < 10; i++) {
            const x = this.width / 2 + (Math.random() - 0.5) * 300;
            const y = this.height / 2 + (Math.random() - 0.5) * 300;
            const pos = this.findSpawnPoint(x-50, y-50, x+50, y+50);
            if (pos) this.loot.push({ x: pos.x, y: pos.y, type: Math.random() > 0.5 ? 'WeaponCrate' : 'Medkit', radius: 5 });
        }

        // Standard loot everywhere
        for (let i = 0; i < 20; i++) {
            const pos = this.findSpawnPoint(0, 0, this.width, this.height);
            const rand = Math.random();
            let type = 'AmmoCrate';
            if (rand > 0.8) type = 'Medkit';
            this.loot.push({ x: pos.x, y: pos.y, type: type, radius: 5 });
        }
    }

    spawnAgentsFromMap() {
        const squadComposition = ['MEDIC', 'GUNNER', 'MARKSMAN', 'BREACHER', 'RIFLEMAN', 'RIFLEMAN'];
        
        // Group spawns by team
        const team1Spawns = this.spawns.filter(s => s.team === 0);
        const team2Spawns = this.spawns.filter(s => s.team === 1);

        // Fallback: If no spawns defined in map, use default random logic
        if (team1Spawns.length === 0 || team2Spawns.length === 0) {
            console.warn("No spawn points found in map data. Falling back to random base spawning.");
            this.spawnAgents();
            return;
        }

        // Team 1
        const team1 = [];
        for (let i = 0; i < 6; i++) {
            // Cycle through spawns or reuse if not enough
            const spawn = team1Spawns[i % team1Spawns.length];
            if (spawn) {
                // Add jitter if reusing spawn
                const x = spawn.x + (Math.random() - 0.5) * 20;
                const y = spawn.y + (Math.random() - 0.5) * 20;
                team1.push(new Agent(i, 0, x, y, squadComposition[i], this));
            }
        }
        this.electLeader(team1);
        this.agents.push(...team1);

        // Team 2
        const team2 = [];
        for (let i = 0; i < 6; i++) {
             const spawn = team2Spawns[i % team2Spawns.length];
             if (spawn) {
                const x = spawn.x + (Math.random() - 0.5) * 20;
                const y = spawn.y + (Math.random() - 0.5) * 20;
                team2.push(new Agent(i + 6, 1, x, y, squadComposition[i], this));
             }
        }
        this.electLeader(team2);
        this.agents.push(...team2);

        this.agents.forEach(a => a.initTeammateTrust(this));
    }

    spawnAgents() {
        const squadComposition = ['MEDIC', 'GUNNER', 'MARKSMAN', 'BREACHER', 'RIFLEMAN', 'RIFLEMAN'];

        // Team 1 (Left Base)
        const team1 = [];
        for (let i = 0; i < 6; i++) {
            const pos = this.findSpawnPoint(50, 50, 200, this.height - 50);
            if (pos) team1.push(new Agent(i, 0, pos.x, pos.y, squadComposition[i], this));
        }
        this.electLeader(team1);
        this.agents.push(...team1);

        // Team 2 (Right Base)
        const team2 = [];
        for (let i = 0; i < 6; i++) {
            const pos = this.findSpawnPoint(this.width - 200, 50, this.width - 50, this.height - 50);
            if (pos) team2.push(new Agent(i + 6, 1, pos.x, pos.y, squadComposition[i], this));
        }
        this.electLeader(team2);
        this.agents.push(...team2);

        this.agents.forEach(a => a.initTeammateTrust(this));
    }

    electLeader(teamAgents) {
        if (teamAgents.length === 0) return;
        // Find highest leadership potential weighted by current trust from survivors
        let bestLeader = teamAgents[0];
        let maxScore = -1;
        
        teamAgents.forEach(candidate => {
            // Calculate average trust from other survivors
            let totalTrust = 0;
            let count = 0;
            teamAgents.forEach(voter => {
                if (voter !== candidate && voter.memory) {
                    totalTrust += (voter.memory.socialCredit.get(candidate.id) || 0.5);
                    count++;
                }
            });
            const avgTrust = count > 0 ? totalTrust / count : 0.5;
            
            // Score = Merit (70%) + Trust (30%)
            const score = (candidate.traits.leadershipPotential * 0.7) + (avgTrust * 0.3);
            
            if (score > maxScore) {
                maxScore = score;
                bestLeader = candidate;
            }
            candidate.rank = 0; // Private
        });
        
        bestLeader.rank = 1; // Captain
    }

    update(dt) {
        // 0. Update Spatial Grid
        this.spatial.clear();
        this.agents.forEach(a => this.spatial.add(a));
        // Add covers to spatial grid so projectiles can find them quickly
        this.covers.forEach(c => {
            // Mock entity structure for spatial grid
            this.spatial.add({
                pos: { x: c.x + c.w/2, y: c.y + c.h/2 },
                radius: Math.max(c.w, c.h),
                isCover: true,
                ref: c
            });
        });
        
        // 1. Remove Dead & Handle Death Events
        const deadAgents = this.agents.filter(a => a.state.isDead);
        if (deadAgents.length > 0) {
            this.agents = this.agents.filter(a => !a.state.isDead);
            deadAgents.forEach(dead => {
                this.events.emit('death', { agent: dead });
            });
        }

        // 2. Update Agents
        this.agents.forEach(agent => {
            // Leader Buff Application
            if (agent.rank === 1) {
                const nearbyEntities = this.spatial.query(agent.pos.x, agent.pos.y, Config.WORLD.LEADERSHIP_RANGE);
                nearbyEntities.forEach(entity => {
                    if (entity.team === agent.team && entity !== agent) {
                         entity.buffs.leader = true; 
                    }
                });
            }
            agent.update(dt, this);
            agent.buffs.leader = false; 
        });

        // 3. Resolve Collisions (Spatial)
        this.agents.forEach(a1 => {
            const neighbors = this.spatial.getNeighbors(a1, a1.radius * 2).filter(e => !e.isCover); 
            neighbors.forEach(a2 => {
                 this.resolveCollision(a1, a2);
            });
        });

        // 4. Update Projectiles & Check Suppression
        this.projectiles.forEach(p => {
             p.update(dt, this);
             // Optimize Suppression: Only check every few frames or if bullet is active
             if (p.active && p.type === 'BULLET') {
                 // Optimization: Only query for agents
                 const nearby = this.spatial.query(p.pos.x, p.pos.y, Config.PHYSICS.SUPPRESSION_RADIUS);
                 nearby.forEach(e => {
                     if (!e.isCover && e.team !== p.team) {
                         const dist = Utils.distance(p.pos, e.pos);
                         if (dist < Config.PHYSICS.SUPPRESSION_RADIUS) {
                             e.suppress(Config.PHYSICS.SUPPRESSION_STRESS * (dt/100), this); 
                         }
                     }
                 });
             }
        });
        this.projectiles = this.projectiles.filter(p => p.active);

        // 5. Update Effects
        this.effects.forEach(e => e.life -= dt);
        this.effects = this.effects.filter(e => e.life > 0);

        this.smokes.forEach(s => s.life -= dt);
        this.smokes = this.smokes.filter(s => s.life > 0);

        // Update Command Chaos
        for (let team in this.commandChaos) {
            if (this.commandChaos[team] > 0) {
                this.commandChaos[team] -= dt;
                if (this.commandChaos[team] <= 0) {
                    // Succession: Elect new leader among survivors
                    const teamAgents = this.agents.filter(a => a.team === parseInt(team) && !a.state.isDead && !a.state.isDowned);
                    this.electLeader(teamAgents);
                }
            }
        }
    }
    
    resolveCollision(a1, a2) {
        if (a1 === a2) return;
        const dist = Utils.distance(a1.pos, a2.pos);
        const minDist = a1.radius + a2.radius;
        
        if (dist < minDist) {
            const overlap = minDist - dist;
            const angle = Utils.angle(a1.pos, a2.pos);
            const moveX = (Math.cos(angle) * overlap) / 2;
            const moveY = (Math.sin(angle) * overlap) / 2;
            
            if (!this.isWallAt(a1.pos.x - moveX, a1.pos.y - moveY)) {
                a1.pos.x -= moveX;
                a1.pos.y -= moveY;
            }
            if (!this.isWallAt(a2.pos.x + moveX, a2.pos.y + moveY)) {
                a2.pos.x += moveX;
                a2.pos.y += moveY;
            }
        }
    }

    handleDeath(data) {
        const dead = data.agent;
        const range = dead.rank === 1 ? 9999 : 400; // Leader death is global shock
        
        const nearby = this.spatial.query(dead.pos.x, dead.pos.y, range); 
        
        // If leader died, re-elect? Or just chaos first?
        if (dead.rank === 1) {
            this.commandChaos[dead.team] = Config.WORLD.COMMAND_CHAOS_DURATION;
            this.events.emit('leaderDeath', { team: dead.team });
        }

        // Penalty for teammates, Reward for enemies
        this.agents.forEach(other => {
            if (other.team === dead.team) {
                const dist = Utils.distance(other.pos, dead.pos);
                if (dist > range) return;

                let stressImpact = 25;
                let moraleImpact = 15;
                
                if (dead.rank === 1) {
                    stressImpact = Config.WORLD.LEADER_DEATH_PENALTY;
                    moraleImpact = 40;
                }

                other.state.modifyStress(stressImpact);
                other.state.modifyMorale(-moraleImpact);
                other.memory.traumaLevel += 10 * (1 - dist/range);
                
                // LEADERSHIP IMPACT: Penalty for casualties
                if (dead.rank === 0) {
                    other.memory.modifyLeaderApproval(-Config.WORLD.APPROVAL_LOSS_DEATH);
                }

                other.react(this);
            } else {
                // Enemy Team Reward
                other.memory.modifyLeaderApproval(Config.WORLD.APPROVAL_GAIN_KILL);
                other.state.modifyMorale(5);
            }
        });
    }

    handleSound(data) {
        // data: { x, y, radius, type, sourceId, sourceTeam }
        // Optimize: Only notify agents in range
        const potentialListeners = this.spatial.query(data.x, data.y, data.radius);
        potentialListeners.forEach(entity => {
            // Only actual agents have the sensory property
            if (entity.sensory) {
                entity.sensory.processSound(data, this);
            }
        });
    }

    addSoundEvent(x, y, radius, type = 'GUNSHOT', sourceId = null, sourceTeam = null) {
        this.events.emit('sound', { x, y, radius, type, sourceId, sourceTeam });
    }

    explode(x, y, radius) {
        if (!radius || radius <= 0) radius = 1;
        // Simple Frag
        this.addSoundEvent(x, y, radius * 2, 'EXPLOSION');
        
        // Damage
        const victims = this.spatial.query(x, y, radius);
            victims.forEach(v => {
                const dist = Utils.distance({x, y}, v.pos);
                if (dist < radius) {
                    const dmg = Config.PHYSICS.FRAG_DAMAGE * (1 - dist / radius);
                    v.takeDamage(dmg, this);
                    v.state.modifyStress(50); 
                    v.suppress(100, this);
                }
            });

        // Damage Cover
        this.covers.forEach(cover => {
            // Check if cover is in radius
            // Simple center point check or corner check? 
            // Center point is good enough
            const cx = cover.x + cover.w/2;
            const cy = cover.y + cover.h/2;
            const dist = Utils.distance({x, y}, {x: cx, y: cy});
            
            if (dist < radius + Math.max(cover.w, cover.h)/2) {
                 this.damageCover(cover, 50); // Massive damage
            }
        });
        
        // Visuals
        this.effects.push({ x, y, radius, type: 'EXPLOSION', life: 300 }); // 300ms visual
        this.events.emit('explosion', { x, y, radius });
    }

    addSmoke(x, y, radius) {
        this.smokes.push({ x, y, radius, life: Config.PHYSICS.SMOKE_DURATION });
        this.addSoundEvent(x, y, radius * 1.5, 'EXPLOSION'); // Smoke pop
    }

    damageCover(cover, amount) {
        cover.hp -= amount;
        if (cover.hp <= 0) {
            // Remove cover
            const idx = this.covers.indexOf(cover);
            if (idx > -1) {
                this.covers.splice(idx, 1);
                this.events.emit('coverDestroyed', cover);
                
                // Update Grid for Pathfinding
                this.markGrid(cover, 0); // Walkable
            }
        }
    }

    triggerImpactSuppression(x, y, radius, stressAmount) {
        const victims = this.spatial.query(x, y, radius);
        victims.forEach(v => {
            if (v.isCover) return; // Ignore covers
            const dist = Utils.distance({x, y}, v.pos);
            if (dist < radius) {
                // Suppression falls off with distance
                const falloff = 1 - (dist / radius);
                v.suppress(stressAmount * falloff, this);
                v.state.modifyStress(stressAmount * 0.2 * falloff);
            }
        });
    }

    // --- Helpers ---

    isWallAt(x, y) {
        if (isNaN(x) || isNaN(y)) return true;
        const gx = Math.floor(x / this.gridSize);
        const gy = Math.floor(y / this.gridSize);
        if (gx < 0 || gy < 0 || gy >= this.grid.length || gx >= this.grid[0].length) {
            return true;
        }
        const cell = this.grid[gy][gx];
        // Non-walkable if Wall (1) or Cover (3, 4)
        return cell === 1 || cell === 3 || cell === 4;
    }

    isVisionBlockedAt(x, y) {
         if (isNaN(x) || isNaN(y)) return true;
        const gx = Math.floor(x / this.gridSize);
        const gy = Math.floor(y / this.gridSize);
        if (gx < 0 || gy < 0 || gy >= this.grid.length || gx >= this.grid[0].length) {
            return true;
        }
        // Blocked by Wall (1) OR Bush (2)
        return this.grid[gy][gx] === 1 || this.grid[gy][gx] === 2;
    }

    isNaturalWallAt(x, y) {
        if (isNaN(x) || isNaN(y)) return true;
        const gx = Math.floor(x / this.gridSize);
        const gy = Math.floor(y / this.gridSize);
        if (gx < 0 || gy < 0 || gy >= this.naturalGrid.length || gx >= this.naturalGrid[0].length) {
            return true;
        }
        return this.naturalGrid[gy][gx] === 1;
    }
    
    findSpawnPoint(minX, minY, maxX, maxY) {
        let attempts = 0;
        while(attempts < 100) {
            const x = Utils.randomGaussian((minX + maxX)/2, (maxX - minX)/4);
            const y = Utils.randomGaussian((minY + maxY)/2, (maxY - minY)/4);
            const gx = Math.floor(x / this.gridSize);
            const gy = Math.floor(y / this.gridSize);
            
            if (gx >= 0 && gy >= 0 && gy < this.grid.length && gx < this.grid[0].length) {
                if (this.grid[gy][gx] === 0) return { x, y };
            }
            attempts++;
        }
        return { x: (minX+maxX)/2, y: (minY+maxY)/2 };
    }

    // A* Pathfinding (Optimized: Uses Coarse Visual Grid, Heat-Aware)
    findPath(startPos, endPos, heatmap = null, preferStealth = false) {
        // Use Coarse Grid (16px) for pathfinding to reduce search space by 16x
        const step = Config.WORLD.VISUAL_GRID_SIZE;
        
        const startX = Math.floor(startPos.x / step);
        const startY = Math.floor(startPos.y / step);
        const endX = Math.floor(endPos.x / step);
        const endY = Math.floor(endPos.y / step);

        if (startX === endX && startY === endY) return [];
        if (this.isWallAt(endPos.x, endPos.y)) return []; // End is blocked

        const rows = Math.ceil(this.height / step);
        const cols = Math.ceil(this.width / step);
        
        const openSet = [{ x: startX, y: startY, g: 0, h: this.heuristic(startX, startY, endX, endY), parent: null }];
        const closedSet = new Set(); 
        
        const getHash = (x, y) => (y << 16) | x;
        let iterations = 0;
        const maxIterations = 3000; // Fail-safe limit

        while (openSet.length > 0) {
            if (iterations++ > maxIterations) break; // Emergency exit

            // Optimized: Simple linear scan instead of sort
            let lowestIndex = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (openSet[i].g + openSet[i].h < openSet[lowestIndex].g + openSet[lowestIndex].h) {
                    lowestIndex = i;
                }
            }
            const current = openSet[lowestIndex];
            
            // Remove efficiently
            if (lowestIndex === openSet.length - 1) openSet.pop();
            else openSet[lowestIndex] = openSet.pop();

            if (current.x === endX && current.y === endY) {
                const path = [];
                let curr = current;
                while (curr.parent) {
                    path.push({ 
                        x: curr.x * step + step / 2, 
                        y: curr.y * step + step / 2 
                    });
                    curr = curr.parent;
                }
                path.reverse();
                
                // STRING PULLING: Simplify Path
                // Reduces zig-zag movement which causes corner clipping
                if (path.length > 2) {
                    const smoothed = [path[0]];
                    let lastIdx = 0;
                    
                    for (let i = 1; i < path.length; i++) {
                        // Check if we can walk directly from last confirmed point to i+1
                        // If we can, skip i. If not, add i as a necessary waypoint.
                        // We check the NEXT point (i+1) if it exists, otherwise we just add the end.
                        
                        let target = path[i];
                        if (i < path.length - 1) {
                            // Look ahead as far as possible? 
                            // Standard Algo: Check line from 'last' to 'current'. If blocked, insert 'prev'.
                            // Better: Check line from 'last' to 'next'.
                        }
                    }
                    
                    // Simple Greensboro implementation:
                    // Iterate from start. Try to connect to furthest possible node.
                    const newPath = [path[0]];
                    let bookmark = 0;
                    
                    for (let i = 1; i < path.length; i++) {
                        // Check LOS between bookmark and i
                        // We need a robust "thick line" check or circle cast.
                        // hasLineOfSight checks center-to-center raycast.
                        // We need to ensure the agent width fits.
                        
                        // Heuristic: If distance is short and LOS is clear, it's probably fine.
                        // But for long lines, we might clip corners.
                        // Let's use hasLineOfSight with a stricter check.
                        
                        // If clear, continue. If blocked, push (i-1) and set bookmark = i-1.
                        const p1 = path[bookmark];
                        const p2 = path[i];
                        
                        // We need to check if the FULL WIDTH of the agent can pass.
                        // hasLineOfSight only checks center ray.
                        // Let's check 3 rays: Center, Left Edge, Right Edge relative to movement.
                        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                        const perp = angle + Math.PI/2;
                        const r = 9; // Safety radius
                        
                        const p1L = { x: p1.x + Math.cos(perp)*r, y: p1.y + Math.sin(perp)*r };
                        const p1R = { x: p1.x - Math.cos(perp)*r, y: p1.y - Math.sin(perp)*r };
                        const p2L = { x: p2.x + Math.cos(perp)*r, y: p2.y + Math.sin(perp)*r };
                        const p2R = { x: p2.x - Math.cos(perp)*r, y: p2.y - Math.sin(perp)*r };
                        
                        let blocked = !this.hasLineOfSight(p1, p2, Infinity, true);
                        if (!blocked) blocked = !this.hasLineOfSight(p1L, p2L, Infinity, true);
                        if (!blocked) blocked = !this.hasLineOfSight(p1R, p2R, Infinity, true);

                        if (blocked) {
                            // The direct path is blocked.
                            // So we MUST go to the previous point (i-1) to clear the obstacle.
                            newPath.push(path[i-1]);
                            bookmark = i - 1;
                            // Re-check from new bookmark to i?
                            // No, path[i-1] to path[i] is guaranteed by A* grid adjacency.
                            // So process continues from i (next loop checks bookmark to i+1)
                        }
                    }
                    newPath.push(path[path.length-1]);
                    return newPath;
                }
                
                return path;
            }

            closedSet.add(getHash(current.x, current.y));

            const neighbors = [
                { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }
            ];

            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.x >= cols || neighbor.y < 0 || neighbor.y >= rows) continue;
                
                // Improved Collision Check: Sample 4 points to ensure a 20px agent can fit
                const cx = neighbor.x * step + step/2;
                const cy = neighbor.y * step + step/2;
                // Agent Radius is 10px. 
                // Grid step is 16px. Center is at 8px.
                // If we check offset 5.33 (step/3), we check span of ~10.6px.
                // If we check offset 8 or 9, we check span of ~16-18px.
                // To prevent clipping walls (which start at 8px from center), we need to check if the agent's body (radius 10) hits the wall.
                // We should check slightly less than radius to allow "squeezing" but huge clipping is bad.
                const offset = 9; 
                
                // If this is the target tile, we skip the strict area check because we know the specific end point is valid
                const isTargetTile = (neighbor.x === endX && neighbor.y === endY);

                if (!isTargetTile) {
                    if (this.isWallAt(cx, cy) || 
                        this.isWallAt(cx - offset, cy - offset) ||
                        this.isWallAt(cx + offset, cy + offset) ||
                        this.isWallAt(cx - offset, cy + offset) ||
                        this.isWallAt(cx + offset, cy - offset)) continue;
                }

                if (closedSet.has(getHash(neighbor.x, neighbor.y))) continue;

                // Tactical Cost: Map coarse grid to heatmap
                let tacticalCost = 0;
                if (heatmap) {
                    const hRows = heatmap.length;
                    const hCols = heatmap[0].length;
                    // Map coarse world coords to heatmap coords
                    const hx = Math.floor((cx / this.width) * hCols);
                    const hy = Math.floor((cy / this.height) * hRows);
                    
                    if (hx >= 0 && hx < hCols && hy >= 0 && hy < hRows) {
                        tacticalCost = heatmap[hy][hx] * 10; 
                    }
                }

                // Movement Cost & Terrain Logic
                let moveCost = 1;
                
                // Check terrain type at center of coarse tile
                const gx = Math.floor(cx / this.gridSize);
                const gy = Math.floor(cy / this.gridSize);
                
                if (gy >= 0 && gy < this.grid.length && gx >= 0 && gx < this.grid[0].length) {
                    const cell = this.grid[gy][gx];
                    if (cell === 2) { // Bush
                        if (preferStealth) moveCost = 1;
                        else moveCost = 10;
                    }
                }

                const gScore = current.g + moveCost + tacticalCost;
                let existing = openSet.find(o => o.x === neighbor.x && o.y === neighbor.y);

                if (!existing) {
                    openSet.push({
                        x: neighbor.x,
                        y: neighbor.y,
                        g: gScore,
                        h: this.heuristic(neighbor.x, neighbor.y, endX, endY),
                        parent: current
                    });
                } else if (gScore < existing.g) {
                    existing.g = gScore;
                    existing.parent = current;
                }
            }
        }
        return [];
    }

    heuristic(x1, y1, x2, y2) {
        return Math.abs(x2 - x1) + Math.abs(y2 - y1);
    }
    
    // Line of Sight
    hasLineOfSight(p1, p2, maxDist = Infinity, checkCovers = false, ignoreTargetBush = false) {
        const dist = Utils.distance(p1, p2);
        if (dist > maxDist) return false;
        
        const stepSize = 8; // Slightly larger for performance
        const steps = Math.ceil(dist / stepSize);
        const dx = (p2.x - p1.x) / steps;
        const dy = (p2.y - p1.y) / steps;
        
        const targetGx = Math.floor(p2.x / this.gridSize);
        const targetGy = Math.floor(p2.y / this.gridSize);

        // Start check from slightly ahead of p1 to avoid self-blocking when right against cover
        for (let i = 2; i < steps - 1; i++) { 
             const x = p1.x + dx * i;
             const y = p1.y + dy * i;
             
             const gx = Math.floor(x / this.gridSize);
             const gy = Math.floor(y / this.gridSize);

             if (gx >= 0 && gy >= 0 && gy < this.grid.length && gx < this.grid[0].length) {
                 if (this.naturalGrid[gy][gx] === 1) return false;
                 
                 if (checkCovers) {
                     const cell = this.grid[gy][gx];
                     if (cell === 1) return false; // Wall blocked
                     
                     if (cell === 2) { // Bush blocked
                         // Exception: If we are looking for a target IN this bush, and we are AT this bush (approx)
                         if (ignoreTargetBush && gx === targetGx && gy === targetGy) {
                             // Allow vision into the target's own bush
                             continue;
                         }
                         return false;
                     }
                 }
             }

             // Check for smoke occlusion
             for (const s of this.smokes) {
                 if (Utils.distance({x, y}, s) < s.radius) return false;
             }
        }
        return true;
    }
    
    getRayDistance(startPos, angle, maxDist) {
        const step = this.gridSize / 2;
        for (let dist = 0; dist < maxDist; dist += step) {
            const x = startPos.x + Math.cos(angle) * dist;
            const y = startPos.y + Math.sin(angle) * dist;
            if (this.isNaturalWallAt(x, y)) return dist;
        }
        return maxDist;
    }
}
