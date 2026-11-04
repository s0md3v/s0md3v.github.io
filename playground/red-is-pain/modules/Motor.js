import { Config } from './Config.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';

export class Motor {
    constructor(agent) {
        this.agent = agent;
        this.smoothedMoveAngle = agent.angle || 0;
        this._lastPathCheckTime = 0;
    }

    rotateTowards(angle, dt, turnRate = Config.AGENT.TURN_SPEED, snap = false) {
        if (snap) {
            this.agent.angle = angle;
            this.agent.targetAngle = angle;
            return;
        }

        let diff = angle - this.agent.angle;
        while (diff <= -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const maxTurn = turnRate * (dt / 1000);
        
        if (Math.abs(diff) < maxTurn) {
            this.agent.angle = angle;
        } else {
            this.agent.angle += Math.sign(diff) * maxTurn;
        }
    }

    calculateCurrentSpeed(world) {
        const modeConfig = Config.AGENT.MODES[this.agent.movementMode] || Config.AGENT.MODES.TACTICAL;
        let baseSpeed = Config.AGENT.MOVE_SPEED * modeConfig.SPEED_MULT;
        
        baseSpeed *= this.agent.state.speedMod;

        const staminaPercent = this.agent.state.stamina / Config.AGENT.MAX_STAMINA;
        if (staminaPercent < 0.2) {
            baseSpeed *= 0.4;
            if (this.agent.movementMode === 'BOUNDING') this.agent.movementMode = 'TACTICAL';
        } else if (staminaPercent < 0.5) {
            const t = (staminaPercent - 0.2) / 0.3;
            baseSpeed *= (0.4 + t * 0.6); 
        }

        if (this.agent.state.stress > 90) baseSpeed *= 1.3;
        else if (this.agent.state.stress > 60) baseSpeed *= 1.15;

        baseSpeed *= (1 - (this.agent.state.suppression / 200)); 

        const hpPercent = this.agent.state.hp / this.agent.state.maxHp;
        if (hpPercent < 0.3) baseSpeed *= 0.7;

        if (this.agent.state.isPinned) baseSpeed *= 0.1;

        const gx = Math.floor(this.agent.pos.x / Config.WORLD.GRID_SIZE);
        const gy = Math.floor(this.agent.pos.y / Config.WORLD.GRID_SIZE);
        if (world.grid[gy] && world.grid[gy][gx] === 2) {
            baseSpeed *= 0.6;
        }

        return baseSpeed;
    }

    moveTo(targetPos, dt, world, turnSpeed = Config.AGENT.TURN_SPEED, speedMultiplier = 1.0, lookTarget = null, zigZag = false) {
        if (!targetPos) {
            this.agent.isMoving = false;
            return;
        }
        this.agent.isMoving = true;
        
        const distToFinalTarget = Utils.distance(this.agent.pos, targetPos);
        const now = Date.now();
        
        const targetMoved = !this.agent.lastPathTarget || Utils.distance(this.agent.lastPathTarget, targetPos) > 15;
        const periodicCheck = now - this._lastPathCheckTime > 1000;
        const pathEmptyButNotThere = (!this.agent.path || this.agent.path.length === 0) &&
            distToFinalTarget > 20 && now - this._lastPathCheckTime > 500;

        if (targetMoved || periodicCheck || pathEmptyButNotThere) {
            this._lastPathCheckTime = now;
            const preferStealth = (this.agent.movementMode === 'SNEAKING' || this.agent.movementMode === 'COVERING');
            this.agent.path = world.findPath(this.agent.pos, targetPos, this.agent.memory.heatmap, preferStealth, this.agent.memory.hazardMap);
            
            if (!this.agent.path || this.agent.path.length === 0) {
                 this.agent.memory.markUnreachable(targetPos);
                 
                 if (this.agent.currentAction && (this.agent.currentAction.type === 'MOVE' || this.agent.currentAction.type === 'RETREAT')) {
                     this.agent.currentAction = { type: 'IDLE', score: 0 };
                     this.agent.isMoving = false;
                     return;
                 }
            }

            this.agent.lastPathTarget = { ...targetPos };
        }

        let activeTarget = targetPos;
        if (this.agent.path && this.agent.path.length > 0) {
            activeTarget = this.agent.path[0];
            if (Utils.distance(this.agent.pos, activeTarget) < 8) {
                this.agent.path.shift();
                if (this.agent.path.length > 0) activeTarget = this.agent.path[0];
                else activeTarget = targetPos;
            }
        }

        let desiredX = activeTarget.x - this.agent.pos.x;
        let desiredY = activeTarget.y - this.agent.pos.y;
        
        const distToActive = Utils.distance(this.agent.pos, activeTarget);
        if (distToActive > 0) {
            desiredX /= distToActive;
            desiredY /= distToActive;
        }

        const separationRadius = 15;
        const neighbors = world.spatial.query(this.agent.pos.x, this.agent.pos.y, separationRadius + 10); 
        let avoidX = 0;
        let avoidY = 0;
        
        const avgEnemy = this.agent.sensory.getAverageEnemyPos(world);
        let enemyAngle = 0;
        let hasEnemy = false;
        
        if (avgEnemy) {
            enemyAngle = Utils.angle(this.agent.pos, avgEnemy);
            hasEnemy = true;
        }

        neighbors.forEach(n => {
            if (n !== this.agent && n.team === this.agent.team && !n.isCover) {
                if (!isFinite(n.pos.x) || !isFinite(n.pos.y)) return;
                const dist = Utils.distance(this.agent.pos, n.pos);
                if (dist < separationRadius && dist > 0) {
                    let pushStrength = Math.pow((separationRadius - dist) / separationRadius, 2); 
                    const angleToMe = Utils.angle(n.pos, this.agent.pos);
                    
                    if (hasEnemy && dist > 20) {
                         const relAngle = angleToMe - enemyAngle;
                         const normRel = Math.atan2(Math.sin(relAngle), Math.cos(relAngle));
                         const perpAngle = enemyAngle + (normRel > 0 ? Math.PI/2 : -Math.PI/2);
                         
                         avoidX += Math.cos(perpAngle) * pushStrength * 0.4;
                         avoidY += Math.sin(perpAngle) * pushStrength * 0.4;
                    } else {
                        avoidX += Math.cos(angleToMe) * pushStrength * 1.5;
                        avoidY += Math.sin(angleToMe) * pushStrength * 1.5;
                    }

                    if (n.isMoving) {
                        const relativePos = { x: n.pos.x - this.agent.pos.x, y: n.pos.y - this.agent.pos.y };
                        const dot = desiredX * relativePos.x + desiredY * relativePos.y;
                        if (dot > 0) { 
                             const perpX = -desiredY;
                             const perpY = desiredX;
                             const side = (relativePos.x * perpX + relativePos.y * perpY) > 0 ? 1 : -1;
                             avoidX += perpX * side * pushStrength * 1.0;
                             avoidY += perpY * side * pushStrength * 1.0;
                        }
                    }
                }
            }
        });

        const rawAvoidMag = Math.sqrt(avoidX * avoidX + avoidY * avoidY);
        let maxAvoid = 0.8; 
        
        if (rawAvoidMag > 0.8) {
             maxAvoid = 2.0; 
        }

        if (rawAvoidMag > maxAvoid) {
            avoidX = (avoidX / rawAvoidMag) * maxAvoid;
            avoidY = (avoidY / rawAvoidMag) * maxAvoid;
        }

        const finalX = desiredX + avoidX;
        const finalY = desiredY + avoidY;
        
        const rawMoveAngle = Math.atan2(finalY, finalX);
        
        this.smoothedMoveAngle = Utils.lerpAngle(this.smoothedMoveAngle, rawMoveAngle, 0.35);
        let moveAngle = this.smoothedMoveAngle;

        if (zigZag) {
             const time = Date.now() / 1000;
             const freq = 6.0; // Hz
             const amp = 0.5; // rad
             moveAngle += Math.sin(time * freq) * amp;
        }
        
        let currentSpeed = this.calculateCurrentSpeed(world) * (Number.isFinite(speedMultiplier) ? speedMultiplier : 1.0);
        const mode = this.agent.movementMode;
        
        if (mode === 'BOUNDING') {
            this.agent.targetAngle = moveAngle;
            this.rotateTowards(
                moveAngle,
                dt,
                Config.AGENT.TURN_SPEED * Config.AGENT.MODES.BOUNDING.TURN_MULT
            );
        } else {
            let actualLookAngle = moveAngle;
            
            if (lookTarget) {
                actualLookAngle = Utils.angle(this.agent.pos, lookTarget);
            } else if (this.agent.targetAngle !== undefined) {
                actualLookAngle = this.agent.targetAngle;
            }

            const angleDiff = Math.abs(Utils.angleDiff(actualLookAngle, moveAngle));
            
            const penalty = Utils.lerp(1.0, 0.7, angleDiff / Math.PI);
            currentSpeed *= penalty;

            this.rotateTowards(actualLookAngle, dt, turnSpeed);
        }

        let dist = currentSpeed * (dt / 1000);

        if (distToActive < 3.0) {
             dist = Math.min(dist, distToActive);
             if (distToActive < 2.0) {
                 if (isFinite(activeTarget.x) && isFinite(activeTarget.y)) {
                    this.agent.pos.x = activeTarget.x;
                    this.agent.pos.y = activeTarget.y;
                 }
                 
                 if (activeTarget === targetPos) {
                     this.agent.isMoving = false;
                 }
                 return; 
             }
        }

        const drainRate = Config.AGENT.MODES[this.agent.movementMode].DRAIN;
        this.agent.state.consumeStamina(drainRate * dt);
        
        const nextX = this.agent.pos.x + Math.cos(moveAngle) * dist;
        const nextY = this.agent.pos.y + Math.sin(moveAngle) * dist;

        const PHYSICS_STEP_MS = 10;
        let remainingDt = dt;
        if (remainingDt > 50) remainingDt = 50; 

        while (remainingDt > 0) {
            const stepDt = Math.min(remainingDt, PHYSICS_STEP_MS);
            remainingDt -= stepDt;
            const stepDist = currentSpeed * (stepDt / 1000);
            const stepX = this.agent.pos.x + Math.cos(moveAngle) * stepDist;
            const stepY = this.agent.pos.y + Math.sin(moveAngle) * stepDist;
            
            if (!isNaN(stepX) && !isNaN(stepY)) {
                this.agent.pos.x = stepX;
                this.agent.pos.y = stepY;
            }

            const resolved = world.resolveCollision(this.agent.pos.x, this.agent.pos.y, this.agent.radius);
            if (!isNaN(resolved.x) && !isNaN(resolved.y)) {
                this.agent.pos.x = resolved.x;
                this.agent.pos.y = resolved.y;
            }
        }
    }
}
