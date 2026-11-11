type Bands = { bass: number; mid: number; treble: number; level: number; playing: boolean };
const tau = Math.PI * 2;
const unit = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = unit((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function grain(i: number, salt: number) {
    let n = Math.imul(i + 1, 0x45d9f3b) ^ salt;
    n = Math.imul(n ^ (n >>> 16), 0x27d4eb2d);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export function mountAudioField(canvas: HTMLCanvasElement, read: () => Bands, reduced: boolean): () => void {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return () => {};
    const portal = canvas.closest<HTMLElement>('.hologram-portal');
    let w = 0, h = 0, span = 0, frame = 0, disposed = false, last = 0, time = 0;
    let bass = 0, mid = 0, treble = 0, level = 0;
    let targetX = 0, targetY = 0, mouseX = 0, mouseY = 0;
    const dust: { x: number; y: number; z: number; phase: number; size: number }[] = [];
    const ribbons: { lane: number; angle: number; offset: number; depth: number; phase: number; size: number }[] = [];
    const visible = () => !portal || (!portal.hidden && portal.dataset.complete !== 'true');
    const wake = () => { if (!frame && !disposed && !document.hidden && visible() && w && h) frame = requestAnimationFrame(draw); };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const visibility = () => { if (document.hidden || !visible()) stop(); else wake(); };
    function resize() {
        const box = canvas.getBoundingClientRect();
        w = box.width; h = box.height;
        if (!w || !h) { stop(); return; }
        const dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1450000 / (w * h)));
        canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
        ctx!.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
        // Same perspective scale as the relief cube; the quiet center follows its size.
        span = h * Math.min(2.05, w / h * 2.42) / 4.6;
        dust.length = ribbons.length = 0;
        const count = Math.round(Math.min(1100, Math.max(420, w * h / 1300)));
        for (let i = 0; i < count; i++) dust.push({ x: grain(i, 17), y: grain(i, 79), z: grain(i, 135), phase: grain(i, 91) * tau, size: .55 + grain(i, 269) ** 3 * 1.3 });
        const flowCount = w < 700 ? 1500 : 2500;
        for (let i = 0; i < flowCount; i++) ribbons.push({ lane: i % 3, angle: grain(i, 25) * tau, offset: (grain(i, 472) - .5), depth: grain(i, 395), phase: grain(i, 851) * tau, size: .55 + grain(i, 267) ** 2 * 1.1 });
        canvas.dataset.pointCount = String(dust.length + ribbons.length);
        canvas.dataset.fieldStyle = 'layered-particle-streams';
        wake();
    }
    function draw(now: number) {
        frame = 0;
        if (disposed || document.hidden || !visible() || !w || !h) return;
        if (last && now - last < 1000 / 30 - 1) { wake(); return; }
        const dt = last ? Math.min(.08, (now - last) / 1000) : 1 / 30; last = now;
        const sound = read();
        const follow = (old: number, value: number) => old + ((sound.playing ? unit(value) : 0) - old) * (1 - Math.exp(-dt * (value > old ? 12 : 4)));
        bass = follow(bass, Math.pow(unit(sound.bass * 1.6), .8)); mid = follow(mid, unit(sound.mid * 2.4));
        treble = follow(treble, unit(sound.treble * 3.6)); level = follow(level, unit(sound.level * 2));
        mouseX += (targetX - mouseX) * (1 - Math.exp(-dt * 3)); mouseY += (targetY - mouseY) * (1 - Math.exp(-dt * 3));
        if (!reduced) time += dt;
        const entrance = reduced ? 1 : smooth(0, .85, time);
        ctx!.clearRect(0, 0, w, h); ctx!.fillStyle = '#fff';
        const cx = w * .5, cy = h * .55;
        const quietX = span * .51, quietY = span * .55;
        function pixel(x: number, y: number, size: number, light: number) {
            const ellipse = Math.hypot((x - cx) / quietX, (y - cy) / quietY);
            const centerQuiet = smooth(.87, 1.35, ellipse);
            const titleDistance = Math.hypot((x - cx) / Math.min(250, w * .4), (y - h * .16) / (h * .095));
            const titleQuiet = .12 + .88 * smooth(.8, 1.7, titleDistance);
            const edge = smooth(0, 35, Math.min(x, w - x, y, h - y));
            const alpha = light * centerQuiet * titleQuiet * edge * entrance * 1.18;
            if (alpha < .015) return;
            ctx!.globalAlpha = Math.min(.78, alpha);
            ctx!.fillRect(x - size / 2, y - size / 2, size, size);
        }
        for (const p of dust) {
            const drift = reduced ? 0 : time * (.0015 + p.z * .0015);
            const x = ((p.x + drift) % 1) * w + mouseX * p.z * 14;
            const y = p.y * h + (reduced ? 0 : Math.sin(time * .22 + p.phase) * 7) + mouseY * p.z * 10;
            const glint = reduced ? .5 : .5 + .5 * Math.sin(time * .7 + p.phase);
            pixel(x, y, p.size + treble * .6 * p.z, (.055 + p.z * .23) * (.65 + glint * .6 + level * .4));
        }
        for (const p of ribbons) {
            const direction = p.lane === 1 ? -1 : 1;
            const a = p.angle + time * (.035 + p.depth * .012) * direction;
            const width = span * (.72 + p.lane * .15) * (1 + bass * .035);
            const height = span * (.48 + p.lane * .13);
            const tilt = [-.48, .57, -.16][p.lane];
            const band = p.offset * (14 + 21 * p.depth);
            const rx = Math.cos(a) * (width + band), ry = Math.sin(a) * (height + band);
            const x = cx + rx * Math.cos(tilt) - ry * Math.sin(tilt) + mouseX * (8 + p.depth * 14);
            const y = cy + rx * Math.sin(tilt) + ry * Math.cos(tilt) + mouseY * (6 + p.depth * 10);
            const cloud = .25 + .75 * Math.pow(.5 + .5 * Math.cos(a * 2 - time * .18 + p.lane * 1.6), 2);
            const depth = .48 + .52 * (.5 + .5 * Math.sin(a + p.lane));
            const glint = reduced ? 0 : Math.pow(.5 + .5 * Math.sin(time * 1.1 + p.phase), 10);
            pixel(x, y, p.size * (.75 + depth * .4) + treble * glint * .7,
                (.13 + .33 * p.depth) * cloud * depth * (1 + mid * .5 + level * .4) + glint * (.035 + treble * .1));
        }
        ctx!.globalAlpha = 1;
        const audioActive = String(sound.playing);
        if (canvas.dataset.audioActive !== audioActive) canvas.dataset.audioActive = audioActive;
        if (!reduced) wake();
    }
    const pointer = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || event.target instanceof Element && event.target.closest('a,button,input,.site-audio')) return;
        const box = canvas.getBoundingClientRect();
        targetX = unit((event.clientX - box.left) / Math.max(1, w)) * 2 - 1;
        targetY = unit((event.clientY - box.top) / Math.max(1, h)) * 2 - 1;
    };
    const leave = () => { targetX = targetY = 0; };
    const portalObserver = new MutationObserver(visibility);
    if (portal) portalObserver.observe(portal, { attributes: true, attributeFilter: ['hidden', 'data-complete'] });
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    window.addEventListener('pointermove', pointer, { passive: true }); document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
    resize();
    return () => {
        if (disposed) return;
        disposed = true; stop(); observer.disconnect(); portalObserver.disconnect();
        window.removeEventListener('pointermove', pointer); document.documentElement.removeEventListener('pointerleave', leave);
        window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
        ctx!.clearRect(0, 0, w, h);
    };
}
