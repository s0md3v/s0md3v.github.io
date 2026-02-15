export class Utils {
    static randomGaussian(mean = 0, stdev = 1) {
        const u = 1 - Math.random(); 
        const v = Math.random();
        const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
        return z * stdev + mean;
    }

    static distance(a, b) {
        if (!a || !b) return 0;
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    static angle(a, b) {
        if (!a || !b) return 0;
        return Math.atan2(b.y - a.y, b.x - a.x);
    }

    static clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
    }

    static lerp(a, b, t) {
        return a + (b - a) * t;
    }

    static angleDiff(a, b) {
        const diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
        return diff < -Math.PI ? diff + Math.PI * 2 : diff;
    }

    static lerpAngle(a, b, t) {
        const diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
        const normalizedDiff = diff < -Math.PI ? diff + Math.PI * 2 : diff;
        return a + normalizedDiff * t;
    }

    static distanceToSegment(p, v, w) {
        const l2 = (w.x - v.x)**2 + (w.y - v.y)**2;
        if (l2 === 0) return Utils.distance(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Utils.distance(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    }
}
