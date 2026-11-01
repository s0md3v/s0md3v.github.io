// The site has one sound, a click, and it's always exactly the same. It's made here from noise,
// nothing is recorded, and nothing runs until a reader turns sound on in settings.
(() => {
    let enabled = false;
    try {
        enabled = localStorage.getItem('sound') === 'on';
    } catch (e) { }

    let audio, master, noise;

    function wake() {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!audio && Audio) {
            audio = new Audio({ latencyHint: 'interactive' });
            // Seeded, so that it's the same noise every time
            let seed = 1;
            noise = audio.createBuffer(1, audio.sampleRate / 10, audio.sampleRate);
            noise.getChannelData(0).forEach((_, i, data) => {
                seed = seed * 16807 % 2147483647;
                data[i] = seed / 1073741823.5 - 1;
            });
            master = audio.createGain();
            master.gain.value = 0.275;
            master.connect(audio.destination);
        }
        if (audio && audio.state !== 'running') audio.resume().catch(() => { });
        return audio;
    }

    // A scrap of noise through a filter
    function hiss(start, type, freq, length, gain) {
        const when = audio.currentTime + 0.002 + start;
        const source = audio.createBufferSource();
        const filter = audio.createBiquadFilter();
        const env = audio.createGain();
        source.buffer = noise;
        filter.type = type;
        filter.frequency.value = freq;
        env.gain.setValueAtTime(gain, when);
        env.gain.exponentialRampToValueAtTime(0.0001, when + length * 2);
        source.connect(filter).connect(env).connect(master);
        source.start(when);
    }

    // A spring letting go, then the plate landing
    function click() {
        if (!enabled || !wake()) return;
        hiss(0, 'highpass', 1800, 0.003, 0.5);
        hiss(0.013, 'bandpass', 1500, 0.018, 0.6);
    }

    function press(target) {
        if (target.closest?.('a, button, summary, label, select, input, [role="button"]')) click();
    }

    // At the press, as a real thing would, and before a link can take the page away. A finger might
    // be starting a scroll, though, so that waits to be a tap.
    let pointer;
    addEventListener('pointerdown', event => {
        pointer = event.pointerType;
        if (pointer !== 'touch') press(event.target);
    }, { capture: true, passive: true });

    addEventListener('click', event => {
        if (pointer === 'touch') press(event.target);
        pointer = undefined;
    }, { capture: true, passive: true });

    addEventListener('keydown', event => {
        if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
        if (event.key === ' ' && event.target.closest?.('a')) return;
        press(event.target);
    }, { capture: true, passive: true });

    window.siteSound = {
        get enabled() {
            return enabled;
        },
        set(on) {
            enabled = on;
            try {
                if (on) localStorage.setItem('sound', 'on');
                else localStorage.removeItem('sound');
            } catch (e) { }
            click();
        },
        click,
    };
})();
