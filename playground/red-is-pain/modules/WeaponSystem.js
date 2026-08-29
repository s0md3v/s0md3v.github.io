import { Config } from './Config.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';
import { Projectile } from './Projectile.js?v=field-console-14';

export class WeaponSystem {
    constructor(agent) {
        this.agent = agent;
        this.pendingReload = null;
    }

    update(now = Date.now()) {
        const state = this.agent.state;

        if (this.pendingReload && now >= this.pendingReload.completeAt) {
            const { weapon, rounds } = this.pendingReload;
            const missing = Math.max(0, weapon.capacity - weapon.ammo);
            const loaded = Math.min(rounds, missing, weapon.carriedAmmo);
            weapon.ammo += loaded;
            weapon.carriedAmmo -= loaded;
            this.pendingReload = null;
        }

        if (state.reloadingUntil > 0 && now >= state.reloadingUntil) {
            state.reloadingUntil = 0;
            state.busyStartedAt = 0;
            state.busyReason = null;
        }
    }

    cancelReload() {
        this.pendingReload = null;
    }

    reload(now = Date.now()) {
        this.update(now);

        const state = this.agent.state;
        const weapon = state.inventory.weapon;
        if (state.reloadingUntil > now || this.pendingReload) return false;

        const missing = Math.max(0, weapon.capacity - weapon.ammo);
        const rounds = Math.min(missing, weapon.carriedAmmo);
        if (rounds <= 0) return false;

        const stressPenalty = 1.0 + (state.stress / 100) * (Config.AGENT.STRESS_RELOAD_MULT - 1.0);
        const reloadTime = weapon.reloadTime * stressPenalty;
        const completeAt = now + reloadTime;

        this.pendingReload = { weapon, rounds, completeAt };
        state.busyStartedAt = now;
        state.busyReason = 'reload';
        state.reloadingUntil = completeAt;
        this.agent.addBark("RELOADING!");
        return true;
    }

    switchWeapon(slot, now) {
        if (this.agent.state.inventory.currentEntry === slot) return;

        this.cancelReload();

        // 1.5s switch time (modified by handling)
        const newWeapon = this.agent.state.inventory[slot];
        const handling = newWeapon.handling || 0.5;
        const switchTime = 1500 * (1.5 - handling); 
        
        this.agent.state.inventory.currentEntry = slot;
        this.agent.state.busyStartedAt = now;
        this.agent.state.busyReason = 'switch';
        this.agent.state.reloadingUntil = now + switchTime;
        this.agent.addBark(slot === 'primary' ? "RIFLE UP!" : "PISTOL!");
    }

