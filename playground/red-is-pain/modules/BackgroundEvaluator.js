import { Utils } from './Utils.js';
import { Config } from './Config.js';
import { THOUGHT_IDLE, THOUGHT_SOCIAL } from './DecisionConstants.js';

export class BackgroundEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
    }

    scoreLoot(world) {
        let bestLoot = null;
        let bestScore = Infinity;
        
        // 1. EVALUATE CURRENTLY VISIBLE LOOT
        world.loot.forEach(item => {
            const dist = Utils.distance(this.agent.pos, item);
            if (dist > this.agent.traits.visionRadius * 1.5) return;

            const hasLOS = world.hasLineOfSight(this.agent.pos, item);
            if (!hasLOS) return; // Cannot see it through walls

            let score = dist;
            // Priority boost for Medkits when wounded
            if (item.type === 'Medkit' && this.agent.state.hp < this.agent.state.maxHp * 0.8) {
                const healthImpact = (1.0 - (this.agent.state.hp / this.agent.state.maxHp)) * 600;
                score -= healthImpact;
            }
            
            if (score < bestScore) {
                bestScore = score;
                bestLoot = item;
            }
        });

        // 2. EVALUATE REMEMBERED LOOT (If no visible loot)
        if (!bestLoot && this.agent.memory.knownLoot.length > 0) {
             this.agent.memory.knownLoot.forEach(item => {
                const dist = Utils.distance(this.agent.pos, item);
                if (dist > 1000) return; // Out of mind

                let score = dist + 200; // Penalty for having to travel to memory location
                
                if (item.type === 'Medkit' && this.agent.state.hp < this.agent.state.maxHp * 0.8) {
                    const healthImpact = (1.0 - (this.agent.state.hp / this.agent.state.maxHp)) * 600;
                    score -= healthImpact;
                }

                if (score < bestScore) {
                    bestScore = score;
                    bestLoot = item;
                }
             });
        }

        if (!bestLoot) return { score: 0 };
        
        // --- REACHABILITY CHECK ---
        // If it's a known loot (not currently in LOS), we must check if we can even get there.
        // We use a simple LOS check first, then a pathfinder check if LOS is blocked.
        const hasLOS = world.hasLineOfSight(this.agent.pos, bestLoot);
        if (!hasLOS) {
             const path = world.pathfinder.findPath(this.agent.pos, bestLoot);
             if (path.length === 0) {
                 this.agent.memory.markUnreachable(bestLoot);
                 return { score: 0 };
             }
        }
        
        return { type: 'LOOT', target: bestLoot, score: 1, description: 'Securing Assets' };
    }

    scoreSocialize(world) {
        // Find nearby idle/social teammates to bond with
        let bestTarget = null;
        let maxScore = -1;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                const dist = Utils.distance(this.agent.pos, a.pos);
                if (dist < 100) {
                    // Teammates must also be in a non-combat state
                    const otherThought = a.brain.currentThought;
                    if (otherThought === THOUGHT_IDLE || otherThought === THOUGHT_SOCIAL) {
                        const score = (100 - dist) / 100 + (1.0 - this.agent.traits.agreeableness); // Grumpy people like distance, agreeable like proximity
                        if (score > maxScore) {
                            maxScore = score;
                            bestTarget = a;
                        }
                    }
                }
            }
        });

        if (bestTarget) {
            // Apply a small trust gain over time
            this.agent.memory.modifyTrust(bestTarget.id, 0.0001); // Very slow bonding
            return { type: 'MOVE', target: bestTarget.pos, score: 1.5, movementMode: 'SNEAKING' };
        }

        return { score: 0 };
    }

    scoreMutiny(world) {
        // Only trigger if:
        // 1. Not currently the leader
        // 2. Low Approval of current leader (< threshold)
        // 3. I am more competent (higher potential) OR leader is incompetent (high stress/downed)
        if (this.agent.rank === 1) return { score: 0 };
        
        const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
        if (!leader) return { score: 0 }; 

        const approval = this.agent.memory.leaderApproval;
        if (approval > Config.WORLD.APPROVAL_MIN_MUTINY) return { score: 0 };

        // Competence Gap
        const myPotential = this.agent.traits.leadershipPotential;
        const leaderPotential = leader.traits.leadershipPotential;
        
        // Mutiny is more likely if the leader is panicking (High Stress) while I am cool
        const stressGap = (leader.state.stress - this.agent.state.stress) / 100;
        
        let mutinyScore = (myPotential - leaderPotential) * 2.0;
        mutinyScore += stressGap * 3.0;
        mutinyScore += (1.0 - (approval / 100)) * 2.0;

        // Extraverts are more ambitious
        mutinyScore *= (0.5 + this.agent.traits.extraversion);

        if (mutinyScore > 2.0) {
            return { type: 'MUTINY', targetId: leader.id, score: mutinyScore };
        }

        return { score: 0 };
    }

    scoreLurk(world) {
        // Only lurk if we have NO direct visual contact but DO have heatmap intel
        const visibleEnemy = this.decision.getThreatSource(world, false);
        if (visibleEnemy) return { score: 0 };
        
        const suspected = this.decision.getThreatSource(world, true);
        if (!suspected || !suspected.isSuspected) return { score: 0 };

        // If we are already in a bush, STAY PUT
        if (this.agent.state.inBush) {
            return { type: 'IDLE', score: 2.0 }; // High score to override wandering
        }

        // Find a nearby bush to hide in
        // Optimization: Bushes are stored in world.bushes
        let bestBush = null;
        let bestScore = -1;

        world.bushes.forEach(b => {
            const dist = Utils.distance(this.agent.pos, b);
            if (dist > 300) return; // Too far

            // Score based on distance (closer is better) and tactical position relative to heat
            const suspectedPos = suspected.pos || suspected.lastKnownPosition;
            if (!suspectedPos) return;

            const distToHeat = Utils.distance(b, suspectedPos);
            
            // Range-based positioning
            let rangeScore = 0;
            const optRange = this.agent.state.inventory.weapon.optimalRange;
            if (optRange > 400) {
                rangeScore = (distToHeat > 300 && distToHeat < 600) ? 1.0 : 0;
            } else if (optRange < 150) {
                rangeScore = (distToHeat < 200) ? 1.0 : 0;
            } else {
                rangeScore = 0.5;
            }
            
            let score = (300 - dist) / 300 + rangeScore;
            
            // Trait modifiers
            score += this.agent.traits.conscientiousness * 0.5; // Patient agents love bushes
            
            if (score > bestScore) {
                bestScore = score;
                bestBush = b;
            }
        });

        if (bestBush) {
            return { type: 'MOVE', target: {x: bestBush.x, y: bestBush.y}, score: 1.8, movementMode: 'SNEAKING' };
        }
        
        return { score: 0 };
    }

    scorePatrol(world) {
         if (!this.agent.patrolTarget || Utils.distance(this.agent.pos, this.agent.patrolTarget) < 20) {
            let found = false;
            let attempts = 0;
            while (!found && attempts < 10) {
                const angle = this.agent.angle + (Math.random() - 0.5) * Math.PI;
                const dist = 100 + Math.random() * 200;
                const tx = Utils.clamp(this.agent.pos.x + Math.cos(angle) * dist, 50, world.width - 50);
                const ty = Utils.clamp(this.agent.pos.y + Math.sin(angle) * dist, 50, world.height - 50);
                
                if (world.isPositionClear(tx, ty, this.agent.radius)) {
                    this.agent.patrolTarget = { x: tx, y: ty };
                    found = true;
                }
                attempts++;
            }
            if (!found) {
                this.agent.patrolTarget = null;
                return { score: 0 };
            }
         }

         if (!this.agent.patrolTarget || this.agent.memory.isUnreachable(this.agent.patrolTarget)) {
             this.agent.patrolTarget = null; // Reset if unreachable
             return { score: 0 };
         }
         // Patrol is low priority filler (0.5), overridden by almost anything tactical
         return { type: 'MOVE', target: this.agent.patrolTarget, score: 0.5, movementMode: 'SNEAKING' };
    }

    scoreExplore(world) {
        // "FOG OF WAR" LOGIC: Find an area we haven't controlled/visited recently
        const mem = this.agent.memory;
        const now = Date.now();

        // 1. STRATEGIC SQUAD OBJECTIVE (Priority)
        if (this.agent.squad && this.agent.squad.strategicObjective) {
            const goal = this.agent.squad.strategicObjective;
            const dist = Utils.distance(this.agent.pos, goal);
            
            // If we are already close to the strategic objective, we can transition to local scouting
            if (dist < 150) {
                 // High score to keep us here until it's "cleared" by seeing it
                 return { type: 'MOVE', target: goal, score: 3.5, description: 'Scouting Area', movementMode: 'TACTICAL' };
            }
            
            // On the way to a strategic objective
            return { type: 'MOVE', target: goal, score: 3.0, description: 'Strategic Recon', movementMode: 'TACTICAL' };
        }

        // 2. COMMITMENT: If we already have a scouting target and are moving towards it, stick to it!
        if (this.agent.currentAction && 
            this.agent.currentAction.description === 'Scouting Area' && 
            this.agent.path && this.agent.path.length > 0) {
            
            const lastT = this.agent.currentAction.target;
            const gx = Math.floor((lastT.x / world.width) * mem.gridCols);
            const gy = Math.floor((lastT.y / world.height) * mem.gridRows);
            const lastObserved = (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) ? mem.observedMap[gy][gx] : now;
            
            // If we haven't looked at it recently (in the last 2 seconds)
            if (now - lastObserved > 2000) {
                return { ...this.agent.currentAction, score: 2.5 }; // High score to ensure it wins hysteresis
            }
        }
        
        // 3. Sample candidate points to explore (Fog of War)
        let bestTarget = null;
        let maxUtility = -Infinity;
        
        // Increase sampling for better results
        for (let i = 0; i < 8; i++) {
             const tx = 100 + Math.random() * (world.width - 200);
             const ty = 100 + Math.random() * (world.height - 200);
             
             const gx = Math.floor((tx / world.width) * mem.gridCols);
             const gy = Math.floor((ty / world.height) * mem.gridRows);
             
             if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
                 const lastObserved = mem.observedMap[gy][gx];
                 const heat = mem.heatmap[gy][gx];
                 const control = mem.controlMap[gy][gx];
                 
                 const dist = Utils.distance(this.agent.pos, {x: tx, y: ty});
                 if (dist < 150) continue; 
                 
                 // Utility based on Time Since Observed (The real Fog of War)
                 // Max score for never observed (lastObserved = 0)
                 let score = (now - lastObserved) / 10000; // 1 point per 10s of amnesia
                 
                 // Avoid heat (danger)
                 if (heat > 0) score -= heat * 5; 
                 
                 // Slight preference for areas where we don't already have strong control
                 score += (5.0 - control) * 0.5;

                 const distScore = (1200 - dist) / 1200; 
                 score += distScore * 2.0; // Prefer closer targets for efficiency
                 
                 if (world.isWallAt(tx, ty)) score = -100;

                 if (score > maxUtility) {
                     maxUtility = score;
                     bestTarget = { x: tx, y: ty };
                 }
             }
        }

        if (bestTarget && maxUtility > 1.5) {
             if (world.isPositionClear(bestTarget.x, bestTarget.y, this.agent.radius)) {
                 return { type: 'MOVE', target: bestTarget, score: 1.8, description: 'Scouting Area', movementMode: 'TACTICAL' };
             }
             const valid = this.findNearestValidPoint(world, bestTarget.x, bestTarget.y);
             if (valid) {
                 return { type: 'MOVE', target: valid, score: 1.8, description: 'Scouting Area', movementMode: 'TACTICAL' };
             }
        }
        
        return { score: 0 };
    }

    findNearestValidPoint(world, x, y, range = 100) {
        if (!world.isWallAt(x, y)) return { x, y };

        const spiralStep = 20;
        for (let r = spiralStep; r < range; r += spiralStep) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                const tx = x + Math.cos(a) * r;
                const ty = y + Math.sin(a) * r;
                if (!world.isPositionClear(tx, ty, this.agent.radius)) return { x: tx, y: ty };
            }
        }
        return null;
    }

    scoreInterceptContact(world) {
        // MARCH TO THE SOUND OF THE GUNS
        const mem = this.agent.memory;
        let bestHeatCell = null;
        let maxHeat = 0;
        
        // Scan for heat signals globally
        for (let y = 0; y < mem.gridRows; y++) {
            for (let x = 0; x < mem.gridCols; x++) {
                if (mem.heatmap[y][x] > maxHeat) {
                    maxHeat = mem.heatmap[y][x];
                    bestHeatCell = { x, y };
                }
            }
        }

        if (bestHeatCell && maxHeat > 1) {
            const heatX = (bestHeatCell.x + 0.5) * (world.width / mem.gridCols);
            const heatY = (bestHeatCell.y + 0.5) * (world.height / mem.gridRows);
            const target = { x: heatX, y: heatY };
            
            // DYNAMIC SCORE: The hotter the intel, the more urgent the move.
            const score = 1.0 + (maxHeat * 0.5);
            
            if (this.agent.memory.isUnreachable(target)) return { score: 0 };

            // Real-world: If we hear an active firefight (High Heat), we SPRINT (Bounding)
            const movementMode = maxHeat > 5 ? 'BOUNDING' : 'TACTICAL';

            return { 
                type: 'MOVE', 
                target: target, 
                score: score, 
                description: 'Intercepting Contact', 
                movementMode: movementMode 
            };
        }

        return { score: 0 };
    }
}
