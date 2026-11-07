import { mountAudioField } from './audio-field';

export function initSiteAudio() {
    const host = document.querySelector<HTMLElement>('[data-site-audio]');
    if (!host || host.dataset.ready === 'true') return;
    host.dataset.ready = 'true';
    const audio = host.querySelector<HTMLAudioElement>('audio')!;
    const play = host.querySelector<HTMLButtonElement>('[data-audio-play]')!;
    const volume = host.querySelector<HTMLInputElement>('[data-audio-volume]')!;
    const status = host.querySelector<HTMLElement>('[data-audio-status]')!;
    const silence = { bass: 0, mid: 0, treble: 0, level: 0, playing: false };
    const bands = { ...silence };
    let context: AudioContext | undefined, analyser: AnalyserNode | undefined;
    let data: Uint8Array<ArrayBuffer> | undefined, sampledAt: number | null = null;
    let dispose: (() => void) | undefined, energyFrame = 0, lastEnergy = 0;
    let waitingGesture = false, wantsPlay = true, starting = false, suspended = false, attempt = 0;
    let clearEntryListeners: (() => void) | undefined;
    let lastPositionSave = 0;

    const restorePreference = () => {
        try {
            const saved = JSON.parse(localStorage.getItem('beitian-audio-v1') || 'null');
            if (saved && Number.isFinite(saved.volume)) volume.value = String(Math.max(0, Math.min(1, saved.volume)));
            wantsPlay = saved?.playing !== false;
        } catch (_) { /* Storage may be disabled; this page still works. */ }
        audio.volume = Number(volume.value);
    };
    const persistPreference = () => {
        try { localStorage.setItem('beitian-audio-v1', JSON.stringify({ volume: audio.volume, playing: wantsPlay })); } catch (_) {}
    };
    const persistPosition = () => {
        if (!audio.readyState) return;
        try { sessionStorage.setItem('beitian-audio-position', String(audio.currentTime)); } catch (_) {}
    };
    const restorePosition = () => {
        try {
            const position = Number(sessionStorage.getItem('beitian-audio-position'));
            if (Number.isFinite(position) && position > 0 && (!Number.isFinite(audio.duration) || position < audio.duration)) audio.currentTime = position;
        } catch (_) {}
    };
    const sync = () => {
        const active = !audio.paused && !waitingGesture;
        play.textContent = active ? 'Ⅱ' : '▶';
        play.setAttribute('aria-label', active ? '暂停背景音乐' : '播放背景音乐');
        play.setAttribute('aria-pressed', String(active));
        host.dataset.playing = String(active);
        status.textContent = waitingGesture ? '点击页面启用声音' : active ? '太空漫步 · HOYO-MiX' : '太空漫步 · 已暂停';
    };
    // Share one FFT sample per frame. Events own a copy of that sample.
    const read = () => {
        if (!analyser || !data || audio.paused || context?.state !== 'running' || suspended) return silence;
        const frameTime = document.timeline.currentTime as number | null;
        if (sampledAt !== frameTime || frameTime === null) {
            sampledAt = frameTime;
            analyser.getByteFrequencyData(data);
            let bass = 0, mid = 0, treble = 0, total = 0;
            for (let i = 1; i < 240; i++) {
                const value = data[i];
                if (i < 9) bass += value;
                else if (i < 70) mid += value;
                else treble += value;
                if (i < 160) total += value;
            }
            bands.bass = bass / 8 / 255;
            bands.mid = mid / 61 / 255;
            bands.treble = treble / 170 / 255;
            bands.level = total / 159 / 255;
            bands.playing = true;
        }
        return bands;
    };
    const publish = () => {
        energyFrame = 0;
        if (document.hidden || suspended || audio.paused) return;
        const now = performance.now();
        if (now - lastEnergy >= 80) {
            lastEnergy = now;
            document.dispatchEvent(new CustomEvent('site:audio-energy', { detail: { ...read() } }));
        }
        energyFrame = requestAnimationFrame(publish);
    };
    const wakeEnergy = () => {
        if (!energyFrame && !document.hidden && !suspended && !audio.paused) energyFrame = requestAnimationFrame(publish);
    };
    const stopEnergy = () => {
        cancelAnimationFrame(energyFrame); energyFrame = 0; sampledAt = null;
        document.dispatchEvent(new CustomEvent('site:audio-energy', { detail: { ...silence } }));
    };
    const start = async () => {
        if (suspended || !wantsPlay) return;
        if (!context) {
            context = new AudioContext();
            context.addEventListener('statechange', () => {
                sampledAt = null;
                if (context?.state === 'running' && !audio.paused) { waitingGesture = false; sync(); wakeEnergy(); }
            });
            analyser = context.createAnalyser();
            analyser.fftSize = 1024; analyser.smoothingTimeConstant = .76;
            context.createMediaElementSource(audio).connect(analyser);
            analyser.connect(context.destination);
            data = new Uint8Array(analyser.frequencyBinCount);
        }
        // Resume inside a gesture even when an earlier play request is pending.
        void context.resume().catch(() => {});
        if (starting) return;
        starting = true;
        const currentAttempt = ++attempt;
        try {
            await audio.play();
            if (currentAttempt !== attempt) return;
            if (!wantsPlay || suspended) { audio.pause(); return; }
            waitingGesture = context.state !== 'running';
            sync(); wakeEnergy();
        } catch (error) {
            if (currentAttempt !== attempt || !wantsPlay || suspended) return;
            waitingGesture = error instanceof DOMException && error.name === 'NotAllowedError';
            sync();
            if (!waitingGesture) {
                status.textContent = '播放失败，请重试';
                console.warn('Background audio failed', error);
            }
        } finally { if (currentAttempt === attempt) starting = false; }
    };
    play.addEventListener('click', () => {
        clearEntryListeners?.();
        if (wantsPlay && (!audio.paused || starting) && !waitingGesture) {
            wantsPlay = false; waitingGesture = false; starting = false; ++attempt;
            audio.pause(); persistPosition(); sync();
        } else {
            wantsPlay = true;
            void start();
        }
        persistPreference();
    });
    const unlock = (event: Event) => {
        const entryPending = Boolean(clearEntryListeners);
        if ((!waitingGesture && !entryPending) || !wantsPlay || host.contains(event.target as Node)) return;
        if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
        clearEntryListeners?.();
        void start();
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    volume.addEventListener('input', () => { audio.volume = Number(volume.value); persistPreference(); });
    audio.addEventListener('play', () => { sync(); wakeEnergy(); });
    audio.addEventListener('pause', () => { sync(); stopEnergy(); });
    audio.addEventListener('error', () => { sync(); status.textContent = '音乐加载失败'; });
    audio.addEventListener('waiting', () => { status.textContent = '正在加载音乐…'; });
    audio.addEventListener('playing', sync);
    audio.addEventListener('loadedmetadata', restorePosition);
    audio.addEventListener('timeupdate', () => {
        const now = performance.now();
        if (now - lastPositionSave >= 2000) { lastPositionSave = now; persistPosition(); }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { persistPosition(); stopEnergy(); }
        else wakeEnergy();
    });
    const canvas = document.querySelector<HTMLCanvasElement>('[data-audio-field]');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const mount = () => { dispose?.(); if (canvas) dispose = mountAudioField(canvas, read, motion.matches); };
    motion.addEventListener('change', mount);
    window.addEventListener('pagehide', () => {
        persistPosition(); suspended = true; starting = false; ++attempt;
        dispose?.(); dispose = undefined;
        stopEnergy(); audio.pause(); void context?.suspend();
    });
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        suspended = false; restorePreference(); restorePosition(); mount(); sync();
        if (wantsPlay) void start();
    });
    restorePreference(); restorePosition(); mount(); sync();
    // Give the visible portrait first use of the connection. Explicit Play stays immediate.
    const portrait = document.querySelector<HTMLElement>('[data-portrait]');
    if (document.documentElement.dataset.portal === 'open' && portrait && !portrait.dataset.renderer) {
        const begin = () => {
            clearEntryListeners?.();
            if (wantsPlay && audio.paused) void start();
        };
        const enteredContent = () => { if (document.documentElement.dataset.portal !== 'open') begin(); };
        clearEntryListeners = () => {
            clearEntryListeners = undefined;
            document.removeEventListener('site:portrait-ready', begin);
            document.removeEventListener('site:portal', enteredContent);
        };
        document.addEventListener('site:portrait-ready', begin, { once: true });
        document.addEventListener('site:portal', enteredContent);
    } else if (wantsPlay) void start();
}
