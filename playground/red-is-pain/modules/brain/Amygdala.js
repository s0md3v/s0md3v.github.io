import { Utils } from '../Utils.js?v=field-console-14';
import { Config } from '../Config.js?v=field-console-14';

export class Amygdala {
    constructor(agent) {
        this.agent = agent;
        this.lastContactReportTime = 0;
        this.lastVisibleCount = 0;
    }

    update(dt, world) {
        const now = Date.now();

        let stressBaseline = this.agent.traits.neuroticism * 10; 
        stressBaseline += this.agent.memory.traumaLevel;

        const mem = this.agent.memory;
        const gx = Math.floor((this.agent.pos.x / world.width) * mem.gridCols);
        const gy = Math.floor((this.agent.pos.y / world.height) * mem.gridRows);
        let localHeat = 0;
        if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
            localHeat = mem.heatmap[gy][gx];
        }

        const visibleEnemies = this.agent.sensory.scan(world).filter(a => a.team !== this.agent.team && this.agent.memory.isSpotted(a.id));

        if (visibleEnemies.length > 0 && this.lastVisibleCount === 0) {
            const timeSinceReport = now - this.lastContactReportTime;
            
            if (timeSinceReport > 10000) {
                const spike = visibleEnemies.length * Config.AGENT.STRESS_SPIKE_SIGHT;
                this.agent.state.modifyStress(spike);
                this.agent.addBark("CONTACT!");
                this.lastContactReportTime = now;
            }
        }
        this.lastVisibleCount = visibleEnemies.length;

        if (localHeat > 4 && visibleEnemies.length === 0) {
            const neuroticMult = 1.0 + (this.agent.traits.neuroticism * 2.5);
            this.agent.state.modifyStress(Config.AGENT.UNCERTAINTY_STRESS_RATE * dt * neuroticMult);
        }

        if (this.agent.state.stress > stressBaseline) {
            this.agent.state.stress = Math.max(stressBaseline, this.agent.state.stress - (dt * Config.AGENT.STRESS_DECAY_ISOLATED));
        }
        
