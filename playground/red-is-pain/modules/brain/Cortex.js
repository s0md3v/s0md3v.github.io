import { ActionExecutor } from '../ActionExecutor.js?v=field-console-14';
import { CombatEvaluator } from '../CombatEvaluator.js?v=field-console-14';
import { TacticalEvaluator } from '../TacticalEvaluator.js?v=field-console-14';
import { SupportEvaluator } from '../SupportEvaluator.js?v=field-console-14';
import { BackgroundEvaluator } from '../BackgroundEvaluator.js?v=field-console-14';
import { CoverEvaluator } from '../CoverEvaluator.js?v=field-console-14';
import { Utils } from '../Utils.js?v=field-console-14';
import { Config } from '../Config.js?v=field-console-14';

export class Cortex {
    constructor(agent) {
        this.agent = agent;
        this.lastAction = { type: 'IDLE', score: 0 };
        
        this.combat = new CombatEvaluator(this); 
        this.tactical = new TacticalEvaluator(this);
        this.support = new SupportEvaluator(this);
        this.background = new BackgroundEvaluator(this);
        this.cover = new CoverEvaluator(this);

        this.combatEval = this.combat;
        this.tacticalEval = this.tactical;
        this.supportEval = this.support;
        this.backgroundEval = this.background;
        this.coverEval = this.cover;

        this.currentPlan = null; 
        this.planTimestamp = 0;
    }

    evaluate(world, emotionalOverrideLevel = 0) {
        const threat = this.identifyThreat(world);
        const squadOrder = this.agent.squad ? this.agent.squad.currentOrder : null;
        
        let candidates = [];

        const isBerserk = this.agent.state.stress > 95 && this.agent.state.morale < 20;
        const isHeroic = this.agent.state.isHeroic;

        if (threat && (isBerserk || isHeroic)) {
            const enemyPos = threat.lastKnownPosition || threat.pos;
            if (isBerserk) {
                candidates.push({
                    priority: 95,
                    action: { type: 'ATTACK', target: enemyPos, score: 10.0, speedMultiplier: 1.5, movementMode: 'BOUNDING', description: 'attacking recklessly' },
                    type: 'COMBAT'
                });
            } else if (isHeroic) {
                candidates.push({
                    priority: 90,
                    action: { type: 'ATTACK', target: enemyPos, score: 8.0, speedMultiplier: 1.2, movementMode: 'BOUNDING', description: 'advancing aggressively' },
                    type: 'COMBAT'
                });
            }
        }

        const moraleFactor = (this.agent.state.morale - 50) / 50;
        const moraleCombatBonus = moraleFactor * 15;

        if (this.currentPlan) {
            const planAge = Date.now() - this.planTimestamp;
            let keepPlan = false;

            if (this.currentPlan.type === 'TACTICAL' && planAge < 3000) {
                 const dist = Utils.distance(this.agent.pos, this.currentPlan.action.target);
                 if (dist > 20) keepPlan = true;
            }

            if (keepPlan) {
                const existingAction = { ...this.currentPlan.action };
                candidates.push({ 
                    priority: this.currentPlan.priority + 10,
                    persistenceBasePriority: this.currentPlan.priority,
                    action: existingAction, 
                    type: this.currentPlan.type 
                });
            } else {
                this.currentPlan = null;
            }
        }


        const suspectedThreat = this.identifyThreat(world, true);
        if (threat || suspectedThreat || this.agent.state.stress > 20) {
            const combatAction = this.combat.scoreCombat(world);
            if (combatAction.score > 0) {
                const priority = Math.min(85, combatAction.score * 40) + moraleCombatBonus; 
                candidates.push({ priority, action: combatAction, type: 'COMBAT' });
            }

            const activeThreat = threat || suspectedThreat;
            if (activeThreat) {
                const alreadyFlanking = this.currentPlan && this.currentPlan.type === 'TACTICAL';
                
                if (!alreadyFlanking || Date.now() % 500 < 50) {
                    const flankSpot = this.tactical.findFlankSpot(world, activeThreat.pos);
                    if (flankSpot) {
                        candidates.push({ 
                            priority: 60 + (this.agent.traits.openness * 10) + (moraleCombatBonus * 0.5),
                            action: { type: 'MOVE', target: flankSpot, movementMode: 'TACTICAL', description: 'moving around the enemy' },
                            type: 'TACTICAL'
                        });
                    }
                }
            }

            const fragAction = this.combat.scoreFrag(world);
            if (fragAction.score > 0) {
                 candidates.push({
                     priority: (fragAction.score * 40) + (moraleCombatBonus * 0.5),
                     action: fragAction,
                     type: 'THROW'
                 });
            }

            const smokeAction = this.combat.scoreSmoke(world);
            if (smokeAction.score > 0) {
                 candidates.push({
                     priority: (smokeAction.score * 35) + (moraleCombatBonus * 0.5),
                     action: smokeAction,
                     type: 'THROW'
                 });
            }

            const smokeTacticsAction = this.tactical.scoreSmokeTactics(world);
            if (smokeTacticsAction.score > 0) {
                 candidates.push({
                     priority: (smokeTacticsAction.score * 35) + (moraleCombatBonus * 0.5),
                     action: smokeTacticsAction,
                     type: 'TACTICAL'
                 });
            }
        }

        const suppressAction = this.combat.scoreSuppress(world);
        if (suppressAction.score > 0) {
            candidates.push({
                priority: (suppressAction.score * 30) + (moraleCombatBonus * 0.5),
                action: suppressAction,
                type: 'SUPPRESS'
            });
        }

        if (!threat) {
            const intercept = this.background.scoreInterceptContact(world);
            if (intercept.score > 0) {
                // 60 + score*8 (max ~110) so it beats standard ORDER (70-90) during high-heat contacts
                candidates.push({ priority: 60 + (intercept.score * 8), action: intercept, type: 'INTERCEPT' });
            }
        }

        if (squadOrder) {
             const orderAction = this.tactical.scoreFollowOrder(world);
             if (orderAction.score > 0) {
                 const prio = 70 + (this.agent.traits.conscientiousness * 20);
                 candidates.push({ priority: prio, action: orderAction, type: 'ORDER' });
             }
        }

        const patrolAction = this.background.scorePatrol(world);
        if (patrolAction && patrolAction.type) {
            candidates.push({ priority: 30, action: patrolAction, type: 'PATROL' });
        }

        const coverAction = this.cover.scoreHoldCover(world);
        if (coverAction && coverAction.type && coverAction.score > 1.0) {
            candidates.push({ priority: 40, action: coverAction, type: 'COVER' });
        }

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

        const selfHeal = this.support.scoreSelfHeal(world);
        if (selfHeal.score > 0) {
             candidates.push({ priority: 75, action: selfHeal, type: 'SELF_HEAL' });
        }

        const provideCover = this.support.scoreProvideCover(world);
        if (provideCover.score > 0) {
             candidates.push({ priority: 65 + (provideCover.score * 5), action: provideCover, type: 'SUPPORT' });
        }

        if (emotionalOverrideLevel > 80) {
            candidates = candidates.filter(c => c.type === 'COMBAT' || c.type === 'COVER' || c.type === 'SELF_HEAL' || c.type === 'THROW' || c.type === 'TACTICAL');
            
            candidates.forEach(c => {
                 if (c.type === 'COVER') c.priority += 50; 
                 if (c.type === 'THROW' && c.action.grenadeType === 'SmokeGrenade') c.priority += 40;
                 if (c.type === 'TACTICAL' && c.action.description === 'throwing smoke to retreat') c.priority += 40;
            });
            this.currentPlan = null;
        }

        candidates.sort((a, b) => b.priority - a.priority);
        
        const best = candidates[0];
        
        if (best) this.lastAction = best.action;

        if (best) {
            this.agent.brain.currentFocus = best.type;
            const storedBest = {
                ...best,
                priority: best.persistenceBasePriority ?? best.priority
            };
            delete storedBest.persistenceBasePriority;
            
            if (!this.currentPlan || this.currentPlan.type !== best.type) {
                 this.currentPlan = storedBest;
                 this.planTimestamp = Date.now();
            } else {
                 this.currentPlan = storedBest;
            }
        } else {
             this.currentPlan = null;
        }

        if (!best || best.priority <= 0) {
             return { priority: 10, action: { type: 'IDLE', score: 1 } };
        }

        return best;
    }

