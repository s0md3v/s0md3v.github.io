import { ActionExecutor } from '../ActionExecutor.js'; 
import { CombatEvaluator } from '../CombatEvaluator.js';
import { TacticalEvaluator } from '../TacticalEvaluator.js';
import { SupportEvaluator } from '../SupportEvaluator.js';
import { BackgroundEvaluator } from '../BackgroundEvaluator.js';
import { CoverEvaluator } from '../CoverEvaluator.js';
import { Utils } from '../Utils.js';
import { Config } from '../Config.js';

export class Cortex {
    constructor(agent) {
        this.agent = agent;
        this.lastAction = { type: 'IDLE', score: 0 }; // Compatibility
        
        // Sub-modules
        // We pass 'this' so they can access Cortex helpers and each other (via this.decision.tactical etc)
        this.combat = new CombatEvaluator(this); 
        this.tactical = new TacticalEvaluator(this);
        this.support = new SupportEvaluator(this);
        this.background = new BackgroundEvaluator(this);
        this.cover = new CoverEvaluator(this);

        // Aliases for backward compatibility with evaluators expecting 'tacticalEval' etc.
        this.combatEval = this.combat;
        this.tacticalEval = this.tactical;
        this.supportEval = this.support;
        this.backgroundEval = this.background;
        this.coverEval = this.cover;

        // Memory of plans
        this.currentPlan = null; 
        this.planTimestamp = 0;
    }

