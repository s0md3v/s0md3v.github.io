import { Config } from './Config.js';
import { Utils } from './Utils.js';

export class State {
    constructor(role = 'RIFLEMAN') {
        const loadout = Config.ROLES[role];
        
        this.hp = loadout.hp;
        this.maxHp = loadout.hp;
        this.stamina = Config.AGENT.MAX_STAMINA;
        this.stress = 0; // 0-100
        this.socialBattery = Config.AGENT.MAX_SOCIAL;
        this.morale = Config.AGENT.BASELINE_MORALE;
        this.suppression = 0; // 0-100, decays fast
        this.suppressionSources = []; // { angle, time }
        this.isPinned = false; 
        this.speedMod = loadout.speedMod || 1.0;

        // Deep copy of inventory to track ammo individually
        this.inventory = {
            weapon: { 
                ...loadout.weapon,
                carriedAmmo: loadout.weapon.initialCarriedAmmo || 0
            },
            utility: loadout.utility.map(u => ({ ...u }))
        };
        this.lastFireTime = 0;
        this.reloadingUntil = 0;
        this.isDowned = false;
        this.isDead = false;
        this.isFrozenUntil = 0;
        this.fatigue = 0; // Cumulative permanent stress impact
    }

    modifyStress(amount) {
        if (this.isDowned || Number.isNaN(amount)) return; // Downed agents are shock-locked
        if (amount > 0) {
            // High morale provides resistance to stress gain
            const moraleRatio = (this.morale || 0) / 100;
            const resistance = 1.0 - (moraleRatio * Config.AGENT.MORALE_STRESS_RESISTANCE);
            amount *= (Number.isNaN(resistance) ? 1.0 : resistance);
        }
        
        let targetStress = (this.stress || 0) + amount;
        if (Number.isNaN(targetStress)) targetStress = this.stress || 0;
        
        this.stress = Utils.clamp(targetStress, 0, Config.AGENT.MAX_STRESS);
    }

    modifyMorale(amount) {
        this.morale = Utils.clamp(this.morale + amount, 0, 100);
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.hp = Math.max(0, this.hp - amount);
        this.modifyStress(amount * 0.5);
    }

    consumeStamina(amount) {
        // Fatigue makes stamina drain faster and recover slower
        const fatigueMult = 1.0 + (this.fatigue / 100);
        this.stamina = Math.max(0, this.stamina - amount * fatigueMult);
    }

    update(dt, stressBaseline = 0, isMoving = false) {
        if (this.isDead || Number.isNaN(dt)) return;

        // Ensure baseline is valid
        if (Number.isNaN(stressBaseline)) stressBaseline = 0;

        // Frozen state management
        const now = Date.now();
        if (this.isFrozenUntil > now) {
            this.isPinned = true;
            // No recovery while frozen in shock
            return;
        }

        // Bleed out logic
        if (this.isDowned) {
            this.hp = Math.max(0, (this.hp || 0) - (dt * 0.0002));
            if (this.hp <= 0) {
                this.isDead = true;
                this.hp = 0;
            }
            this.isPinned = true;
            this.stress = 100;
            return;
        }

        // FATIGUE ACCUMULATION: High stress leaves permanent scars
        if (this.stress > 80) {
            this.fatigue = Math.min(100, (this.fatigue || 0) + (dt * 0.001)); 
        }

        // Recovery and decay
        if (Number.isNaN(this.morale)) this.morale = Config.AGENT.BASELINE_MORALE;
        if (Number.isNaN(this.fatigue)) this.fatigue = 0;
        if (Number.isNaN(this.stress)) this.stress = 0;

        // Stress cannot decay below the fatigue floor
        const effectiveBaseline = Math.max(stressBaseline, this.fatigue || 0);

        // Stress clamping
        this.stress = Utils.clamp(this.stress || 0, effectiveBaseline, Config.AGENT.MAX_STRESS);

        // Morale decay/recovery to baseline
        if (this.morale < Config.AGENT.BASELINE_MORALE) this.morale += (dt * 0.001);
        else if (this.morale > Config.AGENT.BASELINE_MORALE) this.morale -= (dt * 0.001);
        
        // Suppression Decay
        if (this.suppression > 0) {
            this.suppression = Math.max(0, (this.suppression || 0) - (dt * 0.05));
        }
        
        // Cleanup old suppression sources (keep last 2 seconds)
        this.suppressionSources = this.suppressionSources.filter(s => (now - s.time) < 2000);
        
        // Stamina Recovery (Penalized by Fatigue)
        const recoveryMult = Math.max(0, 1.0 - ((this.fatigue || 0) / 200));
        let recoveryRate = isMoving ? Config.AGENT.STAMINA_RECOVERY_WALK : Config.AGENT.STAMINA_RECOVERY_IDLE;
        
        this.stamina = Utils.clamp((this.stamina || 0) + (dt * recoveryRate * recoveryMult), 0, Config.AGENT.MAX_STAMINA);

        // Pinning Logic
        this.isPinned = (this.suppression || 0) > Config.PHYSICS.PINNED_THRESHOLD || (this.stress || 0) > Config.PHYSICS.PINNED_THRESHOLD;
        
        // Final Sweep
        if (Number.isNaN(this.hp)) this.hp = this.maxHp;
        if (Number.isNaN(this.morale)) this.morale = Config.AGENT.BASELINE_MORALE;
    }
}