    shootAt(targetPos, world, inaccuracyMultiplier = 1.0) {
        const now = Date.now();
        this.update(now);

        // Access via getter after update, as a completed switch/reload may change state.
        const weapon = this.agent.state.inventory.weapon;

        // 0. Auto-Switch Logic
        const distToTarget = Utils.distance(this.agent.pos, targetPos);
        const inventory = this.agent.state.inventory;

        // Emergency Switch: Primary empty -> Pistol
        if (inventory.currentEntry === 'primary' && weapon.ammo <= 0 && weapon.carriedAmmo <= 0) {
             const secondary = inventory.secondary;
             if (secondary.ammo > 0 || secondary.carriedAmmo > 0) {
                 this.switchWeapon('secondary', now);
                 return false;
             }
        }
        
        // Tactical Switch: Sniper/LMG in CQC -> Pistol
        if (inventory.currentEntry === 'primary') {
            const isUnwieldy = weapon.handling < 0.6; // Sniper/LMG
            const isCQC = distToTarget < 100;
            const hasSecondary = inventory.secondary.ammo > 0;
            
            if (isUnwieldy && isCQC && hasSecondary) {
                this.switchWeapon('secondary', now);
                return false;
            }
        }
        
        // Reset Switch: Pistol -> Primary if range opens up
        if (inventory.currentEntry === 'secondary') {
            const primary = inventory.primary;
            const primaryHasAmmo = primary.ammo > 0 || primary.carriedAmmo > 0;
            const rangeSafe = distToTarget > 150;
            
            if (primaryHasAmmo && rangeSafe) {
                this.switchWeapon('primary', now);
                return false;
            }
        }

        // 1. Reloading/Arming Logic
        if (this.agent.state.reloadingUntil > now || this.agent.armingUntil > now) return false;
        
        // NO SHOOTING WHILE SPRINTING
        if (this.agent.movementMode === 'BOUNDING') return false;
        
        if (weapon.ammo <= 0) {
            if (weapon.carriedAmmo <= 0) return false; // Out of ammo completely
            this.reload(now);
            return false;
        }

        // 2. Fire Rate Check
        if (now - this.agent.state.lastFireTime < weapon.fireRate) return false;
        
        // 3. Friendly Fire Safety Check
        
        // COMBAT REALISM: Negligent Discharge
        // If stress is high, we might skip the safety check entirely (Tunnel Vision)
        // High Conscientiousness reduces negligence chance significantly
        // Low C agents (0.0) have almost guaranteed negligence if stressed
        const negligenceChance = (1.0 - this.agent.traits.conscientiousness);
        const isNegligent = this.agent.state.stress > Config.AGENT.FRIENDLY_FIRE_NEGLIGENCE_THRESHOLD && Math.random() < negligenceChance;
        
        const fireAngle = Utils.angle(this.agent.pos, targetPos);

        // Only perform safety check if NOT negligent
        if (!isNegligent) {
            const cos = Math.cos(fireAngle);
            const sin = Math.sin(fireAngle);
            const clearDistance = Math.min(
                weapon.range,
                world.getClearShotDistance(this.agent.pos, fireAngle, weapon.range)
            );
            const suppressionHalfAngle = inaccuracyMultiplier > 1.5
                ? Math.min(0.16, Math.max(0.035, (weapon.spread || 0.05) * inaccuracyMultiplier * 0.5))
                : 0;
            const hasFriendly = world.agents.some(friend => {
                if (friend.team !== this.agent.team || friend.id === this.agent.id || friend.state.isDead) return false;

                const dx = friend.pos.x - this.agent.pos.x;
                const dy = friend.pos.y - this.agent.pos.y;
                const along = dx * cos + dy * sin;
                if (along < 18 || along > clearDistance) return false;

                const lateral = Math.abs(-dx * sin + dy * cos);
                const spreadMargin = Math.tan(suppressionHalfAngle) * along;
                return lateral < friend.radius + 1.5 + spreadMargin;
            });

            if (hasFriendly) {
                if (Math.random() < 0.1) this.agent.addBark("CHECK FIRE!");
                return false;
            }
        } else if (Math.random() < 0.05) {
             this.agent.addBark("OUT OF MY WAY!");
        }

        // 4. Firing Arc Check
        // Allow wider arc for suppression (high inaccuracyMultiplier)
        const targetAngle = Utils.angle(this.agent.pos, targetPos);
        const angleDiff = Math.abs((this.agent.angle - targetAngle + Math.PI) % (Math.PI * 2) - Math.PI);
        const maxArc = inaccuracyMultiplier > 1.5 ? 0.8 : 0.6; 
        
        if (angleDiff > maxArc) return false;

        // 5. Fire!
        weapon.ammo--;
        this.agent.state.lastFireTime = now;
        if (world && world.audio) world.audio.playGunshot();

        // ACCURACY CALCULATION
        // Base spread from weapon stats
        let spread = weapon.spread || 0.05;
        
        // Distance Falloff
        const optimalRange = weapon.optimalRange || 200;
        // Reduced falloff from 0.001 to 0.0006 for tighter spread at 400px
        const effectiveFalloff = 0.0006 * (2.0 - (weapon.handling || 1.0));
        
        if (distToTarget > optimalRange) {
            spread += (distToTarget - optimalRange) * effectiveFalloff;
        }

        // Modifiers
        const stressFactor = (this.agent.state.stress / 100);
        const stressPenalty = stressFactor * Config.AGENT.STRESS_ACCURACY_MULT; // e.g. +0.3 rads at max stress
        const skillBonus = (this.agent.traits.accuracyBase) * 0.02; // Minor skill reduction
        
        // MOVEMENT PENALTY (Dynamic)
        let movementPenalty = 0;
        if (this.agent.isMoving) {
            // Reduced base movement penalty from 0.05 to 0.03
            movementPenalty = 0.03; 
            
            // Strafing/Backwards Penalty: Reduced from 0.25 to 0.12
            const moveAngle = this.agent.motor.smoothedMoveAngle;
            const lookAngle = this.agent.angle;
            const angleDiff = Math.abs(Utils.angleDiff(lookAngle, moveAngle));
            
            movementPenalty += (angleDiff / Math.PI) * 0.12;
        }

        let totalInaccuracy = (spread + stressPenalty + movementPenalty - skillBonus) * inaccuracyMultiplier;
        
        // Clamp minimum spread
        totalInaccuracy = Math.max(0.01, totalInaccuracy);
        
        const shootAngle = this.agent.angle + (Math.random() - 0.5) * totalInaccuracy;
        
        const forwardOffset = 5.5;
        const sideOffset = 2.2;
        const startX = this.agent.pos.x + Math.cos(this.agent.angle) * forwardOffset - Math.sin(this.agent.angle) * sideOffset;
        const startY = this.agent.pos.y + Math.sin(this.agent.angle) * forwardOffset + Math.cos(this.agent.angle) * sideOffset;

        const startingCovers = this.agent.getCurrentCovers(world);

        const projectile = new Projectile(
            this.agent.id,
            this.agent.team,
            startX,
            startY,
            shootAngle,
            1200, // Instant hit scan (was projectileSpeed)
            weapon.damage,
            'BULLET',
            startingCovers,
            null,
            weapon.visualType
        );
        projectile.maxDistance = weapon.range;
        world.projectiles.push(projectile);
        
        world.addSoundEvent(startX, startY, Config.PHYSICS.SOUND_RADIUS_GUNSHOT, 'GUNSHOT', this.agent.id, this.agent.team, null, null);
        return true;
    }
}
