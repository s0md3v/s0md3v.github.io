import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';

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
        this.status = 'IDLE';
        this.strategicObjective = null;
        this.lastObjectiveChangeTime = 0;
        
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
        if (this.members.length === 0) return;
        this.leader = this.members.reduce((prev, current) => {
            return (prev.rank > current.rank) ? prev : current;
        }, this.members[0]);
    }

    update(world) {
        this.members = this.members.filter(a => !a.state.isDead);
        if (this.members.length === 0) return;

        if (!this.leader || this.leader.state.isDead) this.electLeader();

        if (this.status === 'ATTACK' || this.status === 'ENGAGE') {
             if (this.activeBounderId === null || Date.now() - this.lastBoundSwitchTime > 4000) {
                 this.rotateBounder();
             }
        } else {
             this.activeBounderId = null;
        }

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
        
        let idx = this.members.findIndex(m => m.id === this.activeBounderId);
        
        for (let i = 1; i <= this.members.length; i++) {
            const nextIdx = (idx + i) % this.members.length;
            const nextAgent = this.members[nextIdx];
            
            if (!nextAgent.state.isDead && !nextAgent.state.isPinned && nextAgent.state.hp > 0) {
                this.activeBounderId = nextAgent.id;
                this.lastBoundSwitchTime = Date.now();
                return;
            }
        }
        
        this.activeBounderId = null;
    }

    evaluateSituation(world) {
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

        const activeThreats = knownHostiles.filter(h => !h.isGhost || (Date.now() - h.timestamp < 5000));
        
        if (this.averageStress > 80 || this.averageMorale < 20) {
            this.tacticalPlan = { type: 'RETREAT', focus: this.findRetreatPoint(world) };
            if (this.status !== 'RETREAT') {
                this.issueOrder('RETREAT', this.tacticalPlan.focus);
                this.status = 'RETREAT';
            }
            this.strategicObjective = null;
            return;
        }

        if (activeThreats.length > 0) {
            let ex = 0, ey = 0;
            activeThreats.forEach(h => { ex += h.lastKnownPosition.x; ey += h.lastKnownPosition.y; });
            const enemyCenter = { x: ex / activeThreats.length, y: ey / activeThreats.length };

            const myStrength = this.members.length;
            const enemyStrength = activeThreats.length; 
            const ratio = myStrength / Math.max(1, enemyStrength);

            if (ratio < 0.6) {
                this.tacticalPlan = { type: 'DEFEND_PERIMETER', focus: this.centroid };
                if (this.status !== 'DEFEND') {
                    this.issueOrder('DEFEND', this.centroid);
                    this.status = 'DEFEND';
                }
            } else if (ratio > 1.4) {
                const flankSide = (Date.now() % 2 === 0) ? 'LEFT' : 'RIGHT';
                this.tacticalPlan = { type: `FLANK_${flankSide}`, focus: enemyCenter };
                
                if (this.status !== 'ATTACK') {
                    this.issueOrder('ATTACK', enemyCenter);
                    this.status = 'ATTACK';
                }
            } else {
                this.tacticalPlan = { type: 'ASSAULT', focus: enemyCenter };
                if (this.status !== 'ENGAGE') {
                    this.issueOrder('ATTACK', enemyCenter);
                    this.status = 'ENGAGE';
                }
            }
            this.strategicObjective = null;
            return;
        }

        let maxDist = 0;
        this.members.forEach(m => {
            const d = Utils.distance(m.pos, this.centroid);
            if (d > maxDist) maxDist = d;
        });

        if (maxDist > Config.AGENT.COHESION_RADIUS * 2.0) {
            this.tacticalPlan = { type: 'REGROUP', focus: this.centroid };
            this.issueOrder('REGROUP', this.centroid);
            this.status = 'REGROUP';
            return;
        }

        if (this.strategicObjective) {
            const distToGoal = Utils.distance(this.centroid, this.strategicObjective);
            if (distToGoal < 150) {
                this.strategicObjective = null;
            }
        }

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
        const candidates = [];
        
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

        for (let i = 0; i < 20; i++) {
            const tx = 150 + Math.random() * (world.width - 300);
            const ty = 150 + Math.random() * (world.height - 300);
            
            if (!world.isPositionClear(tx, ty, Config.AGENT.RADIUS + 2)) continue;

            let sumObs = 0;
            this.members.forEach(m => {
                const gx = Math.floor((tx / world.width) * m.memory.gridCols);
                const gy = Math.floor((ty / world.height) * m.memory.gridRows);
                if (gx >= 0 && gx < m.memory.gridCols && gy >= 0 && gy < m.memory.gridRows) {
                    sumObs += m.memory.observedMap[gy][gx];
                }
            });
            const avgObs = sumObs / this.members.length;
            candidates.push({ target: { x: tx, y: ty }, utility: avgObs });
        }

        // Check the darkest candidates in order and choose the first one the
        // squad can actually reach. This avoids repeated expensive path searches.
        candidates.sort((a, b) => a.utility - b.utility);
        for (const candidate of candidates.slice(0, 4)) {
            const path = world.findPath(this.centroid, candidate.target);
            if (!path || path.length === 0) continue;
            bestTarget = candidate.target;
            lowestUtility = candidate.utility;
            break;
        }

        const amnesiaThreshold = 5000;
        
        if (bestTarget && (!this.strategicObjective || (currentUtility - lowestUtility) > amnesiaThreshold)) {
            this.strategicObjective = bestTarget;
            this.lastObjectiveChangeTime = now;
        }
    }

    findRetreatPoint(world) {
        if (this.team === 0) return { x: 50, y: world.height / 2 };
        return { x: world.width - 50, y: world.height / 2 };
    }

    issueOrder(type, target, description = null) {
        this.currentOrder = {
            type: type,
            target: target,
            description: description,
            timestamp: Date.now()
        };
    }
}
