/** Article entry: fracture the current wallpaper, preserving this site's image and palette. */
let library: Promise<any> | undefined;
let wallpaper: { url: string; image: Promise<HTMLImageElement> } | undefined;
function currentWallpaper() {
    const layer = document.querySelector<HTMLElement>('.global-glass-backdrop');
    if (!layer || document.documentElement.dataset.bg !== 'on') throw Error('Wallpaper is disabled');
    const url = getComputedStyle(layer).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (!url) throw Error('No wallpaper image');
    if (wallpaper?.url !== url) {
        const image = new Image(); image.decoding = 'async'; image.src = url;
        wallpaper = { url, image: image.decode().then(() => image) };
    }
    return wallpaper.image;
}
function warmLibrary() {
    if (!library) {
        const base = new URL(document.documentElement.dataset.siteBase || '/', location.origin);
        library = import(new URL('vendor/three/three.module.js', base).href).catch(error => { library = undefined; throw error; });
    }
    return library;
}
export function warmGlass() {
    return Promise.all([warmLibrary(), Promise.resolve().then(currentWallpaper)]);
}
function photograph(image: HTMLImageElement, width: number, height: number) {
    const canvas = document.createElement('canvas'), dpr = Math.min(1.25, devicePixelRatio || 1, Math.sqrt(2000000 / (width * height)));
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr);
    const style = getComputedStyle(document.querySelector('.global-glass-backdrop')!);
    ctx.fillStyle = style.backgroundColor; ctx.fillRect(0, 0, width, height);
    // Match live background cover, overscan, blur, saturation and the theme veil.
    const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
    const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight) * (Math.abs(matrix.a) || 1);
    const iw = image.naturalWidth * cover, ih = image.naturalHeight * cover;
    ctx.drawImage(image, (width - iw) / 2, (height - ih) / 2, iw, ih);
    const veil = document.querySelector('.global-glass-veil');
    if (veil) { ctx.fillStyle = getComputedStyle(veil).backgroundColor; ctx.fillRect(0, 0, width, height); }
    ctx.textBaseline = 'alphabetic';
    // Current visible labels travel with their image region; no dark panel is added.
    document.querySelectorAll('.main-container,.experience-nav').forEach(root => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node: Node | null;
        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent || !node.textContent?.trim() || parent.closest('[aria-hidden="true"],script,style,canvas,svg,.exp-row__preview')) continue;
            if (parent.closest('details:not([open])') && !parent.closest('summary')) continue;
            if (parent.checkVisibility && !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
            const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
            if (box.bottom < 0 || box.top > height) continue;
            ctx.fillStyle = style.color; ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const size = parseFloat(style.fontSize), range = document.createRange(), content = node.textContent;
            for (let i = 0; i < content.length; i++) {
                if (/\s/.test(content[i])) continue;
                range.setStart(node, i); range.setEnd(node, i + 1); const glyph = range.getBoundingClientRect();
                if (glyph.width && glyph.bottom >= 0 && glyph.top < height) ctx.fillText(content[i], glyph.left, glyph.top + size * .87);
            }
        }
    });
    return canvas;
}
function blurredSurface(image: HTMLImageElement, width: number, height: number) {
    const canvas=document.createElement('canvas');
    const ratio=Math.min(1.25,devicePixelRatio||1,Math.sqrt(1600000/(width*height)));
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    const context=canvas.getContext('2d')!;
    context.filter=`blur(${7*ratio}px)`;
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas;
}
type Point = { x: number; y: number };
type GlassCell = {site: Point; polygon: Point[]};
export type GlassEntry = { snapshot: string; width: number; height: number; pointerX: number; pointerY: number;
    startedAt?: number; cracks?: string; cells?: GlassCell[] };

export function clearGlassBridge() {
    ['--glass-cracks','--glass-x','--glass-y','--glass-radius','--glass-crack-delay'].forEach(name=>document.documentElement.style.removeProperty(name));
}

