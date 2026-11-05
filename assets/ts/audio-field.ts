type Bands = { bass: number; mid: number; treble: number; level: number; playing: boolean };

const tau = Math.PI * 2;
const unit = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
const ease = (v: number) => { const t = unit(v); return t * t * (3 - 2 * t); };

// Geometry only: resizing retains the same stars. All audio envelopes come from read().
function grain(i: number, salt: number) {
    let n = Math.imul(i + 1, 0x45d9f3b) ^ salt;
    n = Math.imul(n ^ (n >>> 16), 0x27d4eb2d);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export function mountAudioField(canvas: HTMLCanvasElement, read: () => Bands, reduced: boolean): () => void {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return () => {};
    let w = 0, h = 0, floor = 0, span = 0, frame = 0, disposed = false;
    let last = -1, time = 0, bass = 0, mid = 0, treble = 0, level = 0, bassBed = 0;
    const portal=canvas.closest<HTMLElement>('.hologram-portal');
    const visible=()=>!portal||(!portal.hidden&&portal.dataset.complete!=='true');
    const stars: { x: number; y: number; phase: number; light: number; size: number; side: number }[] = [];
    const rings: { x: number; y: number; radius: number; light: number; size: number }[] = [];
    function resize() {
        if (disposed) return;
        const box = canvas.getBoundingClientRect();
        w = box.width; h = box.height;
        if (!w || !h) { stop(); return; }
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1450000 / (w * h)));
        const px = Math.max(1, Math.round(w * dpr)), py = Math.max(1, Math.round(h * dpr));
        if (canvas.width !== px) canvas.width = px;
        if (canvas.height !== py) canvas.height = py;
        ctx!.setTransform(px / w, 0, 0, py / h, 0, 0);
        // Match the projected portrait height and foot line in hologram.ts (cropped aspect ~0.78).
        span = Math.min(h * .88, w * .93 / .78);
        floor = h * .4775 + span * .49 * Math.cos(.12);
        const count = Math.round(Math.min(3200, Math.max(1000, w * h / 450)));
        stars.length = rings.length = 0;
        for (let i = 0; i < count; i++) {
            const t = grain(i, 177), depth = grain(i, 21291), side = i % 2 ? 1 : -1;
            const lane = (i >> 1) % 4;
            // Three loose, curved filaments per side, interspersed with distant dust.
            const distance = lane === 3 ? .22 + .8 * depth :
                .28 + .15 * lane + .23 * Math.sin(t * 3.6 + lane * .6) + .18 * depth;
            stars.push({ x: side * w * .5 * distance, y: h * (.07 + t * .89),
                phase: tau * grain(i, 39383), light: .16 + depth * .45,
                size: .8 + 1.5 * depth * depth, side });
        }
        const steps = Math.min(180, Math.max(88, Math.round(w / 8)));
        for (let lane = 0; lane < 14; lane++) {
            const radius = .18 + lane * .060;
            for (let j = 0; j < steps; j++) {
                const seed = lane * steps + j;
                const a = tau * (j + .38 * lane + grain(seed, 37) * .24) / steps;
                const r = radius + (grain(seed, 4237) - .5) * .009;
                rings.push({ x: w * .59 * r * Math.cos(a),
                    y: Math.min(h * .16, w * .14) * r * Math.sin(a),
                    radius, light: .14 + .32 * grain(seed, 5851) + .13 * Math.sin(a),
                    size: .75 + .65 * grain(seed, 9217) });
            }
        }
        canvas.dataset.pointCount=String(stars.length+rings.length);
        wake();
    }
    function draw(now: number) {
        frame = 0;
        if (disposed || document.hidden || !w || !h) return;
        const interval = reduced ? 100 : 1000 / 30;
        if (last >= 0 && now - last < interval - 1) { wake(); return; }
        const dt = last < 0 ? interval / 1000 : Math.min(.12, (now - last) / 1000);
        last = now;
        const s = read();
        const attack = 1 - Math.exp(-dt / .035), release = 1 - Math.exp(-dt / .20);
        const follow = (old: number, input: number) => {
            const target = s.playing ? unit(input) : 0;
            return old + (target - old) * (target > old ? attack : release);
        };
        // Lift quieter passages without replacing the real analyser input.
        const energy=(v:number,gain:number)=>Math.pow(unit((v-.012)*gain),.78);
        bass = follow(bass, energy(s.bass,1.8)); mid = follow(mid,energy(s.mid,2.7));
        treble = follow(treble,energy(s.treble,4)); level = follow(level,energy(s.level,2.5));
        bassBed+=(bass-bassBed)*(1-Math.exp(-dt/.55));
        if (!reduced) time += dt;
        const pulse=unit(bass*.45+Math.max(0,bass-bassBed)*4.8);
        const spread = reduced ? 0 : unit(bass*.45+pulse*.75);
        const lift = reduced ? 0 : mid * Math.min(84, h * .095);
        const halfGap = Math.min(span * .245, w * .28);
        const feather = Math.max(12, Math.min(span * .10, w * .08));
        ctx!.clearRect(0, 0, w, h);
        ctx!.fillStyle = "#fff";
        function pixel(x: number, y: number, size: number, light: number) {
            // Feather around the torso. Let the front orbits meet again below the feet.
            const silhouette = ease((Math.abs(x) - halfGap) / feather);
            const below = ease((y - floor) / Math.max(10, h * .036));
            const alpha = light * (silhouette + below * (1 - silhouette));
            if (alpha < .022 || Math.abs(x) > w * .5 + 2 || y < 0 || y > h) return;
            const centerX=w*(w>700?.4:.5);
            const rightQuiet=w>700&&centerX+x>w*.66?.32:1;
            const titleQuiet=w>700&&centerX+x<w*.27&&y<h*.32?.24:1;
            ctx!.globalAlpha = Math.min(1, alpha)*rightQuiet*titleQuiet;
            ctx!.fillRect(centerX + x - size / 2, y - size / 2, size, size);
        }
        for (const p of rings) {
            const expansion = 1 + spread * (.65 - p.radius * .16);
            // A bright annulus travels from the inner tracks to the rim as bass rises.
            const band = Math.max(0, 1 - Math.abs(p.radius - (.18 + bass * .70)) * 9);
            pixel(p.x * expansion, floor + p.y * (1 + spread * .95),
                p.size + 1.7 * bass * band, p.light * (.75 + level * 1.15) + pulse * (.25 + .7 * band));
        }
        for (const p of stars) {
            const drift = Math.sin(time * .5 + p.phase);
            const wave=reduced?0:Math.sin(p.y*.018-time*1.3+p.phase*.2)*lift;
            const glint = reduced ? .45 : .5 + .5 * Math.cos(time * 2.7 + p.phase);
            pixel(p.x * (1 + .22 * spread) + p.side * wave,
                p.y + (reduced ? 0 : drift * 3) - lift * p.light + wave*.5,
                p.size + 1.5 * treble * glint + pulse*.75,
                p.light * (.6 + level * 1.1 + .45 * mid) + treble * glint ** 3 * .9);
        }
        ctx!.globalAlpha = 1;
        wake();
    }
    function wake() {
        if (!frame && !disposed && !document.hidden && visible() && w && h) frame = requestAnimationFrame(draw);
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; last = -1; }
    function visibility() { if (document.hidden||!visible()) stop(); else wake(); }
    const portalObserver=new MutationObserver(visibility);
    if(portal)portalObserver.observe(portal,{attributes:true,attributeFilter:['hidden','data-complete']});
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    resize();
    return () => {
        if (disposed) return;
        disposed = true; stop(); observer.disconnect();portalObserver.disconnect();
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", visibility);
        ctx.clearRect(0, 0, w, h);
    };
}
