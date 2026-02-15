import { Utils } from './Utils.js';
import { Config } from './Config.js';

// Graph Node Constants
const THOUGHT_IDLE = 'IDLE';
const THOUGHT_COMBAT = 'COMBAT';
const THOUGHT_SURVIVAL = 'SURVIVAL';
const THOUGHT_SCAVANGE = 'SCAVANGE';
const THOUGHT_SOCIAL = 'SOCIAL';

export class Decision {
    constructor(agent) {
        this.agent = agent;
        this.currentThought = THOUGHT_IDLE;
        this.nextDecisionTime = 0;
        
        // Define graph edges and their base weights/conditions
        this.graph = {
            [THOUGHT_IDLE]: [
                { to: THOUGHT_COMBAT, weight: this.w_IdleToCombat.bind(this) },
                { to: THOUGHT_SCAVANGE, weight: this.w_IdleToScavange.bind(this) },
                { to: THOUGHT_SOCIAL, weight: this.w_IdleToSocial.bind(this) },
                { to: THOUGHT_SURVIVAL, weight: this.w_Panic.bind(this) }
            ],
            [THOUGHT_COMBAT]: [
                { to: THOUGHT_SURVIVAL, weight: this.w_CombatToSurvival.bind(this) },
                { to: THOUGHT_SCAVANGE, weight: this.w_CombatToScavange.bind(this) },
                { to: THOUGHT_IDLE, weight: this.w_CombatToIdle.bind(this) }
            ],
            [THOUGHT_SURVIVAL]: [
                { to: THOUGHT_COMBAT, weight: this.w_SurvivalToCombat.bind(this) },
                { to: THOUGHT_IDLE, weight: this.w_SurvivalToIdle.bind(this) },
                { to: THOUGHT_SCAVANGE, weight: this.w_SurvivalToScavange.bind(this) }
            ],
            [THOUGHT_SCAVANGE]: [
                { to: THOUGHT_COMBAT, weight: this.w_ScavangeToCombat.bind(this) },
                { to: THOUGHT_SURVIVAL, weight: this.w_Panic.bind(this) },
                { to: THOUGHT_IDLE, weight: this.w_ScavangeToIdle.bind(this) }
            ],
            [THOUGHT_SOCIAL]: [
                { to: THOUGHT_IDLE, weight: this.w_SocialToIdle.bind(this) },
                { to: THOUGHT_COMBAT, weight: this.w_IdleToCombat.bind(this) }, // Reuse IdleToCombat logic
                { to: THOUGHT_SURVIVAL, weight: this.w_Panic.bind(this) }
            ]
        };
    }

    decide(world, forceReevaluate = false) {
        const now = Date.now();
        
        // OODA LOOP LATENCY: High stress/fatigue slows decision making
        if (forceReevaluate || now >= this.nextDecisionTime) {
             this.updateThought(world, forceReevaluate);
             
             // Calculate next decision time
             const baseInterval = 100; // 100ms default (10 decisions/sec)
             const stressLag = (this.agent.state.stress / 100) * 500; // Up to +500ms lag
             const fatigueLag = (this.agent.state.fatigue / 100) * 1000; // Up to +1000ms lag (Exhaustion)
             
             // Random noise to prevent perfect synchronization
             const noise = Math.random() * 50;
             
             this.nextDecisionTime = now + baseInterval + stressLag + fatigueLag + noise;
        }

        // 2. Execute Action based on Current Thought
        switch(this.currentThought) {
            case THOUGHT_COMBAT: return this.actCombat(world);
            case THOUGHT_SURVIVAL: return this.actSurvival(world);
            case THOUGHT_SCAVANGE: return this.actScavange(world);
            case THOUGHT_SOCIAL: return this.actSocial(world);
            case THOUGHT_IDLE: default: return this.actIdle(world);
        }
    }

    updateThought(world, forceReevaluate = false) {
        let bestNextNode = this.currentThought;
        
        // Calculate "Stay" weight (Inertia)
        // If forced, inertia is 0
        let stayWeight = forceReevaluate ? 0 : this.calculateStayWeight(world);

        let bestWeight = stayWeight;

        // Check edges
        const validEdges = this.graph[this.currentThought];
        if (validEdges) {
            validEdges.forEach(edge => {
                const weight = edge.weight(world);
                if (weight > bestWeight) {
                    bestWeight = weight;
                    bestNextNode = edge.to;
                }
            });
        }

        if (bestNextNode !== this.currentThought) {
            this.currentThought = bestNextNode;
            this.agent.lastThoughtChange = Date.now();
        }
    }
    
    calculateStayWeight(world) {
        let base = Config.AI.WEIGHTS.BASE_INERTIA + (this.agent.traits.conscientiousness * 0.3);
        
        // FATIGUE INERTIA: Exhausted agents are stubborn/slow to change state
        if (this.agent.state.fatigue > 20) {
            base += (this.agent.state.fatigue / 100) * 2.0;
        }

        // MORALE INFLUENCE ON INITIATIVE
        // High morale reduces inertia for aggression (faster OODA loop)
        // Low morale increases inertia for everything (hesitation)
        const moraleFactor = (this.agent.state.morale - 50) / 50; // -1.0 to 1.0
        
        switch (this.currentThought) {
            case THOUGHT_IDLE:
                return base + (moraleFactor < 0 ? Math.abs(moraleFactor) * 0.5 : 0); 
            case THOUGHT_COMBAT:
                const enemy = this.getThreatSource(world, true);
                let combatInertia = base + 1.0;
                if (this.agent.role === 'GUNNER' || this.agent.role === 'BREACHER') combatInertia += 0.5;
                
                // High morale agents are "snappier" in combat
                if (moraleFactor > 0.5) combatInertia -= 0.3;
                
                if (enemy) return combatInertia; 
                return base;
            case THOUGHT_SCAVANGE:
                if (this.agent.currentAction && this.agent.currentAction.type === 'LOOT') {
                    return base + 0.8;
                }
                return base;
            case THOUGHT_SURVIVAL:
                if (this.agent.state.stress > 80) return base + 0.8;
                return base;
            case THOUGHT_SOCIAL:
                if (this.agent.state.socialBattery < 50) return base + 0.5;
                return base;
            default:
                return base;
        }
    }

