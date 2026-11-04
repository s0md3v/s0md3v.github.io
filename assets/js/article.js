(function () {
    const content = document.querySelector('.post-content');
    if (!content) return;

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

    const lists = [...content.querySelectorAll('ul, ol')].filter(list => !list.closest('.notes'));
    function lines(item) {
        const half = parseFloat(getComputedStyle(item).lineHeight) / 2;
        const ends = [];
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        while (walker.nextNode()) {
            const text = walker.currentNode;
            if (!text.data.trim() || text.parentElement.closest('li') !== item) continue;
            range.selectNodeContents(text);
            for (const box of range.getClientRects()) {
                if (box.width && !ends.some(end => Math.abs(end - box.bottom) < half)) ends.push(box.bottom);
            }
        }
        return ends.length;
    }
    function chunk() {
        lists.forEach(list => {
            const items = [...list.children].filter(child => child.matches('li'));
            list.classList.toggle('one-line', items.every(item => lines(item) <= 1));
        });
    }
    if (lists.length) {
        let width = 0;
        chunk();
        new ResizeObserver(([entry]) => {
            if (entry.contentRect.width === width) return;
            width = entry.contentRect.width;
            chunk();
        }).observe(content);
        document.fonts?.ready.then(chunk);
    }

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

            const near = on => {
                slip.classList.toggle('near', on);
                entry.ref.classList.toggle('near', on);
            };
            [entry.ref, slip].forEach(el => {
                el.addEventListener('pointerenter', () => near(true));
                el.addEventListener('pointerleave', () => near(false));
            });
            // detail 0 is the keyboard, which still goes to the real note
            entry.ref.addEventListener('click', event => {
                if (!holder.classList.contains('slips-on') || event.detail === 0) return;
                event.preventDefault();
                slip.classList.remove('called');
                void slip.offsetWidth;
                slip.classList.add('called');
            });
        });
        holder.append(slips);

        const GAP = 8;
        function lay() {
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
                // 0.25em: a glyph's box ends a descent (in Lexend) below its baseline
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

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    content.querySelectorAll('video[autoplay]').forEach(video => {
        video.controls = true;
        if (still) {
            video.autoplay = false;
            video.pause();
        }
    });
})();
