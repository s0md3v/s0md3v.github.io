import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';

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
        this.distanceTraveled = 0;
        this.maxDistance = Infinity;
        this.totalDuration = 1200; // 1.2s flight time
        this.startPos = { x, y };
        this.isLanding = false;
    }

    isInsideRect(p, rect) {
        return p.x >= rect.x && p.x <= rect.x + rect.w &&
               p.y >= rect.y && p.y <= rect.y + rect.h;
    }

    segmentCircleHitT(start, end, center, radius) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const fx = start.x - center.x;
        const fy = start.y - center.y;
        const a = dx * dx + dy * dy;
        if (a === 0) return Utils.distance(start, center) <= radius ? 0 : null;

        const c = fx * fx + fy * fy - radius * radius;
        if (c <= 0) return 0;

        const b = 2 * (fx * dx + fy * dy);
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return null;

        const root = Math.sqrt(discriminant);
        const first = (-b - root) / (2 * a);
        const second = (-b + root) / (2 * a);
        if (first >= 0 && first <= 1) return first;
        if (second >= 0 && second <= 1) return second;
        return null;
    }

    segmentIntersectionT(a, b, c, d) {
        const r = { x: b.x - a.x, y: b.y - a.y };
        const s = { x: d.x - c.x, y: d.y - c.y };
        const cross = r.x * s.y - r.y * s.x;
        if (Math.abs(cross) < 1e-9) return null;

        const q = { x: c.x - a.x, y: c.y - a.y };
        const t = (q.x * s.y - q.y * s.x) / cross;
        const u = (q.x * r.y - q.y * r.x) / cross;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
    }

    shapeHitT(start, end, shape) {
        if (shape.points?.length >= 2) {
            if (shape.closed && shape.points.length >= 3) {
                if (Utils.pointInPolygon(start.x, start.y, shape.points)) return 0;
                let nearest = null;
                for (let i = 0; i < shape.points.length; i++) {
                    const hit = this.segmentIntersectionT(
                        start,
                        end,
                        shape.points[i],
                        shape.points[(i + 1) % shape.points.length]
                    );
                    if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
                }
                return nearest;
            }

            const travel = Utils.distance(start, end);
            const hitRadius = Math.max(this.radius, (shape.thickness || 6) / 2);
            const samples = Math.max(1, Math.ceil(travel / Math.max(1, hitRadius / 2)));
            for (let sample = 0; sample <= samples; sample++) {
                const t = sample / samples;
                const point = {
                    x: start.x + (end.x - start.x) * t,
                    y: start.y + (end.y - start.y) * t
                };
                for (let i = 1; i < shape.points.length; i++) {
                    if (Utils.distanceToSegment(point, shape.points[i - 1], shape.points[i]) <= hitRadius) {
                        return t;
                    }
                }
            }
            return null;
        }

        if ([shape.x, shape.y, shape.w, shape.h].every(Number.isFinite)) {
            const points = [
                { x: shape.x, y: shape.y },
                { x: shape.x + shape.w, y: shape.y },
                { x: shape.x + shape.w, y: shape.y + shape.h },
                { x: shape.x, y: shape.y + shape.h }
            ];
            return this.shapeHitT(start, end, { points, closed: true });
        }

        return null;
    }

    updateBullet(dt, world) {
        const remainingRange = this.maxDistance - this.distanceTraveled;
        const travel = Math.min(this.speed * (dt / 1000), remainingRange);
        if (travel <= 0) return;

        const start = { x: this.pos.x, y: this.pos.y };
        const end = {
            x: start.x + Math.cos(this.angle) * travel,
            y: start.y + Math.sin(this.angle) * travel
        };
        const collisions = [];

        // Hard walls use the high-resolution collision grid. Low cover is handled
        // separately so its material penetration chance remains meaningful.
        const wallSteps = Math.max(1, Math.ceil(travel / world.gridSize));
        for (let step = 1; step <= wallSteps; step++) {
            const t = step / wallSteps;
            const x = start.x + (end.x - start.x) * t;
            const y = start.y + (end.y - start.y) * t;
            const gx = Math.floor(x / world.gridSize);
            const gy = Math.floor(y / world.gridSize);
            const cell = world.grid[gy]?.[gx];
            if (cell === 1 || cell === 4 || gx < 0 || gy < 0 || gy >= world.grid.length || gx >= world.grid[0].length) {
                collisions.push({ type: 'wall', t });
                break;
            }
        }

        const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const candidates = world.spatial.query(midpoint.x, midpoint.y, travel / 2 + 24);
        for (const entity of candidates) {
            if (entity.isCover) {
                const cover = entity.ref;
                if (this.ignoredCovers.includes(cover)) continue;
                const t = this.shapeHitT(start, end, cover);
                if (t !== null) collisions.push({ type: 'cover', t, cover });
                continue;
            }

            if (entity.id === this.ownerId || entity.state?.isDead) continue;
            const t = this.segmentCircleHitT(start, end, entity.pos, entity.radius + this.radius);
            if (t !== null) collisions.push({ type: 'agent', t, entity });
        }

        collisions.sort((a, b) => a.t - b.t);
        for (const collision of collisions) {
            const hitPos = {
                x: start.x + (end.x - start.x) * collision.t,
                y: start.y + (end.y - start.y) * collision.t
            };

            if (collision.type === 'cover') {
                if (Math.random() >= 0.7) {
                    this.ignoredCovers.push(collision.cover);
                    continue;
                }
                this.pos = hitPos;
                this.distanceTraveled += travel * collision.t;
                this.active = false;
                world.damageCover(collision.cover, 2);
                world.triggerImpactSuppression(hitPos.x, hitPos.y, 80, 10);
                return;
            }

            this.pos = hitPos;
            this.distanceTraveled += travel * collision.t;
            this.active = false;
            if (collision.type === 'agent') {
                collision.entity.takeDamage(this.damage, world, this.ownerId);
            } else {
                world.triggerImpactSuppression(hitPos.x, hitPos.y, 100, 15);
            }
            return;
        }

        this.pos = end;
        this.distanceTraveled += travel;
        if (this.distanceTraveled >= this.maxDistance || end.x < 0 || end.x > world.width || end.y < 0 || end.y > world.height) {
            this.active = false;
        }
    }

    update(dt, world) {
        if (!this.active) return;

        this.elapsed += dt;

        if (this.type === 'BULLET') {
            this.updateBullet(dt, world);
            return;
        }

        if (this.type === 'GRENADE' || this.type === 'SMOKE') {
            this.fuse -= dt;
            
            if (this.fuse <= 0) {
                this.active = false;
                if (this.type === 'SMOKE') {
                    world.addSmoke(this.pos.x, this.pos.y, Config.PHYSICS.SMOKE_RADIUS);
                } else {
                    world.explode(this.pos.x, this.pos.y, Config.PHYSICS.FRAG_RADIUS, this.ownerId); 
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
                            this.impactedAgents.add(entity.id);
                            // Bounce slightly but do NOT push or damage the agent
                            this.speed *= 0.5;
                            this.angle += (Math.random() - 0.5) * 1.0;
                            this.isLanding = true; // Stop precise flight
                        }
                    } else {
                        entity.takeDamage(this.damage, world, this.ownerId);
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