    // --- WEIGHT CALCULATORS ---

    getLeaderThought(world) {
        const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
        if (leader && leader !== this.agent) return leader.brain.currentThought;
        return null;
    }

    w_IdleToCombat(world) {
        const threat = this.getThreatSource(world, true);
        
        // SUSPICION CHECK: Recent DangerZones (Sounds)
        const recentSound = this.agent.memory.dangerZones.find(dz => (Date.now() - dz.timestamp) < 2000);
        
        let w = 0;

        if (threat || recentSound) {
            w = (threat && threat.id) ? Config.AI.WEIGHTS.SIGHT_ENEMY : Config.AI.WEIGHTS.SUSPECTED_ENEMY;
            
            if (recentSound && !threat) {
                w = 1.0; // Lower weight for just sound, prompts investigation
            }

            // Morale boost to combat drive
            if (this.agent.state.morale > 80) w += 0.5;
            if (this.agent.state.morale < 20) w -= 0.5; // Hesitation

            if (this.agent.role === 'BREACHER') w += 0.8;
            if (this.agent.role === 'GUNNER') w += 0.4;

            w += this.agent.traits.extraversion * 0.3;
            w += (1 - this.agent.traits.agreeableness) * 0.2;
        }

        // COMMAND INFLUENCE: If leader is fighting, I should fight
        if (this.getLeaderThought(world) === THOUGHT_COMBAT) {
             w += 1.5;
        }
        
        return w;
    }

    w_IdleToScavange(world) {
        let w = 0;
        const hpThreshold = this.agent.state.maxHp * 0.7;
        if (this.agent.state.hp < hpThreshold) {
            w += (1 - (this.agent.state.hp / this.agent.state.maxHp)) * 0.8;
        }
        
        const ammoThreshold = this.agent.state.inventory.weapon.maxAmmo * 0.3;
        if (this.agent.state.inventory.weapon.ammo < ammoThreshold) {
            w += (1 - (this.agent.state.inventory.weapon.ammo / this.agent.state.inventory.weapon.maxAmmo)) * 1.0;
        }
        
        // Marksmen and Gunners are more ammo-dependent
        if (this.agent.role === 'MARKSMAN' || this.agent.role === 'GUNNER') w *= 1.2;

        const hasLoot = this.hasLootKnowledge(world);
        if (!hasLoot) w *= 0.1; 

        return w;
    }

    w_IdleToSocial(world) {
        if (this.agent.state.socialBattery < 20) return 0.6; 
        return 0;
    }

    w_Panic(world) {
        let w = 0;
        const hpPct = this.agent.state.hp / this.agent.state.maxHp;
        const threat = this.getThreatSource(world, false); // Only actual visible enemies

        // AMBUSH LOGIC: If taking damage but no visible enemy, panic weight is much higher
        if (hpPct < 1.0 && !threat) {
             w += (1.0 - hpPct) * 2.0;
        }
        
        // SHELLSHOCK (Ghosts of War)
        if (this.agent.memory.traumaLevel > 50) {
            w += 1.0; // Persistent fear
            if (this.agent.state.stress > 50) w += 1.0; // Panic earlier
        }

        if (this.agent.state.stress > Config.AI.WEIGHTS.PANIC_THRESHOLD && this.agent.traits.neuroticism > 0.6) {
            w += Config.AI.WEIGHTS.PANIC_WEIGHT;
        }

        // COMMAND INFLUENCE: If leader is panicked (Survival), I'm more likely to panic
        if (this.getLeaderThought(world) === THOUGHT_SURVIVAL) {
            w += 1.0;
        }

        return w;
    }

    w_CombatToSurvival(world) {
        let w = 0;
        const hpPct = this.agent.state.hp / this.agent.state.maxHp;
        
        // Lowered weights: Survival should be a last resort, not a default
        if (hpPct < 0.4) w += 0.8;
        if (hpPct < 0.2) w += 1.5;
        
        if (this.agent.state.inventory.weapon.ammo <= 0) w += 0.7; 
        
        // LEADER PRESERVATION: Captains are more cautious
        if (this.agent.rank === 1) w += 0.5;

        // TRAIT INFLUENCE: Neurotic agents panic and flee MUCH earlier
        // Fix: Scale by stress so they don't flee with 0 stress
        const stressFactor = this.agent.state.stress / 100;
        w += stressFactor * this.agent.traits.neuroticism * 4.0; 

        // Safety in numbers: If I have many allies nearby, I'm less likely to run
        const alliesNearby = world.spatial.query(this.agent.pos.x, this.agent.pos.y, 200)
            .filter(a => a.team === this.agent.team && a !== this.agent).length;
        
        if (alliesNearby >= 2) w -= 0.5;
        if (alliesNearby >= 4) w -= 1.0;

        // Marksmen flee earlier if enemies get close
        if (this.agent.role === 'MARKSMAN') {
            const enemy = this.getThreatSource(world);
            if (enemy && Utils.distance(this.agent.pos, enemy.pos) < 200) w += 1.0;
        }

        // COMMAND INFLUENCE: Leader Retreating pulls me too
        if (this.getLeaderThought(world) === THOUGHT_SURVIVAL) {
            w += 1.5;
        }
        
        return w;
    }

