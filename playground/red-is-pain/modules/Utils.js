export class Utils {
    static randomGaussian(mean = 0, stdev = 1) {
        const u = 1 - Math.random(); 
        const v = Math.random();
        const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
        return z * stdev + mean;
    }

    static distance(a, b) {
        if (!a || !b) return 0;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (isNaN(d)) return 0;
        return d;
    }

    static angle(a, b) {
        if (!a || !b || !isFinite(a.x) || !isFinite(b.x)) return 0;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        return isFinite(ang) ? ang : 0;
    }

    static clamp(val, min, max) {
        if (isNaN(val)) return min || 0;
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
        if (!isFinite(a) || !isFinite(b)) return isFinite(a) ? a : (isFinite(b) ? b : 0);
        const diff = (b - a + Math.PI) % (Math.PI * 2) - Math.PI;
        const normalizedDiff = diff < -Math.PI ? diff + Math.PI * 2 : diff;
        return a + normalizedDiff * t;
    }

    static distanceToSegment(p, v, w) {
        const l2 = (w.x - v.x)**2 + (w.y - v.y)**2;
        if (l2 === 0) return Utils.distance(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
        return Math.hypot(p.x - proj.x, p.y - proj.y);
    }
    
    static distanceToRect(p, r) {
        const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
        const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
        return Math.sqrt(dx*dx + dy*dy);
    }

    static pointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    static rasterizePolygon(grid, points, value, gridSize) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        const gMinX = Math.floor(minX / gridSize);
        const gMaxX = Math.ceil(maxX / gridSize);
        const gMinY = Math.floor(minY / gridSize);
        const gMaxY = Math.ceil(maxY / gridSize);

        for (let y = gMinY; y < gMaxY; y++) {
            for (let x = gMinX; x < gMaxX; x++) {
                if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) continue;
                
                const wx = x * gridSize + gridSize/2;
                const wy = y * gridSize + gridSize/2;
                
                const q = gridSize * 0.4;
                if (Utils.pointInPolygon(wx, wy, points) ||
                    Utils.pointInPolygon(wx - q, wy - q, points) ||
                    Utils.pointInPolygon(wx + q, wy - q, points) ||
                    Utils.pointInPolygon(wx - q, wy + q, points) ||
                    Utils.pointInPolygon(wx + q, wy + q, points)) {
                    grid[y][x] = value;
                }
            }
        }
    }
}

export class PriorityQueue {
    constructor(comparator = (a, b) => a - b) {
        this.heap = [];
        this.comparator = comparator;
    }
    push(value) {
        this.heap.push(value);
        this.bubbleUp();
    }
    pop() {
        if (this.size() === 0) return null;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.size() > 0) {
            this.heap[0] = bottom;
            this.bubbleDown();
        }
        return top;
    }
    peek() { return this.size() > 0 ? this.heap[0] : null; }
    size() { return this.heap.length; }
    bubbleUp() {
        let index = this.heap.length - 1;
        while (index > 0) {
            let parent = (index - 1) >> 1;
            if (this.comparator(this.heap[index], this.heap[parent]) < 0) {
                [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
                index = parent;
            } else break;
        }
    }
    bubbleDown() {
        let index = 0;
        const length = this.heap.length;
        while (true) {
            let left = (index << 1) + 1;
            let right = (index << 1) + 2;
            let swap = null;
            if (left < length) {
                if (this.comparator(this.heap[left], this.heap[index]) < 0) swap = left;
            }
            if (right < length) {
                if ((swap === null && this.comparator(this.heap[right], this.heap[index]) < 0) ||
                    (swap !== null && this.comparator(this.heap[right], this.heap[left]) < 0)) swap = right;
            }
            if (swap === null) break;
            [this.heap[index], this.heap[swap]] = [this.heap[swap], this.heap[index]];
            index = swap;
        }
    }
}
