export class AudioController {
    constructor() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.buffers = {};
        this.loaded = false;
        this.muted = false;

        this.loadAssets();
    }

    async loadAssets() {
        const gunshotFiles = ['1.mp3', '2.mp3', '3.mp3', '4.mp3', '5.mp3', '6.mp3', '7.mp3', '8.mp3', '9.mp3'];
        const hitFiles = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3', 'e.mp3', 'f.mp3', 'g.mp3'];

        const loadBuffer = async (filename) => {
            try {
                const response = await fetch(`./assets/${filename}`);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
                this.buffers[filename] = audioBuffer;
            } catch (e) {
                console.warn(`Failed to load audio: ${filename}`, e);
            }
        };

        const promises = [
            ...gunshotFiles.map(f => loadBuffer(f)),
            ...hitFiles.map(f => loadBuffer(f))
        ];

        await Promise.all(promises);
        this.loaded = true;
        console.log("Audio assets loaded (Web Audio API).");
    }

    playBuffer(filename, volume = 0.5, playbackRate = 1.0) {
        if (this.muted) return;
        if (!this.loaded) {
            console.warn("Audio not loaded yet.");
            return;
        }
        if (!this.buffers[filename]) {
            console.warn(`Audio buffer missing: ${filename}`);
            return;
        }

        // Resume context if suspended (browser policy) - Fallback
        if (this.context.state === 'suspended') {
            this.context.resume().catch(e => console.warn("Auto-resume failed:", e));
            return; // Can't play yet
        }

        const source = this.context.createBufferSource();
        source.buffer = this.buffers[filename];
        
        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(this.context.destination);
        
        source.playbackRate.value = playbackRate;
        source.start(0);
    }

    playGunshot() {
        const id = Math.floor(Math.random() * 9) + 1; // 1-9
        const filename = `${id}.mp3`;
        // Randomize volume and pitch slightly
        const vol = 0.2 + Math.random() * 0.1;
        const rate = 0.9 + Math.random() * 0.2;
        this.playBuffer(filename, vol, rate);
    }

    playHit() {
        const chars = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        const char = chars[Math.floor(Math.random() * chars.length)];
        const filename = `${char}.mp3`;
        this.playBuffer(filename, 0.4, 1.0);
    }
}