    w_CombatToScavange(world) {
         if (this.agent.state.inventory.weapon.ammo <= 0) return Config.AI.WEIGHTS.LOW_AMMO_WEIGHT;
         return 0;
    }

    w_CombatToIdle(world) {
        // If no enemies for a while
        const enemy = this.getThreatSource(world, true);
        const timeInState = Date.now() - this.agent.lastThoughtChange;
        
        if (!enemy) {
             if (timeInState > 5000) return 0.8; // Relax after 5s of no contact
             if (this.agent.state.stress < 30) return 0.6;
        }
        return 0;
    }

    w_SurvivalToCombat(world) {
        // If we found cover and have ammo/hp
        const inCover = this.isSafe(world);
        if (inCover && this.agent.state.inventory.weapon.ammo > 0) {
            // High boost to fight back once safe
            return 0.9 + (this.agent.traits.extraversion * 0.4); 
        }
        return 0;
    }

    w_SurvivalToIdle(world) {
        const enemy = this.getThreatSource(world, true);
        const timeInState = Date.now() - this.agent.lastThoughtChange;
        if (!enemy && this.agent.state.stress < 50) return 0.6;
        if (timeInState > 10000 && this.isSafe(world)) return 0.8; 
        return 0;
    }

    w_SurvivalToScavange(world) {
        if (this.agent.state.inventory.weapon.ammo <= 0) return Config.AI.WEIGHTS.LOW_AMMO_WEIGHT; 
        return 0;
    }

    w_ScavangeToCombat(world) {
        // If we bumped into enemy and have some ammo
        const enemy = this.getThreatSource(world, true);
        if (enemy && Utils.distance(this.agent.pos, enemy.pos || enemy.lastKnownPosition) < 150 && this.agent.state.inventory.weapon.ammo > 5) {
            return 0.9; // Self defense
        }
        return 0;
    }

    w_ScavangeToIdle(world) {
        // Timeout check (15s)
        const timeInState = Date.now() - this.agent.lastThoughtChange;
        if (timeInState > 15000) return 2.0; // Give up

        // SQUAD COHESION: If squad moves too far, abandon scavenging
        const squadCenter = this.agent.getSquadCenter(world);
        const distToSquad = Utils.distance(this.agent.pos, squadCenter);
        if (distToSquad > 400) return 1.5;

        // Loot secured?
        if (this.agent.state.hp === this.agent.state.maxHp && this.agent.state.inventory.weapon.ammo === this.agent.state.inventory.weapon.maxAmmo) {
            return 0.8;
        }
        return 0.1;
    }

    w_SocialToIdle(world) {
        const timeInState = Date.now() - this.agent.lastThoughtChange;
        if (timeInState > 10000) return 2.0;

        if (this.agent.state.socialBattery > 80) return 0.5;
        return 0.1;
    }

    // --- ACTION EXECUTORS ---

    actIdle(world) {
        // Sub-states: Patrol, MoveToObjective, Solitude
        if (Math.random() < 0.3) return this.scorePatrol(world);
        return this.scoreMoveToObjective(world);
    }

    actCombat(world) {
        // MUTINY CHECK (REALISM): Can I lead better in this crisis?
        const mutiny = this.scoreMutiny(world);
        if (mutiny.score > 2.0) return mutiny;

        if (this.agent.role === 'MEDIC') {
            const healScore = this.scoreHeal(world);
            if (healScore.score > 1.5) return healScore;
        }

        // Evaluate Rescue (Moving to help/cover wounded)
        const rescueScore = this.scoreRescue(world);
        if (rescueScore.type !== 'NONE' && rescueScore.score > 2.0) {
            return rescueScore;
        }

        // AMBUSH/LURK LOGIC
        const lurkScore = this.scoreLurk(world);
        if (lurkScore.type !== 'NONE' && lurkScore.score > 1.5) {
             return lurkScore;
        }

        // BERSERK BREAKING POINT
        // At max stress and low morale, agent might go berserk (suicide charge)
        if (this.agent.state.stress > 95 && this.agent.state.morale < 20) {
            const enemy = this.getThreatSource(world, true);
            if (enemy) {
                const enemyPos = enemy.lastKnownPosition || enemy.pos;
                // High speed, no cover, direct charge
                return { type: 'ATTACK', target: enemyPos, score: 10.0, speedMultiplier: 1.5, movementMode: 'BOUNDING' };
            }
        }

        // COGNITIVE REALISM: Accuracy-Driven Tactics
        // If I can't aim (High Stress), I should SUPPRESS (Volume Fire) instead of ATTACK (Precision)
        const stressAccPenalty = (this.agent.state.stress / 100) * Config.AGENT.STRESS_ACCURACY_MULT;
        const currentAccuracy = this.agent.traits.accuracyBase - stressAccPenalty;
        
        const sprayAndPrayBonus = currentAccuracy < 0.6 ? 1.0 : 0.0; // Bonus to suppression if shaky

        // ROLE-SPECIFIC SPECIALS
        if (this.agent.role === 'GUNNER') {
            const suppressScore = this.scoreSuppress(world);
            // Gunners are 2x more likely to choose suppression
            if (suppressScore.type === 'SUPPRESS' && suppressScore.score > 0.5) {
                return suppressScore;
            }
        }

        // Evaluate Suppression (Blind fire)
        const suppressScore = this.scoreSuppress(world);
        if (suppressScore.type === 'SUPPRESS' && (suppressScore.score + sprayAndPrayBonus) > 1.0) {
            return suppressScore;
        }

        // Evaluate Throwing
        const grenadeScore = this.scoreThrow(world);
        if (grenadeScore.type === 'THROW' && grenadeScore.score > 1.5) {
            return grenadeScore;
        }

        const combatScore = this.scoreCombat(world);
        // If accuracy is trash, don't try to snipe
        if (currentAccuracy < 0.4 && combatScore.type === 'ATTACK') {
             combatScore.score *= 0.5; 
        }
        return combatScore; 
    }

