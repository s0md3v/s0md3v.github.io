import { Utils } from '../Utils.js?v=field-console-14';
import { Config } from '../Config.js?v=field-console-14';

export class LimbicSystem {
    constructor(agent) {
        this.agent = agent;
    }

    update(dt, world) {
        const now = Date.now();

        const buddyRadius = Config.AGENT.BATTLE_BUDDY_RADIUS || 50;
        const buddies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, buddyRadius)
            .some(a => a.team === this.agent.team && a !== this.agent && (this.agent.memory.socialCredit.get(a.id) || 0) > 0.7);
        
        this.agent.state.isBattleBuddyActive = buddies;

        const nearbyCount = this.agent.state.isBattleBuddyActive ? 1 : 0;
        
        const isAlone = !buddies; 
        
        if (isAlone) {
             const drainRate = 0.5 + ((this.agent.traits.extraversion - 0.5) * 0.5); 
             this.agent.state.socialBattery = Math.max(0, this.agent.state.socialBattery - (dt * 0.01 * drainRate));
        } else {
             this.agent.state.socialBattery = Math.min(100, this.agent.state.socialBattery + (dt * 0.05));
        }

        if (this.agent.rank === 0) {
            const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
            if (leader) {
                const iAmFighting = this.agent.brain.currentThought === 'COMBAT';
                const leaderRetreating = leader.brain.currentThought === 'SURVIVAL';
                
                if (iAmFighting && leaderRetreating) {
                    this.agent.memory.modifyLeaderApproval(-Config.AGENT.APPROVAL_COWARDICE_PENALTY * (dt / 1000));
                }
            }
        }
    }

    evaluate(world) {
        let priority = 0;
        let action = { type: 'IDLE', score: 0 };

        const woundedAlly = this.scanForWounded(world);
        if (woundedAlly && this.canHeal(woundedAlly)) {
            const empathy = this.agent.traits.agreeableness * 1.5;
            const healthRatio = woundedAlly.state.hp / Math.max(1, woundedAlly.state.maxHp);
            const urgency = (1 - healthRatio) * 100;

            priority = urgency + (empathy * 20);
            
            if (!this.agent.brain.isSafe(world)) priority -= 30;

            action = { 
                type: 'HEAL', 
                targetId: woundedAlly.id, 
                movementMode: 'BOUNDING', 
                description: 'helping a wounded teammate'
            };
            return { priority, action };
        }

        const isolation = this.calculateIsolation(world);
        const loneliness = (1 - this.agent.state.socialBattery / 100) * 50;
        const fear = this.agent.state.stress / 2;

        if (isolation > 50) {
            priority = loneliness + fear + (this.agent.traits.extraversion * 20);
            const squadCenter = this.agent.getSquadCenter(world);
            
            action = {
                type: 'MOVE',
                target: squadCenter,
                movementMode: 'BOUNDING',
                description: 'regrouping with the squad'
            };
            return { priority, action };
        }

        if (this.agent.brain.isSafe(world) && this.agent.state.socialBattery < 80) {
             const socialize = this.agent.brain.cortex.background.scoreSocialize(world);
             if (socialize && socialize.score > 0) {
                 return { priority: 20, action: socialize };
             }
        }

        return { priority: 0, action: { type: 'IDLE' } };
    }

    scanForWounded(world) {
        let nearest = null;
        let minDist = Infinity;
        
        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && a.state.hp < a.state.maxHp * 0.4) {
                const d = Utils.distance(this.agent.pos, a.pos);
                if (d < minDist && d < 500) {
                    minDist = d;
                    nearest = a;
                }
            }
        });
        return nearest;
    }

    canHeal(target) {
        return this.agent.state.inventory.utility.some(u => u.type === 'Medkit' && u.count > 0);
    }
    
    calculateIsolation(world) {
        let minDist = Infinity;
        let alliesFound = false;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && !a.state.isDead) {
                const d = Utils.distance(this.agent.pos, a.pos);
                if (d < minDist) minDist = d;
                alliesFound = true;
            }
        });
        
        if (!alliesFound) return 0;
        
        if (minDist > 500) return 100;
        if (minDist > 200) return 50;
        return 0;
    }
}
