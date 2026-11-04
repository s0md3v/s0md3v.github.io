import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';
import { THOUGHT_IDLE, THOUGHT_SOCIAL } from './DecisionConstants.js?v=field-console-14';

export class BackgroundEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
    }

    scoreLoot(world) {
        let bestLoot = null;
        let bestScore = Infinity;
        
        world.loot.forEach(item => {
            const dist = Utils.distance(this.agent.pos, item);
            if (dist > this.agent.traits.visionRadius * 1.5) return;

            const hasLOS = world.hasVisualLine(this.agent.pos, item);
            if (!hasLOS) return;

            let score = dist;
            if (item.type === 'Medkit' && this.agent.state.hp < this.agent.state.maxHp * 0.8) {
                const healthImpact = (1.0 - (this.agent.state.hp / this.agent.state.maxHp)) * 600;
                score -= healthImpact;
            }
            
            if (score < bestScore) {
                bestScore = score;
                bestLoot = item;
            }
        });

        if (!bestLoot && this.agent.memory.knownLoot.length > 0) {
             this.agent.memory.knownLoot.forEach(item => {
                const dist = Utils.distance(this.agent.pos, item);
                if (dist > 1000) return;

                let score = dist + 200;
                
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
        
        const hasLOS = world.hasVisualLine(this.agent.pos, bestLoot);
        if (!hasLOS) {
             const path = world.pathfinder.findPath(this.agent.pos, bestLoot);
             if (path.length === 0) {
                 this.agent.memory.markUnreachable(bestLoot);
                 return { score: 0 };
             }
        }
        
        return { type: 'LOOT', target: bestLoot, score: 1, description: 'collecting supplies' };
    }

    scoreSocialize(world) {
        let bestTarget = null;
        let maxScore = -1;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                const dist = Utils.distance(this.agent.pos, a.pos);
                if (dist < 100) {
                    const otherThought = a.brain.currentThought;
                    if (otherThought === THOUGHT_IDLE || otherThought === THOUGHT_SOCIAL) {
                        const score = (100 - dist) / 100 + (1.0 - this.agent.traits.agreeableness);
                        if (score > maxScore) {
                            maxScore = score;
                            bestTarget = a;
                        }
                    }
                }
            }
        });

        if (bestTarget) {
            this.agent.memory.modifyTrust(bestTarget.id, 0.0001);
            return { type: 'MOVE', target: bestTarget.pos, score: 1.5, movementMode: 'SNEAKING' };
        }

        return { score: 0 };
    }

    scoreMutiny(world) {
        if (this.agent.rank === 1) return { score: 0 };
        
        const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
        if (!leader) return { score: 0 }; 

        const approval = this.agent.memory.leaderApproval;
        if (approval > Config.AGENT.APPROVAL_MIN_MUTINY) return { score: 0 };

        const myPotential = this.agent.traits.leadershipPotential;
        const leaderPotential = leader.traits.leadershipPotential;
        
        const stressGap = (leader.state.stress - this.agent.state.stress) / 100;
        
        let mutinyScore = (myPotential - leaderPotential) * 2.0;
        mutinyScore += stressGap * 3.0;
        mutinyScore += (1.0 - (approval / 100)) * 2.0;

        mutinyScore *= (0.5 + this.agent.traits.extraversion);

        if (mutinyScore > 2.0) {
            return { type: 'MUTINY', targetId: leader.id, score: mutinyScore };
        }

        return { score: 0 };
    }

    scoreLurk(world) {
        const visibleEnemy = this.decision.getThreatSource(world, false);
        if (visibleEnemy) return { score: 0 };
        
        const suspected = this.decision.getThreatSource(world, true);
        if (!suspected || !suspected.isSuspected) return { score: 0 };

        if (this.agent.state.inBush) {
            return { type: 'IDLE', score: 2.0 };
        }

        let bestBush = null;
        let bestScore = -1;

        world.bushes.forEach(b => {
            const dist = Utils.distance(this.agent.pos, b);
            if (dist > 300) return;

            const suspectedPos = suspected.pos || suspected.lastKnownPosition;
            if (!suspectedPos) return;

            const distToHeat = Utils.distance(b, suspectedPos);
            
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
            
            score += this.agent.traits.conscientiousness * 0.5;
            
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
             this.agent.patrolTarget = null;
             return { score: 0 };
         }
         return { type: 'MOVE', target: this.agent.patrolTarget, score: 0.5, movementMode: 'SNEAKING' };
    }

    scoreExplore(world) {
        const mem = this.agent.memory;
        const now = Date.now();

        if (this.agent.squad && this.agent.squad.strategicObjective) {
            const goal = this.agent.squad.strategicObjective;
            const dist = Utils.distance(this.agent.pos, goal);
            
            if (dist < 150) {
                 return { type: 'MOVE', target: goal, score: 3.5, description: 'checking the area', movementMode: 'TACTICAL' };
            }
            
            return { type: 'MOVE', target: goal, score: 3.0, description: 'searching for enemies', movementMode: 'TACTICAL' };
        }

        if (this.agent.currentAction && 
            this.agent.currentAction.description === 'checking the area' &&
            this.agent.path && this.agent.path.length > 0) {
            
            const lastT = this.agent.currentAction.target;
            const gx = Math.floor((lastT.x / world.width) * mem.gridCols);
            const gy = Math.floor((lastT.y / world.height) * mem.gridRows);
            const lastObserved = (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) ? mem.observedMap[gy][gx] : now;
            
            if (now - lastObserved > 2000) {
                return { ...this.agent.currentAction, score: 2.5 };
            }
        }
        
        let bestTarget = null;
        let maxUtility = -Infinity;
        
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
                 
                 let score = (now - lastObserved) / 10000; // 1 point per 10s unobserved
                 
                 if (heat > 0) score -= heat * 5; 
                 
                 score += (5.0 - control) * 0.5;

                 const distScore = (1200 - dist) / 1200; 
                 score += distScore * 2.0;
                 
                 if (world.isWallAt(tx, ty)) score = -100;

                 if (score > maxUtility) {
                     maxUtility = score;
                     bestTarget = { x: tx, y: ty };
                 }
             }
        }

        if (bestTarget && maxUtility > 1.5) {
             if (world.isPositionClear(bestTarget.x, bestTarget.y, this.agent.radius)) {
                 return { type: 'MOVE', target: bestTarget, score: 1.8, description: 'checking the area', movementMode: 'TACTICAL' };
             }
             const valid = this.findNearestValidPoint(world, bestTarget.x, bestTarget.y);
             if (valid) {
                 return { type: 'MOVE', target: valid, score: 1.8, description: 'checking the area', movementMode: 'TACTICAL' };
             }
        }
        
        return { score: 0 };
    }

    findNearestValidPoint(world, x, y, range = 100) {
        if (world.isPositionClear(x, y, this.agent.radius)) return { x, y };

        const spiralStep = 20;
        for (let r = spiralStep; r < range; r += spiralStep) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                const tx = x + Math.cos(a) * r;
                const ty = y + Math.sin(a) * r;
                if (world.isPositionClear(tx, ty, this.agent.radius)) return { x: tx, y: ty };
            }
        }
        return null;
    }

    scoreInterceptContact(world) {
        const mem = this.agent.memory;
        let bestHeatCell = null;
        let maxHeat = 0;
        
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
            
            const score = 1.0 + (maxHeat * 0.5);
            
            if (this.agent.memory.isUnreachable(target)) return { score: 0 };

            const movementMode = maxHeat > 5 ? 'BOUNDING' : 'TACTICAL';

            return { 
                type: 'MOVE', 
                target: target, 
                score: score, 
                description: 'moving toward a reported enemy',
                movementMode: movementMode 
            };
        }

        return { score: 0 };
    }
}