    evaluate(world, emotionalOverrideLevel = 0) {
        // 0. GATHER INTEL
        const threat = this.identifyThreat(world);
        const squadOrder = this.agent.squad ? this.agent.squad.currentOrder : null;
        
        let candidates = [];

        // --- HEROIC / BERSERK OVERRIDES (#6) ---
        const isBerserk = this.agent.state.stress > 95 && this.agent.state.morale < 20;
        const isHeroic = this.agent.state.isHeroic;

        if (threat && (isBerserk || isHeroic)) {
            const enemyPos = threat.lastKnownPosition || threat.pos;
            if (isBerserk) {
                candidates.push({
                    priority: 95,
                    action: { type: 'ATTACK', target: enemyPos, score: 10.0, speedMultiplier: 1.5, movementMode: 'BOUNDING', description: 'BERSERK' },
                    type: 'COMBAT'
                });
            } else if (isHeroic) {
                candidates.push({
                    priority: 90,
                    action: { type: 'ATTACK', target: enemyPos, score: 8.0, speedMultiplier: 1.2, movementMode: 'BOUNDING', description: 'HEROIC PUSH' },
                    type: 'COMBAT'
                });
            }
        }

        // --- MORALE MODIFIER (#3) ---
        const moraleFactor = (this.agent.state.morale - 50) / 50; // -1.0 to 1.0
        const moraleCombatBonus = moraleFactor * 15; // -15 to +15 priority

        // --- HYSTERESIS / PLAN PERSISTENCE ---
        // If we have an active plan, check if we should stick to it.
        if (this.currentPlan) {
            const planAge = Date.now() - this.planTimestamp;
            let keepPlan = false;

            if (this.currentPlan.type === 'TACTICAL' && planAge < 3000) { // Stick to flank/move for 3s minimum
                 const dist = Utils.distance(this.agent.pos, this.currentPlan.action.target);
                 if (dist > 20) keepPlan = true; // Haven't arrived yet
            }

            if (keepPlan) {
                // ADD THE CURRENT PLAN AS A STRONG CANDIDATE
                // We give it a bonus score to resist jitter
                const existingAction = { ...this.currentPlan.action };
                candidates.push({ 
                    priority: this.currentPlan.priority + 10, // Persistence Bonus
                    action: existingAction, 
                    type: this.currentPlan.type 
                });
            } else {
                this.currentPlan = null; // Plan expired or completed
            }
        }


        // A. COMBAT (Highest Priority if threatened)
        // includes suspected threats from radio/memory via identifyThreat(world, true)
        const suspectedThreat = this.identifyThreat(world, true);
        if (threat || suspectedThreat || this.agent.state.stress > 20) {
            const combatAction = this.combat.scoreCombat(world);
            if (combatAction.score > 0) {
                // Map score 2.0 -> 80 priority
                const priority = Math.min(85, combatAction.score * 40) + moraleCombatBonus; 
                candidates.push({ priority, action: combatAction, type: 'COMBAT' });
            }

            // Flanking
            const activeThreat = threat || suspectedThreat;
            if (activeThreat) {
                // Only search for NEW flank spots if we aren't already committed to one
                const alreadyFlanking = this.currentPlan && this.currentPlan.type === 'TACTICAL';
                
                if (!alreadyFlanking || Date.now() % 500 < 50) { // Check occasionally
                    const flankSpot = this.tactical.findFlankSpot(world, activeThreat.pos);
                    if (flankSpot) {
                        candidates.push({ 
                            priority: 60 + (this.agent.traits.openness * 10) + (moraleCombatBonus * 0.5),
                            action: { type: 'MOVE', target: flankSpot, movementMode: 'TACTICAL', description: 'FLANK' },
                            type: 'TACTICAL'
                        });
                    }
                }
            }

            // ... (rest of combat actions)
            // Suppress
            const suppressAction = this.combat.scoreSuppress(world);
             if (suppressAction.score > 0) {
                 candidates.push({ 
                     priority: (suppressAction.score * 30) + (moraleCombatBonus * 0.5), // Score 2.0 -> 60
                     action: suppressAction, 
                     type: 'SUPPRESS' 
                 });
             }

            // Frag Grenades
            const fragAction = this.combat.scoreFrag(world);
            if (fragAction.score > 0) {
                 candidates.push({
                     priority: (fragAction.score * 40) + (moraleCombatBonus * 0.5),
                     action: fragAction,
                     type: 'THROW'
                 });
            }

            // Smoke Grenades
            const smokeAction = this.combat.scoreSmoke(world);
            if (smokeAction.score > 0) {
                 candidates.push({
                     priority: (smokeAction.score * 35) + (moraleCombatBonus * 0.5),
                     action: smokeAction,
                     type: 'THROW'
                 });
            }

            // Smoke Tactics (Movement based)
            const smokeTacticsAction = this.tactical.scoreSmokeTactics(world);
            if (smokeTacticsAction.score > 0) {
                 candidates.push({
                     priority: (smokeTacticsAction.score * 35) + (moraleCombatBonus * 0.5),
                     action: smokeTacticsAction,
                     type: 'TACTICAL'
                 });
            }
        }

        // G. INTERCEPT CONTACT (Radio intel response)
        if (!threat) {
            const intercept = this.background.scoreInterceptContact(world);
            if (intercept.score > 0) {
                // Priority boost: 60 + (score * 8). Max ~110. 
                // This ensures it overrides standard ORDER (70-90) during high-heat contacts.
                candidates.push({ priority: 60 + (intercept.score * 8), action: intercept, type: 'INTERCEPT' });
            }
        }

        // B. ORDERS
        if (squadOrder) {
             const orderAction = this.tactical.scoreFollowOrder(world);
             if (orderAction.score > 0) {
                 const prio = 70 + (this.agent.traits.conscientiousness * 20);
                 candidates.push({ priority: prio, action: orderAction, type: 'ORDER' });
             }
        }

        // C. IDLE / PATROL
        const patrolAction = this.background.scorePatrol(world);
        if (patrolAction && patrolAction.type) {
            candidates.push({ priority: 30, action: patrolAction, type: 'PATROL' });
        }

        // D. COVER (If exposed)
        const coverAction = this.cover.scoreHoldCover(world);
        if (coverAction && coverAction.type && coverAction.score > 1.0) {
            candidates.push({ priority: 40, action: coverAction, type: 'COVER' });
        }

        // E. SCAVANGE / LOOT (Low Ammo)
        const weapon = this.agent.state.inventory.weapon;
        if (weapon.carriedAmmo < weapon.maxAmmo * 1.5) {
             const resupply = this.support.scoreResupply(world);
             if (resupply.score > 0) {
                 candidates.push({ priority: 50 + (resupply.score * 10), action: resupply, type: 'RESUPPLY' });
             }
             
             const loot = this.background.scoreLoot(world);
             if (loot.score > 0) {
                 candidates.push({ priority: 40 + (loot.score * 10), action: loot, type: 'LOOT' });
             }
        }

        // F. SELF CARE (Heal)
        const selfHeal = this.support.scoreSelfHeal(world);
        if (selfHeal.score > 0) {
             candidates.push({ priority: 75, action: selfHeal, type: 'SELF_HEAL' });
        }

        // H. SUPPORT (Provide Cover/Rescue)
        const provideCover = this.support.scoreProvideCover(world);
        if (provideCover.score > 0) {
             candidates.push({ priority: 65 + (provideCover.score * 5), action: provideCover, type: 'SUPPORT' });
        }

        // 2. FILTER & SELECT
        if (emotionalOverrideLevel > 80) {
            // Panic/Urgent Survival inhibits complex plans
            candidates = candidates.filter(c => c.type === 'COMBAT' || c.type === 'COVER' || c.type === 'SELF_HEAL' || c.type === 'THROW' || c.type === 'TACTICAL');
            
            // If panic is high, finding cover and using smoke are top priorities
            candidates.forEach(c => {
                 if (c.type === 'COVER') c.priority += 50; 
                 if (c.type === 'THROW' && c.action.grenadeType === 'SmokeGrenade') c.priority += 40;
                 if (c.type === 'TACTICAL' && c.action.description === 'Retreat Smoke') c.priority += 40;
            });
            this.currentPlan = null; // Panic clears the mind
        }

        candidates.sort((a, b) => b.priority - a.priority);
        
        const best = candidates[0];
        
        // Update lastAction for evaluators
        if (best) this.lastAction = best.action;

        // --- EXPORT CURRENT THOUGHT ---
        // For debugging/state display
        if (best) {
            this.agent.brain.currentFocus = best.type;
            
            // COMMIT TO PLAN
            if (!this.currentPlan || this.currentPlan.type !== best.type) {
                 // New plan adopted
                 this.currentPlan = { ...best };
                 this.planTimestamp = Date.now();
            } else {
                 // Update the current plan with new action/priority (e.g. updated target)
                 this.currentPlan = { ...best };
            }
        } else {
             this.currentPlan = null;
        }

        if (!best || best.priority <= 0) {
             return { priority: 10, action: { type: 'IDLE', score: 1 } };
        }

        return best;
    }

