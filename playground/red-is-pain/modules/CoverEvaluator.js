import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class CoverEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
        this.currentCover = null;
    }

    // Evaluate maintaining current cover position
    scoreHoldCover(world) {
        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return { score: 0 };

        const enemyPos = enemy.lastKnownPosition || enemy.pos;
        
        // 1. Are we in cover?
        const currentCover = this.decision.findNearestCover(world, 60);
        if (!currentCover || Utils.distance(this.agent.pos, currentCover) > 45) {
            this.currentCover = null;
            return { score: 0 }; // Should have returned HOLD before this if valid
        }
        
        this.currentCover = currentCover;

        // 2. Is cover effective?
        // Check if the cover actually overlaps the line to the enemy
        // Or if we are in a 'safe spot' relative to the cover
        // Simple check: Is the cover between us and the enemy?
        const distToCover = Utils.distance(this.agent.pos, currentCover);
        const distToEnemy = Utils.distance(this.agent.pos, enemyPos);
        const coverToEnemy = Utils.distance(currentCover, enemyPos);
        
        // Geometric check: Is cover roughly on the line? 
        // If (DistToCover + CoverToEnemy) is close to DistToEnemy, it's between us.
        // But we might be behind it.
        // Let's rely on TacticalEvaluator's "safe spot" calculation usually putting us there.
        // Instead, let's check EXPOSURE.
        
        // SIMULATION REALISM: If I stick my head out, I can shoot, but I am exposed.
        // If I hunker, I am safe but can't shoot.
        // We assume 'HOLD' means using the cover intelligently (peeking).
        
        let score = 4.5; // BASE: High incentive to stay alive
        
        // 3. Modifiers

        // A. Suppression Defense
        if (this.agent.state.suppression > 0) {
            score += Math.min(5.0, this.agent.state.suppression * 0.2); // Up to +5 score if pinned
        }

        // B. Offensive Opportunity (Can I shoot from here?)
        // If I can see the enemy from my cover (peeking), it's a great spot.
        const canSee = world.hasLineOfSight(this.agent.pos, enemyPos);
        if (canSee) {
            score += 1.0; // Good fighting position
        } else {
            // I can't see them. Am I pinned?
            if (this.agent.state.suppression < 10) {
                 // Not pinned, but blind. I should probably move or peek.
                 score -= 2.0; 
                 // Unless I am reloading or healing
                 if (this.agent.state.reloadingUntil > Date.now()) score += 3.0; // RELOAD IN COVER!
            } else {
                // Pinned and blind is fine. Stay down.
                score += 1.0;
            }
        }

        // C. Flanked Check
        const angleToEnemy = Utils.angle(this.agent.pos, enemyPos);
        const angleToCover = Utils.angle(this.agent.pos, currentCover);
        const angleDiff = Math.abs(Utils.angleDiff(angleToEnemy, angleToCover));
        
        // If cover is NOT generally towards the enemy (i.e. angle diff is large), we are flanked.
        // If cover is at 0 deg and enemy is at 180, we are exposed.
        // If cover is at 0 and enemy is at 0, we are behind it (roughly).
        // Wait, if I am BEHIND cover, looking at enemy, the cover is in front of me.
        // So Angle(Me->Cover) should be similar to Angle(Me->Enemy).
        if (angleDiff > 1.5) { // ~90 degrees
             // FLANKED! Cover is useless.
             score -= 10.0;
             this.agent.addBark("FLANKED!");
        }
        
        // D. Range Check
        if (distToEnemy < 80) {
            score -= 3.0; // Too close, they might rush around
        }

        return { type: 'HOLD', score: score, target: currentCover, description: 'Hold Cover' };
    }

    // Evaluate moving to better cover
    scoreReposition(world) {
        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return { score: 0 };

        // Only reposition if:
        // 1. Not currently in cover OR current cover is compromised
        // 2. Suppression is low enough to move
        
        if (this.agent.state.suppression > 50) return { score: 0 }; // Pinned!

        const bestCover = this.decision.findNearestCover(world, 600);
        if (!bestCover) return { score: 0 };

        // If we are already there, don't reposition
        if (Utils.distance(this.agent.pos, bestCover) < 40) return { score: 0 };

        let score = 2.5;

        // Modifiers
        if (this.agent.traits.openness > 0.6) score += 0.5; // Creative/Tactical agents move more
        
        return { type: 'MOVE', target: bestCover, score: score, movementMode: 'BOUNDING' };
    }
}