    actSurvival(world) {
        // MUTINY CHECK (REALISM): The leader is getting us killed!
        const mutiny = this.scoreMutiny(world);
        if (mutiny.score > 2.0) return mutiny;

        // High priority: Use smoke to break contact if we have it
        const smokeScore = this.scoreThrow(world, 'SmokeGrenade');
        if (smokeScore.type === 'THROW' && smokeScore.score > 1.5) {
            return smokeScore;
        }

        const regroup = this.scoreRegroup(world);
        if (regroup.score > 1.5) return regroup;
        
        // Medics are more likely to regroup to help others while retreating
        if (this.agent.role === 'MEDIC' && regroup.score > 1.0) return regroup;

        return this.scoreRetreat(world);
    }

    actScavange(world) {
        // High priority: Resupply from ally if we are dry and squad is close
        const resupply = this.scoreResupply(world);
        if (resupply.score > 1.5) return resupply;

        const loot = this.scoreLoot(world);
        if (loot.type === 'NONE') {
            return this.scorePatrol(world);
        }
        return loot;
    }

    actSocial(world) {
        const socialAction = this.scoreSocialize(world);
        if (socialAction.score > 1.0) return socialAction;
        
        return this.scoreFollowOrder(world);
    }

    scoreSocialize(world) {
        // Find nearby idle/social teammates to bond with
        let bestTarget = null;
        let maxScore = -1;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && !a.state.isDowned) {
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

        return { type: 'NONE', score: 0 };
    }

    // --- HELPER METHODS ---

