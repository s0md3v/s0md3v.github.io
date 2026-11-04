(function () {
    const chart = document.querySelector('.chart');
    if (!chart) return;
    const list = chart.querySelector('.projects');
    const stars = [...list.querySelectorAll('.stars svg')];
    const today = chart.querySelector('.today');
    if (!stars.length || !today) return;
    const layer = document.createElement('div');
    layer.className = 'trail';
    layer.setAttribute('aria-hidden', 'true');
    chart.prepend(layer);

    const CRUMB = 1.4;
    const CLEAR = 0.75;

    const shape = n => ['', 'b2', 'b3'][(n * 7 + (n >> 2)) % 3];

    function lay() {
        const em = parseFloat(getComputedStyle(list).fontSize);
        const base = chart.getBoundingClientRect();
        const chunk = getComputedStyle(today, '::before');
        const end = {
            el: today,
            x: today.offsetLeft + parseFloat(chunk.left),
            y: today.getBoundingClientRect().top - base.top + parseFloat(chunk.top),
            width: parseFloat(chunk.width),
            height: parseFloat(chunk.height),
        };
        const x = end.x;

        const Y0 = -innerHeight - 200, length = end.y - Y0;
        const sAtY = y => Math.min(Math.max(y - Y0, 0), length);
        const at = s => ({ x, y: Y0 + Math.min(Math.max(s, 0), length), dx: 0, dy: 1 });

        const bits = stars.map(el => {
            const box = el.getBoundingClientRect();
            const count = el.parentElement.querySelector('span[aria-hidden="true"]');
            const y = box.top + box.height / 2 - base.top;
            const below = Math.max(box.bottom, count ? count.getBoundingClientRect().bottom : 0) - base.top;
            return { el, s: sAtY(y), y, top: y - box.height / 2, below };
        });

        const fragment = document.createDocumentFragment();
        const stops = [{ below: -1.5 * em - CLEAR * em }, ...bits, { top: end.y - end.height / 2 }];
        let n = 0;
        for (let i = 1; i < stops.length - 1; i++) {
            const from = stops[i - 1].below + CLEAR * em, to = stops[i].top - CLEAR * em;
            const count = Math.floor((to - from) / (CRUMB * em));
            for (let k = 1; k <= count; k++, n++) {
                const y = from + (to - from) * (k - 0.5) / count;
                const el = document.createElement('span');
                el.className = `bit ${shape(n)}`.trim();
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
                fragment.append(el);
                bits.push({ el, s: sAtY(y), y });
            }
        }
        bits.sort((p, q) => p.s - q.s);
        layer.replaceChildren(fragment);

        chart.trail = { at, sAtY, bits, end };
        chart.dispatchEvent(new Event('trail'));
    }

    let width = 0;
    lay();
    new ResizeObserver(([entry]) => {
        if (entry.contentRect.width === width) return;
        width = entry.contentRect.width;
        lay();
    }).observe(list);
    document.fonts?.ready.then(lay);
})();
