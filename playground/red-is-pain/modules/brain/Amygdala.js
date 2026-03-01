import { Utils } from '../Utils.js';
import { Config } from '../Config.js';

export class Amygdala {
    constructor(agent) {
        this.agent = agent;
        this.lastContactReportTime = 0;
        this.lastVisibleCount = 0;
    }

    update(dt, world) {
        // Manage Stress, Suppression, and Emotional State
        const now = Date.now();

        // 1. Calculate Stress Baseline
        // Base stress goal remains low to encourage standing ground
        let stressBaseline = this.agent.traits.neuroticism * 10; 
        stressBaseline += this.agent.memory.traumaLevel;

        // 2. Heatmap Awareness (Uncertainty Stress)
        const mem = this.agent.memory;
        const gx = Math.floor((this.agent.pos.x / world.width) * mem.gridCols);
        const gy = Math.floor((this.agent.pos.y / world.height) * mem.gridRows);
        let localHeat = 0;
        if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
            localHeat = mem.heatmap[gy][gx];
        }

        const visibleEnemies = this.agent.sensory.scan(world).filter(a => a.team !== this.agent.team && this.agent.memory.isSpotted(a.id));

        // 3. Contact Events (Stress Spike)
        if (visibleEnemies.length > 0 && this.lastVisibleCount === 0) {
            const timeSinceReport = now - this.lastContactReportTime;
            
            if (timeSinceReport > 10000) {
                const spike = visibleEnemies.length * Config.AGENT.STRESS_SPIKE_SIGHT;
                // Cohesion Resistance handled in Limbic ideally, but we can check nearby allies count here
                // For now, simpler:
                this.agent.state.modifyStress(spike);
                this.agent.addBark("CONTACT!");
                this.lastContactReportTime = now;
            }
        }
        this.lastVisibleCount = visibleEnemies.length;

        // 4. Fog of War Tension
        if (localHeat > 4 && visibleEnemies.length === 0) {
            // NEUROTICISM: Higher N = Faster uncertainty stress
            const neuroticMult = 1.0 + (this.agent.traits.neuroticism * 2.5);
            this.agent.state.modifyStress(Config.AGENT.UNCERTAINTY_STRESS_RATE * dt * neuroticMult);
        }

        // 5. Stress Decay
        // We need to know if we are cohesive (Limbic job?). 
        // For now, let's assume standard decay, maybe Limbic applies a bonus later.
        if (this.agent.state.stress > stressBaseline) {
            this.agent.state.stress = Math.max(stressBaseline, this.agent.state.stress - (dt * Config.AGENT.STRESS_DECAY_ISOLATED));
        }
        
        // 6. Grenade Awareness (Barks only, action is in evaluate)
        this.handleGrenadeReactions(dt, world);
    }

    handleGrenadeReactions(dt, world) {
        // Check for active grenades nearby for barking purposes
        for (const p of world.projectiles) {
            if ((p.type === 'GRENADE' || p.type === 'SMOKE') && p.active) {
                 const dist = Utils.distance(this.agent.pos, p.pos);
                 const dangerRadius = p.type === 'GRENADE' ? Config.PHYSICS.FRAG_RADIUS * 1.5 : 40;
                 
                 if (dist < dangerRadius) {
                     const isTeammate = p.team === this.agent.team;
                     
                     if (p.type === 'GRENADE') {
                         // Variety in barks based on personality
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

    /**
     * Evaluates immediate survival threats and emotional state.
     * Returns: { priority: number (0-100), action: ActionObject }
     */
    evaluate(world) {
        // BASELINE: The "Run or Freeze" reflex.
        const stress = this.agent.state.stress;
        const suppression = this.agent.state.suppression;
        const health = this.agent.state.hp / this.agent.state.maxHp;
        
        let priority = 0;
        let action = { type: 'IDLE', score: 0 };

        const balance = this.getForceBalance(world);
        const isOutnumbered = balance < 0.5; // 2:1 or worse
        const isHeavilyOutnumbered = balance < 0.34; // 3:1 or worse

        // 1. REFLEXES: Immediate Threat Response (Grenades/Pinned/Wounded)
        
        // --- REACT TO GRENADES (Highest Priority: 90+) ---
        // This was formerly handled directly in Agent.js update loop
        // Now properly localized here.
        const nearestGrenade = this.scanForGrenades(world);
        if (nearestGrenade) {
            const escapeVector = this.calculateEscapeVector(nearestGrenade, world);
            return {
                priority: 95, // Override almost everything except maybe mutiny
                action: { 
                    type: 'MOVE', 
                    target: escapeVector, 
                    movementMode: 'BOUNDING', // SPRINT!
                    description: 'DODGE GRENADE' 
                }
            };
        }

        // --- PAIN & PANIC RESPONSE (High Prio: 80+) ---
        // If taking significant damage rapidly, trigger fight/flight reflex based on personality.
        // Neuroticism boosts Flight instinct.
        if (health < 0.3 && stress > 60) {
            // Panic Button
            const anxiety = this.agent.traits.neuroticism * 100;
            if (anxiety > 50 || Math.random() < 0.1 || isHeavilyOutnumbered) {
                // PANIC RETREAT
                // Run AWAY from the threat vector blindly
                const threat = this.agent.brain.cortex.identifyThreat(world); // Ask Cortex "Who is hurting me?"
                if (threat) {
                    const runAngle = Utils.angle(threat.pos, this.agent.pos); // Away
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
                            description: 'PANIC RUN'
                        }
                    };
                }
            }
        }

        // --- SUPPRESSION FLINCH & OUTNUMBERED STRESS (#4) ---
        // If pinned or heavily outnumbered, increase survival bid
        if (suppression > 80 || (isOutnumbered && stress > 50)) {
            // If in cover, stay put. If in open, DIVE.
            const inCover = this.agent.brain.isSafe(world); 
            
            if (inCover) {
                // Stay down!
                return {
                    priority: 70 + (isOutnumbered ? 10 : 0),
                    action: { type: 'HOLD', duration: 1000, description: 'COWER' }
                };
            } else {
                // In open and pinned/outnumbered -> DIVE! (Find nearest cover instantly)
                // We boost priority for running to cover and smoke usage
                const survivalBoost = isOutnumbered ? 20 : 0;
                
                // Amygdala proposes high priority for "survival behavior"
                // Cortex will handle the actual choice of cover/smoke but Amygdala sets the urgency
                return { 
                    priority: 85 + survivalBoost, 
                    action: { type: 'IDLE', score: 0, description: 'URGENT SURVIVAL' } 
                };
            }
        }

        return { priority: 0, action: { type: 'IDLE' } };
    }

    getForceBalance(world) {
        // Local allies within 400px
        const allies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, 400)
            .filter(a => !a.isCover && a.team === this.agent.team).length; 
        
        // Visible enemies
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
        return null; // All clear
    }

    calculateEscapeVector(hazard, world) {
        const angle = Utils.angle(hazard.pos, this.agent.pos);
        const dist = 150; // Run 150px away
        return {
            x: this.agent.pos.x + Math.cos(angle) * dist,
            y: this.agent.pos.y + Math.sin(angle) * dist
        };
    }
}