    identifyThreat(world, includeSuspected = false) {
        const enemies = this.agent.sensory.scan(world).filter(a => a.team !== this.agent.team);
        if (enemies.length > 0) {
            const myPos = this.agent.pos;
            enemies.sort((a, b) => Utils.distance(myPos, a.pos) - Utils.distance(myPos, b.pos));
            return enemies[0];
        }
        
        if (includeSuspected && this.agent.memory.knownHostiles.length > 0) {
             const memoryParams = this.agent.memory.knownHostiles.reduce((latest, hostile) => {
                 return !latest || hostile.timestamp > latest.timestamp ? hostile : latest;
             }, null);
             return { 
                 pos: memoryParams.lastKnownPosition, 
                 lastKnownPosition: memoryParams.lastKnownPosition,
                 id: memoryParams.id, 
                 isMemory: true,
                 isSuspected: true,
                 team: 'HOSTILE' 
             };
        }
        return null;
    }

    get currentThought() {
        return this.agent.brain.currentFocus;
    }

    isSafe(world) {
        const threat = this.getThreatSource(world, true);
        if (!threat) return true;
        
        const nearCover = this.tactical.findNearestCover(world, 40) !== null;
        if (!nearCover) return false;
        
        const isExposed = world.hasClearShot(this.agent.pos, threat.pos);
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
        const allies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, 300)
            .filter(a => !a.isCover && a.team === this.agent.team).length; 
        
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
