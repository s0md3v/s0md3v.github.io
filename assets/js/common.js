document.addEventListener('DOMContentLoaded', function () {
    const DEFAULT_FONT_SIZE = 1.0;

    function getFontFamily(font) {
        switch (font) {
            case 'lexend':
                return '"Lexend", sans-serif';
            case 'opendyslexic':
                return '"OpenDyslexic", sans-serif';
            case 'system':
                return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
            default:
                return 'var(--base-font-family)'; // Default to site's base font (Lexend)
        }
    }

    function deobfuscateEmails() {
        const links = document.querySelectorAll('a[href^="mailto:"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            // Check for [at] in the mailto link or inner text
            if (href.includes('[at]') || link.innerText.includes('[at]')) {
                const newEmail = href.replace('mailto:', '').replace('[at]', '@');
                link.setAttribute('href', 'mailto:' + newEmail);
                if (link.innerText.includes('[at]')) {
                    link.innerText = link.innerText.replace('[at]', '@');
                }
            }
        });
    }

    function setupThemeButtons() {
        const themeButtons = document.querySelectorAll('.theme-options button');
        // Set active state based on current theme
        const currentTheme = getPreferredTheme();
        const activeThemeButton = document.querySelector(`.theme-options button[data-theme="${currentTheme}"]`);

        if (activeThemeButton) {
            themeButtons.forEach(btn => btn.classList.remove('active'));
            activeThemeButton.classList.add('active');
        }

        themeButtons.forEach(button => {
            button.addEventListener('click', function () {
                const theme = this.dataset.theme;

                themeButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');

                applyTheme(theme);
            });
        });
    }

    function setupFontButtons() {
        const fontButtons = document.querySelectorAll('.font-options button');
        fontButtons.forEach(button => {
            button.addEventListener('click', function () {
                const font = this.dataset.font;

                fontButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');

                document.documentElement.style.setProperty('--blog-font-family', getFontFamily(font));
                localStorage.setItem('font', font);
            });
        });
    }

    function setupFontSizeButtons() {
        const decreaseFont = document.getElementById('decrease-font');
        const resetFont = document.getElementById('reset-font');
        const increaseFont = document.getElementById('increase-font');

        if (decreaseFont) {
            decreaseFont.addEventListener('click', function () {
                changeFontSize(-0.1);
            });
        }

        if (resetFont) {
            resetFont.addEventListener('click', function () {
                document.documentElement.style.setProperty('--blog-font-size', DEFAULT_FONT_SIZE + 'rem');
                localStorage.setItem('fontSize', DEFAULT_FONT_SIZE);
            });
        }

        if (increaseFont) {
            increaseFont.addEventListener('click', function () {
                changeFontSize(0.1);
            });
        }
    }

    function changeFontSize(amount) {
        const currentSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--blog-font-size')) || DEFAULT_FONT_SIZE;
        const newSize = Math.max(0.7, Math.min(2.5, currentSize + amount)).toFixed(1);
        document.documentElement.style.setProperty('--blog-font-size', newSize + 'rem');
        localStorage.setItem('fontSize', newSize);
    }

    // Load Font Settings
    function loadFontSettings() {
        // Initial theme load is already done at top level

        const font = localStorage.getItem('font') || 'system';
        // We set propertly on documentElement, so it's safe to do here
        document.documentElement.style.setProperty('--blog-font-family', getFontFamily(font));

        const activeFontButton = document.querySelector(`.font-options button[data-font="${font}"]`);
        if (activeFontButton) {
            document.querySelectorAll('.font-options button').forEach(btn => btn.classList.remove('active'));
            activeFontButton.classList.add('active');
        }

        const fontSize = localStorage.getItem('fontSize') || DEFAULT_FONT_SIZE;
        document.documentElement.style.setProperty('--blog-font-size', fontSize + 'rem');
    }

    setupThemeButtons();
    setupFontButtons();
    setupFontSizeButtons();
    loadFontSettings();
    deobfuscateEmails();

    const menuToggle = document.querySelector(".menu-toggle");
    const navLinks = document.querySelector(".nav-links");
    const header = document.getElementById("site-header");
    let lastScrollTop = 0;

    if (menuToggle && navLinks) {
        menuToggle.addEventListener("click", () => {
            navLinks.classList.toggle("visible");
        });
    }

    if (header) {
        window.addEventListener("scroll", function () {
            let scrollTop = window.scrollY;
            if (scrollTop > lastScrollTop && scrollTop > 50) {
                header.classList.add("hidden");
            } else {
                header.classList.remove("hidden");
            }
            lastScrollTop = Math.max(0, scrollTop);
        });
    }

    const settingsToggle = document.getElementById('settings-toggle');
    const settingsMenu = document.getElementById('settings-menu');

    if (settingsToggle && settingsMenu) {
        settingsToggle.addEventListener('click', function () {
            settingsToggle.classList.toggle('active');
            settingsMenu.classList.toggle('visible');
        });

        document.addEventListener('click', function (event) {
            if (!settingsMenu.contains(event.target) && !settingsToggle.contains(event.target)) {
                settingsToggle.classList.remove('active');
                settingsMenu.classList.remove('visible');
            }
        });
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
            ['[', ']'],
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