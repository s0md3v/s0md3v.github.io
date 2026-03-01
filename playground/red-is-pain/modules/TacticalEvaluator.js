import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class TacticalEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
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
            
            // Prefer cover in control zones (retreating towards friends)
            let tacticalScore = dist + (heat * 100) - (control * 50) + (hazard * 500);

            if (isCircle) {
                // Bush: Good for hiding, Bad for suppression
                if (isSuppressed) tacticalScore += 2000;
                else tacticalScore -= 300;
            } else if (isSuppressed) {
                // Wall: Good for suppression
                tacticalScore -= 500;
            }
            
            // Directional Weight: Prefer cover that is BEHIND us relative to enemy
            const angleToCover = Utils.angle(this.agent.pos, {x: cx, y: cy});
            const angleToEnemy = Utils.angle(this.agent.pos, enemyPos);
            const angleDiff = Math.abs(Utils.angleDiff(angleToEnemy, angleToCover));
            if (angleDiff > Math.PI * 0.5) {
                 tacticalScore -= 200; // Bonus for retreating
            } else {
                 tacticalScore += 500; // Penalty for cover towards enemy
            }
            
            // HYSTERESIS: Prefer the cover we are already targeting to prevent flickering
            if (this.decision.lastAction && this.decision.lastAction.target) {
                // Check if this cover object contains/is near the last target
                const lastT = this.decision.lastAction.target;
                const dLast = Utils.distance(lastT, {x: cx, y: cy});
                // If last target is within 100px of this cover's center, give a massive bonus
                if (dLast < 100) {
                     tacticalScore -= 1500; // Sticky factor (Equivalent to 1500px distance or 15 heat levels)
                }
            }

            if (tacticalScore < bestTacticalScore) {
                let safeX = cx;
                let safeY = cy;
                const buffer = 25;
                const margin = 15;
                
                if (isCircle) {
                    // Bush: Hide inside/behind
                    const angleFromEnemy = Math.atan2(cy - enemyPos.y, cx - enemyPos.x);
                    safeX = cx + Math.cos(angleFromEnemy) * (c.radius * 0.5);
                    safeY = cy + Math.sin(angleFromEnemy) * (c.radius * 0.5);
                } else if (c.w > c.h) {
                    // Horizontal Wall
                    if (enemyPos.y < c.y) safeY = c.y + c.h + buffer; // Enemy above, hide below
                    else safeY = c.y - buffer; // Enemy below, hide above
                    
                    // Slide along the wall to be closest to agent, but within wall bounds
                    safeX = Utils.clamp(this.agent.pos.x, c.x + margin, c.x + c.w - margin);
                } else {
                    // Vertical Wall
                    if (enemyPos.x < c.x) safeX = c.x + c.w + buffer; // Enemy left, hide right
                    else safeX = c.x - buffer; // Enemy right, hide left
                    
                    safeY = Utils.clamp(this.agent.pos.y, c.y + margin, c.y + c.h - margin);
                }

                if (!this.isSpotBlocked(world, safeX, safeY)) {
                    // VERIFY COVERAGE: Does this spot actually block LOS to the enemy?
                    const safePos = { x: safeX, y: safeY };
                    
                    // 1. Flank Check (Geometric)
                    // If the cover is narrow and we are exposed from the side
                    // (Handled implicitly by LOS check, but good for scoring)
                    
                    // 2. Raycast Check (Crucial)
                    // Check if we can see the enemy from the safe spot. If yes, it's bad cover.
                    // We treat Bushes as transparent for "Safety" (we want hard cover)
                    // So we pass checkCovers=true (block by wall/cover), ignoring bushes/smoke
                    // If hasLineOfSight returns true, it means we are EXPOSED.
                    const isExposed = world.hasLineOfSight(safePos, enemyPos, Infinity, true);
                    
                    if (isExposed) {
                        tacticalScore += 5000; // Penalize heavily (effectively invalid)
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
        return bestTacticalScore > 4000 ? null : bestCoverPos; // Don't return exposed spots
    }

    findFlankSpot(world, enemyPos, side = null) {
        const vr = Config.AGENT.VISION_RADIUS;
        const radii = [vr * 0.6, vr * 0.4, vr * 0.8];
        const samples = 12;
        let bestSpot = null;
        let bestScore = -Infinity;

        // Reference Vector for Side calculation (Squad Center -> Enemy)
        const squadCenter = this.agent.getSquadCenter(world);
        const refVec = { x: enemyPos.x - squadCenter.x, y: enemyPos.y - squadCenter.y };

        for (const radius of radii) {
            for (let i = 0; i < samples; i++) {
                const angle = (i / samples) * Math.PI * 2;
                const tx = this.agent.pos.x + Math.cos(angle) * radius;
                const ty = this.agent.pos.y + Math.sin(angle) * radius;

                // Robust Collision Check
                if (this.isSpotBlocked(world, tx, ty)) continue;

                // SIDE CHECK
                if (side) {
                    const spotVec = { x: tx - squadCenter.x, y: ty - squadCenter.y };
                    // Cross product (2D)
                    const cross = (refVec.x * spotVec.y) - (refVec.y * spotVec.x);
                    
                    if (side === 'LEFT' && cross > 0) continue; // Wrong side (Screen coords y-down implies inverted cross usually, let's test)
                    // Actually in screen coords (y down):
                    // Cross > 0 is usually Left? No, X cross Y = Z. 
                    // Let's rely on standard: right hand rule. thumb up.
                    // If y is down... 
                    // Let's just assume Cross > 0 is one side, < 0 is other.
                    // If I want 'LEFT' relative to facing enemy, and I am at origin looking at enemy.
                    // Left is ...
                    // Let's use simple logic: 'LEFT' means cross < 0, 'RIGHT' means cross > 0?
                    // I will strictly enforce: LEFT = cross < 0, RIGHT = cross > 0.
                    // If it's swapped, they just flank the other way, which is fine as long as they agree.
                    
                    // Update: To be consistent with generally accepted "Left flank"
                    if (side === 'LEFT' && cross > 0) continue; 
                    if (side === 'RIGHT' && cross < 0) continue;
                }

                const distToEnemy = Utils.distance({x: tx, y: ty}, enemyPos);
                
                // Score: Closer is generally better for flanking/closing in
                // But avoid hugging the enemy (melee range)
                let score = (500 - distToEnemy) + (this.agent.traits.openness * 100);
                
                if (distToEnemy < 50) score -= 500; // Too close!
                
                // Prioritize spots that provide a new angle of attack (Angle difference)
                const angleToEnemyOld = Utils.angle(this.agent.pos, enemyPos);
                const angleToEnemyNew = Utils.angle({x: tx, y: ty}, enemyPos);
                const angleDiff = Math.abs(Utils.angleDiff(angleToEnemyOld, angleToEnemyNew));
                
                score += angleDiff * 100; // Bonus for changing the angle

                // Hazard Check
                const mem = this.agent.memory;
                const gridX = Math.floor((tx / world.width) * mem.gridCols);
                const gridY = Math.floor((ty / world.height) * mem.gridRows);
                const hazard = (gridX >= 0 && gridX < mem.gridCols && gridY >= 0 && gridY < mem.gridRows) 
                                ? (mem.hazardMap ? mem.hazardMap[gridY][gridX] : 0) : 0;
                
                score -= hazard * 50; // Vastly discourage flanking directly into a kill house
                
                if (score > bestScore) {
                    bestScore = score;
                    bestSpot = { x: tx, y: ty };
                }
            }
        }
        return bestSpot;
    }

    isSpotBlocked(world, x, y) {
        const r = Config.AGENT.RADIUS * 2; // Slightly larger than agent radius (10) for safety
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
            // Check if we are already there
            const dist = Utils.distance(this.agent.pos, nearestCover);
            if (dist < 40) {
                 // We are safe(ish). Hold Ground.
                 const enemy = this.decision.getThreatSource(world, true);
                 if (enemy) {
                     return { type: 'ATTACK', targetId: enemy.id, score: 2.0, movementMode: 'TACTICAL' };
                 } else {
                     return { type: 'IDLE', score: 1.0 };
                 }
            }
            // SMOKE SCREEN NUANCE: If we are retreating in the open and have smoke, throw it!
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
                          description: 'Retreat Smoke',
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
        if (!world.isWallAt(x, y)) return { x, y };

        const spiralStep = 20;
        for (let r = spiralStep; r < range; r += spiralStep) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                const tx = x + Math.cos(a) * r;
                const ty = y + Math.sin(a) * r;
                if (!world.isWallAt(tx, ty)) return { x: tx, y: ty };
            }
        }
        return { x, y };
    }

    scoreRegroup(world) {
        const squadCenter = this.agent.getSquadCenter(world);
        const distToSquad = Utils.distance(this.agent.pos, squadCenter);
        
        // Don't regroup if we are already "close enough" (Relaxed from 80 to 120)
        // We want a loose skirmish line, not a ball of death
        if (distToSquad < Config.AGENT.BATTLE_BUDDY_RADIUS * 1.5) return { type: 'NONE', score: 0 };

        const mem = this.agent.memory;
        const gx = Math.floor((squadCenter.x / world.width) * mem.gridCols);
        const gy = Math.floor((squadCenter.y / world.height) * mem.gridRows);
        let destinationHeat = 0;
        if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
            destinationHeat = mem.heatmap[gy][gx];
        }

        // Formation Offset: Ring around the center
        // Use ID to deterministically spread out
        const angle = (this.agent.id % 6) * (Math.PI / 3);
        const offsetDist = 50; // Slightly larger spread
        let target = {
            x: squadCenter.x + Math.cos(angle) * offsetDist,
            y: squadCenter.y + Math.sin(angle) * offsetDist
        };
        
        // Ensure formation point is valid
        target = this.findNearestValidPoint(world, target.x, target.y);

        // Factors: Squad proximity, low heat at destination, and morale
        // Reduced base score from 2.0 to 1.5 so it doesn't override Objective logic
        let score = (1.0 - (destinationHeat / 5)) * 1.5; 
        score += (this.agent.state.morale / 200);
        
        // If we are very far, score is lower (too detached to rally easily)
        if (distToSquad > 400) score *= 0.5;

        // If we are already being shot at (high stress), we are less likely to regroup and more likely to keep retreating
        if (this.agent.state.stress > 80) score *= 0.4;
        
        // If the destination is HOT, do NOT regroup there (Suicide prevention)
        if (destinationHeat > 5) score = 0;

        // ARRIVAL CHECK
        if (distToSquad < 60) score = 0; 

        return { type: 'MOVE', target: target, score: score, description: 'Regrouping' };
    }

    isPositionTacticallyValid(targetPos, enemyPos, world) {
        // Check 1: Does this position block an ally's shot?
        // Check 2: Is this position in an ally's line of fire?
        // Check 3: Does this PATH cross a known line of fire? (New)
        
        const dangerRadius = 25; // Increased buffer
        let valid = true;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                // Line: Ally -> Enemy (Ally's firing lane)
                const distToFireLine = Utils.distanceToSegment(targetPos, a.pos, enemyPos);
                if (distToFireLine < dangerRadius) {
                     valid = false;
                }
                
                // Line: TargetPos -> Enemy (My firing lane)
                // Don't move somewhere where an ally is in front of me
                const distAllyToMyLine = Utils.distanceToSegment(a.pos, targetPos, enemyPos);
                if (distAllyToMyLine < dangerRadius) {
                    valid = false;
                }
                
                // Path intersection check (simplified):
                // If the midpoint of my move is in the line of fire, it's risky
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
        const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
        if (!leader || leader === this.agent) return { type: 'NONE', score: 0 };

        // INSUBORDINATION CHECK (REALISM)
        const approvalFactor = this.agent.memory.leaderApproval / 100;
        
        // Check heat at destination
        const mem = this.agent.memory;
        const gx = Math.floor((leader.pos.x / world.width) * mem.gridCols);
        const gy = Math.floor((leader.pos.y / world.height) * mem.gridRows);
        const destinationHeat = (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) 
            ? mem.heatmap[gy][gx] : 0;
            
        // Suicide Order Check: High heat OR known enemy LOS
        const isSuicidal = destinationHeat > Config.WORLD.SUICIDE_ORDER_THRESHOLD;
        
        if (isSuicidal) {
             // Low agreeable agents refuse suicidal orders immediately
             // High agreeable agents might follow but take a massive stress hit
             const refusalChance = (1.0 - this.agent.traits.agreeableness) * (1.0 - approvalFactor);
             
             if (Math.random() < refusalChance) {
                 this.agent.addBark("NO WAY!");
                 this.agent.memory.modifyLeaderApproval(-5); // Losing faith
                 return { type: 'IDLE', score: 2.0 }; // Refuse
             } else {
                 // Follow but be stressed about it
                 this.agent.state.modifyStress(10);
             }
        }
        
        if (approvalFactor < 0.2) {
            if (Math.random() < 0.1) this.agent.addBark("Whatever...");
            return { type: 'IDLE', score: 1.0 }; // Passive resistance
        }

        // Formation Offset: Follow slightly behind/around leader
        const angle = (this.agent.id % 5) * (Math.PI / 2.5) + Math.PI; // Semicircle behind
        const offsetDist = 40 + (Math.floor(this.agent.id / 3) * 20); // Layers
        let target = {
            x: leader.pos.x + Math.cos(angle) * offsetDist,
            y: leader.pos.y + Math.sin(angle) * offsetDist
        };

        // Ensure valid
        target = this.findNearestValidPoint(world, target.x, target.y);

        // STUCK/ARRIVAL PREVENTION
        const dist = Utils.distance(this.agent.pos, target);
        if (dist < 20 || this.agent.memory.isUnreachable(target)) {
            return { type: 'IDLE', score: 0.1 }; // Stop moving if arrived or impossible
        }

        return { type: 'MOVE', target: target, score: 1, description: 'Following Leader' };
    }

    scoreSmokeTactics(world) {
        // Find nearest active smoke
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
        
        // SAFETY CHECK: Is the smoke "Hot"? (Taking enemy fire)
        // If bullets are flying through the smoke, it is NOT a screen, it is a Kill Zone.
        let incomingFire = 0;
        if (world.projectiles) {
            for (const p of world.projectiles) {
                // Check if projectile is hostile and inside/near smoke
                if (p.team !== this.agent.team) {
                    const dx = p.x - nearestSmoke.x;
                    const dy = p.y - nearestSmoke.y;
                    if ((dx*dx + dy*dy) < nearestSmoke.radius * nearestSmoke.radius) {
                        incomingFire++;
                    }
                }
            }
        }
        
        const isHotSmoke = incomingFire > 0;
        if (isHotSmoke) {
             // Abort smoke maneuvers!
             // Return a 'Wait' or 'Hold' to signify we see the smoke but it's dangerous
             // Use a moderate score so we don't override self-preservation, but we acknowledge the situation
             if (Math.random() < 0.05) this.agent.addBark("SMOKE IS HOT!");
             return { type: 'IDLE', score: 2.0, description: 'Waiting for Smoke Clear' };
        }

        const inSmoke = minDist < nearestSmoke.radius;
        const enemy = this.decision.getThreatSource(world, true);
        const enemyPos = enemy ? (enemy.lastKnownPosition || enemy.pos) : this.agent.sensory.getAverageEnemyPos(world);
        
        if (!enemyPos) return { score: 0 };

        const distEnemyToSmoke = Utils.distance(enemyPos, nearestSmoke);
        const isSmokeOnEnemy = distEnemyToSmoke < nearestSmoke.radius + 50;
        
        // TRAITS
        const isAggressive = (this.agent.traits.extraversion + (1 - this.agent.traits.agreeableness)) > 1.2;
        const isCQBWeapon = this.agent.state.inventory.weapon.optimalRange < 150;
        
        // CASE 1: I AM IN SMOKE (Disoriented / Vulnerable)
        if (inSmoke) {
            // REALISM: You don't stay in smoke unless you have to. You get out to clear fields of fire.
            // Move to the nearest edge roughly towards the enemy (if attacking) or away (if retreating)
            const angleToEnemy = Utils.angle(this.agent.pos, enemyPos);
            
            // If Aggressive/CQB: Push out the FRONT (Risk it for the biscuit)
            if (isAggressive || isCQBWeapon) {
                const target = {
                    x: nearestSmoke.x + Math.cos(angleToEnemy) * (nearestSmoke.radius + 30),
                    y: nearestSmoke.y + Math.sin(angleToEnemy) * (nearestSmoke.radius + 30)
                };
                 return { type: 'MOVE', target: target, score: 3.0, movementMode: 'BOUNDING', description: 'Assaulting Out' };
            }
            
            // Defensive: Back out or Side out
            // Find nearest edge relative to current position
            const angleFromCenter = Utils.angle(nearestSmoke, this.agent.pos);
            const target = {
                x: nearestSmoke.x + Math.cos(angleFromCenter) * (nearestSmoke.radius + 40),
                y: nearestSmoke.y + Math.sin(angleFromCenter) * (nearestSmoke.radius + 40)
            };
            return { type: 'MOVE', target: target, score: 4.0, movementMode: 'TACTICAL', description: 'Clearing Smoke' };
        }

        // CASE 2: SMOKE IS ON THE ENEMY (Opportunity)
        if (isSmokeOnEnemy) {
            // CQB/Aggressive: CLOSE DISTANCE while they are blind
            if (isAggressive || isCQBWeapon) {
                const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
                if (distToEnemy > 150) {
                     return { type: 'ATTACK', target: enemyPos, score: 3.0, movementMode: 'BOUNDING', description: 'Assault Blinded' };
                }
            }
            // Others: Suppress the smoke cloud (Handled by CombatEvaluator blindFire)
        }

        // CASE 3: SMOKE IS A SCREEN (Between us)
        // Check if smoke actually blocks LOS
        const distToSmoke = Utils.distance(this.agent.pos, nearestSmoke);
        const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
        const isScreening = distToSmoke < distToEnemy && Utils.distanceToSegment(nearestSmoke, this.agent.pos, enemyPos) < nearestSmoke.radius;

        if (isScreening) {
            // REALISM: Use the screen to move to better cover that was previously dangerous
            // 1. Find cover closer to enemy
            const betterCover = this.findNearestCover(world, 300); // Look for cover
            
            if (betterCover) {
                // Check if this cover is closer to enemy than we are
                const myDist = Utils.distance(this.agent.pos, enemyPos);
                const coverDist = Utils.distance(betterCover, enemyPos);
                
                if (coverDist < myDist - 50) {
                     // SCREENED ADVANCE: We can move because they can't see us
                     return { type: 'MOVE', target: betterCover, score: 2.5, movementMode: 'BOUNDING', description: 'Screened Advance' };
                }
            }
            
            // Flank around the screen
            const angleToSmoke = Utils.angle(this.agent.pos, nearestSmoke);
            const side = Math.random() > 0.5 ? 1 : -1;
            const flankAngle = angleToSmoke + (Math.PI / 2.5 * side); // Wide flank
            const flankDist = distToSmoke + 80; // Go around
            const target = {
                 x: this.agent.pos.x + Math.cos(flankAngle) * 100,
                 y: this.agent.pos.y + Math.sin(flankAngle) * 100
            };
            
            // Check if flank target is valid and safe(ish)
             if (world.isPositionClear(target.x, target.y, this.agent.radius)) {
                 // FLANK the smoke
                 return { type: 'MOVE', target: target, score: 2.5, movementMode: 'TACTICAL', description: 'Screen Flank' };
             }
        } else {
             // Smoke is nearby but useless? 
             // Maybe we should USE it?
             // If we are exposed and smoke is nearby, get BEHIND it relative to enemy
             const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
             const distToSmoke = Utils.distance(this.agent.pos, nearestSmoke);
             
             if (distToSmoke < 150 && distToSmoke < distToEnemy) {
                 // Move to put smoke between me and enemy
                 const angleEnemyToSmoke = Utils.angle(enemyPos, nearestSmoke);
                 const hideDist = nearestSmoke.radius + 50;
                 const target = {
                     x: nearestSmoke.x + Math.cos(angleEnemyToSmoke) * hideDist,
                     y: nearestSmoke.y + Math.sin(angleEnemyToSmoke) * hideDist
                 };
                 
                 if (Utils.distance(this.agent.pos, target) > 20 && world.isPositionClear(target.x, target.y, this.agent.radius)) {
                      return { type: 'MOVE', target: target, score: 2.2, movementMode: 'BOUNDING', description: 'Use Smoke Screen' };
                 }
             }
        }
        
        return { score: 0 };
    }
    findPeekSpot(world, enemyPos) {
        // 1. Find the cover we are currently using (or closest one)
        // We use a generous radius to find "the wall I'm hiding behind"
        const coverRadius = 60;
        let nearbyCover = null;
        let minDist = Infinity;

        // Optimization: Search covers and walls efficiently
        const allCoverObjects = [...world.covers, ...world.walls];
        for (const c of allCoverObjects) {
            const cx = c.x + c.w/2;
            const cy = c.y + c.h/2;
            const dist = Utils.distance(this.agent.pos, {x: cx, y: cy});
            
            // Check if we are actually close to this cover
            // Distance check needs to account for cover size (large walls)
            // Distance to center isn't enough for long walls.
            // Distance to Box:
            const distToBox = Utils.distanceToRect(this.agent.pos, c);
            
            if (distToBox < 40 && distToBox < minDist) {
                minDist = distToBox;
                nearbyCover = c;
            }
        }

        if (!nearbyCover) return null;

        // 2. Generate Candidate Corners
        // We project points slightly off each corner of the rectangle
        const margin = 20; // Step out distance
        const corners = [
            {x: nearbyCover.x - margin, y: nearbyCover.y - margin}, // Top Left
            {x: nearbyCover.x + nearbyCover.w + margin, y: nearbyCover.y - margin}, // Top Right
            {x: nearbyCover.x + nearbyCover.w + margin, y: nearbyCover.y + nearbyCover.h + margin}, // Bottom Right
            {x: nearbyCover.x - margin, y: nearbyCover.y + nearbyCover.h + margin} // Bottom Left
        ];

        // 3. Filter and Sort
        // Priority: 1. Has LOS to enemy. 2. Closest to me.
        const validSpots = [];
        
        for (const p of corners) {
            // Must be walkable
            if (!world.isPositionClear(p.x, p.y, this.agent.radius)) continue;
            
            // Must have LOS to enemy
            if (world.hasLineOfSight(p, enemyPos)) {
                validSpots.push(p);
            }
        }

        if (validSpots.length === 0) return null;

        // Sort by distance to current agent position + Hazard
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
