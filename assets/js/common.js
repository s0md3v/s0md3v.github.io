// DEFAULT_FONT, DEFAULT_FONT_SIZE, getFontFamily, getPreferredTheme, applyTheme: see _includes/theme_init.html
document.addEventListener('DOMContentLoaded', function () {
    function setActiveOption(buttons, activeButton) {
        buttons.forEach(btn => {
            const active = btn === activeButton;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
    }

    function deobfuscateEmails() {
        const links = document.querySelectorAll('a[href^="mailto:"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href.includes('[at]') || link.innerText.includes('[at]')) {
                const newEmail = href.replace('mailto:', '').replace('[at]', '@');
                link.setAttribute('href', 'mailto:' + newEmail);
                if (link.innerText.includes('[at]')) {
                    link.innerText = link.innerText.replace('[at]', '@');
                }
            }
        });
        // Addresses that aren't links
        document.querySelectorAll('[data-email]').forEach(el => {
            el.textContent = el.textContent.replace('[at]', '@');
        });
    }

    function setupThemeButtons() {
        const themeButtons = document.querySelectorAll('.theme-options button');
        const currentTheme = getPreferredTheme();
        const activeThemeButton = document.querySelector(`.theme-options button[data-theme="${currentTheme}"]`);
        setActiveOption(themeButtons, activeThemeButton);

        themeButtons.forEach(button => {
            button.addEventListener('click', function () {
                const theme = this.dataset.theme;

                setActiveOption(themeButtons, this);

                applyTheme(theme);
            });
        });
    }

    function setupFontButtons() {
        const fontButtons = document.querySelectorAll('.font-options button');
        fontButtons.forEach(button => {
            button.addEventListener('click', function () {
                const font = this.dataset.font;

                setActiveOption(fontButtons, this);

                document.documentElement.style.setProperty('--blog-font-family', getFontFamily(font));
                localStorage.setItem('font', font);
            });
        });
    }

    const FONT_SIZE_MIN = 0.7;
    const FONT_SIZE_MAX = 2.5;

    function currentFontSize() {
        return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--blog-font-size')) || DEFAULT_FONT_SIZE;
    }

    function showFontSize(size) {
        const disable = (id, disabled) => document.getElementById(id)?.setAttribute('aria-disabled', String(disabled));
        const value = document.getElementById('font-size-value');
        if (value) value.textContent = Math.round(size * 100) + '%';
        disable('decrease-font', size <= FONT_SIZE_MIN);
        disable('increase-font', size >= FONT_SIZE_MAX);
        disable('reset-font', size === DEFAULT_FONT_SIZE);
    }

    function setFontSize(size) {
        document.documentElement.style.setProperty('--blog-font-size', size + 'rem');
        localStorage.setItem('fontSize', size);
        showFontSize(size);
    }

    function setupFontSizeButtons() {
        const decreaseFont = document.getElementById('decrease-font');
        const resetFont = document.getElementById('reset-font');
        const increaseFont = document.getElementById('increase-font');

        if (decreaseFont) decreaseFont.addEventListener('click', () => changeFontSize(-0.1));
        if (resetFont) resetFont.addEventListener('click', () => setFontSize(DEFAULT_FONT_SIZE));
        if (increaseFont) increaseFont.addEventListener('click', () => changeFontSize(0.1));
        showFontSize(currentFontSize());
    }

    function changeFontSize(amount) {
        const size = Number((currentFontSize() + amount).toFixed(1));
        setFontSize(Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size)));
    }

    // Only syncs the menu; _includes/theme_init.html applies font and size before first paint
    function loadFontSettings() {
        let font = DEFAULT_FONT;
        try {
            font = localStorage.getItem('font') || DEFAULT_FONT;
        } catch (e) { }

        const activeFontButton = document.querySelector(`.font-options button[data-font="${font}"]`);
        setActiveOption(document.querySelectorAll('.font-options button'), activeFontButton);
    }

    setupThemeButtons();
    setupFontButtons();
    setupFontSizeButtons();
    loadFontSettings();
    deobfuscateEmails();

    const settingsToggle = document.getElementById('settings-toggle');
    const settingsMenu = document.getElementById('settings-menu');
    const mobileNavigation = window.matchMedia('(max-width: 48em)');
    const panels = [{ toggle: settingsToggle, panel: settingsMenu }].filter(({ toggle, panel }) => toggle && panel);

    function setPanel({ toggle, panel }, open) {
        panel.classList.toggle('visible', open);
        toggle.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', String(open));
    }

    panels.forEach(entry => {
        entry.toggle.addEventListener('click', () => {
            const open = entry.toggle.getAttribute('aria-expanded') !== 'true';
            panels.forEach(other => setPanel(other, other === entry && open));
        });
        entry.panel.addEventListener('click', event => {
            if (event.target.closest('a')) setPanel(entry, false);
        });
    });

    document.addEventListener('click', event => {
        panels.forEach(entry => {
            if (!entry.panel.contains(event.target) && !entry.toggle.contains(event.target)) {
                setPanel(entry, false);
            }
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const openPanel = panels.find(entry => entry.toggle.getAttribute('aria-expanded') === 'true');
        if (openPanel) {
            event.preventDefault();
            setPanel(openPanel, false);
            openPanel.toggle.focus();
        }
    });

    document.addEventListener('focusin', event => {
        panels.forEach(entry => {
            if (!entry.panel.contains(event.target) && !entry.toggle.contains(event.target)) {
                setPanel(entry, false);
            }
        });
    });

    mobileNavigation.addEventListener('change', () => {
        panels.forEach(entry => setPanel(entry, false));
    });

    // Above the page it leaves as you read on and comes back as you turn back, once either is
    // clearly meant, so a nudge of the wheel or a thumb leaves it where it is. On a phone it's
    // tabs, which stay.
    const header = document.getElementById('site-header');
    const TURN = 8;
    let lastScroll = Math.max(0, window.scrollY);
    let travelled = 0;

    function barNeeded() {
        return mobileNavigation.matches ||
            panels.some(entry => entry.toggle.getAttribute('aria-expanded') === 'true') ||
            header.querySelector(':focus-visible');
    }

    if (header) {
        mobileNavigation.addEventListener('change', () => header.classList.remove('hidden'));

        window.addEventListener('scroll', () => {
            const scroll = Math.max(0, window.scrollY);
            const moved = scroll - lastScroll;
            travelled = Math.sign(moved) === Math.sign(travelled) ? travelled + moved : moved;
            lastScroll = scroll;

            if (scroll < header.offsetHeight || barNeeded()) header.classList.remove('hidden');
            else if (Math.abs(travelled) >= TURN) header.classList.toggle('hidden', travelled > 0);
        }, { passive: true });

        document.addEventListener('focusin', event => {
            if (header.contains(event.target)) header.classList.remove('hidden');
        });

        // A mouse at the top of the screen is reaching for it
        document.addEventListener('mousemove', event => {
            if (event.clientY <= 6) header.classList.remove('hidden');
        }, { passive: true });
    }

    // The marks have no words of their own, so the title names the one you're on, in a hint of its
    // colour, and goes back to where you are when you leave it
    const title = document.querySelector('.nav-title');
    if (header && title) {
        const here = title.textContent;
        const preview = item => {
            title.textContent = item.dataset.name;
            title.style.setProperty('--c', getComputedStyle(item).getPropertyValue('--c'));
            title.classList.add('previewing');
        };
        const restore = () => {
            title.textContent = here;
            title.style.removeProperty('--c');
            title.classList.remove('previewing');
        };
        const named = event => event.target.closest?.('.nav-item:not([aria-current])');

        header.addEventListener('pointerover', event => {
            if (event.pointerType === 'mouse' && named(event)) preview(named(event));
        });
        header.addEventListener('pointerout', event => {
            if (named(event)) restore();
        });
        header.addEventListener('focusin', event => {
            if (named(event)?.matches(':focus-visible')) preview(named(event));
        });
        header.addEventListener('focusout', restore);
    }

    function setupAccessibility() {
        const mainContent = document.querySelector('main') ||
            document.querySelector('article') ||
            document.querySelector('.wrapper') ||
            document.querySelector('.content');

        if (mainContent && !mainContent.id) {
            mainContent.id = 'main-content';
        }
    }
    setupAccessibility();

    const menuHeaders = document.querySelectorAll('.menuheader');
    if (menuHeaders.length > 0) {
        const brackets = [
            ['{', '}'],
            ['(', ')'],
            [':', ':'],
            ['|', '|'],
        ];

        menuHeaders.forEach(header => {
            const originalText = header.textContent.trim().replace(/^.|.$/g, '');

            header.addEventListener('mouseenter', () => {
                const randomPair = brackets[Math.floor(Math.random() * brackets.length)];
                header.textContent = `${randomPair[0]}${originalText}${randomPair[1]}`;
            });

            header.addEventListener('mouseleave', () => {
                header.textContent = `[${originalText}]`;
            });
        });
    }

    const consoleStyles = [
        'color: #e17800',
        'font-size: 24px',
        'font-family: monospace',
        'font-weight: bold',
        'text-shadow: 2px 2px 0px rgba(0,0,0,0.2)'
    ].join(';');

    const infoStyles = [
        'color: #828282',
        'font-size: 14px',
        'font-family: sans-serif'
    ].join(';');

    console.log('%cHello there! 👋', consoleStyles);
    console.log(
        '%cWant to see how this works?\nhttps://github.com/s0md3v/s0md3v.github.io',
        infoStyles
    );
});