    scoreResupply(world) {
        const weapon = this.agent.state.inventory.weapon;
        const ammoPct = weapon.ammo / weapon.maxAmmo;
        
        // Only look for resupply if we are below 25% ammo
        if (ammoPct > 0.25) return { type: 'NONE', score: 0 };

        let bestSource = null;
        let bestScore = -1;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && !a.state.isDowned) {
                const sourceWeapon = a.state.inventory.weapon;
                // Allies must have plenty of ammo themselves to share
                if (sourceWeapon.ammo > sourceWeapon.maxAmmo * 0.5) {
                    const dist = Utils.distance(this.agent.pos, a.pos);
                    if (dist > 300) return;

                    // Trust Synergy: Only ask people we trust
                    const trust = this.agent.memory.socialCredit.get(a.id) || 0.5;
                    if (trust < 0.4) return;

                    const score = (1.0 - ammoPct) * 2.0 + trust;
                    if (score > bestScore) {
                        bestScore = score;
                        bestSource = a;
                    }
                }
            }
        });

        if (bestSource) {
            const dist = Utils.distance(this.agent.pos, bestSource.pos);
            if (dist < 25) {
                return { type: 'RESUPPLY', targetId: bestSource.id, score: bestScore };
            }
            return { type: 'MOVE', target: bestSource.pos, score: bestScore };
        }

        return { type: 'NONE', score: 0 };
    }

    getSquadActionCount(world, actionType) {
        let count = 0;
        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && a.currentAction && a.currentAction.type === actionType) {
                count++;
            }
        });
        return count;
    }

    getThreatSource(world, includeSuspected = false) {
        // 1. Visible Enemies (Must be spotted)
        const scanResults = this.agent.sensory.scan(world);
        const visibleMax = scanResults.filter(a => a.team !== this.agent.team && this.agent.memory.isSpotted(a.id));
        if (visibleMax.length > 0) return visibleMax[0]; 

        // 2. Memory (Recent)
        const mem = this.agent.memory.knownHostiles;
        if (mem.length > 0) {
            const latest = mem[0];
            if (Date.now() - latest.timestamp < 3000) { 
                return latest;
            }
        }
        
        // 3. Suspected (Heatmap/Sound)
        if (includeSuspected) {
            const hSize = 16;
            const gx = Math.floor((this.agent.pos.x / world.width) * hSize);
            const gy = Math.floor((this.agent.pos.y / world.height) * hSize);
            
            let maxHeat = 0;
            let heatPos = null;
            
            // HYSTERESIS: If already in combat/survival, we are more sensitive to weak signals (retention)
            // If idle, we need a strong signal to react (acquisition)
            const retentionState = (this.currentThought === THOUGHT_COMBAT || this.currentThought === THOUGHT_SURVIVAL);
            const heatThreshold = retentionState ? 1.0 : 3.0;

            for(let y = Math.max(0, gy-2); y <= Math.min(hSize-1, gy+2); y++) {
                for(let x = Math.max(0, gx-2); x <= Math.min(hSize-1, gx+2); x++) {
                    const heat = this.agent.memory.heatmap[y][x];
                    if (heat > heatThreshold && heat > maxHeat) {
                        maxHeat = heat;
                        heatPos = {
                            x: (x + 0.5) * (world.width / hSize),
                            y: (y + 0.5) * (world.height / hSize)
                        };
                    }
                }
            }
            
            if (heatPos) return { pos: heatPos, isSuspected: true };
        }
        
        // 4. Danger Zones (Sound) - If nothing else found
        if (includeSuspected) {
             const recentSound = this.agent.memory.dangerZones
                 .filter(dz => (Date.now() - dz.timestamp) < 3000)
                 .sort((a, b) => b.intensity - a.intensity)[0]; // Loudest
             
             if (recentSound) {
                 return { pos: {x: recentSound.x, y: recentSound.y}, isSuspected: true };
             }
        }
        
        return null;
    }

    hasLootKnowledge(world) {
        const loops = world.loot.some(item => Utils.distance(this.agent.pos, item) < this.agent.traits.visionRadius);
        if (loops) return true;
        return this.agent.memory.knownLoot.length > 0;
    }

    isSafe(world) {
        return this.findNearestCover(world, 20) !== null; 
    }

    scorePatrol(world) {
         if (!this.agent.patrolTarget || Utils.distance(this.agent.pos, this.agent.patrolTarget) < 20) {
            const angle = this.agent.angle + (Math.random() - 0.5) * Math.PI;
            const dist = 100 + Math.random() * 200;
            this.agent.patrolTarget = {
                x: Utils.clamp(this.agent.pos.x + Math.cos(angle) * dist, 50, world.width - 50),
                y: Utils.clamp(this.agent.pos.y + Math.sin(angle) * dist, 50, world.height - 50)
            };
        }
        return { type: 'MOVE', target: this.agent.patrolTarget, score: 1, movementMode: 'SNEAKING' };
    }

    scoreMoveToObjective(world) {
        const targetX = this.agent.team === 0 ? world.width * 0.8 : world.width * 0.2;
        const targetY = world.height / 2;
        
        let bestHeatCell = null;
        let maxHeat = 0;
        const mem = this.agent.memory;
        
        const startCol = this.agent.team === 0 ? 8 : 0;
        const endCol = this.agent.team === 0 ? 15 : 7;
        
        for (let y = 4; y < 12; y++) {
            for (let x = startCol; x <= endCol; x++) {
                if (mem.heatmap[y][x] > maxHeat) {
                    maxHeat = mem.heatmap[y][x];
                    bestHeatCell = { x, y };
                }
            }
        }

        let finalTarget = { x: targetX, y: targetY };
        if (bestHeatCell && maxHeat > 2) {
            const heatX = (bestHeatCell.x + 0.5) * (world.width / 16);
            const heatY = (bestHeatCell.y + 0.5) * (world.height / 16);
            finalTarget = { x: heatX, y: heatY };
        }
        
        return { type: 'MOVE', target: finalTarget, score: 1, movementMode: 'SNEAKING' };
    }

    scoreCombat(world) {
        const enemy = this.getThreatSource(world, true);
        if (!enemy) return { type: 'NONE', score: 0 };
        
        const enemyPos = enemy.lastKnownPosition || enemy.pos; 
        const dist = Utils.distance(this.agent.pos, enemyPos);
        const hasLOS = enemy.id ? world.hasLineOfSight(this.agent.pos, enemyPos) : false; 

        // TACTICAL COORDINATION (Bounding Overwatch)
        const inChaos = world.commandChaos[this.agent.team] > 0;
        const suppressors = this.getSquadActionCount(world, 'SUPPRESS');
        const attackers = this.getSquadActionCount(world, 'ATTACK');
        const totalActive = suppressors + attackers;
        
        // Check if ANYONE in the squad is currently advancing
        // Chaos disables intent-reading
        const anyoneAdvancing = !inChaos && world.agents.some(a => 
            a.team === this.agent.team && 
            a !== this.agent && 
            (Date.now() - a.lastAdvanceTime < 1000)
        );

        let moveTarget = null;
        let shouldAdvance = false;
        
        if (this.agent.role === 'BREACHER') shouldAdvance = true;
        else if (!inChaos && suppressors >= 1 && totalActive >= 2) shouldAdvance = true; 
        else if (!inChaos && this.agent.traits.openness > 0.7 && suppressors >= 1) shouldAdvance = true;

        // If I am a Gunner and someone is advancing, I MUST suppress
        if (this.agent.role === 'GUNNER' && anyoneAdvancing) {
             shouldAdvance = false; // Stay put and cover
        }

        if (hasLOS) {
            if (shouldAdvance) {
                if (!inChaos) this.agent.lastAdvanceTime = Date.now(); // Signal intent to squad
                const flankSpot = this.findFlankSpot(world, enemyPos);
                if (flankSpot) moveTarget = flankSpot;
                else moveTarget = enemyPos;
            } else {
                const tacticalCover = this.findNearestCover(world, 100);
                if (tacticalCover && Utils.distance(this.agent.pos, tacticalCover) > 20) {
                    moveTarget = tacticalCover;
                }
            }
        } else {
            moveTarget = enemyPos;
        }

        if (this.agent.role === 'MARKSMAN' && dist < 350) {
            moveTarget = this.findNearestCover(world, 300); 
        }

        if (enemy.id) {
             return { type: 'ATTACK', targetId: enemy.id, moveTarget: moveTarget, score: 2.0, movementMode: shouldAdvance ? 'BOUNDING' : 'TACTICAL' };
        } else {
            return { type: 'ATTACK', target: enemyPos, moveTarget: moveTarget, score: 2.0, movementMode: shouldAdvance ? 'BOUNDING' : 'TACTICAL' };
        }
    }

    findNearestCover(world, range = 600) {
        const enemy = this.getThreatSource(world, true);
        if (!enemy) return null;
        
        const enemyPos = enemy.lastKnownPosition || enemy.pos;

        let bestCoverPos = null;
        let bestTacticalScore = Infinity; 
        
        world.covers.forEach(c => {
            const coverCenter = { x: c.x + c.w/2, y: c.y + c.h/2 };
            const dist = Utils.distance(this.agent.pos, coverCenter);
            if (dist > range) return;

            const gridX = Math.floor((coverCenter.x / world.width) * 16);
            const gridY = Math.floor((coverCenter.y / world.height) * 16);
            
            const heat = (gridX >= 0 && gridX < 16 && gridY >= 0 && gridY < 16) 
                         ? this.agent.memory.heatmap[gridY][gridX] : 0;
            
            let tacticalScore = dist + (heat * 100);

            if (tacticalScore < bestTacticalScore) {
                let safeX = coverCenter.x;
                let safeY = coverCenter.y;
                const buffer = 15;
                
                if (c.w > c.h) {
                    if (enemyPos.y < c.y) safeY = c.y + c.h + buffer;
                    else safeY = c.y - buffer;
                    safeX = Utils.clamp(enemyPos.x, c.x + 5, c.x + c.w - 5);
                } else {
                    if (enemyPos.x < c.x) safeX = c.x + c.w + buffer;
                    else safeX = c.x - buffer;
                    safeY = Utils.clamp(enemyPos.y, c.y + 5, c.y + c.h - 5);
                }

                if (!world.isWallAt(safeX, safeY)) {
                    // Check Friendly Fire Lines
                    if (!this.isPositionTacticallyValid({x: safeX, y: safeY}, enemyPos, world)) {
                         tacticalScore += 2000; // Heavy penalty for blocking/being blocked
                    }

                    if (tacticalScore < bestTacticalScore) {
                        bestTacticalScore = tacticalScore;
                        bestCoverPos = { x: safeX, y: safeY };
                    }
                }
            }
        });
        return bestCoverPos;
    }

    findFlankSpot(world, enemyPos) {
        const radius = 150;
        const samples = 8;
        let bestSpot = null;
        let bestScore = -1;

        for (let i = 0; i < samples; i++) {
            const angle = (i / samples) * Math.PI * 2;
            const tx = this.agent.pos.x + Math.cos(angle) * radius;
            const ty = this.agent.pos.y + Math.sin(angle) * radius;

            if (world.isWallAt(tx, ty)) continue;

            const distToEnemy = Utils.distance({x: tx, y: ty}, enemyPos);
            
            const score = (300 - distToEnemy) + (this.agent.traits.openness * 100);
            if (score > bestScore) {
                bestScore = score;
                bestSpot = { x: tx, y: ty };
            }
        }
        return bestSpot;
    }

    scoreRetreat(world) {
        const nearestCover = this.findNearestCover(world);
        if (nearestCover) {
            return { type: 'RETREAT', target: nearestCover, score: 1, movementMode: 'BOUNDING' };
        }
        return { type: 'RETREAT', score: 1, movementMode: 'BOUNDING' };
    }

    scoreRegroup(world) {
        const squadCenter = this.agent.getSquadCenter(world);
        const distToSquad = Utils.distance(this.agent.pos, squadCenter);
        
        // Don't regroup if we are already there
        if (distToSquad < 60) return { type: 'NONE', score: 0 };

        // Real War: Rallying is easier if the destination is safe
        const gx = Math.floor((squadCenter.x / world.width) * 16);
        const gy = Math.floor((squadCenter.y / world.height) * 16);
        let destinationHeat = 0;
        if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) {
            destinationHeat = this.agent.memory.heatmap[gy][gx];
        }

        // Factors: Squad proximity, low heat at destination, and morale
        let score = (1.0 - (destinationHeat / 10)) * 2.0;
        score += (this.agent.state.morale / 100);
        
        // If we are very far, score is lower (too detached to rally easily)
        if (distToSquad > 400) score *= 0.5;

        // If we are already being shot at (high stress), we are less likely to regroup and more likely to keep retreating
        if (this.agent.state.stress > 80) score *= 0.4;

        return { type: 'MOVE', target: squadCenter, score: score };
    }

    scoreLoot(world) {
        let bestLoot = null;
        let bestScore = Infinity;
        
        const evaluateLoot = (item) => {
            const dist = Utils.distance(this.agent.pos, item);
            const hasLOS = world.hasLineOfSight(this.agent.pos, item);
            const score = dist + (hasLOS ? 0 : 200); 
            
            if (score < bestScore && dist < this.agent.traits.visionRadius * 1.5) {
                bestScore = score;
                bestLoot = item;
            }
        };

        world.loot.forEach(evaluateLoot);

        if (!bestLoot && this.agent.memory.knownLoot.length > 0) {
             this.agent.memory.knownLoot.forEach(evaluateLoot);
        }

        if (!bestLoot) return { type: 'NONE', score: 0 };
        return { type: 'LOOT', target: bestLoot, score: 1 };
    }

    scoreMutiny(world) {
        // Only trigger if:
        // 1. Not currently the leader
        // 2. Low Approval of current leader (< threshold)
        // 3. I am more competent (higher potential) OR leader is incompetent (high stress/downed)
        if (this.agent.rank === 1) return { type: 'NONE', score: 0 };
        
        const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
        if (!leader) return { type: 'NONE', score: 0 }; 

        const approval = this.agent.memory.leaderApproval;
        if (approval > Config.WORLD.APPROVAL_MIN_MUTINY) return { type: 'NONE', score: 0 };

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

        return { type: 'NONE', score: 0 };
    }

    scoreFollowOrder(world) {
        const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
        if (!leader || leader === this.agent) return { type: 'NONE', score: 0 };

        // INSUBORDINATION CHECK (REALISM)
        const approvalFactor = this.agent.memory.leaderApproval / 100;
        
        // Check heat at destination
        const gx = Math.floor((leader.pos.x / world.width) * 16);
        const gy = Math.floor((leader.pos.y / world.height) * 16);
        const destinationHeat = (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) 
            ? this.agent.memory.heatmap[gy][gx] : 0;
            
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

        return { type: 'MOVE', target: leader.pos, score: 1 };
    }
    
    scoreSuppress(world) {
        const memoryHostiles = this.agent.memory.knownHostiles;
        let baseScore = 0;
        let targetPos = null;

        // Check for "Cover Me" signal (Disabled in chaos)
        const inChaos = world.commandChaos[this.agent.team] > 0;
        const anyoneAdvancing = !inChaos && world.agents.some(a => 
            a.team === this.agent.team && 
            a !== this.agent && 
            (Date.now() - a.lastAdvanceTime < 1000)
        );

        if (memoryHostiles.length > 0) {
            const latest = memoryHostiles[0];
            const age = Date.now() - latest.timestamp;
            if (age < 5000) {
                const dist = Utils.distance(this.agent.pos, latest.lastKnownPosition);
                if (dist < this.agent.state.inventory.weapon.range * 1.2) {
                    const timeFactor = Math.max(0, 1 - age / 10000);
                    baseScore = timeFactor * (1.5 - this.agent.traits.agreeableness);
                    targetPos = latest.lastKnownPosition;
                }
            }
        }
        
        if (!targetPos) {
            const heatmap = this.agent.memory.heatmap;
            let maxHeat = 0;
            const hSize = 16;
            const gx = Math.floor((this.agent.pos.x / world.width) * hSize);
            const gy = Math.floor((this.agent.pos.y / world.height) * hSize);
            
            for(let y = Math.max(0, gy-2); y <= Math.min(hSize-1, gy+2); y++) {
                for(let x = Math.max(0, gx-2); x <= Math.min(hSize-1, gx+2); x++) {
                    const heat = heatmap[y][x];
                    if (heat > 3) {
                         const cellPos = { 
                            x: (x + 0.5) * (world.width / 16), 
                            y: (y + 0.5) * (world.height / 16) 
                        };
                        const dist = Utils.distance(this.agent.pos, cellPos);
                        if (dist < this.agent.state.inventory.weapon.range && heat > maxHeat) {
                             maxHeat = heat;
                             targetPos = cellPos;
                        }
                    }
                }
            }
            if (targetPos) baseScore = (maxHeat / 10) * (1.2 - this.agent.traits.agreeableness);
        }
        
        if (targetPos) {
            // ROLE INFLUENCE: Gunners are the backbone of suppression
            if (this.agent.role === 'GUNNER') baseScore *= 2.0;
            if (this.agent.role === 'RIFLEMAN') baseScore *= 1.2;
            
            // TRAIT INFLUENCE: Agreeable agents prioritize helping (suppressing)
            baseScore += (this.agent.traits.agreeableness * 1.5);

            // BOUNDING OVERWATCH BOOST: If ally is moving, I MUST cover them
            // Only if I'm agreeable or disciplined (Conscientious)
            if (anyoneAdvancing) {
                baseScore += (1.0 + this.agent.traits.agreeableness + this.agent.traits.conscientiousness);
            }

            // DISTRESS SIGNAL BOOST: Help teammates who are pinned
            for (const [id, signal] of this.agent.memory.distressSignals) {
                if (signal.type === 'NEED_COVER') {
                    const distToAlly = Utils.distance(this.agent.pos, signal.position);
                    if (distToAlly < 400) {
                        baseScore += (1.5 + this.agent.traits.agreeableness);
                        // If we don't have a target yet, suppress near the ally
                        if (!targetPos) targetPos = signal.position;
                    }
                }
            }
            
            if (baseScore > 0.8) {
                return { type: 'SUPPRESS', target: targetPos, score: baseScore };
            }
        }

        return { type: 'NONE', score: 0 };
    }
    
    scoreThrow(world, preferredType = null) {
        if (Date.now() - this.agent.lastThrowTime < 8000) return { type: 'NONE', score: 0 };
        
        const inventory = this.agent.state.inventory.utility;
        const enemy = this.getThreatSource(world, true);
        if (!enemy) return { type: 'NONE', score: 0 };
        
        const enemyPos = enemy.lastKnownPosition || enemy.pos;
        const dist = Utils.distance(this.agent.pos, enemyPos);
        
        if (dist > 60 && dist < Config.PHYSICS.GRENADE_RANGE) {
            const hasLOS = enemy.id ? world.hasLineOfSight(this.agent.pos, enemyPos) : false;

            // 1. SMOKE GRENADE LOGIC (Break Contact / Tactical Withdrawal)
            const hasSmoke = inventory.some(u => u.type === 'SmokeGrenade' && u.count > 0);
            if (hasSmoke && (preferredType === 'SmokeGrenade' || this.agent.state.stress > 60 || this.currentThought === THOUGHT_SURVIVAL)) {
                let smokeScore = 1.0;
                if (this.currentThought === THOUGHT_SURVIVAL) smokeScore += 2.0;
                if (this.agent.state.stress > 80) smokeScore += 1.5;
                if (this.agent.role === 'MEDIC') smokeScore += 1.0;

                // Throw smoke between self and enemy
                const smokePos = {
                    x: (this.agent.pos.x + enemyPos.x) / 2,
                    y: (this.agent.pos.y + enemyPos.y) / 2
                };

                return { type: 'THROW', target: smokePos, grenadeType: 'SmokeGrenade', score: smokeScore };
            }

            // 2. FRAG GRENADE LOGIC (Lethal Flush)
            const hasFrag = inventory.some(u => u.type === 'FragGrenade' && u.count > 0);
            if (hasFrag && (preferredType === 'FragGrenade' || !preferredType)) {
                let fragScore = 1.2;

                // ROLE INFLUENCE: Breachers use grenades to clear rooms/covers
                if (this.agent.role === 'BREACHER') fragScore *= 1.5;

                if (!hasLOS) {
                     return { type: 'THROW', target: enemyPos, grenadeType: 'FragGrenade', score: fragScore * 2.0 };
                }
                
                if (this.agent.traits.agreeableness < 0.4 && Math.random() < 0.3) {
                     return { type: 'THROW', target: enemyPos, grenadeType: 'FragGrenade', score: fragScore * 1.5 };
                }

                return { type: 'THROW', target: enemyPos, grenadeType: 'FragGrenade', score: fragScore };
            }
        }
        return { type: 'NONE', score: 0 };
    }

    scoreHeal(world) {
        const hasMedkit = this.agent.state.inventory.utility.some(u => u.type === 'Medkit' && u.count > 0);
        if (!hasMedkit) return { type: 'NONE', score: 0 };

        let bestTarget = null;
        let bestScore = -1;
        
        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                const dist = Utils.distance(this.agent.pos, a.pos);
                if (dist > 500) return;

                let score = 0;
                if (a.state.isDowned) {
                    score = 10.0; // Absolute priority
                } else if (a.state.hp < a.state.maxHp * 0.7) {
                    score = (1.0 - (a.state.hp / a.state.maxHp)) * 5.0;
                }

                // Distress Signal Boost
                const signal = this.agent.memory.distressSignals.get(a.id);
                if (signal && signal.type === 'MEDIC') {
                    score += 5.0;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = a;
                }
            }
        });

        if (bestTarget && bestScore > 0) {
            const dist = Utils.distance(this.agent.pos, bestTarget.pos);
            if (dist < 25) {
                 return { type: 'HEAL', targetId: bestTarget.id, score: bestScore }; 
            }
            return { type: 'MOVE', target: bestTarget.pos, score: bestScore }; 
        }

        return { type: 'NONE', score: 0 };
    }

    scoreRescue(world) {
        // Non-medics moving to protect or provide cover for downed teammates
        let bestTarget = null;
        let bestScore = -1;

        for (const [id, signal] of this.agent.memory.distressSignals) {
            if (signal.type === 'MEDIC') {
                const dist = Utils.distance(this.agent.pos, signal.position);
                if (dist > 400) continue;

                // Trust and Agreeableness play a role
                const trust = this.agent.memory.socialCredit.get(id) || 0.5;
                const score = (1.0 - dist / 400) * 2.0 + (this.agent.traits.agreeableness * 2.0) + (trust * 1.0);

                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = signal.position;
                }
            }
        }

        if (bestTarget) {
            // Move to a tactical position near the teammate
            const tacticalCover = this.findNearestCover(world, 100);
            if (tacticalCover) return { type: 'MOVE', target: tacticalCover, score: bestScore, movementMode: 'BOUNDING' };
            return { type: 'MOVE', target: bestTarget, score: bestScore, movementMode: 'BOUNDING' };
        }

        return { type: 'NONE', score: 0 };
    }

    scoreLurk(world) {
        // Only lurk if we have NO direct visual contact but DO have heatmap intel
        const visibleEnemy = this.getThreatSource(world, false);
        if (visibleEnemy) return { type: 'NONE', score: 0 };
        
        const suspected = this.getThreatSource(world, true);
        if (!suspected || !suspected.isSuspected) return { type: 'NONE', score: 0 };

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
            const distToHeat = Utils.distance(b, suspected.pos);
            
            // Marksmen like distance, Breachers like close
            let rangeScore = 0;
            if (this.agent.role === 'MARKSMAN') {
                rangeScore = (distToHeat > 300 && distToHeat < 600) ? 1.0 : 0;
            } else if (this.agent.role === 'BREACHER') {
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
        
        return { type: 'NONE', score: 0 };
    }
    isPositionTacticallyValid(targetPos, enemyPos, world) {
        // Check 1: Does this position block an ally's shot?
        // Check 2: Is this position in an ally's line of fire?
        
        const dangerRadius = 20;
        let valid = true;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent && !a.state.isDowned) {
                // Line: Ally -> Enemy
                // Dist from TargetPos to Line(Ally, Enemy)
                const distToFireLine = Utils.distanceToSegment(targetPos, a.pos, enemyPos);
                if (distToFireLine < dangerRadius) {
                     valid = false;
                }
                
                // Line: TargetPos -> Enemy
                // Dist from Ally to Line(TargetPos, Enemy)
                // (Don't move in front of ally)
                const distAtomyshot = Utils.distanceToSegment(a.pos, targetPos, enemyPos);
                if (distAtomyshot < dangerRadius) {
                    valid = false;
                }
            }
        });
        return valid;
    }
}