    identifyThreat(world, includeSuspected = true) {
        const enemies = this.agent.sensory.scan(world).filter(a => a.team !== this.agent.team);
        if (enemies.length > 0) {
            const myPos = this.agent.pos;
            enemies.sort((a, b) => Utils.distance(myPos, a.pos) - Utils.distance(myPos, b.pos));
            return enemies[0];
        }
        
        if (includeSuspected && this.agent.memory.knownHostiles.length > 0) {
             const memoryParams = this.agent.memory.knownHostiles[0];
             return { 
                 pos: memoryParams.lastKnownPosition, 
                 lastKnownPosition: memoryParams.lastKnownPosition,
                 id: memoryParams.id, 
                 isMemory: true,
                 team: 'HOSTILE' 
             };
        }
        return null;
    }

    // --- PROXIES FOR EVALUATORS ---

    get currentThought() {
        return this.agent.brain.currentFocus;
    }

    isSafe(world) {
        const threat = this.getThreatSource(world, true);
        if (!threat) return true;
        
        const nearCover = this.tactical.findNearestCover(world, 40) !== null;
        if (!nearCover) return false;
        
        const isExposed = world.hasLineOfSight(this.agent.pos, threat.pos, Infinity, true);
        return !isExposed;
    }

    getThreatSource(world, includeSuspected = false) {
         return this.identifyThreat(world, includeSuspected);
    }

    findNearestCover(world, range) {
        return this.tactical.findNearestCover(world, range);
    }

    findFlankSpot(world, enemyPos, side) {
        return this.tactical.findFlankSpot(world, enemyPos, side);
    }

    findPeekSpot(world, enemyPos) {
        return this.tactical.findPeekSpot(world, enemyPos);
    }

    getSquadActionCount(world, actionType) {
        let count = 0;
        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                if (a.currentAction && a.currentAction.type === actionType) {
                    count++;
                }
            }
        });
        return count;
    }

    getForceBalance(world) {
        // Local allies within 300px
        const allies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, 300)
            .filter(a => !a.isCover && a.team === this.agent.team).length; 
        
        // Visible enemies
        const enemies = this.agent.sensory.scan(world)
            .filter(a => a.team !== this.agent.team && this.agent.memory.isSpotted(a.id)).length;
        
        if (enemies === 0) return 999;
        return allies / enemies;
    }

    hasLootKnowledge(world) {
        const visionRange = this.agent.traits.visionRadius || 400;
        const visibleLoot = world.loot.some(item => Utils.distance(this.agent.pos, item) < visionRange);
        if (visibleLoot) return true;
        return this.agent.memory.knownLoot.length > 0;
    }

    scoreResupply(world) {
        return this.support.scoreResupply(world);
    }
}
