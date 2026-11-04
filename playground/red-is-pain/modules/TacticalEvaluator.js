import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';

export class TacticalEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
        this.orderFallback = null;
    }

    findNearestCover(world, range = Config.AGENT.VISION_RADIUS) {
        const mem = this.agent.memory;
        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return null;
        
        const enemyPos = enemy.lastKnownPosition || enemy.pos;
        const rangeSq = range * range;

        let bestCoverPos = null;
        let bestTacticalScore = Infinity; 
        
        const allCoverObjects = [...world.covers, ...world.walls, ...world.bushes];
        const isSuppressed = this.agent.state.suppression > 40;
        
        for (let i = 0; i < allCoverObjects.length; i++) {
            const c = allCoverObjects[i];
            const isCircle = c.radius !== undefined;
            const cx = isCircle ? c.x : c.x + c.w/2;
            const cy = isCircle ? c.y : c.y + c.h/2;
            
            const dx = this.agent.pos.x - cx;
            const dy = this.agent.pos.y - cy;
            const distSq = dx*dx + dy*dy;

            if (distSq > rangeSq) continue;
            const dist = Math.sqrt(distSq);

            const gridX = Math.floor((cx / world.width) * mem.gridCols);
            const gridY = Math.floor((cy / world.height) * mem.gridRows);
            
            const heat = (gridX >= 0 && gridX < mem.gridCols && gridY >= 0 && gridY < mem.gridRows) 
                         ? mem.heatmap[gridY][gridX] : 0;
            const control = (gridX >= 0 && gridX < mem.gridCols && gridY >= 0 && gridY < mem.gridRows) 
                            ? mem.controlMap[gridY][gridX] : 0;
            const hazard = (gridX >= 0 && gridX < mem.gridCols && gridY >= 0 && gridY < mem.gridRows) 
                            ? mem.hazardMap[gridY][gridX] : 0;
            
            let tacticalScore = dist + (heat * 100) - (control * 50) + (hazard * 500);

            if (isCircle) {
                if (isSuppressed) tacticalScore += 2000;
                else tacticalScore -= 300;
            } else if (isSuppressed) {
                tacticalScore -= 500;
            }
            
            const angleToCover = Utils.angle(this.agent.pos, {x: cx, y: cy});
            const angleToEnemy = Utils.angle(this.agent.pos, enemyPos);
            const angleDiff = Math.abs(Utils.angleDiff(angleToEnemy, angleToCover));
            if (angleDiff > Math.PI * 0.5) {
                 tacticalScore -= 200;
            } else {
                 tacticalScore += 500;
            }
            
            if (this.decision.lastAction && this.decision.lastAction.target) {
                const lastT = this.decision.lastAction.target;
                const dLast = Utils.distance(lastT, {x: cx, y: cy});
                if (dLast < 100) {
                     tacticalScore -= 1500;
                }
            }

            if (tacticalScore < bestTacticalScore) {
                let safeX = cx;
                let safeY = cy;
                const buffer = 25;
                const margin = 15;
                
                if (isCircle) {
                    const angleFromEnemy = Math.atan2(cy - enemyPos.y, cx - enemyPos.x);
                    safeX = cx + Math.cos(angleFromEnemy) * (c.radius * 0.5);
                    safeY = cy + Math.sin(angleFromEnemy) * (c.radius * 0.5);
                } else if (c.w > c.h) {
                    if (enemyPos.y < c.y) safeY = c.y + c.h + buffer;
                    else safeY = c.y - buffer;
                    
                    safeX = Utils.clamp(this.agent.pos.x, c.x + margin, c.x + c.w - margin);
                } else {
                    if (enemyPos.x < c.x) safeX = c.x + c.w + buffer;
                    else safeX = c.x - buffer;
                    
                    safeY = Utils.clamp(this.agent.pos.y, c.y + margin, c.y + c.h - margin);
                }

                if (!this.isSpotBlocked(world, safeX, safeY)) {
                    const safePos = { x: safeX, y: safeY };
                    
                    const isExposed = isCircle
                        ? world.hasVisualLine(safePos, enemyPos)
                        : world.hasClearShot(safePos, enemyPos);
                    
                    if (isExposed) {
                        tacticalScore += 5000;
                    }

                    if (!this.isPositionTacticallyValid(safePos, enemyPos, world)) {
                         tacticalScore += 2000; 
                    }

                    if (tacticalScore < bestTacticalScore) {
                        bestTacticalScore = tacticalScore;
                        bestCoverPos = safePos;
                    }
                }
            }
        }
        return bestTacticalScore > 4000 ? null : bestCoverPos;
    }

    findFlankSpot(world, enemyPos, side = null) {
        const vr = Config.AGENT.VISION_RADIUS;
        const radii = [vr * 0.6, vr * 0.4, vr * 0.8];
        const samples = 12;
        let bestSpot = null;
        let bestScore = -Infinity;

        const squadCenter = this.agent.getSquadCenter(world);
        const refVec = { x: enemyPos.x - squadCenter.x, y: enemyPos.y - squadCenter.y };

        for (const radius of radii) {
            for (let i = 0; i < samples; i++) {
                const angle = (i / samples) * Math.PI * 2;
                const tx = this.agent.pos.x + Math.cos(angle) * radius;
                const ty = this.agent.pos.y + Math.sin(angle) * radius;

                if (this.isSpotBlocked(world, tx, ty)) continue;

                if (side) {
                    const spotVec = { x: tx - squadCenter.x, y: ty - squadCenter.y };
                    const cross = (refVec.x * spotVec.y) - (refVec.y * spotVec.x);
                    
                    if (side === 'LEFT' && cross > 0) continue;
                    
                    if (side === 'LEFT' && cross > 0) continue; 
                    if (side === 'RIGHT' && cross < 0) continue;
                }

                const distToEnemy = Utils.distance({x: tx, y: ty}, enemyPos);
                
                let score = (500 - distToEnemy) + (this.agent.traits.openness * 100);
                
                if (distToEnemy < 50) score -= 500;
                
                const angleToEnemyOld = Utils.angle(this.agent.pos, enemyPos);
                const angleToEnemyNew = Utils.angle({x: tx, y: ty}, enemyPos);
                const angleDiff = Math.abs(Utils.angleDiff(angleToEnemyOld, angleToEnemyNew));
                
                score += angleDiff * 100;

                const mem = this.agent.memory;
                const gridX = Math.floor((tx / world.width) * mem.gridCols);
                const gridY = Math.floor((ty / world.height) * mem.gridRows);
                const hazard = (gridX >= 0 && gridX < mem.gridCols && gridY >= 0 && gridY < mem.gridRows) 
                                ? (mem.hazardMap ? mem.hazardMap[gridY][gridX] : 0) : 0;
                
                score -= hazard * 50;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestSpot = { x: tx, y: ty };
                }
            }
        }
        return bestSpot;
    }

    isSpotBlocked(world, x, y) {
        const r = Config.AGENT.RADIUS * 2;
        if (world.isWallAt(x, y)) return true;
        if (world.isWallAt(x + r, y)) return true;
        if (world.isWallAt(x - r, y)) return true;
        if (world.isWallAt(x, y + r)) return true;
        if (world.isWallAt(x, y - r)) return true;
        return false;
    }

    scoreRetreat(world) {
        const nearestCover = this.findNearestCover(world);
        if (nearestCover) {
            const dist = Utils.distance(this.agent.pos, nearestCover);
            if (dist < 40) {
                 const enemy = this.decision.getThreatSource(world, true);
                 if (enemy) {
                     return { type: 'ATTACK', targetId: enemy.id, score: 2.0, movementMode: 'TACTICAL' };
                 } else {
                     return { type: 'IDLE', score: 1.0 };
                 }
            }
            const inOpen = !this.agent.brain.isSafe(world);
            const hasSmoke = this.agent.state.inventory.utility.some(u => u.type === 'SmokeGrenade' && u.count > 0);
            
            if (inOpen && hasSmoke) {
                 const enemy = this.decision.getThreatSource(world, true);
                 const smokeTarget = enemy ? (enemy.pos || enemy.lastKnownPosition) : null;
                 if (smokeTarget) {
                      return { 
                          type: 'THROW', 
                          grenadeType: 'SmokeGrenade', 
                          target: smokeTarget, 
                          score: 3.0, 
                          description: 'throwing smoke to retreat',
                          nextAction: { type: 'RETREAT', target: nearestCover, score: 3.0, movementMode: 'BOUNDING' }
                      };
                 }
            }

            return { type: 'RETREAT', target: nearestCover, score: 1, movementMode: 'BOUNDING' };
        }
        
        if (nearestCover && this.agent.memory.isUnreachable(nearestCover)) {
             return { type: 'NONE', score: 0 };
        }
        
        return { type: 'RETREAT', score: 1, movementMode: 'BOUNDING' };
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

    scoreOrderFallback(world, orderKey) {
        if (!this.orderFallback || this.orderFallback.orderKey !== orderKey) {
            const awayFromOrder = Utils.angle(this.agent.squad.currentOrder.target, this.agent.pos);
            let fallbackTarget = null;

            // The deterministic offset keeps every decision tick from choosing
            // a different point and creating another oscillation.
            for (const radius of [35, 55, 75]) {
                for (let i = 0; i < 8; i++) {
                    const angle = awayFromOrder + (this.agent.id % 3 - 1) * 0.35 + i * Math.PI / 4;
                    const candidate = {
                        x: this.agent.pos.x + Math.cos(angle) * radius,
                        y: this.agent.pos.y + Math.sin(angle) * radius
                    };
                    if (!world.isPositionClear(candidate.x, candidate.y, this.agent.radius)) continue;
                    if (!world.hasMovementLine(this.agent.pos, candidate, radius + 5)) continue;
                    fallbackTarget = candidate;
                    break;
                }
                if (fallbackTarget) break;
            }

            this.orderFallback = { orderKey, target: fallbackTarget };
        }

        const fallback = this.orderFallback.target;
        if (!fallback || Utils.distance(this.agent.pos, fallback) < 18) {
            return {
                type: 'HOLD',
                target: fallback || { ...this.agent.pos },
                score: 1.1,
                orderKey,
                description: 'scanning while awaiting a new route'
            };
        }

        return {
            type: 'MOVE',
            target: fallback,
            score: 1.1,
            orderKey,
            description: 'repositioning to scan',
            movementMode: 'TACTICAL'
        };
    }

    scoreRegroup(world) {
        const squadCenter = this.agent.getSquadCenter(world);
        const distToSquad = Utils.distance(this.agent.pos, squadCenter);
        
        if (distToSquad < Config.AGENT.BATTLE_BUDDY_RADIUS * 1.5) return { type: 'NONE', score: 0 };

        const mem = this.agent.memory;
        const gx = Math.floor((squadCenter.x / world.width) * mem.gridCols);
        const gy = Math.floor((squadCenter.y / world.height) * mem.gridRows);
        let destinationHeat = 0;
        if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
            destinationHeat = mem.heatmap[gy][gx];
        }

        const angle = (this.agent.id % 6) * (Math.PI / 3);
        const offsetDist = 50;
        let target = {
            x: squadCenter.x + Math.cos(angle) * offsetDist,
            y: squadCenter.y + Math.sin(angle) * offsetDist
        };
        
        target = this.findNearestValidPoint(world, target.x, target.y);
        if (!target) return { type: 'NONE', score: 0 };

        let score = (1.0 - (destinationHeat / 5)) * 1.5; 
        score += (this.agent.state.morale / 200);
        
        if (distToSquad > 400) score *= 0.5;

        if (this.agent.state.stress > 80) score *= 0.4;
        
        if (destinationHeat > 5) score = 0;

        if (distToSquad < 60) score = 0; 

        return { type: 'MOVE', target: target, score: score, description: 'regrouping with the squad' };
    }

    isPositionTacticallyValid(targetPos, enemyPos, world) {
        const dangerRadius = 25;
        let valid = true;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                const distToFireLine = Utils.distanceToSegment(targetPos, a.pos, enemyPos);
                if (distToFireLine < dangerRadius) {
                     valid = false;
                }
                
                const distAllyToMyLine = Utils.distanceToSegment(a.pos, targetPos, enemyPos);
                if (distAllyToMyLine < dangerRadius) {
                    valid = false;
                }
                
                const midPoint = {
                    x: (this.agent.pos.x + targetPos.x) / 2,
                    y: (this.agent.pos.y + targetPos.y) / 2
                };
                if (Utils.distanceToSegment(midPoint, a.pos, enemyPos) < dangerRadius) {
                    valid = false;
                }
            }
        });
        
        return valid;
    }

    scoreFollowOrder(world) {
        const leader = this.agent.squad?.leader;
        const order = this.agent.squad?.currentOrder;
        if (!leader || leader.state.isDead || !order?.target) return { type: 'NONE', score: 0 };
        const orderKey = `${order.type}:${Math.round(order.target.x / 16)}:${Math.round(order.target.y / 16)}`;

        if (this.orderFallback?.orderKey === orderKey) {
            return this.scoreOrderFallback(world, orderKey);
        }
        this.orderFallback = null;

        const approvalFactor = this.agent.memory.leaderApproval / 100;
        
        const mem = this.agent.memory;
        const gx = Math.floor((order.target.x / world.width) * mem.gridCols);
        const gy = Math.floor((order.target.y / world.height) * mem.gridRows);
        const destinationHeat = (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) 
            ? mem.heatmap[gy][gx] : 0;
            
        const isSuicidal = destinationHeat > Config.AGENT.SUICIDE_ORDER_THRESHOLD;
        
        if (isSuicidal && leader !== this.agent) {
             const refusalChance = (1.0 - this.agent.traits.agreeableness) * (1.0 - approvalFactor);
             
             if (Math.random() < refusalChance) {
                 this.agent.addBark("NO WAY!");
                 this.agent.memory.modifyLeaderApproval(-5);
                 return { type: 'IDLE', score: 2.0 };
             } else {
                 this.agent.state.modifyStress(10);
             }
        }
        
        if (leader !== this.agent && approvalFactor < 0.2) {
            if (Math.random() < 0.1) this.agent.addBark("Whatever...");
            return { type: 'IDLE', score: 1.0 };
        }

        const angle = (this.agent.id % 6) * (Math.PI * 2 / 6);
        const offsetDist = leader === this.agent ? 0 : 25 + (this.agent.id % 2) * 15;
        let target = {
            x: order.target.x + Math.cos(angle) * offsetDist,
            y: order.target.y + Math.sin(angle) * offsetDist
        };

        target = this.findNearestValidPoint(world, target.x, target.y);
        if (!target) return this.scoreOrderFallback(world, orderKey);

        const dist = Utils.distance(this.agent.pos, target);
        const continuingHold = this.agent.currentAction?.type === 'HOLD'
            && this.agent.currentAction.orderKey === orderKey;
        const settleRadius = continuingHold ? 45 : 24;

        if (dist < settleRadius) {
            return {
                type: 'HOLD',
                target,
                score: 1.2,
                orderKey,
                description: 'scanning the assigned area'
            };
        }

        if (this.agent.memory.isUnreachable(target)) {
            return this.scoreOrderFallback(world, orderKey);
        }

        if (order.type === 'DEFEND' && dist < 70) {
            return { type: 'HOLD', target, score: 1.2, orderKey, description: 'scanning the assigned area' };
        }

        const descriptions = {
            ATTACK: 'Advancing on Contact',
            RETREAT: 'Squad Withdrawal',
            REGROUP: 'regrouping with the squad',
            MOVE: order.description === 'STRATEGIC_EXPLORE' ? 'searching for enemies' : 'following an order'
        };

        return {
            type: 'MOVE',
            target,
            score: order.type === 'ATTACK' ? 1.5 : 1.2,
            orderKey,
            description: descriptions[order.type] || 'following an order',
            movementMode: order.type === 'RETREAT' ? 'BOUNDING' : 'TACTICAL'
        };
    }

    scoreSmokeTactics(world) {
        const smokes = world.smokes || [];
        if (smokes.length === 0) return { score: 0 };

        let nearestSmoke = null;
        let minDist = Infinity;
        
        for (const s of smokes) {
            const d = Utils.distance(this.agent.pos, s);
            if (d < minDist) {
                minDist = d;
                nearestSmoke = s;
            }
        }

        if (!nearestSmoke || minDist > 500) return { score: 0 };
        
        let incomingFire = 0;
        if (world.projectiles) {
            for (const p of world.projectiles) {
                if (p.team !== this.agent.team) {
                    const dx = p.pos.x - nearestSmoke.x;
                    const dy = p.pos.y - nearestSmoke.y;
                    if ((dx*dx + dy*dy) < nearestSmoke.radius * nearestSmoke.radius) {
                        incomingFire++;
                    }
                }
            }
        }
        
        const isHotSmoke = incomingFire > 0;
        if (isHotSmoke) {
             if (Math.random() < 0.05) this.agent.addBark("SMOKE IS HOT!");
             return { type: 'IDLE', score: 2.0, description: 'waiting for smoke to clear' };
        }

        const inSmoke = minDist < nearestSmoke.radius;
        const enemy = this.decision.getThreatSource(world, true);
        const enemyPos = enemy ? (enemy.lastKnownPosition || enemy.pos) : this.agent.sensory.getAverageEnemyPos(world);
        
        if (!enemyPos) return { score: 0 };

        const distEnemyToSmoke = Utils.distance(enemyPos, nearestSmoke);
        const isSmokeOnEnemy = distEnemyToSmoke < nearestSmoke.radius + 50;
        
        const isAggressive = (this.agent.traits.extraversion + (1 - this.agent.traits.agreeableness)) > 1.2;
        const isCQBWeapon = this.agent.state.inventory.weapon.optimalRange < 150;
        
        if (inSmoke) {
            const angleToEnemy = Utils.angle(this.agent.pos, enemyPos);
            
            if (isAggressive || isCQBWeapon) {
                const target = {
                    x: nearestSmoke.x + Math.cos(angleToEnemy) * (nearestSmoke.radius + 30),
                    y: nearestSmoke.y + Math.sin(angleToEnemy) * (nearestSmoke.radius + 30)
                };
                 return { type: 'MOVE', target: target, score: 3.0, movementMode: 'BOUNDING', description: 'pushing out of the smoke' };
            }
            
            const angleFromCenter = Utils.angle(nearestSmoke, this.agent.pos);
            const target = {
                x: nearestSmoke.x + Math.cos(angleFromCenter) * (nearestSmoke.radius + 40),
                y: nearestSmoke.y + Math.sin(angleFromCenter) * (nearestSmoke.radius + 40)
            };
            return { type: 'MOVE', target: target, score: 4.0, movementMode: 'TACTICAL', description: 'leaving the smoke' };
        }

        if (isSmokeOnEnemy) {
            if (isAggressive || isCQBWeapon) {
                const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
                if (distToEnemy > 150) {
                     return { type: 'ATTACK', target: enemyPos, score: 3.0, movementMode: 'BOUNDING', description: 'rushing a hidden enemy' };
                }
            }
        }

        const distToSmoke = Utils.distance(this.agent.pos, nearestSmoke);
        const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
        const isScreening = distToSmoke < distToEnemy && Utils.distanceToSegment(nearestSmoke, this.agent.pos, enemyPos) < nearestSmoke.radius;

        if (isScreening) {
            const betterCover = this.findNearestCover(world, 300);
            
            if (betterCover) {
                const myDist = Utils.distance(this.agent.pos, enemyPos);
                const coverDist = Utils.distance(betterCover, enemyPos);
                
                if (coverDist < myDist - 50) {
                     return { type: 'MOVE', target: betterCover, score: 2.5, movementMode: 'BOUNDING', description: 'advancing behind smoke' };
                }
            }
            
            const angleToSmoke = Utils.angle(this.agent.pos, nearestSmoke);
            const side = Math.random() > 0.5 ? 1 : -1;
            const flankAngle = angleToSmoke + (Math.PI / 2.5 * side);
            const flankDist = distToSmoke + 80;
            const target = {
                 x: this.agent.pos.x + Math.cos(flankAngle) * 100,
                 y: this.agent.pos.y + Math.sin(flankAngle) * 100
            };
            
             if (world.isPositionClear(target.x, target.y, this.agent.radius)) {
                 return { type: 'MOVE', target: target, score: 2.5, movementMode: 'TACTICAL', description: 'moving around the enemy behind smoke' };
             }
        } else {
             const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
             const distToSmoke = Utils.distance(this.agent.pos, nearestSmoke);
             
             if (distToSmoke < 150 && distToSmoke < distToEnemy) {
                 const angleEnemyToSmoke = Utils.angle(enemyPos, nearestSmoke);
                 const hideDist = nearestSmoke.radius + 50;
                 const target = {
                     x: nearestSmoke.x + Math.cos(angleEnemyToSmoke) * hideDist,
                     y: nearestSmoke.y + Math.sin(angleEnemyToSmoke) * hideDist
                 };
                 
                 if (Utils.distance(this.agent.pos, target) > 20 && world.isPositionClear(target.x, target.y, this.agent.radius)) {
                      return { type: 'MOVE', target: target, score: 2.2, movementMode: 'BOUNDING', description: 'moving behind smoke' };
                 }
             }
        }
        
        return { score: 0 };
    }
    findPeekSpot(world, enemyPos) {
        const coverRadius = 60;
        let nearbyCover = null;
        let minDist = Infinity;

        const allCoverObjects = [...world.covers, ...world.walls];
        for (const c of allCoverObjects) {
            const cx = c.x + c.w/2;
            const cy = c.y + c.h/2;
            const dist = Utils.distance(this.agent.pos, {x: cx, y: cy});
            
            const distToBox = Utils.distanceToRect(this.agent.pos, c);
            
            if (distToBox < 40 && distToBox < minDist) {
                minDist = distToBox;
                nearbyCover = c;
            }
        }

        if (!nearbyCover) return null;

        const margin = 20;
        const corners = [
            {x: nearbyCover.x - margin, y: nearbyCover.y - margin},
            {x: nearbyCover.x + nearbyCover.w + margin, y: nearbyCover.y - margin},
            {x: nearbyCover.x + nearbyCover.w + margin, y: nearbyCover.y + nearbyCover.h + margin},
            {x: nearbyCover.x - margin, y: nearbyCover.y + nearbyCover.h + margin}
        ];

        const validSpots = [];
        
        for (const p of corners) {
            if (!world.isPositionClear(p.x, p.y, this.agent.radius)) continue;
            
            if (world.hasVisualLine(p, enemyPos)) {
                validSpots.push(p);
            }
        }

        if (validSpots.length === 0) return null;

        validSpots.sort((a, b) => {
             const m = this.agent.memory;
             const ax = Math.floor((a.x / world.width) * m.gridCols);
             const ay = Math.floor((a.y / world.height) * m.gridRows);
             const bx = Math.floor((b.x / world.width) * m.gridCols);
             const by = Math.floor((b.y / world.height) * m.gridRows);
             
             const ah = (ax >= 0 && ax < m.gridCols && ay >= 0 && ay < m.gridRows && m.hazardMap) ? m.hazardMap[ay][ax] : 0;
             const bh = (bx >= 0 && bx < m.gridCols && by >= 0 && by < m.gridRows && m.hazardMap) ? m.hazardMap[by][bx] : 0;
             
             const costA = Utils.distance(this.agent.pos, a) + (ah * 50);
             const costB = Utils.distance(this.agent.pos, b) + (bh * 50);
             
             return costA - costB;
        });

        return validSpots[0];
    }
}
