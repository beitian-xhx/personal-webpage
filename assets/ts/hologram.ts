/** Six geometric point faces. A/B/C occupy Z/X/Y opposite pairs respectively. */
export async function mountHologram(canvas: HTMLCanvasElement, reduced: boolean) {
    const clamp = (v: number, low = 0, high = 1) => Math.max(low, Math.min(high, v));
    const originalBackground = canvas.style.background;
    const originalFilter = canvas.style.filter;
    let paths: string[] = [];
    try {
        const value: unknown = JSON.parse(canvas.dataset.cubeImages || "[]");
        if (Array.isArray(value)) paths = value.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, 3);
    } catch (_) { /* Older templates provide a single portrait. */ }
    if (!paths.length && canvas.dataset.portrait) paths = [canvas.dataset.portrait];
    const loaded = await Promise.all(paths.map(async path => {
        const image = new Image();
        image.decoding = "async";
        image.src = path;
        try { await image.decode(); return image; } catch (_) { return null; }
    }));
    const first = loaded.find((image): image is HTMLImageElement => image !== null);
    const showFallback = (reason: string) => {
        canvas.dataset.renderer = "static-fallback";
        canvas.dataset.renderError = reason;
        const src = first?.src || canvas.dataset.portrait;
        if (src) canvas.style.background = `url(${JSON.stringify(src)}) center 55% / auto 56% no-repeat`;
        canvas.style.filter = "grayscale(1)";
    };
    const clearFallback = () => {
        canvas.style.background = originalBackground;
        canvas.style.filter = originalFilter;
    };
    if (!first) { showFallback("cube-images-unavailable"); return clearFallback; }
    const images = [0, 1, 2].map(i => loaded[i] || first);
    canvas.dataset.sourceCount = String(new Set(images.map(image => image.src)).size);
    canvas.dataset.faceCount = "6";
    canvas.dataset.structure = "six-face-relief-cube";
    canvas.dataset.faceRendering = "alpha-masked-relief-points";
    canvas.dataset.faceSources = JSON.stringify(images.map(image => image.src));

    // Sample a true surface lattice, never a textured underpainting. Positive
    // grayscale preserves bright hair/skin and dark eyes/clothing from the source.
    const grid = 112, sampleSize = 448;
    const sample = document.createElement("canvas");
    sample.width = sample.height = sampleSize;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) { showFallback("image-sampling-unavailable"); return clearFallback; }
    let samples: { tones: Float32Array; alpha: Float32Array }[];
    try {
        samples = images.map(image => {
            context.clearRect(0, 0, sampleSize, sampleSize);
            const side = Math.min(image.naturalWidth, image.naturalHeight);
            context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2,
                side, side, 0, 0, sampleSize, sampleSize);
            const rgba = context.getImageData(0, 0, sampleSize, sampleSize).data;
            const luma = new Float32Array(sampleSize * sampleSize);
            for (let i = 0; i < luma.length; i++) luma[i] = (rgba[i * 4] * .2126 + rgba[i * 4 + 1] * .7152 + rgba[i * 4 + 2] * .0722) / 255;
            const result = new Float32Array(grid * grid);
            const alpha = new Float32Array(grid * grid);
            for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
                const sx = x * 4 + 2, sy = y * 4 + 2, index = sy * sampleSize + sx;
                let weight = 0, weightedLight = 0;
                for (const offset of [0, -1, sampleSize, sampleSize - 1]) {
                    const coverage = rgba[(index + offset) * 4 + 3] / 255;
                    weight += coverage; weightedLight += luma[index + offset] * coverage;
                }
                alpha[y * grid + x] = weight / 4;
                const light = weight > 0 ? weightedLight / weight : 0;
                result[y * grid + x] = .018 + Math.pow(clamp((light - .035) / .94), .95) * .982;
            }
            return { tones: result, alpha };
        });
    } catch (_) { showFallback("image-sampling-failed"); return clearFallback; }

    // Each basis is oriented so images read correctly from outside the cube.
    const faces = [
        { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], image: 0 },
        { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], image: 0 },
        { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], image: 1 },
        { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], image: 1 },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], image: 2 },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], image: 2 }
    ];
    // Source-specific anatomical anchors: face, hair crown and shoulder volume.
    // These shapes carry depth independently of the image's light/dark colors.
    const profiles = [
        { face: [.64, .40, .16, .19], hair: [.61, .24, .25, .23], shoulder: [.64, .72, .32, .30] },
        { face: [.60, .49, .18, .21], hair: [.51, .29, .31, .27], shoulder: [.56, .81, .34, .27] },
        { face: [.52, .60, .23, .23], hair: [.48, .32, .34, .30], shoulder: [.51, .94, .36, .24] }
    ];
    const relief = (image: number, x: number, y: number) => {
        const profile = profiles[image];
        const gaussian = ([cx, cy, rx, ry]: number[]) => Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
        return .035 + .18 * gaussian(profile.face) + .10 * gaussian(profile.hair) + .085 * gaussian(profile.shoulder);
    };
    const vertices: number[] = [];
    const put = (face: typeof faces[number], u: number, v: number, tone: number, alpha: number, depth = 0) => {
        for (let axis = 0; axis < 3; axis++) vertices.push(face.n[axis] * (1 + depth) + face.u[axis] * u + face.v[axis] * v);
        vertices.push(...face.n, tone, alpha);
    };
    const facePointCounts = Array(6).fill(0) as number[];
    for (const face of faces) for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
        const index = y * grid + x, sample = samples[face.image];
        if (sample.alpha[index] < .08) continue;
        const nx = (x + .5) / grid, ny = (y + .5) / grid;
        put(face, nx * 2 - 1, 1 - ny * 2, sample.tones[index], sample.alpha[index], relief(face.image, nx, ny));
        facePointCounts[faces.indexOf(face)]++;
    }
    const imagePoints = vertices.length / 8;
    // The cube is an occlusion/interaction structure; it has no visible border.
    const pointCount = vertices.length / 8;
    for (const face of faces) for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, -1], [1, 1], [-1, 1]]) put(face, u, v, 0, 0);
    canvas.dataset.points = String(imagePoints);
    canvas.dataset.scenePoints = String(pointCount);
    canvas.dataset.environmentPoints = "0";
    canvas.dataset.facePointCounts = JSON.stringify(facePointCounts);

    let gl: WebGLRenderingContext | null = null;
    try { gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: true, premultipliedAlpha: true, powerPreference: "low-power" }); } catch (_) { /* Explicit static fallback below. */ }
    if (!gl) { showFallback("webgl-unavailable"); return clearFallback; }
    const vertexSource = `
        attribute vec3 aPosition, aNormal;
        attribute vec2 aDetail;
        uniform vec2 uTurn, uResolution, uParallax;
        uniform float uScale, uIntro, uExit, uTime, uReduced, uPointMax, uMotion;
        uniform mediump float uPass;
        varying mediump float vTone, vFacing;
        vec3 rotate(vec3 p) {
            float cy=cos(uTurn.x), sy=sin(uTurn.x), cx=cos(uTurn.y), sx=sin(uTurn.y);
            p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
            p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
            float py=cos(uParallax.x), sy2=sin(uParallax.x), px=cos(uParallax.y), sx2=sin(uParallax.y);
            p=vec3(py*p.x+sy2*p.z,p.y,-sy2*p.x+py*p.z);
            return vec3(p.x,px*p.y-sx2*p.z,sx2*p.y+px*p.z);
        }
        void main() {
            vec3 p=aPosition;
            // The depth shell remains just beneath every light bead.
            p+=aNormal*uPass*.006;
            p*=mix(.94,1.0,uIntro)*(1.0-uExit*.12);
            vec3 q=rotate(p), normal=rotate(aNormal);
            q.y+=sin(uTime*.73)*.010*(1.0-uReduced);
            float distance=5.6-q.z;
            vec3 eye=normalize(vec3(0.0,0.0,5.6)-q);
            vFacing=dot(normal,eye);
            float aspect=uResolution.x/uResolution.y;
            gl_Position=vec4(q.x*uScale/aspect,q.y*uScale-.10*distance,
                (20.0+.1)/(20.0-.1)*distance-2.0*20.0*.1/(20.0-.1),distance);
            float pitch=uResolution.y*uScale/(112.0*distance);
            // Circular particles stay visibly separated even on oblique faces.
            float facing=clamp(vFacing,0.0,1.0);
            float size=pitch*mix(.38,.66,sqrt(aDetail.x))*sqrt(max(.12,facing));
            gl_PointSize=clamp(size,1.0,uPointMax);
            float glint=1.0+.025*sin(uTime*.65+aPosition.y*5.0)*(1.0-uReduced)*uMotion;
            vec3 planar=abs(aPosition)*(vec3(1.0)-abs(aNormal));
            float border=max(planar.x,max(planar.y,planar.z));
            float edgeFade=1.0-smoothstep(.97,1.0,border)*.35;
            vTone=aDetail.x*aDetail.y*glint*uIntro*(1.0-uExit)*edgeFade;
        }`;
    const fragmentSource = `
        precision mediump float;
        uniform mediump float uPass;
        varying mediump float vTone, vFacing;
        void main() {
            if(uPass<.5) { gl_FragColor=vec4(0.0); return; }
            if(vFacing<=.018) discard;
            float radius=length(gl_PointCoord-.5);
            if(radius>.5) discard;
            float coverage=1.0-smoothstep(.34,.5,radius);
            float light=mix(.76,1.0,sqrt(max(0.0,vFacing)));
            float alpha=coverage*vTone*light;
            gl_FragColor=vec4(vec3(alpha),alpha);
        }`;
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
    const shaders: WebGLShader[] = [];
    const releaseGpu = () => {
        if (buffer) gl!.deleteBuffer(buffer);
        if (program) gl!.deleteProgram(program);
        shaders.forEach(shader => gl!.deleteShader(shader));
        shaders.length = 0; buffer = null; program = null;
    };
    try {
        program = gl.createProgram();
        if (!program) throw new Error("program-allocation");
        for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
            const shader = gl.createShader(type);
            if (!shader) throw new Error("shader-allocation");
            shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "shader-compile");
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "program-link");
        gl.useProgram(program);
        buffer = gl.createBuffer();
        if (!buffer) throw new Error("buffer-allocation");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        for (const [name, size, offset] of [["aPosition", 3, 0], ["aNormal", 3, 12], ["aDetail", 2, 24]] as const) {
            const location = gl.getAttribLocation(program, name);
            gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset);
        }
    } catch (error) {
        releaseGpu(); showFallback(error instanceof Error ? error.message : "gpu-initialization"); return clearFallback;
    }
    clearFallback(); delete canvas.dataset.renderError;
    const uniforms = Object.fromEntries(["uTurn", "uResolution", "uScale", "uPass", "uIntro", "uExit", "uTime", "uReduced", "uPointMax", "uMotion", "uParallax"].map(name => [name, gl!.getUniformLocation(program!, name)]));
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    const pointMax = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1];
    const host = canvas.closest<HTMLElement>(".hologram-portal") || canvas.parentElement || canvas;
    let disposed = false, suspended = false, lost = false, frame = 0, last = 0, elapsed = 0;
    let yaw = 0, pitch = 0, velocityX = 0, velocityY = 0, targetX = 0, targetY = 0, motion = 0;
    let dragging = false, inside = false, pointerId = -1, previousX = 0, previousY = 0, pointerTime = 0;
    let snapFace: number | null = 0;
    let parallaxX = 0, parallaxY = 0, parallaxTargetX = 0, parallaxTargetY = 0;
    // Canonical views keep each image's local up vector upright on screen.
    const faceAngles = [[0, 0], [Math.PI, 0], [-Math.PI / 2, 0], [Math.PI / 2, 0], [0, Math.PI / 2], [0, -Math.PI / 2]];
    const angleDelta = (target: number, current: number) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
    const updateTurn = (now: number, dt: number) => {
        if (reduced) return;
        const sinceMove = now - pointerTime;
        const active = (inside || dragging) && sinceMove < 200;
        if (active) {
            const ease = 1 - Math.exp(-dt * 18);
            velocityX += (targetX - velocityX) * ease;
            velocityY += (targetY - velocityY) * ease;
        } else if (sinceMove < 380) {
            // A brief release, followed by a stable, upright nearest-face target.
            velocityX *= Math.exp(-dt * 9); velocityY *= Math.exp(-dt * 9);
        } else {
            if (snapFace === null) {
                const view = [-Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
                let best = -Infinity;
                faces.forEach((face, index) => {
                    const facing = face.n.reduce((sum, value, axis) => sum + value * view[axis], 0);
                    if (facing > best) { best = facing; snapFace = index; }
                });
            }
            const [restYaw, restPitch] = faceAngles[snapFace!];
            const dx = angleDelta(restYaw, yaw), dy = angleDelta(restPitch, pitch);
            // Critically damped spring, integrated analytically for frame independence.
            const decay = Math.exp(-11 * dt);
            const cx = velocityX - 11 * dx, cy = velocityY - 11 * dy;
            yaw += dx + (-dx + cx * dt) * decay;
            pitch += dy + (-dy + cy * dt) * decay;
            velocityX = (velocityX - 11 * cx * dt) * decay;
            velocityY = (velocityY - 11 * cy * dt) * decay;
            if (Math.abs(dx) + Math.abs(dy) + Math.abs(velocityX) + Math.abs(velocityY) < .002) {
                yaw = restYaw; pitch = restPitch; velocityX = velocityY = 0;
            }
        }
        if (active || sinceMove < 380) { yaw += velocityX * dt; pitch += velocityY * dt; }
        yaw %= Math.PI * 2; pitch %= Math.PI * 2;
        motion += (clamp(Math.hypot(velocityX, velocityY) * .65) - motion) * (1 - Math.exp(-dt * 12));
    };
    let bounds = canvas.getBoundingClientRect();
    const wake = () => { if (!disposed && !suspended && !lost && !document.hidden && !frame) frame = requestAnimationFrame(paint); };
    const pause = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const resize = () => {
        bounds = canvas.getBoundingClientRect();
        const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
        const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2600000 / (width * height)));
        canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
        gl!.viewport(0, 0, canvas.width, canvas.height);
        canvas.dataset.renderScale = dpr.toFixed(3); wake();
    };
    function paint(now: number) {
        frame = 0;
        if (disposed || suspended || lost || document.hidden) return;
        const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, .04); last = now; elapsed += dt;
        updateTurn(now, dt);
        const parallaxEase = 1 - Math.exp(-dt * 3);
        parallaxX += (parallaxTargetX - parallaxX) * parallaxEase;
        parallaxY += (parallaxTargetY - parallaxY) * parallaxEase;
        const exitValue = Number(canvas.dataset.exit || 0);
        const exit = Number.isFinite(exitValue) ? clamp(exitValue) : 0;
        gl!.depthMask(true); gl!.colorMask(true, true, true, true);
        gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
        gl!.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
        gl!.uniform2f(uniforms.uTurn, yaw, pitch);
        const quiet = reduced ? 0 : 1 - motion * .8;
        gl!.uniform2f(uniforms.uParallax, quiet * (parallaxX + Math.sin(elapsed * .43) * .012), quiet * (parallaxY + Math.sin(elapsed * .37) * .008));
        const activeFace = snapFace === null ? "moving" : String(faces[snapFace].image);
        if (canvas.dataset.activeImage !== activeFace) canvas.dataset.activeImage = activeFace;
        gl!.uniform1f(uniforms.uScale, Math.min(2.05, canvas.width / canvas.height * 2.42));
        gl!.uniform1f(uniforms.uIntro, reduced ? 1 : Math.min(1, elapsed / .75));
        gl!.uniform1f(uniforms.uExit, exit); gl!.uniform1f(uniforms.uTime, elapsed);
        gl!.uniform1f(uniforms.uReduced, reduced ? 1 : 0); gl!.uniform1f(uniforms.uPointMax, pointMax);
        gl!.uniform1f(uniforms.uMotion, motion);
        // Closed, depth-only cube prevents rear dots leaking through front gaps.
        gl!.colorMask(false, false, false, false); gl!.uniform1f(uniforms.uPass, 0);
        gl!.drawArrays(gl!.TRIANGLES, pointCount, 36);
        gl!.colorMask(true, true, true, true); gl!.depthMask(false); gl!.uniform1f(uniforms.uPass, 1);
        gl!.drawArrays(gl!.POINTS, 0, pointCount);
        if (!reduced && exit < 1) wake();
    }
    const isControl = (target: EventTarget | null) => target instanceof Element && !!target.closest("button,a,input,audio,video,.site-audio");
    const move = (event: PointerEvent) => {
        if (reduced || disposed) return;
        const x = (event.clientX - bounds.left) / Math.max(1, bounds.width), y = (event.clientY - bounds.top) / Math.max(1, bounds.height);
        const wasInside = inside;
        inside = x >= 0 && x <= 1 && y >= 0 && y <= 1 && !isControl(event.target);
        if (!inside && !dragging) return;
        parallaxTargetX = (clamp(x) - .5) * .055;
        parallaxTargetY = (clamp(y) - .5) * .040;
        if (dragging && event.pointerId !== pointerId) return;
        const now = performance.now(), dt = clamp((now - pointerTime) / 1000, .008, .06);
        const dx = event.clientX - previousX, dy = event.clientY - previousY;
        if (!wasInside && !dragging) {
            previousX = event.clientX; previousY = event.clientY; pointerTime = now;
            targetX = targetY = 0; return;
        }
        if (dx === 0 && dy === 0) return;
        const gain = (dragging ? 6.2 : 4.2) / Math.max(1, Math.min(bounds.width, bounds.height));
        targetX = clamp(dx * gain / dt, dragging ? -5 : -3.5, dragging ? 5 : 3.5);
        targetY = event.pointerType === "touch" ? 0 : clamp(dy * gain / dt, dragging ? -4 : -3, dragging ? 4 : 3);
        previousX = event.clientX; previousY = event.clientY; pointerTime = now; snapFace = null;
        wake();
    };
    const down = (event: PointerEvent) => {
        if (reduced || event.button !== 0 || isControl(event.target)) return;
        dragging = true; pointerId = event.pointerId; previousX = event.clientX; previousY = event.clientY;
        pointerTime = performance.now(); targetX = targetY = 0;
        host.dataset.cubeDragging = "true";
    };
    const up = () => { if (!dragging) return; dragging = false; inside = false; targetX = targetY = 0; delete host.dataset.cubeDragging; };
    const leave = () => { inside = false; parallaxTargetX = parallaxTargetY = 0; if (!dragging) targetX = targetY = 0; };
    const visibility = () => { if (document.hidden) { up(); leave(); pause(); } else wake(); };
    const pageHide = () => { suspended = true; up(); leave(); pause(); };
    const pageShow = () => { suspended = false; resize(); wake(); };
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; pause(); showFallback("webgl-context-lost"); };
    // A restored canvas remains an explicit static fallback until the next mount.
    const contextRestored = () => { releaseGpu(); showFallback("webgl-context-restored-remount-required"); };
    const observer = new ResizeObserver(() => { if (!disposed && !lost) resize(); });
    const exitObserver = new MutationObserver(wake);
    const dispose = () => {
        if (disposed) return; disposed = true; pause(); observer.disconnect(); exitObserver.disconnect();
        window.removeEventListener("pointermove", move); host.removeEventListener("pointerdown", down);
        window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
        host.removeEventListener("pointerleave", leave); window.removeEventListener("blur", up);
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", pageShow);
        canvas.removeEventListener("webglcontextlost", contextLost); canvas.removeEventListener("webglcontextrestored", contextRestored);
        delete host.dataset.cubeDragging; releaseGpu(); clearFallback();
    };
    window.addEventListener("pointermove", move, { passive: true }); host.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true }); window.addEventListener("pointercancel", up, { passive: true });
    host.addEventListener("pointerleave", leave); window.addEventListener("blur", up);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pageHide); window.addEventListener("pageshow", pageShow);
    canvas.addEventListener("webglcontextlost", contextLost); canvas.addEventListener("webglcontextrestored", contextRestored);
    observer.observe(canvas); exitObserver.observe(canvas, { attributes: true, attributeFilter: ["data-exit"] });
    resize(); canvas.dataset.renderer = "webgl-points";
    return dispose;
}
