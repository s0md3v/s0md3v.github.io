import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';

export class SupportEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
    }

    scoreHeal(world) {
        const hasMedkit = this.agent.state.inventory.utility.some(u => u.type === 'Medkit' && u.count > 0);
        if (!hasMedkit) return { score: 0 };

        let bestTarget = null;
        let bestScore = -1;
        
        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                const dist = Utils.distance(this.agent.pos, a.pos);
                if (dist > 500) return;

                let score = 0;
                if (a.state.hp < a.state.maxHp * 0.7) {
                    score = (1.0 - (a.state.hp / a.state.maxHp)) * 5.0;
                }

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

        return { score: 0 };
    }

    scoreSelfHeal(world) {
        const hpPct = this.agent.state.hp / this.agent.state.maxHp;
        if (hpPct >= 0.85) return { score: 0 };

        const hasMedkit = this.agent.state.inventory.utility.some(u => u.type === 'Medkit' && u.count > 0);
        if (!hasMedkit) return { score: 0 };

        let score = (1.0 - hpPct) * 6.0;
        
        let isSafe = false;
        const threat = this.decision.getThreatSource(world, true);
        if (!threat) isSafe = true;
        else {
             const threatPos = threat.pos || threat.lastKnownPosition;
             if (threatPos && !world.hasClearShot(this.agent.pos, threatPos)) isSafe = true;
        }

        if (isSafe) {
            score += 3.0;
        } else {
            if (threat) {
                if (hpPct > 0.3) score = 0;
                else score -= 2.0; 
            }
        }

        return { type: 'SELF_HEAL', score: score };
    }

    scoreRescue(world) {
        return { score: 0 };
    }

    scoreProvideCover(world) {
        let bestTarget = null;
        let bestScore = -1;

        for (const [id, signal] of this.agent.memory.distressSignals) {
            if (signal.type === 'NEED_COVER') {
                const dist = Utils.distance(this.agent.pos, signal.position);
                if (dist < 500 && dist > 100) {
                    const trust = this.agent.memory.socialCredit.get(id) || 0.5;
                    const score = (1.0 - dist / 500) * 3.0 + (this.agent.traits.agreeableness * 5.0) + (trust * 2.0);

                    if (score > bestScore) {
                        bestScore = score;
                        bestTarget = signal.position;
                    }
                }
            }
        }

        if (bestTarget && bestScore > 2.0) {
            return { 
                type: 'MOVE', 
                target: bestTarget, 
                score: bestScore, 
                description: 'covering a teammate',
                movementMode: 'BOUNDING' 
            };
        }

        return { score: 0 };
    }

    scoreResupply(world) {
        const weapon = this.agent.state.inventory.weapon;
        if (weapon.ammo + weapon.carriedAmmo > weapon.maxAmmo * 0.5) return { score: 0 };

        let bestSource = null;
        let bestScore = -1;

        world.agents.forEach(a => {
            if (a.team === this.agent.team && a !== this.agent) {
                const dist = Utils.distance(this.agent.pos, a.pos);
                if (dist > 300) return;

                const theirWeapon = a.state.inventory.weapon;
                if (theirWeapon.name === weapon.name && theirWeapon.carriedAmmo > theirWeapon.maxAmmo) {
                     let score = (1.0 - dist / 300) * 2.0;
                     if (score > bestScore) {
                         bestScore = score;
                         bestSource = a;
                     }
                }
            }
        });

        if (bestSource) {
            if (Utils.distance(this.agent.pos, bestSource.pos) < 30) {
                 return { type: 'RESUPPLY', targetId: bestSource.id, score: bestScore };
            }
            return { type: 'MOVE', target: bestSource.pos, score: bestScore };
        }
        return { score: 0 };
    }
}
