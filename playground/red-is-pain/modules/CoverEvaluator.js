import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';

export class CoverEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
        this.currentCover = null;
    }

    scoreHoldCover(world) {
        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return { score: 0 };

        const enemyPos = enemy.lastKnownPosition || enemy.pos;
        
        const currentCover = this.decision.findNearestCover(world, 60);
        if (!currentCover || Utils.distance(this.agent.pos, currentCover) > 45) {
            this.currentCover = null;
            return { score: 0 };
        }
        
        this.currentCover = currentCover;

        const distToCover = Utils.distance(this.agent.pos, currentCover);
        const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
        const coverToEnemy = Utils.distance(currentCover, enemyPos);
        
        let score = 4.5;
        
        if (this.agent.state.suppression > 0) {
            score += Math.min(5.0, this.agent.state.suppression * 0.2);
        }

        const canSee = world.hasVisualLine(this.agent.pos, enemyPos);
        if (canSee) {
            score += 1.0;
        } else {
            if (this.agent.state.suppression < 10) {
                 score -= 2.0; 
                 if (this.agent.state.reloadingUntil > Date.now()) score += 3.0;
            } else {
                score += 1.0;
            }
        }

        const angleToEnemy = Utils.angle(this.agent.pos, enemyPos);
        const angleToCover = Utils.angle(this.agent.pos, currentCover);
        const angleDiff = Math.abs(Utils.angleDiff(angleToEnemy, angleToCover));
        
        if (angleDiff > 1.5) {
             score -= 10.0;
             this.agent.addBark("FLANKED!");
        }
        
        if (distToEnemy < 80) {
            score -= 3.0;
        }

        return { type: 'HOLD', score: score, target: currentCover, description: 'staying behind cover' };
    }

    scoreReposition(world) {
        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return { score: 0 };

        if (this.agent.state.suppression > 50) return { score: 0 };

        const bestCover = this.decision.findNearestCover(world, 600);
        if (!bestCover) return { score: 0 };

        if (Utils.distance(this.agent.pos, bestCover) < 40) return { score: 0 };

        let score = 2.5;

        if (this.agent.traits.openness > 0.6) score += 0.5;
        
        return { type: 'MOVE', target: bestCover, score: score, movementMode: 'BOUNDING' };
    }
}
