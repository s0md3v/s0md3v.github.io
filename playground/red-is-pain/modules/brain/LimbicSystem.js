import { Utils } from '../Utils.js';
import { Config } from '../Config.js';

export class LimbicSystem {
    constructor(agent) {
        this.agent = agent;
    }

    update(dt, world) {
        const now = Date.now();

        // 1. Battle Buddy Check (Am I near a friend?)
        const buddyRadius = Config.AGENT.BATTLE_BUDDY_RADIUS || 50;
        const buddies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, buddyRadius)
            .some(a => a.team === this.agent.team && a !== this.agent && (this.agent.memory.socialCredit.get(a.id) || 0) > 0.7);
        
        this.agent.state.isBattleBuddyActive = buddies;

        // 2. Social Battery (The desire to be near others)
        // High Battery = Satiated (Happy to be alone for a bit). Low Battery = Lonely (Needs group).
        // Model: Everyone gets lonely when alone. Everyone gets satiated when together.
        // Extraverts get lonely FASTER (drain battery when alone). Interact more intensely (refill faster check?).
        
        const nearbyCount = this.agent.state.isBattleBuddyActive ? 1 : 0; // Simplified check or reuse spatial
        // Actually let's use the scan we did (optimization needed? for now redundant scan ok or minimal)
        
        // Re-implementing Agent.js logic but FIXED for Red is pain behavior:
        // Together -> Refill. Alone -> Drain.
        
        const isAlone = !buddies; 
        
        if (isAlone) {
             // Drain battery (Get Lonely)
             // Extraverts drain faster (0.8), Introverts drain slower (0.2)
             const drainRate = 0.5 + ((this.agent.traits.extraversion - 0.5) * 0.5); 
             this.agent.state.socialBattery = Math.max(0, this.agent.state.socialBattery - (dt * 0.01 * drainRate));
        } else {
             // Refill battery (Socializing)
             // Introverts refill slower? Or maybe they drain if TOO crowded?
             // Let's keep it simple: Being with friends is good.
             this.agent.state.socialBattery = Math.min(100, this.agent.state.socialBattery + (dt * 0.05));
        }

        // 3. Leadership / Cowardice Check
        if (this.agent.rank === 0) {
            // Optimization: Don't search every frame. But update is every frame. 
            // Maybe throttle this? Or assume World provides leader reference.
            // For now, simple find (expensive if many agents, but usually <50).
            const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
            if (leader) {
                const iAmFighting = this.agent.brain.currentThought === 'COMBAT';
                const leaderRetreating = leader.brain.currentThought === 'SURVIVAL';
                
                if (iAmFighting && leaderRetreating) {
                    this.agent.memory.modifyLeaderApproval(-Config.WORLD.APPROVAL_COWARDICE_PENALTY * (dt / 1000));
                }
            }
        }
    }

    evaluate(world) {
        // Evaluate Social Needs, Morale, and Squad Cohesion
        
        let priority = 0;
        let action = { type: 'IDLE', score: 0 };

        // 1. HELP A FRIEND (High Priority: 60-80)
        // If a nearby friend is DOWNED and we have a medkit
        const woundedAlly = this.scanForWounded(world);
        if (woundedAlly && this.canHeal(woundedAlly)) {
            // Empathy Factor: High Agreeableness = More likely to prioritize helping
            const empathy = this.agent.traits.agreeableness * 1.5;
            const urgency = (1 - woundedAlly.state.hp) * 100; // More hurt = more urgent

            priority = urgency + (empathy * 20);
            
            // Safety Check: Don't suicide to heal (Limbic system cares about *group* survival too)
            if (!this.agent.brain.isSafe(world)) priority -= 30;

            action = { 
                type: 'HEAL', 
                targetId: woundedAlly.id, 
                movementMode: 'BOUNDING', 
                description: 'COMBAT MEDIC' 
            };
            return { priority, action };
        }

        // 2. REGROUP (Medium Priority: 30-50)
        // If isolated and feeling lonely (Social Battery Low OR High Neuroticism)
        // This replaces the old 'Social Battery' idle logic.
        const isolation = this.calculateIsolation(world);
        const loneliness = (1 - this.agent.state.socialBattery / 100) * 50;
        const fear = this.agent.state.stress / 2;

        if (isolation > 50) {
            // Need to find the herd
            priority = loneliness + fear + (this.agent.traits.extraversion * 20);
            const squadCenter = this.agent.getSquadCenter(world);
            
            action = {
                type: 'MOVE',
                target: squadCenter,
                movementMode: 'BOUNDING', // Run back to safety!
                description: 'REGROUP'
            };
            return { priority, action };
        }

        // 3. SOCIALIZE (Idle behavior, Low Priority)
        // Only if safe and not fully socially charged
        if (this.agent.brain.isSafe(world) && this.agent.state.socialBattery < 80) {
             const socialize = this.agent.brain.cortex.background.scoreSocialize(world);
             if (socialize && socialize.score > 0) {
                 return { priority: 20, action: socialize };
             }
        }

        // 4. MORALE / BARKING (Low Priority Main Task, but High Interrupt)
        // Handled via Barks mostly, but sometimes overrides behavior (e.g. Cheer)
        // Returning IDLE priority 0 usually, letting Cortex handle combat.

        return { priority: 0, action: { type: 'IDLE' } };
    }

    scanForWounded(world) {
        // Find nearest downed ally
        let nearest = null;
        let minDist = Infinity;
        
        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && a.state.hp < a.state.maxHp * 0.4) {
                const d = Utils.distance(this.agent.pos, a.pos);
                if (d < minDist && d < 500) { // Limit range to prevent cross-map running
                    minDist = d;
                    nearest = a;
                }
            }
        });
        return nearest;
    }

    canHeal(target) {
        // Do I have a medkit?
        return this.agent.state.inventory.utility.some(u => u.type === 'Medkit' && u.count > 0);
    }
    
    calculateIsolation(world) {
        // Simple distance check to nearest ally
        let minDist = Infinity;
        let alliesFound = false;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && !a.state.isDead) {
                const d = Utils.distance(this.agent.pos, a.pos);
                if (d < minDist) minDist = d;
                alliesFound = true;
            }
        });
        
        if (!alliesFound) return 0; // Cannot be isolated if you are the last one
        
        if (minDist > 500) return 100; // Totally alone
        if (minDist > 200) return 50;  // Stretched thin
        return 0; // Safe
    }
}
