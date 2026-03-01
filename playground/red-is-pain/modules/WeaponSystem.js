import { Config } from './Config.js';
import { Utils } from './Utils.js';
import { Projectile } from './Projectile.js';

export class WeaponSystem {
    constructor(agent) {
        this.agent = agent;
    }

    switchWeapon(slot, now) {
        if (this.agent.state.inventory.currentEntry === slot) return;

        // 1.5s switch time (modified by handling)
        const newWeapon = this.agent.state.inventory[slot];
        const handling = newWeapon.handling || 0.5;
        const switchTime = 1500 * (1.5 - handling); 
        
        this.agent.state.inventory.currentEntry = slot;
        this.agent.state.reloadingUntil = now + switchTime;
        this.agent.addBark(slot === 'primary' ? "RIFLE UP!" : "PISTOL!");
    }

    shootAt(targetPos, world, inaccuracyMultiplier = 1.0) {
        // Access via getter
        const weapon = this.agent.state.inventory.weapon;
        const now = Date.now();

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

            // STRESS PENALTY: Reloading is slower when panicked
            const stressPenalty = 1.0 + (this.agent.state.stress / 100) * (Config.AGENT.STRESS_RELOAD_MULT - 1.0);
            this.agent.state.reloadingUntil = now + (weapon.reloadTime * stressPenalty);
            
            const refillAmount = Math.min(weapon.capacity, weapon.carriedAmmo);
            weapon.ammo = refillAmount;
            
            // Check for shared ammo (unlikely in this model but good practice)
            // Actually config uses shared keys, but State initializes separate objects.
            // Wait, State.js copies values. 
            // FIXED: Config now defines shared `inventory.ammo` pool.
            const ammoType = weapon.name;
            const pool = this.agent.state.inventory.ammo;
            
            // Simple string matching or direct decrement?
            // Let's assume the pool key matches weapon name for now (Config refactor needed?)
            // The Config update used: ammo: { 'M4A1': 120 }
            
            // Fallback for legacy ID reuse
            let available = weapon.carriedAmmo; 
            if (pool && pool[weapon.name] !== undefined) {
                 available = pool[weapon.name];
                 const take = Math.min(weapon.capacity, available);
                 pool[weapon.name] -= take;
                 weapon.ammo = take;
            } else {
                // Fallback (Unlimited/Legacy)
                 weapon.carriedAmmo -= refillAmount;
            }
            
            this.agent.addBark("RELOADING!");
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
        
        // TRIGGER DISCIPLINE (Ambush Logic)
        if (this.agent.state.inBush && !isNegligent) {
            // Only shoot if:
            // 1. Enemy is close (Ambush range)
            // 2. OR We are already compromised (High stress/suppression)
            // 3. OR We are a Gunner (No discipline)
            const weapon = this.agent.state.inventory.weapon; // Re-fetch active
            const ambushRange = weapon.optimalRange * 0.4; // 80m for Rifle, 20m for Shotgun
            const compromised = this.agent.state.stress > 30 || this.agent.state.suppression > 10;
            
            if (distToTarget > ambushRange && !compromised && weapon.capacity < 60) {
                return false; // Hold fire!
            }
        }

        const checkStep = 20;
        const steps = Math.min(10, Math.ceil(distToTarget / checkStep)); // Check first 200px or so
        const fireAngle = Utils.angle(this.agent.pos, targetPos);

        // Only perform safety check if NOT negligent
        if (!isNegligent) {
            // Optimization: Spatial query once
            const checkRadius = steps * checkStep;
            const friends = world.spatial.query(this.agent.pos.x, this.agent.pos.y, checkRadius);
            
            for (let i = 1; i <= steps; i++) {
                const checkX = this.agent.pos.x + Math.cos(fireAngle) * (i * checkStep);
                const checkY = this.agent.pos.y + Math.sin(fireAngle) * (i * checkStep);
                
                const hasFriendly = friends.some(f => {
                    if (f.team !== this.agent.team || f.id === this.agent.id || f.isCover) return false;
                    // Precise Phase: Distance to line of fire
                    const distToLine = Utils.distanceToSegment(f.pos, this.agent.pos, {x: checkX, y: checkY}); 
                    return distToLine < (f.radius + 4); // 4px margin
                });
                
                if (hasFriendly) {
                   if (Math.random() < 0.1) this.agent.addBark("CHECK FIRE!");
                   return false;
                }
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
        
        const forwardOffset = 8;
        const sideOffset = 4;
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
        world.projectiles.push(projectile);
        
        world.addSoundEvent(startX, startY, Config.PHYSICS.SOUND_RADIUS_GUNSHOT, 'GUNSHOT', this.agent.id, this.agent.team, null, null);
        return true;
    }
}
