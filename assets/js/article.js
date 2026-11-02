// What a post needs once it's on the screen (_layouts/post.html)
(function () {
    const content = document.querySelector('.post-content');
    if (!content) return;

    // Code that runs past its box scrolls, so it can be got to, and scrolled, from the keyboard too
    const blocks = [...content.querySelectorAll('pre')];
    function reachable() {
        blocks.forEach(pre => {
            if (pre.scrollWidth > pre.clientWidth + 1) {
                pre.tabIndex = 0;
                pre.setAttribute('role', 'region');
                pre.setAttribute('aria-label', 'Code, scrolls sideways');
            } else {
                pre.removeAttribute('tabindex');
                pre.removeAttribute('role');
                pre.removeAttribute('aria-label');
            }
        });
    }
    if (blocks.length) {
        reachable();
        new ResizeObserver(reachable).observe(content);
    }

    // Where there's room beside the sheet, each note is on a slip of its own, tucked under the
    // sheet's right edge level with the line it's for. The notes at the end stay as they are:
    // they're the post's sources, and what a screen reader goes to.
    const sheet = content.closest('.wrapper');
    const holder = sheet?.parentElement;
    const refs = [];
    content.querySelectorAll('sup > a.footnote').forEach(ref => {
        const note = document.getElementById(decodeURIComponent(ref.hash.slice(1)));
        if (note && !refs.some(r => r.note === note)) refs.push({ ref, note });
    });
    if (sheet && refs.length) {
        const slips = document.createElement('div');
        slips.className = 'slips';
        slips.setAttribute('aria-hidden', 'true');
        refs.forEach(entry => {
            const slip = document.createElement('div');
            slip.className = 'slip';
            entry.note.querySelectorAll(':scope > *').forEach(part => slip.append(part.cloneNode(true)));
            slip.querySelectorAll('.reversefootnote').forEach(back => back.remove());
            slip.querySelectorAll('a, button, input').forEach(el => el.tabIndex = -1);
            const number = document.createElement('span');
            number.className = 'slip-number';
            number.textContent = entry.ref.textContent;
            (slip.firstElementChild || slip).prepend(number);
            slips.append(slip);
            entry.slip = slip;

            // Pointing at either one draws the slip out a little, and marks the number
            const near = on => {
                slip.classList.toggle('near', on);
                entry.ref.classList.toggle('near', on);
            };
            [entry.ref, slip].forEach(el => {
                el.addEventListener('pointerenter', () => near(true));
                el.addEventListener('pointerleave', () => near(false));
            });
            // A click on the number needn't go to the end when its note's beside it. The keyboard's
            // Enter still goes there, to the note a screen reader can read.
            entry.ref.addEventListener('click', event => {
                if (!holder.classList.contains('slips-on') || event.detail === 0) return;
                event.preventDefault();
                slip.classList.remove('called');
                void slip.offsetWidth;
                slip.classList.add('called');
            });
        });
        // Beside the sheet, not in it, so the sheet can lie over them and they're still there to
        // be pointed at and clicked where they stick out
        holder.append(slips);

        const GAP = 8;
        function lay() {
            // Room for a slip's visible part, and a little of the window beyond it
            const sheetBox = sheet.getBoundingClientRect();
            holder.classList.add('slips-on');
            Object.assign(slips.style, {
                top: `${sheet.offsetTop}px`,
                left: `${sheet.offsetLeft}px`,
                width: `${sheet.offsetWidth}px`,
                height: `${sheet.offsetHeight}px`,
            });
            const first = refs[0].slip;
            const tuck = sheetBox.right - first.getBoundingClientRect().left;
            const room = document.documentElement.clientWidth - sheetBox.right >= first.offsetWidth - tuck + 16;
            if (!room) {
                holder.classList.remove('slips-on');
                return;
            }
            let below = -Infinity;
            refs.forEach(({ ref, slip }) => {
                const line = ref.closest('p, li, blockquote, td, dd') || ref;
                const lineHeight = parseFloat(getComputedStyle(line).lineHeight) || 0;
                const refTop = ref.getBoundingClientRect().top - sheetBox.top;
                // Level with the top of its line, as far as the slips above it allow
                const top = Math.max(refTop - lineHeight * 0.3, below + GAP);
                slip.style.top = `${Math.round(top)}px`;
                below = top + slip.offsetHeight;
            });
        }
        lay();
        new ResizeObserver(lay).observe(sheet);
        document.fonts?.ready.then(lay);
        window.addEventListener('load', lay);
    }

    // A moving picture that goes on by itself can be stopped, and doesn't start for anyone who's
    // asked for less motion
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    content.querySelectorAll('video[autoplay]').forEach(video => {
        video.controls = true;
        if (still) {
            video.autoplay = false;
            video.pause();
        }
    });
})();
