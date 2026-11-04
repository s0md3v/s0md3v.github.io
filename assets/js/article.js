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

    // Each block can be copied whole: a payload or a command is meant to be tried, and a line that
    // runs past the box is hard to select by hand. Said aloud as well as shown.
    const said = document.createElement('span');
    said.className = 'sr-only';
    said.setAttribute('role', 'status');
    const links = content.querySelectorAll('.section-link');
    if (blocks.length || links.length) content.append(said);
    blocks.forEach(pre => {
        const box = pre.parentElement.classList.contains('highlight') ? pre.parentElement : pre;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-code';
        button.textContent = 'Copy';
        button.setAttribute('aria-label', 'Copy the code');
        let back;
        const show = (text, aloud) => {
            button.textContent = text;
            said.textContent = aloud;
            clearTimeout(back);
            back = setTimeout(() => { button.textContent = 'Copy'; said.textContent = ''; }, 1600);
        };
        button.addEventListener('click', async () => {
            const text = (pre.querySelector('code') || pre).textContent.replace(/\n$/, '');
            try {
                await navigator.clipboard.writeText(text);
                show('Copied', 'Copied');
            } catch {
                // No clipboard to write to here: the code's selected instead, to copy by hand
                getSelection().selectAllChildren(pre.querySelector('code') || pre);
                show('Selected', 'Selected, copy it with your keyboard');
            }
        });
        if (box === pre) {
            const wrap = document.createElement('div');
            wrap.className = 'highlight';
            pre.replaceWith(wrap);
            wrap.append(pre);
            wrap.append(button);
        } else {
            box.append(button);
        }
    });

    // A section's "#" copies the address of the section, rather than jumping the heading to the
    // top. Where there's no clipboard it's a link to the section, as it always was.
    links.forEach(link => {
        let back;
        link.addEventListener('click', async event => {
            if (!navigator.clipboard) return;
            event.preventDefault();
            try {
                await navigator.clipboard.writeText(location.origin + location.pathname + link.hash);
            } catch {
                location.hash = link.hash;
                return;
            }
            history.replaceState(null, '', link.hash);
            link.querySelector('.section-copied')?.remove();
            const note = document.createElement('span');
            note.className = 'section-copied';
            note.setAttribute('aria-hidden', 'true');
            note.textContent = 'copied';
            link.append(note);
            if (note.getBoundingClientRect().right > document.documentElement.clientWidth - 6) note.classList.add('above');
            link.classList.add('copied');
            said.textContent = 'Copied';
            clearTimeout(back);
            back = setTimeout(() => {
                note.remove();
                link.classList.remove('copied');
                said.textContent = '';
            }, 1000);
        });
    });

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
                // Baseline to baseline: the slip's first line on the line its number is on, as far
                // as the slips above it allow. A glyph's box ends a descent (0.25em in Lexend) below
                // its baseline. The letter before the number is measured, not the raised number.
                const sup = ref.closest('sup') || ref;
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                let text = null;
                while (walker.nextNode() && sup.compareDocumentPosition(walker.currentNode) & Node.DOCUMENT_POSITION_PRECEDING) {
                    if (walker.currentNode.length) text = walker.currentNode;
                }
                const glyph = document.createRange();
                if (text) { glyph.setStart(text, text.length - 1); glyph.setEnd(text, text.length); } else glyph.selectNode(sup);
                const lineFs = parseFloat(getComputedStyle(text ? text.parentElement : line).fontSize);
                const refBase = glyph.getBoundingClientRect().bottom - 0.25 * lineFs - sheetBox.top;
                const num = slip.querySelector('.slip-number');
                const slipBase = num.getBoundingClientRect().bottom - 0.25 * parseFloat(getComputedStyle(num).fontSize) - slip.getBoundingClientRect().top;
                const top = Math.max(refBase - slipBase, below + GAP);
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
