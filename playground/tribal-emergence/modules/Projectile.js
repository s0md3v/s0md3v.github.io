import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Projectile {
    constructor(ownerId, team, x, y, angle, speed, damage, type = 'BULLET', startingCovers = [], targetPos = null, visualType = 'pistol') {
        this.ownerId = ownerId;
        this.visualType = visualType;
        this.team = team;
        this.pos = { x, y };
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.type = type;
        this.radius = type === 'GRENADE' ? 4 : 2;
        this.active = true;
        this.ignoredCovers = startingCovers || []; 
        
        // GRENADE SPECIFICS
        this.fuse = (type === 'GRENADE' || type === 'SMOKE') ? Config.PHYSICS.GRENADE_FUSE : 0;
        this.targetPos = targetPos;
        this.elapsed = 0;
        this.totalDuration = 1200; // 1.2s flight time
        this.startPos = { x, y };
        this.isLanding = false;
    }

    isInsideRect(p, rect) {
        return p.x >= rect.x && p.x <= rect.x + rect.w &&
               p.y >= rect.y && p.y <= rect.y + rect.h;
    }

    update(dt, world) {
        if (!this.active) return;

        this.elapsed += dt;

        if (this.type === 'GRENADE' || this.type === 'SMOKE') {
            this.fuse -= dt;
            
            if (this.fuse <= 0) {
                this.active = false;
                if (this.type === 'SMOKE') {
                    world.addSmoke(this.pos.x, this.pos.y, Config.PHYSICS.SMOKE_RADIUS);
                } else {
                    world.explode(this.pos.x, this.pos.y, Config.PHYSICS.FRAG_RADIUS); 
                }
                return;
            }

            if (this.targetPos && !this.isLanding) {
                // Aimed Throw: Move towards target using ease-out
                const t = Math.min(1, this.elapsed / this.totalDuration);
                const easeOut = 1 - Math.pow(1 - t, 3); // Cubic ease out
                
                this.pos.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * easeOut;
                this.pos.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * easeOut;
                
                if (t >= 1) {
                    this.isLanding = true;
                    this.speed = 20; // Residual roll speed
                    this.angle = Utils.angle(this.startPos, this.targetPos);
                }
                
                // Grenades in "flight" ignore walls/covers (lobbing)
                if (t < 0.8) return; 
            } else {
                // Residual Roll / Bounce
                this.speed *= 0.92;
            }
        }

        const dist = this.speed * (dt / 1000);
        const nextX = this.pos.x + Math.cos(this.angle) * dist;
        const nextY = this.pos.y + Math.sin(this.angle) * dist;

        // Check for wall collision
        if (world.isWallAt(nextX, nextY)) {
            if (this.type === 'GRENADE' || this.type === 'SMOKE') {
                // Vector-based bounce
                const friction = 0.6;
                const bounceStrength = 0.5;
                
                // Determine wall normal (heuristic)
                const step = 4;
                const hitLeft = world.isWallAt(nextX - step, nextY);
                const hitRight = world.isWallAt(nextX + step, nextY);
                const hitTop = world.isWallAt(nextX, nextY - step);
                const hitBottom = world.isWallAt(nextX, nextY + step);

                if (hitLeft !== hitRight) {
                    this.angle = Math.PI - this.angle; // Horizontal bounce
                } else if (hitTop !== hitBottom) {
                    this.angle = -this.angle; // Vertical bounce
                } else {
                    this.angle += Math.PI; // Full redirect (corner)
                }

                this.speed *= bounceStrength;
                this.isLanding = true; // Stop precise flight after a hit
            } else {
                this.active = false;
                world.triggerImpactSuppression(this.pos.x, this.pos.y, 100, 15);
                return;
            }
        }

        this.pos.x = nextX;
        this.pos.y = nextY;

        // Check for local collisions using SpatialGrid
        const localEntities = world.spatial.query(this.pos.x, this.pos.y, 20); // Small radius for bullet

        for (const entity of localEntities) {
            // 1. Cover Collision
            if (entity.isCover) {
                const cover = entity.ref;
                if (this.isInsideRect(this.pos, cover)) {
                    // One-way cover logic: projectile ignores covers it started in or already penetrated
                    if (!this.ignoredCovers.includes(cover)) {
                        // 70% chance to be blocked by cover
                        if (Math.random() < 0.7) {
                            this.active = false;
                            world.damageCover(cover, 2); // Chip damage
                            world.triggerImpactSuppression(this.pos.x, this.pos.y, 80, 10);
                            return;
                        }
                        this.ignoredCovers.push(cover);
                    }
                }
                continue;
            }

            // 2. Agent Collision (FRIENDLY FIRE ENABLED)
            // No team check: bullets hurt everyone
            if (this.ownerId !== entity.id) { // Don't shoot yourself
                if (Utils.distance(this.pos, entity.pos) < entity.radius + this.radius) {
                    if (this.type === 'GRENADE' || this.type === 'SMOKE') {
                        // Impact logic for grenades: minimal damage and bounce/roll
                        if (!this.impactedAgents) this.impactedAgents = new Set();
                        if (!this.impactedAgents.has(entity.id)) {
                            entity.takeDamage(0.1, world); // Minimal "boink" damage
                            this.impactedAgents.add(entity.id);
                            // Slight speed reduction and random bounce on impact
                            this.speed *= 0.5;
                            this.angle += (Math.random() - 0.5) * 1.0;
                            this.isLanding = true; // Stop precise flight
                        }
                    } else {
                        entity.takeDamage(this.damage, world);
                        this.active = false;
                        return;
                    }
                }
            }
        }

        // Out of bounds check
        if (this.pos.x < 0 || this.pos.x > world.width || this.pos.y < 0 || this.pos.y > world.height) {
            this.active = false;
        }
    }
}