        this.handleGrenadeReactions(dt, world);
    }

    handleGrenadeReactions(dt, world) {
        for (const p of world.projectiles) {
            if ((p.type === 'GRENADE' || p.type === 'SMOKE') && p.active) {
                 const dist = Utils.distance(this.agent.pos, p.pos);
                 const dangerRadius = p.type === 'GRENADE' ? Config.PHYSICS.FRAG_RADIUS * 1.5 : 40;
                 
                 if (dist < dangerRadius) {
                     const isTeammate = p.team === this.agent.team;
                     
                     if (p.type === 'GRENADE') {
                         const panicShoutProb = (this.agent.traits.neuroticism * 0.6) + (this.agent.traits.extraversion * 0.3);
                         const warningShoutProb = (this.agent.traits.agreeableness * 0.7) + (this.agent.traits.extraversion * 0.2);

                         if (p.ownerId === this.agent.id) {
                            if (dist < 60 && Math.random() < (this.agent.traits.extraversion * 0.8)) {
                                this.agent.addBark("OOPS!");
                            }
                         } else if (isTeammate) {
                             if (Math.random() < warningShoutProb) {
                                 this.agent.addBark(dist < 60 ? "WATCH IT!" : "FRAG!");
                             }
                         } else {
                             if (Math.random() < panicShoutProb) {
                                 this.agent.addBark("GRENADE!");
                             }
                         }
                     } else if (p.type === 'SMOKE') {
                         const smokeObserveProb = this.agent.traits.extraversion * 0.3;
                         if (Math.random() < smokeObserveProb && !isTeammate) {
                             this.agent.addBark("SMOKE!");
                         }
                     }
                 }
            }
        }
    }

    evaluate(world) {
        const stress = this.agent.state.stress;
        const suppression = this.agent.state.suppression;
        const health = this.agent.state.hp / this.agent.state.maxHp;
        
        let priority = 0;
        let action = { type: 'IDLE', score: 0 };

        const balance = this.getForceBalance(world);
        const isOutnumbered = balance < 0.5;
        const isHeavilyOutnumbered = balance < 0.34;

        const nearestGrenade = this.scanForGrenades(world);
        if (nearestGrenade) {
            const escapeVector = this.calculateEscapeVector(nearestGrenade, world);
            return {
                priority: 95,
                action: { 
                    type: 'MOVE', 
                    target: escapeVector, 
                    movementMode: 'BOUNDING',
                    description: 'escaping a grenade'
                }
            };
        }

        if (health < 0.3 && stress > 60) {
            const anxiety = this.agent.traits.neuroticism * 100;
            if (anxiety > 50 || Math.random() < 0.1 || isHeavilyOutnumbered) {
                const threat = this.agent.brain.cortex.identifyThreat(world);
                if (threat) {
                    const runAngle = Utils.angle(threat.pos, this.agent.pos);
                    const runDist = 300;
                    return {
                        priority: 90 + (isHeavilyOutnumbered ? 5 : 0),
                        action: {
                            type: 'MOVE',
                            target: { 
                                x: this.agent.pos.x + Math.cos(runAngle) * runDist,
                                y: this.agent.pos.y + Math.sin(runAngle) * runDist
                            },
                            movementMode: 'BOUNDING',
                            description: 'fleeing in panic'
                        }
                    };
                }
            }
        }

        if (suppression > 80 || (isOutnumbered && stress > 50)) {
            const inCover = this.agent.brain.isSafe(world); 
            
            if (inCover) {
                return {
                    priority: 70 + (isOutnumbered ? 10 : 0),
                    action: { type: 'HOLD', duration: 1000, description: 'staying behind cover' }
                };
            } else {
                const survivalBoost = isOutnumbered ? 20 : 0;
                const cortex = this.agent.brain.cortex;
                let target = cortex.findNearestCover(world, 500);

                // no usable cover: break contact rather than win arbitration with a high-priority IDLE
                if (!target) {
                    const threat = cortex.identifyThreat(world, true);
                    if (threat?.pos) {
                        const away = Utils.angle(threat.pos, this.agent.pos);
                        target = cortex.tactical.findNearestValidPoint(
                            world,
                            this.agent.pos.x + Math.cos(away) * 180,
                            this.agent.pos.y + Math.sin(away) * 180,
                            140
                        );
                    }
                }

                if (!target) {
                    return {
                        priority: 70 + survivalBoost,
                        action: { type: 'HOLD', duration: 300, description: 'pinned down' }
                    };
                }

                return {
                    priority: 85 + survivalBoost,
                    action: {
                        type: 'MOVE',
                        target,
                        movementMode: 'BOUNDING',
                        speedMultiplier: 1.25,
                        description: 'running to cover'
                    }
                };
            }
        }

        return { priority: 0, action: { type: 'IDLE' } };
    }

    getForceBalance(world) {
        const allies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, 400)
            .filter(a => !a.isCover && a.team === this.agent.team).length; 
        
        const enemies = this.agent.sensory.scan(world)
            .filter(a => a.team !== this.agent.team && this.agent.memory.isSpotted(a.id)).length;
        
        if (enemies === 0) return 999;
        return allies / enemies;
    }

    scanForGrenades(world) {
        if (!world.projectiles) return null;
        for (const p of world.projectiles) {
            if (p.active && (p.type === 'GRENADE')) {
                const dist = Utils.distance(this.agent.pos, p.pos);
                if (dist < Config.PHYSICS.FRAG_RADIUS * 1.5) {
                    return p;
                }
            }
        }
        return null;
    }

    calculateEscapeVector(hazard, world) {
        const angle = Utils.angle(hazard.pos, this.agent.pos);
        const dist = 150;
        return {
            x: this.agent.pos.x + Math.cos(angle) * dist,
            y: this.agent.pos.y + Math.sin(angle) * dist
        };
    }
}
