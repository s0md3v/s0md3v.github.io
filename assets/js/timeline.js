// The years on the line, where there's a side for each (pages/projects.html)
(function () {
    const years = [...document.querySelectorAll('.timeline .year')];
    const today = document.querySelector('.timeline .today');
    if (!years.length) return;
    const wide = matchMedia('(min-width: 1160px)');

    // A year starts as high as it can: below the one before it on the line, which is time, and
    // below what's already on its own side, but beside what's on the other. A year of only big
    // projects leaves the other side to the next, rather than to nothing. In ems:
    const AFTER_ON_LINE = 2;   // from the last thing on the line to the next year's label
    const AFTER_BIG = 4;       // between one year's big projects and the next's
    const AFTER_SMALL = 3;     // between one year's small projects and the next's
    const AFTER_ALL = 4.5;     // from the last of it to "now"

    function lay() {
        years.forEach(year => {
            year.style.marginTop = '';
            year.querySelector('.year-label').style.bottom = '';
        });
        if (today) today.style.marginTop = '';
        if (!wide.matches) return;

        const em = parseFloat(getComputedStyle(years[0]).fontSize);
        // Each measured from its year's top, which is the same wherever the year's put
        const parts = years.map(year => {
            const top = year.getBoundingClientRect().top;
            const from = el => el ? el.getBoundingClientRect() : null;
            const majors = from(year.querySelector('.year-majors'));
            const minors = from(year.querySelector('.minors'));
            const marks = [...year.querySelectorAll('.major h3, .minor-name')].map(el => from(el).bottom - top);
            return {
                height: year.offsetHeight,
                majors: majors && majors.bottom - top,
                minorsTop: minors && minors.top - top,
                minors: minors && minors.bottom - top,
                line: Math.max(0, ...marks),
            };
        });

        let flow = 0, big = -Infinity, small = -Infinity, line = -Infinity;
        const tops = parts.map((part, i) => {
            let top = i ? line + AFTER_ON_LINE * em : 0;
            if (i && part.majors != null) top = Math.max(top, big + AFTER_BIG * em);
            if (i && part.minors != null) top = Math.max(top, small + AFTER_SMALL * em - part.minorsTop);
            if (i) years[i].style.marginTop = `${top - flow}px`;
            flow = top + part.height;
            if (part.majors != null) big = top + part.majors;
            if (part.minors != null) small = top + part.minors;
            line = top + part.line;
            return top;
        });
        // A label's stretch ends where the next year's starts, so the next one takes over from it
        years.forEach((year, i) => {
            if (i < years.length - 1) year.querySelector('.year-label').style.bottom = `${tops[i] + parts[i].height - tops[i + 1]}px`;
        });
        if (today) today.style.marginTop = `${Math.max(big, small) + AFTER_ALL * em - flow}px`;
    }

    let width = 0;
    const again = () => { width = 0; lay(); };
    lay();
    // Only a new width changes what's measured; the heights it changes are its own
    new ResizeObserver(([entry]) => {
        if (entry.contentRect.width === width) return;
        width = entry.contentRect.width;
        lay();
    }).observe(document.querySelector('.timeline'));
    wide.addEventListener('change', again);
    document.fonts?.ready.then(again);
})();
