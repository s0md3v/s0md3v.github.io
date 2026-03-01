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

        // Inventory System
        const primaryWeapon = Config.WEAPONS[loadout.primary];
        const secondaryWeapon = Config.WEAPONS[loadout.secondary];

        this.inventory = {
            primary: { 
                ...primaryWeapon,
                ammo: primaryWeapon.capacity,
                maxAmmo: primaryWeapon.capacity,
                carriedAmmo: loadout.ammo[primaryWeapon.name] || 0
            },
            secondary: { 
                ...secondaryWeapon,
                ammo: secondaryWeapon.capacity,
                maxAmmo: secondaryWeapon.capacity,
                carriedAmmo: loadout.ammo[secondaryWeapon.name] || 0
            },
            currentEntry: 'primary',
            ammo: { ...loadout.ammo }, // Shared ammo pool by name
            utility: loadout.utility.map(u => ({ ...u }))
        };
        
        // Helper getter for active weapon
        Object.defineProperty(this.inventory, 'weapon', {
            get: function() { return this[this.currentEntry]; }
        });
        this.lastFireTime = 0;
        this.reloadingUntil = 0;
        this.isDead = false;
        this.isFrozenUntil = 0;
        this.fatigue = 0; // Cumulative permanent stress impact
        this.inSmoke = false;
        this.inBush = false;
        
        // Dynamic States
        this.isBattleBuddyActive = false;
        this.isHeroic = false;
        this.isBroken = false;
        this.adrenaline = 0; // 0-100, temporary boost
    }

    onKill() {
        this.modifyMorale(Config.AGENT.MORALE_GAIN_KILL);
        this.stress = Math.max(0, this.stress - 20); // Relief
    }

    onWitnessKill() {
        this.modifyMorale(Config.AGENT.MORALE_GAIN_WITNESS_KILL);
        this.stress = Math.max(0, this.stress - 5);
    }

    onAllyDeath(isFriend = false) {
        if (isFriend) {
            this.modifyStress(Config.AGENT.STRESS_SPIKE_FRIEND_DEATH);
            this.modifyMorale(-Config.AGENT.MORALE_LOSS_FRIEND_DEATH);
            this.modifyAdrenaline(40);
        } else {
            this.modifyStress(Config.AGENT.STRESS_SPIKE_ALLY_DEATH);
            this.modifyMorale(-Config.AGENT.MORALE_LOSS_ALLY_DEATH);
            this.modifyAdrenaline(20);
        }
    }

    modifyAdrenaline(amount) {
        this.adrenaline = Utils.clamp(this.adrenaline + amount, 0, 100);
    }

    modifyStress(amount) {
        if (Number.isNaN(amount)) return; 
        if (amount > 0) {
            // High morale provides resistance to stress gain
            // High morale provides resistance to stress gain
            const moraleRatio = (this.morale || 0) / 100;
            let resistance = 1.0 - (moraleRatio * Config.AGENT.MORALE_STRESS_RESISTANCE);
            
            // Battle Buddy Resistance
            if (this.isBattleBuddyActive) {
                resistance -= Config.AGENT.BATTLE_BUDDY_STRESS_RESISTANCE;
            }
            
            resistance = Math.max(0.1, resistance); // Minimum 10% stress gain
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
        this.modifyAdrenaline(amount * 10);
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
            return;
        }

        // 1. STRESS & MORALE DRIFT (The 'flicker' fix)
        // Instead of immediate snaps, we drift values toward their baselines over time
        const driftSpeed = dt * 0.01; // Scale by time

        // Fatigue accumulation (Permanent scars)
        if (this.stress > 90) {
            this.fatigue = Math.min(100, (this.fatigue || 0) + (dt * 0.0002)); 
        }

        // Stress cannot decay below the fatigue floor
        const effectiveBaseline = Math.max(stressBaseline, this.fatigue || 0);

        // DRift Stress toward baseline
        if (this.stress > effectiveBaseline) {
            // Passive decay is slow
            this.stress = Math.max(effectiveBaseline, this.stress - (dt * 0.005));
        } else if (this.stress < effectiveBaseline) {
            // Environment stress gain
            this.stress = Math.min(effectiveBaseline, this.stress + (dt * 0.005));
        }

        // Drift Morale toward baseline
        const moraleBase = Config.AGENT.BASELINE_MORALE;
        let moraleDriftRate = 0.001;
        if (this.morale > Config.AGENT.MORALE_HEROIC_THRESHOLD) moraleDriftRate = 0.0005;

        if (this.morale < moraleBase) {
            this.morale = Math.min(moraleBase, this.morale + (dt * 0.001));
        } else if (this.morale > moraleBase) {
            this.morale = Math.max(moraleBase, this.morale - (dt * moraleDriftRate));
        }

        // 2. HEROIC / BROKEN STATES
        this.isHeroic = this.morale > Config.AGENT.MORALE_HEROIC_THRESHOLD;
        this.isBroken = this.morale < Config.AGENT.MORALE_BROKEN_THRESHOLD;

        // 3. Suppression Decay
        if (this.suppression > 0) {
            this.suppression = Math.max(0, this.suppression - (dt * 0.05));
        }

        // 4. Adrenaline Decay
        if (this.adrenaline > 0) {
            this.adrenaline = Math.max(0, this.adrenaline - (dt * 0.015));
        }
        
        this.suppressionSources = this.suppressionSources.filter(s => (now - s.time) < 2000);
        
        // 5. Stamina Recovery
        const recoveryMult = Math.max(0, 1.0 - ((this.fatigue || 0) / 200)) * (1.0 + (this.adrenaline / 100));
        let recoveryRate = isMoving ? Config.AGENT.STAMINA_RECOVERY_WALK : Config.AGENT.STAMINA_RECOVERY_IDLE;
        
        this.stamina = Utils.clamp((this.stamina || 0) + (dt * recoveryRate * recoveryMult), 0, Config.AGENT.MAX_STAMINA);

        // 6. Pinning Logic
        this.isPinned = this.suppression > Config.PHYSICS.PINNED_THRESHOLD || this.stress > Config.PHYSICS.PINNED_THRESHOLD;
        
        // Final Sweep
        if (Number.isNaN(this.hp)) this.hp = this.maxHp;
        if (Number.isNaN(this.morale)) this.morale = 100; // Reset corrupted values
    }
}
