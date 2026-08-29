import { Agent } from './Agent.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';
import { Projectile } from './Projectile.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';
import { SpatialGrid } from './SpatialGrid.js?v=field-console-14';
import { EventBus } from './EventBus.js?v=field-console-14';
import { Pathfinder } from './Pathfinder.js?v=field-console-14';
import { MapLoader } from './MapLoader.js?v=field-console-14';
import { Squad } from './Squad.js?v=field-console-14';

export class World {
    constructor(width, height, audioController, mapData = null, gameMode = 'AI_VS_AI') {
        this.audio = audioController; 
        this.gameMode = gameMode; // 'AI_VS_AI' or 'HUMAN'

        this.gridSize = Config.WORLD.GRID_SIZE;
        this.events = new EventBus();
        this.pathfinder = new Pathfinder(this);

        this.agents = [];
        this.squads = []; 
        this.projectiles = [];
        this.walls = []; 
        this.covers = [];
        this.bushes = []; 
        this.grid = []; 
        this.loot = [];
        this.effects = []; 
        this.smokes = []; 
        this.corpses = [];
        this.commandChaos = { 0: 0, 1: 0 }; 
        this.visualLayers = []; 
        this.playerAgent = null; // Reference to the human-controlled agent

        // RADIO NET: Stores fuzzy intel shared between squads
        // Each entry: { type: 'HEAT', x, y, timestamp, intensity, team }
        this.radioNet = { 0: [], 1: [] };

        if (mapData) {
             const loader = new MapLoader();
             const loaded = loader.load(mapData);

             this.width = loaded.width;
             this.height = loaded.height;
             Config.WORLD.WIDTH = this.width;
             Config.WORLD.HEIGHT = this.height;

             this.grid = loaded.grid;
             this.naturalGrid = this.grid.map(row => [...row]); 
             this.walls = loaded.walls;
             this.bushes = loaded.bushes;
             this.covers = loaded.covers;
             this.spawns = loaded.spawns;
             this.visualLayers = loaded.visualLayers;

             this.spatial = new SpatialGrid(this.width, this.height, Config.WORLD.SPATIAL_GRID_SIZE);

             this.spawnAgentsFromMap();
             this.spawnLoot();
        } else {
            throw new Error("Map data is required to initialize the world.");
        }

        this.events.on('sound', (data) => this.handleSound(data));
        this.events.on('death', (data) => this.handleDeath(data));
    }
    generateSDF() {
        const rows = Math.ceil(this.height / this.sdfCellSize);
        const cols = Math.ceil(this.width / this.sdfCellSize);
        this.sdfGrid = Array(rows).fill(0).map(() => new Float32Array(cols));

        // 1. Identify all obstacle points (walls/buildings/bushes)
        const obstacles = [];
        for (let gy = 0; gy < this.grid.length; gy++) {
            for (let gx = 0; gx < this.grid[0].length; gx++) {
                const cell = this.grid[gy][gx];
                // 1,3,4: Walls/Buildings. 2: Bushes.
                if (cell === 1 || cell === 2 || cell === 3 || cell === 4) {
                    obstacles.push({
                        x: (gx + 0.5) * this.gridSize,
                        y: (gy + 0.5) * this.gridSize
                    });
                }
            }
        }

        // 2. Compute distances (Brute force is fine for one-time startup)
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const wx = (x + 0.5) * this.sdfCellSize;
                const wy = (y + 0.5) * this.sdfCellSize;
                
                // Start with distance to nearest map edge (treating edges as walls)
                let minDist = Math.min(wx, this.width - wx, wy, this.height - wy);
                let minDistSq = minDist * minDist;

                for (const obs of obstacles) {
                    const dx = wx - obs.x;
                    const dy = wy - obs.y;
                    const d2 = dx*dx + dy*dy;
                    if (d2 < minDistSq) minDistSq = d2;
                }
                
                this.sdfGrid[y][x] = Math.sqrt(minDistSq);
            }
        }
    }

    generateCovers() {
        const hubX = this.width / 2;
        const hubY = this.height / 2;
        for (let i = 0; i < 4; i++) {
             const x = hubX + (Math.random() - 0.5) * 300;
             const y = hubY + (Math.random() - 0.5) * 300;
             this.spawnCoverCluster({ x, y });
        }
        const markers = [this.width * 0.3, this.width * 0.6];
        const lanes = [this.height * 0.25, this.height * 0.5, this.height * 0.75];
        markers.forEach(x => {
            lanes.forEach(y => {
                if (Math.random() < 0.7) {
                    this.spawnCoverCluster({ x: x + (Math.random()-0.5)*50, y: y + (Math.random()-0.5)*50 });
                }
            });
        });
        for (let i = 0; i < 10; i++) {
            const pos = this.findSpawnPoint(150, 100, this.width - 150, this.height - 100);
            if (pos) this.spawnCoverCluster(pos);
        }
    }

    generateBushes() {
        for (let i = 0; i < 15; i++) { 
            const pos = this.findSpawnPoint(100, 100, this.width - 100, this.height - 100);
            if (pos) {
                const radius = 20 + Math.random() * 20; 
                this.spawnBush(pos.x, pos.y, radius);
                if (Math.random() > 0.5) {
                    this.spawnBush(pos.x + (Math.random()-0.5)*30, pos.y + (Math.random()-0.5)*30, radius * 0.8);
                }
            }
        }
    }

    spawnBush(x, y, r) {
        const details = [];
        for (let i = 0; i < 5; i++) {
            details.push({ angle: Math.random() * Math.PI * 2, dist: Math.random() * r * 0.7 });
        }
        this.bushes.push({ x, y, radius: r, details });
        const startGx = Math.floor((x - r) / this.gridSize);
        const startGy = Math.floor((y - r) / this.gridSize);
        const endGx = Math.floor((x + r) / this.gridSize);
        const endGy = Math.floor((y + r) / this.gridSize);

        for (let gy = startGy; gy <= endGy; gy++) {
            for (let gx = startGx; gx <= endGx; gx++) {
                if (gy >= 0 && gy < this.grid.length && gx >= 0 && gx < this.grid[0].length) {
                    if (this.grid[gy][gx] === 0) this.grid[gy][gx] = 2; 
                }
            }
        }
    }

    spawnCoverCluster(pos) {
        const type = Math.random();
        const branchLength = 50; 
        const thickness = 25; 
        if (type < 0.5) {
            const isHorizontal = Math.random() > 0.5;
            const c = { x: pos.x, y: pos.y, w: isHorizontal ? branchLength : thickness, h: isHorizontal ? thickness : branchLength, hp: Config.PHYSICS.COVER_HP_STONE, maxHp: Config.PHYSICS.COVER_HP_STONE };
            this.covers.push(c);
            this.markGrid(c, 1);
        } else {
            const c1 = { x: pos.x, y: pos.y, w: branchLength, h: thickness, hp: Config.PHYSICS.COVER_HP_WOOD, maxHp: Config.PHYSICS.COVER_HP_WOOD };
            const c2 = { x: pos.x, y: pos.y, w: thickness, h: branchLength, hp: Config.PHYSICS.COVER_HP_WOOD, maxHp: Config.PHYSICS.COVER_HP_WOOD };
            this.covers.push(c1, c2);
            this.markGrid(c1, 1);
            this.markGrid(c2, 1);
        }
    }

    markGrid(rect, val, grid = this.grid) {
        const startGx = Math.floor(rect.x / this.gridSize);
        const startGy = Math.floor(rect.y / this.gridSize);
        const endGx = Math.floor((rect.x + rect.w - 0.01) / this.gridSize);
        const endGy = Math.floor((rect.y + rect.h - 0.01) / this.gridSize);
        for (let y = startGy; y <= endGy; y++) {
            for (let x = startGx; x <= endGx; x++) {
                if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
                    grid[y][x] = val;
                }
            }
        }
    }

    spawnLoot() {
        for (let i = 0; i < 8; i++) {
            const pos = this.findSpawnPoint(0, 0, this.width, this.height, 2);
            if (pos) {
                const type = Math.random() > 0.6 ? 'WeaponCrate' : 'Medkit';
                this.loot.push({ x: pos.x, y: pos.y, type: type, radius: 5 });
            }
        }
        for (let i = 0; i < 5; i++) {
            const pos = this.findSpawnPoint(0, 0, this.width, this.height, 2);
            if (pos) {
                const rand = Math.random();
                let type = 'AmmoCrate';
                if (rand > 0.85) type = 'Medkit';
                this.loot.push({ x: pos.x, y: pos.y, type: type, radius: 5 });
            }
        }
    }

    spawnAgentsFromMap() {
        const squadComposition = ['MEDIC', 'GUNNER', 'MARKSMAN', 'BREACHER', 'RIFLEMAN', 'RIFLEMAN'];
        const team1Spawns = this.spawns.filter(s => s.team === 0);
        const team2Spawns = this.spawns.filter(s => s.team === 1);
        if (team1Spawns.length === 0 || team2Spawns.length === 0) {
            this.spawnAgents();
            return;
        }

        if (this.gameMode === 'HUMAN') {
            // --- HUMAN MODE: 1 player (team 0) vs 6 AI (team 1) ---
            const spawn = team1Spawns[0];
            const px = spawn.x + (Math.random() - 0.5) * 20;
            const py = spawn.y + (Math.random() - 0.5) * 20;
            const player = new Agent(0, 0, px, py, 'RIFLEMAN', this);
            player.isPlayer = true;
            player.rank = 1; // Captain (only member)
            this.playerAgent = player;
            this.agents.push(player);

            const team2 = [];
            const squad2 = new Squad(1, 1);
            this.squads.push(squad2);
            for (let i = 0; i < 6; i++) {
                const spawn2 = team2Spawns[i % team2Spawns.length];
                if (spawn2) {
                    const x = spawn2.x + (Math.random() - 0.5) * 20;
                    const y = spawn2.y + (Math.random() - 0.5) * 20;
                    const agent = new Agent(i + 1, 1, x, y, squadComposition[i], this);
                    team2.push(agent);
                    squad2.addMember(agent);
                }
            }
            this.electLeader(team2);
            this.agents.push(...team2);
            this.agents.forEach(a => a.initTacticalIntel(this));
            return;
        }

        // --- AI VS AI MODE (original) ---
        const team1 = [];
        const squad1 = new Squad(0, 0);
        this.squads.push(squad1);
        for (let i = 0; i < 6; i++) {
            const spawn = team1Spawns[i % team1Spawns.length];
            if (spawn) {
                const x = spawn.x + (Math.random() - 0.5) * 20;
                const y = spawn.y + (Math.random() - 0.5) * 20;
                const agent = new Agent(i, 0, x, y, squadComposition[i], this);
                team1.push(agent);
                squad1.addMember(agent);
            }
        }
        this.electLeader(team1);
        this.agents.push(...team1);

        const team2 = [];
        const squad2 = new Squad(1, 1);
        this.squads.push(squad2);
        for (let i = 0; i < 6; i++) {
             const spawn = team2Spawns[i % team2Spawns.length];
             if (spawn) {
                const x = spawn.x + (Math.random() - 0.5) * 20;
                const y = spawn.y + (Math.random() - 0.5) * 20;
                const agent = new Agent(i + 6, 1, x, y, squadComposition[i], this);
                team2.push(agent);
                squad2.addMember(agent);
             }
        }
        this.electLeader(team2);
        this.agents.push(...team2);
        this.agents.forEach(a => a.initTacticalIntel(this));
    }

    spawnAgents() {
        const squadComposition = ['MEDIC', 'GUNNER', 'MARKSMAN', 'BREACHER', 'RIFLEMAN', 'RIFLEMAN'];

        if (this.gameMode === 'HUMAN') {
            // --- HUMAN MODE: 1 player vs 6 AI ---
            const pos = this.findSpawnPoint(50, 50, 200, this.height - 50);
            if (pos) {
                const player = new Agent(0, 0, pos.x, pos.y, 'RIFLEMAN', this);
                player.isPlayer = true;
                player.rank = 1;
                this.playerAgent = player;
                this.agents.push(player);
            }
            const team2 = [];
            const squad2 = new Squad(1, 1);
            this.squads.push(squad2);
            for (let i = 0; i < 6; i++) {
                const pos2 = this.findSpawnPoint(this.width - 200, 50, this.width - 50, this.height - 50);
                if (pos2) {
                    const agent = new Agent(i + 1, 1, pos2.x, pos2.y, squadComposition[i], this);
                    team2.push(agent);
                    squad2.addMember(agent);
                }
            }
            this.electLeader(team2);
            this.agents.push(...team2);
            this.agents.forEach(a => a.initTacticalIntel(this));
            return;
        }

        // --- AI VS AI MODE ---
        const team1 = [];
        const squad1 = new Squad(0, 0);
        this.squads.push(squad1);
        for (let i = 0; i < 6; i++) {
            const pos = this.findSpawnPoint(50, 50, 200, this.height - 50);
            if (pos) {
                const agent = new Agent(i, 0, pos.x, pos.y, squadComposition[i], this);
                team1.push(agent);
                squad1.addMember(agent);
            }
        }
        this.electLeader(team1);
        this.agents.push(...team1);
        const team2 = [];
        const squad2 = new Squad(1, 1);
        this.squads.push(squad2);
        for (let i = 0; i < 6; i++) {
            const pos = this.findSpawnPoint(this.width - 200, 50, this.width - 50, this.height - 50);
            if (pos) {
                const agent = new Agent(i + 6, 1, pos.x, pos.y, squadComposition[i], this);
                team2.push(agent);
                squad2.addMember(agent);
            }
        }
        this.electLeader(team2);
        this.agents.push(...team2);
        this.agents.forEach(a => a.initTacticalIntel(this));
    }

    electLeader(teamAgents) {
        if (teamAgents.length === 0) return;
        let bestLeader = teamAgents[0];
        let maxScore = -1;
        teamAgents.forEach(candidate => {
            let totalTrust = 0;
            let count = 0;
            teamAgents.forEach(voter => {
                if (voter !== candidate && voter.memory) {
                    totalTrust += (voter.memory.socialCredit.get(candidate.id) || 0.5);
                    count++;
                }
            });
            const avgTrust = count > 0 ? totalTrust / count : 0.5;
            const score = (candidate.traits.leadershipPotential * 0.7) + (avgTrust * 0.3);
            if (score > maxScore) {
                maxScore = score;
                bestLeader = candidate;
            }
            candidate.rank = 0; 
        });
        bestLeader.rank = 1; 
    }

    update(dt) {
        this.spatial.clear();
        this.agents.forEach(a => this.spatial.add(a));
        this.covers.forEach(c => {
            let cx, cy, radius;
            if (c.points) {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                c.points.forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                cx = (minX + maxX) / 2; cy = (minY + maxY) / 2;
                radius = Math.max(maxX - minX, maxY - minY) / 2;
            } else {
                cx = c.x + c.w / 2; cy = c.y + c.h / 2;
                radius = Math.max(c.w, c.h) / 2;
            }
            this.spatial.add({ pos: { x: cx, y: cy }, radius: radius, isCover: true, ref: c });
        });
        
        this.collectDeadAgents();

        this.agents.forEach(agent => {
            const gx = Math.floor(agent.pos.x / this.gridSize);
            const gy = Math.floor(agent.pos.y / this.gridSize);
            agent.state.inBush = this.grid[gy]?.[gx] === 2;
            agent.state.inSmoke = this.smokes.some(smoke => Utils.distance(agent.pos, smoke) < smoke.radius);

            if (agent.rank === 1) {
                const nearbyEntities = this.spatial.query(agent.pos.x, agent.pos.y, Config.AGENT.LEADERSHIP_RANGE);
                nearbyEntities.forEach(entity => {
                    if (!entity.isCover && entity.team === agent.team && entity !== agent) entity.buffs.leader = true; 
                });
            }
            agent.update(dt, this);
            agent.buffs.leader = false; 
        });

        this.squads.forEach(s => s.update(this));

        for (let i = 0; i < this.agents.length; i++) {
            const a1 = this.agents[i];
            const neighbors = this.spatial.getNeighbors(a1, a1.radius * 2);
            for (let j = 0; j < neighbors.length; j++) {
                const a2 = neighbors[j];
                if (a2.isCover || a2 === a1 || a1.id > a2.id) continue;
                this.resolveAgentAgentCollision(a1, a2);
            }
        }

        this.projectiles.forEach(p => {
             p.update(dt, this);
             if (p.active && p.type === 'BULLET') {
                 const nearby = this.spatial.query(p.pos.x, p.pos.y, Config.PHYSICS.SUPPRESSION_RADIUS);
                 nearby.forEach(e => {
                     if (!e.isCover && e.team !== p.team) {
                         const dist = Utils.distance(p.pos, e.pos);
                         if (dist < Config.PHYSICS.SUPPRESSION_RADIUS) {
                             // --- LOS CHECK FOR SUPPRESSION ---
                             // Only suppress if the bullet isn't behind a wall relative to the agent
                             if (this.hasClearShot(p.pos, e.pos, Config.PHYSICS.SUPPRESSION_RADIUS)) {
                                 e.suppress(Config.PHYSICS.SUPPRESSION_STRESS * (dt/100), this, p.startPos);
                             }
                         }
                     }
                 });
             }
        });
        this.projectiles = this.projectiles.filter(p => p.active);
        // A projectile can kill the final survivor during this phase. Finalize it
        // before the UI evaluates victory so corpses, squads, and death events agree.
        this.collectDeadAgents();
        this.effects.forEach(e => e.life -= dt);
        this.effects = this.effects.filter(e => e.life > 0);
        this.smokes.forEach(s => s.life -= dt);
        this.smokes = this.smokes.filter(s => s.life > 0);

        for (let team in this.commandChaos) {
            if (this.commandChaos[team] > 0) {
                this.commandChaos[team] -= dt;
                if (this.commandChaos[team] <= 0) {
                    const teamAgents = this.agents.filter(a => a.team === parseInt(team) && !a.state.isDead);
                    this.electLeader(teamAgents);
                }
            }
        }

        // --- RADIO NET PROCESSING ---
        // Information takes time to be verified and re-transmitted
        const now = Date.now();
        const radioDelay = Config.SENSORY.RADIO.DELAY;
        
        [0, 1].forEach(team => {
            if (!this.radioNet[team]) this.radioNet[team] = [];
            const pending = this.radioNet[team].filter(r => !r.broadcasted && (now - r.timestamp) >= radioDelay);
            if (pending.length > 0) {
                pending.forEach(report => {
                    report.broadcasted = true;
                    // Distribute to all agents on this team (Heatmap update)
                    this.agents.forEach(agent => {
                        if (agent.team === team && !agent.state.isDead) {
                            if (report.type === 'HEAT') {
                                // Add fuzzy 'suspected' intel to agent's mental map
                                agent.memory.updateHeat(report.x, report.y, this, report.intensity, true);
                                agent.memory.recordDangerZone({
                                    x: report.x,
                                    y: report.y,
                                    intensity: report.intensity,
                                    confidence: 0.5,
                                    timestamp: report.timestamp,
                                    type: 'RADIO',
                                    reportedByTeam: team
                                });
                            } else if (report.type === 'DISTRESS') {
                                // Share distress signals (MEDIC/NEED_COVER) across the team
                                agent.memory.updateDistressSignal(report.sourceId, report.distressType, {x: report.x, y: report.y}, report.timestamp);
                                if (report.distressType === 'MAN_DOWN') {
                                    agent.memory.updateHazard(report.x, report.y, this, 60); // Squad avoids the death zone
                                }
                            }
                        }
                    });
                });
            }
            // Cleanup old broadcasted reports (keep for 5s)
            this.radioNet[team] = this.radioNet[team].filter(r => (now - r.timestamp) < 5000);
        });
    }
    
    resolveAgentAgentCollision(a1, a2) {
        const dist = Utils.distance(a1.pos, a2.pos);
        const minDist = a1.radius + a2.radius;
        if (dist < minDist) {
            const overlap = minDist - dist;
            const angle = Utils.angle(a1.pos, a2.pos);
            const moveX = (Math.cos(angle) * overlap) / 2;
            const moveY = (Math.sin(angle) * overlap) / 2;
            if (!this.isWallAt(a1.pos.x - moveX, a1.pos.y - moveY)) { a1.pos.x -= moveX; a1.pos.y -= moveY; }
            if (!this.isWallAt(a2.pos.x + moveX, a2.pos.y + moveY)) { a2.pos.x += moveX; a2.pos.y += moveY; }
        }
    }

    collectDeadAgents() {
        const deadAgents = this.agents.filter(agent => agent.state.isDead);
        if (deadAgents.length === 0) return;

        this.agents = this.agents.filter(agent => !agent.state.isDead);
        deadAgents.forEach(dead => {
            dead.bloodSplatter = [];
            for (let i = 0; i < 15; i++) {
                dead.bloodSplatter.push({
                    angle: Math.random() * Math.PI * 2,
                    dist: Math.random() * 20,
                    radius: Math.random() * 5 + 1
                });
            }
            this.corpses.push(dead);
            this.events.emit('death', { agent: dead });
        });
    }

    handleDeath(data) {
        const dead = data.agent;
        const range = dead.rank === 1 ? 9999 : 400; 
        if (dead.rank === 1) {
            this.commandChaos[dead.team] = Config.WORLD.COMMAND_CHAOS_DURATION;
            this.events.emit('leaderDeath', { team: dead.team });
        }
        if (dead.squad) dead.squad.removeMember(dead);
        this.agents.forEach(other => {
            if (other.team === dead.team) {
                const dist = Utils.distance(other.pos, dead.pos);
                if (dist > range) return;
                let stressImpact = dead.rank === 1 ? Config.AGENT.LEADER_DEATH_PENALTY : 25;
                let moraleImpact = dead.rank === 1 ? 40 : 15;
                other.state.modifyStress(stressImpact);
                other.state.modifyMorale(-moraleImpact);
                other.memory.traumaLevel += 10 * (1 - dist/range);
                if (dead.rank === 0) other.memory.modifyLeaderApproval(-Config.AGENT.APPROVAL_LOSS_DEATH);
                other.react(this);
            } else {
                other.memory.modifyLeaderApproval(Config.AGENT.APPROVAL_GAIN_KILL);
                other.state.modifyMorale(5);
            }
        });
    }

    handleSound(data) {
        const potentialListeners = this.spatial.query(data.x, data.y, data.radius);
        potentialListeners.forEach(entity => { if (entity.sensory) entity.sensory.processSound(data, this); });
    }

    addSoundEvent(x, y, radius, type = 'GUNSHOT', sourceId = null, sourceTeam = null, targetPos = null, distressType = null) {
        if (isFinite(x) && isFinite(y)) this.events.emit('sound', { x, y, radius, type, sourceId, sourceTeam, targetPos, distressType });
    }

    triggerImpactSuppression(x, y, radius, stressAmount) {
        const victims = this.spatial.query(x, y, radius);
        victims.forEach(v => {
            if (v.isCover) return; 
            const dist = Utils.distance({x, y}, v.pos);
            if (dist < radius) {
                const falloff = 1 - (dist / radius);
                v.suppress(stressAmount * falloff, this);
                v.state.modifyStress(stressAmount * 0.2 * falloff);
            }
        });
    }

    explode(x, y, radius, sourceId = null) {
        if (!radius || radius <= 0) radius = 1;
        this.addSoundEvent(x, y, radius * 2, 'EXPLOSION');
        const victims = this.spatial.query(x, y, radius);
        victims.forEach(v => {
            const distance = !v.isCover ? Utils.distance({x, y}, v.pos) : Infinity;
            if (!v.isCover && distance < radius && this.hasClearShot({ x, y }, v.pos, radius)) {
                const dmg = Config.PHYSICS.FRAG_DAMAGE * (1 - distance / radius);
                v.takeDamage(dmg, this, sourceId);
                v.state.modifyStress(50); v.suppress(100, this);
            }
        });
        this.covers.forEach(cover => {
            let cx, cy, cr;
            if (cover.points) {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                cover.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
                cx = (minX + maxX) / 2; cy = (minY + maxY) / 2; cr = Math.max(maxX - minX, maxY - minY) / 2;
            } else {
                cx = cover.x + cover.w/2; cy = cover.y + cover.h/2; cr = Math.max(cover.w, cover.h)/2;
            }
            if (Utils.distance({x, y}, {x: cx, y: cy}) < radius + cr) this.damageCover(cover, 50); 
        });
        this.effects.push({ x, y, radius, type: 'EXPLOSION', life: 600 });
        this.events.emit('explosion', { x, y, radius });
    }

    addSmoke(x, y, radius) {
        if (isFinite(x) && isFinite(y)) {
            this.smokes.push({ x, y, radius, life: Config.PHYSICS.SMOKE_DURATION, timestamp: Date.now() });
        }
    }

    damageCover(cover, amount) {
        cover.hp -= amount;
        if (cover.hp <= 0) {
            const idx = this.covers.indexOf(cover);
            if (idx > -1) {
                this.covers.splice(idx, 1);
                this.events.emit('coverDestroyed', cover);
                // Re-rasterize all survivors so overlapping geometry remains solid.
                this.rebuildCollisionGrid();
            }
        }
    }

    rebuildCollisionGrid() {
        const rows = Math.ceil(this.height / this.gridSize);
        const cols = Math.ceil(this.width / this.gridSize);
        const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));

        const rasterize = (shape, value) => {
            if (shape.points?.length >= 2) {
                if (shape.closed) Utils.rasterizePolygon(grid, shape.points, value, this.gridSize);
                else Utils.rasterizePolyline(grid, shape.points, value, this.gridSize, shape.thickness);
                return;
            }
            if (Number.isFinite(shape.radius)) {
                const minX = Math.floor((shape.x - shape.radius) / this.gridSize);
                const maxX = Math.ceil((shape.x + shape.radius) / this.gridSize);
                const minY = Math.floor((shape.y - shape.radius) / this.gridSize);
                const maxY = Math.ceil((shape.y + shape.radius) / this.gridSize);
                for (let gy = minY; gy <= maxY; gy++) {
                    for (let gx = minX; gx <= maxX; gx++) {
                        if (!grid[gy]?.[gx] && Utils.distance(
                            { x: gx * this.gridSize + this.gridSize / 2, y: gy * this.gridSize + this.gridSize / 2 },
                            shape
                        ) <= shape.radius + this.gridSize / 2) grid[gy][gx] = value;
                    }
                }
                return;
            }
            this.markGrid(shape, value, grid);
        };

        // Higher-priority physical blockers are applied last.
        this.bushes.forEach(shape => rasterize(shape, 2));
        this.covers.forEach(shape => rasterize(shape, 3));
        this.walls.forEach(shape => rasterize(shape, 1));
        this.grid = grid;
    }

    isWallAt(x, y) {
        if (!isFinite(x) || !isFinite(y)) return true;
        const gx = Math.floor(x / this.gridSize);
        const gy = Math.floor(y / this.gridSize);
        if (gx < 0 || gy < 0 || gy >= this.grid.length || gx >= this.grid[0].length) return true;
        const cell = this.grid[gy][gx];
        return cell === 1 || cell === 3 || cell === 4;
    }

    isVisionBlockedAt(x, y) {
        if (isNaN(x) || isNaN(y)) return true;
        const gx = Math.floor(x / this.gridSize);
        const gy = Math.floor(y / this.gridSize);
        if (gx < 0 || gy < 0 || gy >= this.grid.length || gx >= this.grid[0].length) return true;
        const cell = this.grid[gy][gx];
        return cell === 1 || cell === 2 || cell === 3 || cell === 4;
    }

    isPositionClear(x, y, radius) {
        if (!isFinite(x) || !isFinite(y)) return false;
        const step = this.gridSize;
        const startGx = Math.max(0, Math.floor((x - radius) / step));
        const endGx = Math.min(this.grid[0].length - 1, Math.floor((x + radius) / step));
        const startGy = Math.max(0, Math.floor((y - radius) / step));
        const endGy = Math.min(this.grid.length - 1, Math.floor((y + radius) / step));
        for (let gy = startGy; gy <= endGy; gy++) {
            for (let gx = startGx; gx <= endGx; gx++) {
                const cell = this.grid[gy][gx];
                if (cell === 1 || cell === 3 || cell === 4) {
                    const rectX = gx * step; const rectY = gy * step;
                    const closestX = Math.max(rectX, Math.min(x, rectX + step));
                    const closestY = Math.max(rectY, Math.min(y, rectY + step));
                    const dx = x - closestX; const dy = y - closestY;
                    if ((dx * dx + dy * dy) < (radius * radius)) return false;
                }
            }
        }
        return true;
    }

    resolveCollision(x, y, radius, options = {}) {
        if (!isFinite(x) || !isFinite(y)) return { x: 0, y: 0 }; 
        let px = Utils.clamp(x, radius, this.width - radius); 
        let py = Utils.clamp(y, radius, this.height - radius); 
        const coverRadius = Number.isFinite(options.coverRadius)
            ? Math.max(0.5, Math.min(radius, options.coverRadius))
            : radius;
        const step = this.gridSize;
        for(let iter = 0; iter < 8; iter++) {
             const startGx = Math.max(0, Math.floor((px - radius) / step));
             const endGx = Math.min(this.grid[0].length - 1, Math.floor((px + radius) / step));
             const startGy = Math.max(0, Math.floor((py - radius) / step));
             const endGy = Math.min(this.grid.length - 1, Math.floor((py + radius) / step));
             let maxPen = 0; let pushX = 0; let pushY = 0; let hit = false;
             for (let gy = startGy; gy <= endGy; gy++) {
                for (let gx = startGx; gx <= endGx; gx++) {
                    const cell = this.grid[gy][gx];
                    if (cell === 1 || cell === 3 || cell === 4) {
                        const effectiveRadius = cell === 3 ? coverRadius : radius;
                        const rectX = gx * step; const rectY = gy * step;
                        const closestX = Math.max(rectX, Math.min(px, rectX + step));
                        const closestY = Math.max(rectY, Math.min(py, rectY + step));
                        const dx = px - closestX; const dy = py - closestY;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist > 0.001) {
                            if (dist < effectiveRadius) {
                                const pen = effectiveRadius - dist;
                                if (pen > maxPen) { maxPen = pen; pushX = (dx / dist) * pen; pushY = (dy / dist) * pen; hit = true; }
                            }
                        } else {
                            const dl = px - rectX; const dr = (rectX + step) - px; const dt = py - rectY; const db = (rectY + step) - py;
                            const min = Math.min(dl, dr, dt, db);
                            let nx = 0, ny = 0, pen = effectiveRadius;
                            if (min === dl) { nx = -1; pen += dl; } else if (min === dr) { nx = 1; pen += dr; } else if (min === dt) { ny = -1; pen += dt; } else { ny = 1; pen += db; }
                            if (pen > maxPen) { maxPen = pen; pushX = nx * pen; pushY = ny * pen; hit = true; }
                        }
                    }
                }
             }
             if (hit) { px += pushX; py += pushY; } else break; 
        }
        return { x: px, y: py };
    }
    
    findSpawnPoint(minX, minY, maxX, maxY, padding = 1) {
        let attempts = 0;
        while(attempts < 100) {
            const x = Utils.randomGaussian((minX + maxX)/2, (maxX - minX)/4);
            const y = Utils.randomGaussian((minY + maxY)/2, (maxY - minY)/4);
            const gx = Math.floor(x / this.gridSize);
            const gy = Math.floor(y / this.gridSize);
            let isClear = true;
            for (let dy = -padding; dy <= padding; dy++) {
                for (let dx = -padding; dx <= padding; dx++) {
                    const nx = gx + dx; const ny = gy + dy;
                    if (nx < 0 || ny < 0 || ny >= this.grid.length || nx >= this.grid[0].length || this.grid[ny][nx] !== 0) { isClear = false; break; }
                }
                if (!isClear) break;
            }
            if (isClear) return { x, y };
            attempts++;
        }
        return { x: (minX+maxX)/2, y: (minY+maxY)/2 };
    }

    findPath(startPos, endPos, heatmap = null, preferStealth = false, hazardMap = null) {
        return this.pathfinder.findPath(startPos, endPos, heatmap, preferStealth, hazardMap);
    }
    
    _gridRayDistance(startPos, angle, maxDist, blocksCell, targetPos = null) {
        if (!startPos || !Number.isFinite(startPos.x) || !Number.isFinite(startPos.y)
            || !Number.isFinite(angle) || !(maxDist >= 0)) return 0;

        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        let gx = Math.floor(startPos.x / this.gridSize);
        let gy = Math.floor(startPos.y / this.gridSize);
        const startGx = gx;
        const startGy = gy;
        const targetGx = targetPos ? Math.floor(targetPos.x / this.gridSize) : null;
        const targetGy = targetPos ? Math.floor(targetPos.y / this.gridSize) : null;
        const stepX = dirX > 0 ? 1 : -1;
        const stepY = dirY > 0 ? 1 : -1;
        const nextBoundaryX = (gx + (dirX > 0 ? 1 : 0)) * this.gridSize;
        const nextBoundaryY = (gy + (dirY > 0 ? 1 : 0)) * this.gridSize;
        let tMaxX = Math.abs(dirX) < 1e-10 ? Infinity : (nextBoundaryX - startPos.x) / dirX;
        let tMaxY = Math.abs(dirY) < 1e-10 ? Infinity : (nextBoundaryY - startPos.y) / dirY;
        const tDeltaX = Math.abs(dirX) < 1e-10 ? Infinity : this.gridSize / Math.abs(dirX);
        const tDeltaY = Math.abs(dirY) < 1e-10 ? Infinity : this.gridSize / Math.abs(dirY);
        let traveled = 0;

        while (traveled <= maxDist) {
            if (gx < 0 || gy < 0 || gy >= this.grid.length || gx >= this.grid[0].length) return traveled;
            const isStart = gx === startGx && gy === startGy;
            const isTarget = gx === targetGx && gy === targetGy;
            if (!isStart && !isTarget && blocksCell(this.grid[gy][gx], traveled)) return traveled;

            if (tMaxX < tMaxY) {
                traveled = tMaxX;
                tMaxX += tDeltaX;
                gx += stepX;
            } else if (tMaxY < tMaxX) {
                traveled = tMaxY;
                tMaxY += tDeltaY;
                gy += stepY;
            } else {
                traveled = tMaxX;
                tMaxX += tDeltaX;
                tMaxY += tDeltaY;
                gx += stepX;
                gy += stepY;
            }
        }
        return maxDist;
    }

    _smokeVisionLimit(startPos, angle, maxDist) {
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        let limit = maxDist;
        for (const smoke of this.smokes) {
            const vx = startPos.x - smoke.x;
            const vy = startPos.y - smoke.y;
            const b = 2 * (vx * dirX + vy * dirY);
            const c = vx * vx + vy * vy - smoke.radius * smoke.radius;
            const discriminant = b * b - 4 * c;
            if (discriminant < 0) continue;
            const root = Math.sqrt(discriminant);
            const entry = (-b - root) / 2;
            const exit = (-b + root) / 2;
            if (entry > 0 && entry < limit) limit = Math.min(limit, entry + 10);
            else if (entry <= 0 && exit > 0) limit = Math.min(limit, 40);
        }
        return limit;
    }

    hasVisualLine(p1, p2, maxDist = Infinity) {
        if (!p1 || !p2 || ![p1.x, p1.y, p2.x, p2.y].every(Number.isFinite)) return false;
        const totalDist = Utils.distance(p1, p2);
        if (totalDist > maxDist) return false;
        if (totalDist < 1e-6) return true;
        const angle = Utils.angle(p1, p2);
        const smokeLimit = this._smokeVisionLimit(p1, angle, totalDist);
        if (smokeLimit < totalDist - 1e-6) return false;
        const hitDistance = this._gridRayDistance(
            p1,
            angle,
            totalDist,
            (cell, traveled) => cell === 1 || cell === 4 || (cell === 2 && traveled >= 25),
            p2
        );
        return hitDistance >= totalDist - 1e-6;
    }

    hasClearShot(p1, p2, maxDist = Infinity) {
        if (!p1 || !p2 || ![p1.x, p1.y, p2.x, p2.y].every(Number.isFinite)) return false;
        const totalDist = Utils.distance(p1, p2);
        if (totalDist > maxDist) return false;
        if (totalDist < 1e-6) return true;
        const hitDistance = this._gridRayDistance(
            p1,
            Utils.angle(p1, p2),
            totalDist,
            cell => cell === 1 || cell === 3 || cell === 4,
            p2
        );
        return hitDistance >= totalDist - 1e-6;
    }

    hasMovementLine(p1, p2, maxDist = Infinity) {
        return this.hasClearShot(p1, p2, maxDist);
    }

    // Compatibility for extensions: line-of-sight always means visual perception.
    hasLineOfSight(p1, p2, maxDist = Infinity) {
        return this.hasVisualLine(p1, p2, maxDist);
    }

    getRayDistance(startPos, angle, maxDist, ignoreCovers = true) {
        const smokeLimit = this._smokeVisionLimit(startPos, angle, maxDist);
        return this._gridRayDistance(
            startPos,
            angle,
            smokeLimit,
            (cell, traveled) => cell === 1 || cell === 4
                || (!ignoreCovers && cell === 3)
                || (cell === 2 && traveled >= 25)
        );
    }

    getClearShotDistance(startPos, angle, maxDist) {
        return this._gridRayDistance(
            startPos,
            angle,
            maxDist,
            cell => cell === 1 || cell === 3 || cell === 4
        );
    }
}
