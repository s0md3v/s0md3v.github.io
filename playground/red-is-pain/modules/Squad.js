import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Squad {
    constructor(id, team) {
        this.id = id;
        this.team = team;
        this.members = [];
        this.leader = null;
        this.centroid = { x: 0, y: 0 };
        this.averageStress = 0;
        this.averageMorale = 50;
        
        // Orders: { type: 'ATTACK'|'DEFEND'|'REGROUP'|'RETREAT'|'MOVE', target: {x,y}, timestamp: 0 }
        this.currentOrder = null;
        this.tacticalPlan = null;
        this.lastOrderTime = 0;
        this.status = 'IDLE'; // Combat State
        this.strategicObjective = null;
        this.lastObjectiveChangeTime = 0;
        
        // Bounding Overwatch
        this.activeBounderId = null;
        this.lastBoundSwitchTime = 0;
    }

    addMember(agent) {
        this.members.push(agent);
        agent.squad = this;
        if (agent.rank === 1) this.leader = agent;
    }

    removeMember(agent) {
        const idx = this.members.indexOf(agent);
        if (idx > -1) {
            this.members.splice(idx, 1);
            agent.squad = null;
        }
        if (this.leader === agent) {
            this.electLeader();
        }
    }

    electLeader() {
        // Simple fallback: highest rank or random
        if (this.members.length === 0) return;
        this.leader = this.members.reduce((prev, current) => {
            return (prev.rank > current.rank) ? prev : current;
        }, this.members[0]);
    }

    update(world) {
        // 1. Cleanup Dead
        this.members = this.members.filter(a => !a.state.isDead);
        if (this.members.length === 0) return;

        if (!this.leader || this.leader.state.isDead) this.electLeader();

        // Manage Bounding Overwatch
        if (this.status === 'ATTACK' || this.status === 'ENGAGE') {
             if (!this.activeBounderId || Date.now() - this.lastBoundSwitchTime > 4000) {
                 this.rotateBounder();
             }
        } else {
             this.activeBounderId = null;
        }

        // 2. Calculate Metrics
        let sumX = 0, sumY = 0, sumStress = 0, sumMorale = 0;
        let activeMembers = 0;

        this.members.forEach(m => {
            sumX += m.pos.x;
            sumY += m.pos.y;
            sumStress += m.state.stress;
            sumMorale += m.state.morale;
            activeMembers++;
        });

        if (activeMembers > 0) {
            this.centroid = { x: sumX / activeMembers, y: sumY / activeMembers };
            this.averageStress = sumStress / activeMembers;
            this.averageMorale = sumMorale / activeMembers;
        }

        // 3. Make Decisions (Throttle: 1/sec)
        if (Date.now() - this.lastOrderTime > 1000) {
            this.evaluateSituation(world);
            this.lastOrderTime = Date.now();
        }
    }

    rotateBounder() {
        if (this.members.length === 0) {
            this.activeBounderId = null;
            return;
        }
        
        // Find index of current bounder
        let idx = this.members.findIndex(m => m.id === this.activeBounderId);
        
        // Pick the next one who isn't pinned or dead
        for (let i = 1; i <= this.members.length; i++) {
            const nextIdx = (idx + i) % this.members.length;
            const nextAgent = this.members[nextIdx];
            
            if (!nextAgent.state.isDead && !nextAgent.state.isPinned && nextAgent.state.hp > 0) {
                this.activeBounderId = nextAgent.id;
                this.lastBoundSwitchTime = Date.now();
                return;
            }
        }
        
        // Fallback: None can bound
        this.activeBounderId = null;
    }

    evaluateSituation(world) {
        // Collect Squad Intel
        const knownHostiles = [];
        const seenIds = new Set();
        
        this.members.forEach(m => {
            m.memory.knownHostiles.forEach(h => {
                if (!seenIds.has(h.id)) {
                    seenIds.add(h.id);
                    knownHostiles.push(h);
                }
            });
        });

        // Filter for relevant threats
        const activeThreats = knownHostiles.filter(h => !h.isGhost || (Date.now() - h.timestamp < 5000));
        
        // --- PLAN GENERATION ---
        
        // 1. RETREAT / BROKEN
        if (this.averageStress > 80 || this.averageMorale < 20) {
            this.tacticalPlan = { type: 'RETREAT', focus: this.findRetreatPoint(world) };
            if (this.status !== 'RETREAT') {
                this.issueOrder('RETREAT', this.tacticalPlan.focus);
                this.status = 'RETREAT';
            }
            this.strategicObjective = null;
            return;
        }

        // 2. COMBAT PLANNING
        if (activeThreats.length > 0) {
            // Find average enemy position
            let ex = 0, ey = 0;
            activeThreats.forEach(h => { ex += h.lastKnownPosition.x; ey += h.lastKnownPosition.y; });
            const enemyCenter = { x: ex / activeThreats.length, y: ey / activeThreats.length };

            // Decisions based on Strength Ratio
            const myStrength = this.members.length;
            const enemyStrength = activeThreats.length; 
            const ratio = myStrength / Math.max(1, enemyStrength);

            if (ratio < 0.6) {
                // Outnumbered -> DEFEND / PERIMETER
                this.tacticalPlan = { type: 'DEFEND_PERIMETER', focus: this.centroid };
                if (this.status !== 'DEFEND') {
                    this.issueOrder('DEFEND', this.centroid);
                    this.status = 'DEFEND';
                }
            } else if (ratio > 1.4) {
                // Advantage -> AGGRESSIVE / FLANK
                // Randomly choose flanking direction based on map control or simplicity
                const flankSide = (Date.now() % 2 === 0) ? 'LEFT' : 'RIGHT'; // Simple toggle for now
                this.tacticalPlan = { type: `FLANK_${flankSide}`, focus: enemyCenter };
                
                if (this.status !== 'ATTACK') {
                    this.issueOrder('ATTACK', enemyCenter); // General order is still attack, but agents read Plan for nuance
                    this.status = 'ATTACK';
                }
            } else {
                // Even -> SKIRMISH / ASSAULT
                this.tacticalPlan = { type: 'ASSAULT', focus: enemyCenter };
                if (this.status !== 'ENGAGE') {
                    this.issueOrder('ATTACK', enemyCenter);
                    this.status = 'ENGAGE';
                }
            }
            this.strategicObjective = null;
            return;
        }

        // 3. REGROUP (If spread out)
        let maxDist = 0;
        this.members.forEach(m => {
            const d = Utils.distance(m.pos, this.centroid);
            if (d > maxDist) maxDist = d;
        });

        if (maxDist > Config.AGENT.COHESION_RADIUS * 2.0) { // Slightly more lenient during exploration
            this.tacticalPlan = { type: 'REGROUP', focus: this.centroid };
            this.issueOrder('REGROUP', this.centroid);
            this.status = 'REGROUP';
            return;
        }

        // 4. STRATEGIC OBJECTIVE (Long-term exploration)
        if (this.strategicObjective) {
            const distToGoal = Utils.distance(this.centroid, this.strategicObjective);
            // Increased completion radius to 150px (approx 10 tiles)
            if (distToGoal < 150) {
                this.strategicObjective = null; // Reached!
            }
        }

        // Only evaluate a NEW objective if we don't have one, OR if we've been on the current one for a while
        const objectiveAge = Date.now() - this.lastObjectiveChangeTime;
        if (!this.strategicObjective || objectiveAge > 8000) {
            this.selectStrategicObjective(world);
        }

        if (this.strategicObjective) {
            this.tacticalPlan = { type: 'EXPLORE', focus: this.strategicObjective };
            this.issueOrder('MOVE', this.strategicObjective, 'STRATEGIC_EXPLORE');
            this.status = 'EXPLORE';
            return;
        }

        // 5. IDLE / PATROL (Fallback)
        this.tacticalPlan = { type: 'PATROL', focus: null };
        if (this.status !== 'IDLE') {
            this.issueOrder('MOVE', this.centroid); 
            this.status = 'IDLE';
        }
    }

    selectStrategicObjective(world) {
        const now = Date.now();
        let bestTarget = null;
        let lowestUtility = Infinity; // Using amnesia as utility: lower timestamp = higher priority
        
        // 1. Calculate Current Objective Utility (if it exists)
        let currentUtility = now;
        if (this.strategicObjective) {
            let sumObs = 0;
            this.members.forEach(m => {
                const gx = Math.floor((this.strategicObjective.x / world.width) * m.memory.gridCols);
                const gy = Math.floor((this.strategicObjective.y / world.height) * m.memory.gridRows);
                if (gx >= 0 && gx < m.memory.gridCols && gy >= 0 && gy < m.memory.gridRows) {
                    sumObs += m.memory.observedMap[gy][gx];
                }
            });
            currentUtility = sumObs / this.members.length;
        }

        // 2. Sample candidate points
        for (let i = 0; i < 15; i++) {
            const tx = 150 + Math.random() * (world.width - 300);
            const ty = 150 + Math.random() * (world.height - 300);
            
            if (world.isWallAt(tx, ty)) continue;

            let sumObs = 0;
            this.members.forEach(m => {
                const gx = Math.floor((tx / world.width) * m.memory.gridCols);
                const gy = Math.floor((ty / world.height) * m.memory.gridRows);
                if (gx >= 0 && gx < m.memory.gridCols && gy >= 0 && gy < m.memory.gridRows) {
                    sumObs += m.memory.observedMap[gy][gx];
                }
            });
            const avgObs = sumObs / this.members.length;

            if (avgObs < lowestUtility) {
                lowestUtility = avgObs;
                bestTarget = { x: tx, y: ty };
            }
        }

        // 3. HYSTERESIS: Only switch if the new target is SIGNIFICANTLY 'darker'
        // Or if we have no current objective.
        const amnesiaThreshold = 5000; // New target must be at least 5s older than current
        
        if (bestTarget && (!this.strategicObjective || (currentUtility - lowestUtility) > amnesiaThreshold)) {
            this.strategicObjective = bestTarget;
            this.lastObjectiveChangeTime = now;
        }
    }

    findRetreatPoint(world) {
        // Simple logic: Away from center of map or towards spawn
        // Assuming spawn is at map edges based on team
        if (this.team === 0) return { x: 50, y: world.height / 2 }; // Left
        return { x: world.width - 50, y: world.height / 2 }; // Right
    }

    issueOrder(type, target, description = null) {
        this.currentOrder = {
            type: type,
            target: target,
            description: description,
            timestamp: Date.now()
        };
        // Propagate to members?
        // Members will poll this.squad.currentOrder in Decision.js
    }
}