export async function prepareGlassEntry(pointerX: number, pointerY: number, signal?: AbortSignal): Promise<GlassEntry | undefined> {
    const width=innerWidth,height=innerHeight,startedAt=Date.now();
    const impact={x:Math.max(1,Math.min(width-1,pointerX)),y:Math.max(1,Math.min(height-1,pointerY))};
    const cells=fracture(width,height,impact);
    const path=cells.map(cell=>cell.polygon.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('')+'Z').join('');
    const cracks='data:image/svg+xml;base64,'+btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#e1efff" stroke-opacity=".65" stroke-width="1" stroke-linejoin="round"/></svg>`);
    const root=document.documentElement;
    root.style.setProperty('--glass-cracks',`url("${cracks}")`);
    root.style.setProperty('--glass-x',`${impact.x/width*100}%`);root.style.setProperty('--glass-y',`${impact.y/height*100}%`);
    root.style.setProperty('--glass-radius',`${Math.hypot(width,height)}px`);
    root.style.setProperty('--glass-crack-delay','0s');
    void warmLibrary().catch(()=>undefined);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (signal?.aborted) return;
    const image = await currentWallpaper();
    if (signal?.aborted) return;
    return { snapshot: photograph(image, innerWidth, innerHeight).toDataURL('image/jpeg', .9),
        width, height, pointerX:impact.x, pointerY:impact.y, startedAt, cracks, cells };
}
/** Viewport cells change with click position and viewport; no preset marketing layout. */
function fracture(width: number, height: number, impact: Point) {
    let seed = ((Math.round(impact.x) * 73856093) ^ (Math.round(impact.y) * 19349663)) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const columns = width < 700 ? 3 : 4, rows = 3, sites: Point[] = [impact];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        const p = { x: (x + .18 + random() * .64) * width / columns, y: (y + .18 + random() * .64) * height / rows };
        if (Math.hypot(p.x - impact.x, p.y - impact.y) > Math.min(width, height) * .1) sites.push(p);
    }
    return sites.map((site, index) => {
        let polygon: Point[] = [{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
        sites.forEach((other, j) => {
            if (j === index || !polygon.length) return;
            const nx = other.x - site.x, ny = other.y - site.y;
            const limit = (other.x ** 2 + other.y ** 2 - site.x ** 2 - site.y ** 2) / 2, clipped: Point[] = [];
            polygon.forEach((b, k) => {
                const a = polygon[(k + polygon.length - 1) % polygon.length];
                const da = a.x * nx + a.y * ny - limit, db = b.x * nx + b.y * ny - limit;
                if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}); }
                if (db <= 0) clipped.push(b);
            }); polygon = clipped;
        }); return {site, polygon};
    }).filter(cell => cell.polygon.length >= 3).flatMap((cell, index) => {
        // Central radial cracks begin exactly at the click, then join outer cells.
        if (index !== 0) return [cell];
        return cell.polygon.map((point, k) => ({site: cell.site,
            polygon: [impact, point, cell.polygon[(k + 1) % cell.polygon.length]]}));
    });
}
export async function glassDeparture(pointerX: number, pointerY: number, signal?: AbortSignal, prepared?: GlassEntry) {
    // Let the click's background blur begin before preparing the fragment scene.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (signal?.aborted) return;
    const snapshot = new Image();
    if (prepared) snapshot.src = prepared.snapshot;
    const [T, image] = prepared
        ? await Promise.all([warmLibrary(), snapshot.decode().then(() => snapshot)])
        : await warmGlass();
    if (signal?.aborted) return;
    if (prepared) {
        const visibleImages = [...document.images].filter(img => {
            const box = img.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
        });
        let timeout = 0;
        try {
            await Promise.race([
                Promise.all([document.fonts.ready, ...visibleImages.map(img => img.decode().catch(() => undefined)),
                    Promise.resolve().then(currentWallpaper).catch(() => undefined)]),
                new Promise(resolve => { timeout = window.setTimeout(resolve, 2000); }),
            ]);
        } finally { clearTimeout(timeout); }
        if (signal?.aborted) return;
    }
    const width = innerWidth, height = innerHeight, diagonal = Math.hypot(width, height);
    const impact = { x: Math.max(1, Math.min(width - 1, pointerX)), y: Math.max(1, Math.min(height - 1, pointerY)) };
    const backdropFilter = getComputedStyle(document.querySelector('.global-glass-backdrop')!).filter;
    const initialBlur = prepared ? 7 : Number(backdropFilter.match(/blur\(([\d.]+)px\)/)?.[1] || 0);
    const photographCanvas = prepared ? blurredSurface(image,width,height) : photograph(image, width, height);
    const renderer = new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setSize(width,height); renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25,Math.sqrt(1600000/(width*height))));
    renderer.outputColorSpace=T.SRGBColorSpace; renderer.setClearColor(0,0);
    renderer.domElement.className='glass-transition-canvas'; renderer.domElement.setAttribute('aria-hidden','true');
    renderer.domElement.style.opacity=prepared?'1':'0';
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,width/height,1,20000);
    camera.position.z=height/(2*Math.tan(Math.PI/12));
    const texture=new T.CanvasTexture(photographCanvas); texture.colorSpace=T.SRGBColorSpace;
    const pieces:any[]=[],geometries:any[]=[],materials:any[]=[];
    const carriedAge=prepared?.startedAt?Math.max(0,(Date.now()-prepared.startedAt)/1000):0;
    const crackRadius={value:Math.min(1,carriedAge/.26)*diagonal};
    const leadIn=prepared?Math.min(.20,carriedAge):0;
    const thickness=Math.max(2.5,Math.min(width,height)*.005);
    const cells=prepared?.cells?prepared.cells.map(cell=>({site:{x:cell.site.x*width/prepared.width,y:cell.site.y*height/prepared.height},
        polygon:cell.polygon.map(p=>({x:p.x*width/prepared.width,y:p.y*height/prepared.height}))})):fracture(width,height,impact);
    for(const {polygon,site} of cells) {
        const center=polygon.reduce((p,q)=>({x:p.x+q.x/polygon.length,y:p.y+q.y/polygon.length}),{x:0,y:0});
        const points=polygon.map(p=>new T.Vector2(p.x-center.x,center.y-p.y));
        const shape=new T.Shape(points),bevel=.65;
        const bodyGeometry=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1,curveSegments:1});
        const bodyMaterial=new T.MeshBasicMaterial({color:0xc2ddff,transparent:true,opacity:.18,depthWrite:false,side:T.DoubleSide});
        const body=new T.Mesh(bodyGeometry,bodyMaterial); body.position.z=-thickness-bevel;
        const frontGeometry=new T.ShapeGeometry(shape),positions=frontGeometry.attributes.position,uvs=frontGeometry.attributes.uv;
        for(let i=0;i<positions.count;i++)uvs.setXY(i,(positions.getX(i)+center.x)/width,(positions.getY(i)+height-center.y)/height);
        const frontMaterial=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,toneMapped:false,transparent:true});
        const front=new T.Mesh(frontGeometry,frontMaterial);front.position.z=.12;
        const edgeGeometry=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(p.x,p.y,.3)));
        const edgeMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,
            uniforms:{uRadius:crackRadius,uAlpha:{value:.65},uImpact:{value:new T.Vector2(impact.x,impact.y)},
                uOrigin:{value:new T.Vector2(center.x,center.y)}},
            vertexShader:`uniform vec2 uOrigin;varying vec2 vSource;
                void main(){vSource=vec2(position.x+uOrigin.x,uOrigin.y-position.y);
                gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
            fragmentShader:`uniform vec2 uImpact;uniform float uRadius,uAlpha;varying vec2 vSource;
                void main(){float d=distance(vSource,uImpact);
                float visible=1.-smoothstep(uRadius-10.,uRadius+2.,d);
                gl_FragColor=vec4(.76,.86,1.,visible*uAlpha);
                #include <colorspace_fragment>
                }`});
        const piece=new T.Group();piece.add(body,front,new T.LineLoop(edgeGeometry,edgeMaterial));
        piece.position.set(center.x-width/2,height/2-center.y,0);scene.add(piece);
        const dx=center.x-impact.x,dy=center.y-impact.y,angle=Math.atan2(dy,dx),index=pieces.length;
        pieces.push({piece,frontMaterial,bodyMaterial,edgeMaterial,origin:piece.position.clone(),
            delay:Math.hypot(site.x-impact.x,site.y-impact.y)/diagonal*.08,
            vx:Math.cos(angle)*width*(.48+index%3*.08),vy:-Math.sin(angle)*height*.43-height*.17,
            vz:Math.min(camera.position.z*.43,550)*(.65+index%4*.13),
            spin:new T.Vector3(Math.sin(angle)*.8+.2,Math.cos(angle),(index%2?1:-1)*.32).normalize(),angle:(index%2?1:-1)*(1.2+index%3*.35)});
        geometries.push(bodyGeometry,frontGeometry,edgeGeometry);materials.push(bodyMaterial,frontMaterial,edgeMaterial);
    }
    renderer.domElement.dataset.source='site-wallpaper';renderer.domElement.dataset.shards=String(pieces.length);
    renderer.domElement.dataset.phase='cracking';
    let frame=0;
    let onAbort: (() => void) | undefined;
    try {
        document.body.append(renderer.domElement);renderer.render(scene,camera);
        document.documentElement.dataset.glassTransition='active';
        if(prepared)delete document.documentElement.dataset.glassHandoff;
        await new Promise<void>((resolve,reject)=>{
            onAbort = () => resolve();
            signal?.addEventListener('abort', onAbort, {once:true});
            let start=0;
            const paint=(now:number)=>{try{
                if(signal?.aborted){resolve();return;}
                if(!start)start=now;const elapsed=(now-start)/1000,t=elapsed+leadIn;
                if(!prepared){
                    renderer.domElement.style.opacity=String(Math.min(1,t/.18));
                    renderer.domElement.style.filter=`blur(${initialBlur + Math.min(1,t/.24)*Math.max(0,7-initialBlur)}px)`;
                }
                crackRadius.value=Math.min(1,(elapsed+carriedAge)/.26)*diagonal;
                const phase=t<.20?'cracking':'breaking';
                if(renderer.domElement.dataset.phase!==phase)renderer.domElement.dataset.phase=phase;
                pieces.forEach(p=>{const u=Math.max(0,Math.min(1,(t-.20-p.delay)/.64)),travel=u*u*(2-u);
                    p.piece.position.copy(p.origin);p.piece.position.x+=p.vx*travel;
                    p.piece.position.y+=p.vy*travel-height*.30*travel*travel;
                    p.piece.position.z+=p.vz*travel;
                    p.piece.quaternion.setFromAxisAngle(p.spin,p.angle*travel);
                    p.edgeMaterial.uniforms.uAlpha.value=.65*(1-u);
                    p.frontMaterial.opacity=1-Math.max(0,(u-.65)/.35);p.bodyMaterial.opacity=.18*p.frontMaterial.opacity;
                });renderer.render(scene,camera);if(t>.94)resolve();else frame=requestAnimationFrame(paint);
            }catch(error){reject(error)}};frame=requestAnimationFrame(paint);
        });
    }finally{if(onAbort)signal?.removeEventListener('abort',onAbort);cancelAnimationFrame(frame);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());texture.dispose();renderer.dispose();renderer.domElement.remove()}
}
