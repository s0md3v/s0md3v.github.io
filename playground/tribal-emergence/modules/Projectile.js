import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Projectile {
    constructor(ownerId, team, x, y, angle, speed, damage, type = 'BULLET', startingCovers = []) {
        this.ownerId = ownerId;
        this.team = team;
        this.pos = { x, y };
        this.angle = angle;
        this.speed = speed;
        this.damage = damage;
        this.type = type;
        this.radius = type === 'GRENADE' ? 4 : 2;
        this.active = true;
        this.ignoredCovers = startingCovers || []; 
        this.fuse = type === 'GRENADE' ? 2000 : 0; // 2s fuse
    }

    isInsideRect(p, rect) {
        return p.x >= rect.x && p.x <= rect.x + rect.w &&
               p.y >= rect.y && p.y <= rect.y + rect.h;
    }

    update(dt, world) {
        if (!this.active) return;

        if (this.type === 'GRENADE' || this.type === 'SMOKE') {
            this.speed *= 0.95; // Friction
            this.fuse -= dt;
            if (this.fuse <= 0) {
                this.active = false;
                if (this.type === 'SMOKE') {
                    world.addSmoke(this.pos.x, this.pos.y, Config.PHYSICS.SMOKE_RADIUS);
                } else {
                    world.explode(this.pos.x, this.pos.y, this.damage); 
                }
                return;
            }
        }

        const dist = this.speed * (dt / 1000);
        const nextX = this.pos.x + Math.cos(this.angle) * dist;
        const nextY = this.pos.y + Math.sin(this.angle) * dist;

        // Check for wall collision
        if (world.isWallAt(nextX, nextY)) {
            if (this.type === 'GRENADE') {
                this.angle = Math.PI - this.angle; // Simple bounce X
                // Better bounce logic needed but this is okay for now
            } else {
                this.active = false;
                // Impact Suppression on walls
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
                    entity.takeDamage(this.damage, world);
                    this.active = false;
                    return;
                }
            }
        }

        // Out of bounds check
        if (this.pos.x < 0 || this.pos.x > world.width || this.pos.y < 0 || this.pos.y > world.height) {
            this.active = false;
        }
    }
}
