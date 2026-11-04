import { Config } from './Config.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';

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

        const primaryWeapon = Config.WEAPONS[loadout.primary];
        const secondaryWeapon = Config.WEAPONS[loadout.secondary];

        this.inventory = {
            primary: { 
                ...primaryWeapon,
                ammo: primaryWeapon.capacity,
                maxAmmo: primaryWeapon.capacity,
                carriedAmmo: loadout.ammo[loadout.primary] || 0
            },
            secondary: { 
                ...secondaryWeapon,
                ammo: secondaryWeapon.capacity,
                maxAmmo: secondaryWeapon.capacity,
                carriedAmmo: loadout.ammo[loadout.secondary] || 0
            },
            currentEntry: 'primary',
            utility: loadout.utility.map(u => ({ ...u }))
        };
        
        Object.defineProperty(this.inventory, 'weapon', {
            get: function() { return this[this.currentEntry]; }
        });
        this.lastFireTime = 0;
        this.reloadingUntil = 0;
        this.busyStartedAt = 0;
        this.busyReason = null;
        this.isDead = false;
        this.isFrozenUntil = 0;
        this.fatigue = 0;
        this.inSmoke = false;
        this.inBush = false;
        
        this.isBattleBuddyActive = false;
        this.isHeroic = false;
        this.isBroken = false;
        this.adrenaline = 0; // 0-100, temporary boost
    }

    onKill() {
        this.modifyMorale(Config.AGENT.MORALE_GAIN_KILL);
        this.stress = Math.max(0, this.stress - 20);
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
            const moraleRatio = (this.morale || 0) / 100;
            let resistance = 1.0 - (moraleRatio * Config.AGENT.MORALE_STRESS_RESISTANCE);
            
            if (this.isBattleBuddyActive) {
                resistance -= Config.AGENT.BATTLE_BUDDY_STRESS_RESISTANCE;
            }
            
            resistance = Math.max(0.1, resistance);
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
        const fatigueMult = 1.0 + (this.fatigue / 100);
        this.stamina = Math.max(0, this.stamina - amount * fatigueMult);
    }

    update(dt, stressBaseline = 0, isMoving = false) {
        if (this.isDead || Number.isNaN(dt)) return;

        if (Number.isNaN(stressBaseline)) stressBaseline = 0;

        const now = Date.now();
        if (this.isFrozenUntil > now) {
            this.isPinned = true;
            return;
        }

        const driftSpeed = dt * 0.01;

        if (this.stress > 90) {
            this.fatigue = Math.min(100, (this.fatigue || 0) + (dt * 0.0002)); 
        }

        const effectiveBaseline = Math.max(stressBaseline, this.fatigue || 0);

        if (this.stress > effectiveBaseline) {
            this.stress = Math.max(effectiveBaseline, this.stress - (dt * 0.005));
        } else if (this.stress < effectiveBaseline) {
            this.stress = Math.min(effectiveBaseline, this.stress + (dt * 0.005));
        }

        const moraleBase = Config.AGENT.BASELINE_MORALE;
        let moraleDriftRate = 0.001;
        if (this.morale > Config.AGENT.MORALE_HEROIC_THRESHOLD) moraleDriftRate = 0.0005;

        if (this.morale < moraleBase) {
            this.morale = Math.min(moraleBase, this.morale + (dt * 0.001));
        } else if (this.morale > moraleBase) {
            this.morale = Math.max(moraleBase, this.morale - (dt * moraleDriftRate));
        }

        this.isHeroic = this.morale > Config.AGENT.MORALE_HEROIC_THRESHOLD;
        this.isBroken = this.morale < Config.AGENT.MORALE_BROKEN_THRESHOLD;

        if (this.suppression > 0) {
            this.suppression = Math.max(0, this.suppression - (dt * 0.05));
        }

        if (this.adrenaline > 0) {
            this.adrenaline = Math.max(0, this.adrenaline - (dt * 0.015));
        }
        
        this.suppressionSources = this.suppressionSources.filter(s => (now - s.time) < 2000);
        
        const recoveryMult = Math.max(0, 1.0 - ((this.fatigue || 0) / 200)) * (1.0 + (this.adrenaline / 100));
        let recoveryRate = isMoving ? Config.AGENT.STAMINA_RECOVERY_WALK : Config.AGENT.STAMINA_RECOVERY_IDLE;
        
        this.stamina = Utils.clamp((this.stamina || 0) + (dt * recoveryRate * recoveryMult), 0, Config.AGENT.MAX_STAMINA);

        this.isPinned = this.suppression > Config.PHYSICS.PINNED_THRESHOLD || this.stress > Config.PHYSICS.PINNED_THRESHOLD;
        
        if (Number.isNaN(this.hp)) this.hp = this.maxHp;
        if (Number.isNaN(this.morale)) this.morale = 100;
    }
}
