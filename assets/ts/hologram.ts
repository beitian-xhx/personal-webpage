/**
 * Image-derived 2.5D light field, not a reconstruction of unseen character sides.
 * One buffer, one image texture and two draws; all light-field motion stays on the GPU.
 * The caller owns entry, exit and replay.
 */
export async function mountHologram(canvas: HTMLCanvasElement, reduced: boolean) {
    const image = new Image();
    image.src = canvas.dataset.portrait || "";
    await image.decode();
    const fallback = () => {
        canvas.style.background = 'url("' + image.src + '") center 46% / auto 72% no-repeat';
        canvas.style.filter = "grayscale(1)";
        canvas.dataset.renderer = "static-fallback";
        return () => { canvas.style.removeProperty("background"); canvas.style.removeProperty("filter"); };
    };
    const crop = { x: .16, y: 0, width: .84, height: 1 };
    const aspect = image.width * crop.width / (image.height * crop.height);
    const sample = document.createElement("canvas");
    sample.height = 880; sample.width = Math.round(sample.height * aspect);
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback();
    context.drawImage(image, image.width*crop.x, 0, image.width*crop.width, image.height*crop.height, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const read = (x: number, y: number, channel: number) => {
        if (x < 0 || y < 0 || x >= sample.width || y >= sample.height) return 0;
        return pixels[(Math.floor(y) * sample.width + Math.floor(x)) * 4 + channel] / 255;
    };
    const luminance = (x: number, y: number) =>
        read(x,y,0)*.2126 + read(x,y,1)*.7152 + read(x,y,2)*.0722;
    const hash = (n: number) => { const s = Math.sin(n*127.1+311.7)*43758.5453; return s-Math.floor(s); };
    const points: number[] = [];
    const gauss = (x: number,y: number,cx: number,cy: number,rx: number,ry: number) =>
        Math.exp(-Math.pow((x-cx)/rx,2)-Math.pow((y-cy)/ry,2));
    const depth=(nx:number,ny:number)=>{
        const x=crop.x+nx*crop.width,y=ny*crop.height;
        return gauss(x,y,.60,.31,.18,.22)*.12+gauss(x,y,.81,.56,.20,.13)*.075
            +gauss(x,y,.57,.76,.25,.25)*.07-gauss(x,y,.24,.68,.29,.35)*.055;
    };
    const headWeight=(ny:number)=>{
        const t=Math.max(0,Math.min(1,(ny*crop.height-.40)/.22));
        return 1-t*t*(3-2*t);
    };
    for(let y=4;y<sample.height;y+=12.8){
        for(let x=4;x<sample.width;x+=12.8){
            if(read(x,y,3)<.7)continue;
            const nx=x/sample.width,ny=y/sample.height;
            points.push((nx-.5)*aspect,.5-ny,depth(nx,ny),hash(x*13+y*41),luminance(x,y),0,headWeight(ny));
        }
    }
    const portraitCount=points.length/7;
    // Horizontal emitter geometry shares the image's perspective.
    for(let ring=0;ring<3;ring++){
        const radius=[.40,.33,.11][ring],count=[190,146,76][ring];
        for(let i=0;i<count;i++){
            const a=i/count*Math.PI*2;
            points.push(Math.cos(a)*radius,-.49,Math.sin(a)*radius*.55,hash(i+ring*200),ring===2?.9:.45,1,ring);
        }
    }
    for(let i=0;i<100;i++) points.push((hash(i+2000)-.5)*.85,hash(i+3000),(hash(i+4000)-.5)*.35,hash(i+5000),.5,2,0);
    // Small fractured pixel constellations occupy the side space, behind the figure.
    const environmentStart=points.length/7;
    for(const side of [-1,1]){
        for(let cluster=0;cluster<7;cluster++){
            const cx=side*(.56+hash(cluster+72)*.24),cy=-.56+cluster*.185;
            for(let row=-3;row<=3;row++)for(let col=-3;col<=3;col++){
                if(Math.abs(row)+Math.abs(col)>3||hash(row*31+col*17+cluster*71)<.36)continue;
                points.push(cx+col*.012,cy+row*.018,-.10,hash(cluster*93+side),.4+hash(row*29+col)*.6,3,cluster%3);
            }
        }
        for(let i=0;i<150;i++){
            const a=-1.05+i/149*2.15;
            if(i%23>16)continue;
            points.push(side*(.48+Math.cos(a)*.35),Math.sin(a)*.72,-.18,hash(i+95),.35,3,3);
        }
        for(let i=0;i<65;i++)points.push(side*(.48+hash(i+23)*.43),(hash(i+62)-.5)*1.5,-.06,hash(i+41),.5,3,4);
    }
    canvas.dataset.environmentPoints=String(points.length/7-environmentStart);
    const lightCount=points.length/7;
    canvas.dataset.points=String(portraitCount);
    canvas.dataset.scenePoints=String(points.length/7);
    canvas.dataset.faceRendering="pixel-light-matrix";
    canvas.dataset.structure="hybrid-light-field";
    let gl: WebGLRenderingContext|null=null;
    try { gl=canvas.getContext("webgl",{alpha:true,antialias:false,premultipliedAlpha:true,powerPreference:"low-power"}); }
    catch (_) { return fallback(); }
    if(!gl) return fallback();
    const vertex = `
        attribute vec3 aPosition; attribute vec4 aDetail; attribute vec2 aUV;
        uniform vec2 uResolution,uMouse,uTurn;
        uniform float uTime,uIntro,uExit,uReduced,uDpr,uSurface,uAspect;
        varying float vAlpha,vLight,vDetail,vInteraction; varying vec2 vUV;
        void main(){
            vec3 p=aPosition;
            float seed=aDetail.x,tone=aDetail.y,kind=aDetail.z,detail=aDetail.w;
            float alive=1.0-uReduced;
            float character=1.0-step(.5,kind);
            float ring=step(.5,kind)*(1.0-step(1.5,kind));
            float dust=step(1.5,kind)*(1.0-step(2.5,kind));
            float environment=step(2.5,kind);
            float t=uTime,rise=fract(t*.065+seed);
            if(dust>.5){
                p.y=mix(-.47,.49,rise); p.x*=.22+rise*.8;
                p.x+=sin(t*.45+seed*30.0)*.012;
            }
            // The emitter stays grounded while the projected figure follows the pointer.
            vec2 turn=mix(uTurn,vec2(0.0,.12),ring);
            float cy=cos(turn.x),sy=sin(turn.x),cx=cos(turn.y),sx=sin(turn.y);
            p.xz=mat2(cy,-sy,sy,cy)*p.xz; p.yz=mat2(cx,-sx,sx,cx)*p.yz;
            vec2 delta=p.xy-uMouse;
            float proximity=exp(-dot(delta,delta)*70.0)*alive*character*mix(1.0,.35,detail);
            p.xy+=delta*proximity*.38;
            p.z+=proximity*(.070+sin(length(delta)*42.0-t*3.2)*.008);
            float assembled=smoothstep(seed*.20,.64+seed*.25,uIntro);
            if(character>.5){
                vec3 source=vec3(sin(seed*75.0)*.055,-.49,cos(seed*61.0)*.055);
                p=mix(source,p,max(assembled,uSurface));
                p.x+=sin(p.y*9.0+t*.48)*.0018*alive*assembled;
                p.y+=sin(t*.60)*.003*alive*assembled;
            }
            float release=uExit*character;
            p.xy+=vec2(sin(seed*83.0),.35+seed)*release*(.32+seed*.4);
            p.z+=release*.6;
            float perspective=2.7/(2.7-p.z);
            float scale=min(1.76,(uResolution.x/uResolution.y)*1.86/uAspect);
            float fieldResponse=0.0;
            if(environment>.5){
                // Screen-relative placement keeps the side fragments off the face.
                p=aPosition;
                p.x*=uResolution.x/uResolution.y/scale; p.y/=scale;
                p.xy+=vec2(sin(t*.20+seed*30.0),cos(t*.24+seed*23.0))*.012*alive;
                p.xy+=uTurn*vec2(.045,-.035)*alive;
                vec2 fieldDelta=p.xy-uMouse;
                fieldResponse=exp(-dot(fieldDelta,fieldDelta)*24.0)*alive;
                p.xy+=fieldDelta*fieldResponse*.32;
                perspective=1.0;
            }
            vec2 clip=p.xy*perspective*scale;
            clip.x*=uResolution.y/uResolution.x; clip.y+=.045;
            gl_Position=vec4(clip,0.0,1.0);
            float scanY=mix(-.48,.52,fract(t*.115));
            float scan=exp(-pow((aPosition.y-scanY)*38.0,2.0))*alive*(1.0-detail);
            float echo=exp(-pow((aPosition.y-scanY+.055)*18.0,2.0))*alive*(1.0-detail);
            float twinkle=.94+.06*sin(t*1.15+seed*12.0)*alive;
            float energy=mix(.08+pow(tone,1.15)*.90,smoothstep(.18,.84,tone),detail);
            energy+=scan*.38+echo*.06+proximity*.15; energy=max(energy,detail*.10);
            vAlpha=clamp(energy,.06,1.0)*twinkle*assembled*(1.0-uExit);
            // The face has one fine pixel lattice. Suppress coarse overlay there
            // to prevent competing grids and moire bands over the facial features.
            vAlpha*=(1.0-detail)*mix(.18,1.0,detail);
            vAlpha*=smoothstep(0.0,.07,aPosition.y+.5);
            float edgeX=aPosition.x/uAspect+.5;
            vAlpha*=mix(1.0,smoothstep(0.0,.055,edgeX)*smoothstep(0.0,.055,1.0-edgeX),character);
            vLight=.86+tone*.14;
            float densityScale=clamp(uResolution.y/uDpr*scale/1240.0,.54,1.08);
            float diameter=(mix(5.4,3.0,detail)+scan*.7+proximity*.6)*densityScale;
            if(ring>.5){
                vAlpha=(.22+tone*.38)*(1.0-uExit)*smoothstep(0.0,.22,uIntro);
                vLight=1.0; diameter=detail>1.5?3.0:2.0;
            }
            if(dust>.5){
                vAlpha=sin(rise*3.14159)*(.08+seed*.16)*(1.0-uExit)*uIntro;
                vLight=1.0; diameter=2.2+seed*1.3;
            }
            if(environment>.5){
                float breathing=.72+.28*sin(t*.65+seed*20.0)*alive;
                float narrow=mix(.22,1.0,smoothstep(.65,1.15,uResolution.x/uResolution.y));
                vAlpha=(.30+tone*.32+fieldResponse*.42)*breathing*narrow*uIntro*(1.0-uExit);
                vLight=1.0; diameter=detail<2.5?4.2:2.2;
                diameter+=fieldResponse*1.7;
            }
            gl_PointSize=diameter*uDpr*perspective;
            vDetail=0.0;
            vInteraction=proximity;
            vUV=aUV;
        }`;
    const fragment = `precision highp float; varying float vAlpha,vLight,vDetail,vInteraction; varying vec2 vUV;
        uniform sampler2D uImage;
        uniform float uSurface,uIntro,uExit,uTime,uReduced,uAspect,uDpr;
        void main(){
            if(uSurface>.5){
                // Small square texels, not large light dots: retain enough cells
                // across each eye for full-page recognition while making the
                // reconstructed face visibly pixel-art rather than photographic.
                float head=1.0-smoothstep(.40,.62,vUV.y);
                float rows=mix(156.0,288.0,head);
                vec2 cells=vec2(rows*uAspect,rows);
                vec2 pixelUV=(floor(vUV*cells)+.5)/cells;
                vec4 source=texture2D(uImage,pixelUV);
                float luma=dot(source.rgb,vec3(.2126,.7152,.0722));
                float sourceY=vUV.y;
                float bodyTone=pow(smoothstep(.035,.85,luma),.68);
                float tone=floor(mix(bodyTone,smoothstep(.09,.93,luma),head)*10.0+.5)/10.0;
                float strength=mix(.72,.98,head)+vInteraction*.12;
                float scan=exp(-pow((sourceY-fract(uTime*.115)*.68)*45.0,2.0))*(1.0-uReduced);
                strength+=scan*.045*(1.0-head);
                float reveal=smoothstep(.26,.94,uIntro);
                // Screen-aligned optical dots avoid subpixel stripe aliasing on
                // the curved UV grid. Integer device-pixel pitch stays stable.
                float pitch=max(3.0,floor(mix(5.6,3.6,head)*uDpr+.5));
                vec2 cell=fract(gl_FragCoord.xy/pitch)-.5;
                float dotCoverage=1.0-smoothstep(mix(.27,.33,head),mix(.43,.56,head),mix(max(abs(cell.x),abs(cell.y)),length(cell),head));
                float edge=smoothstep(0.0,.055,vUV.x)*smoothstep(0.0,.055,1.0-vUV.x)*(1.0-smoothstep(.92,1.0,vUV.y));
                gl_FragColor=vec4(vec3(tone),source.a*strength*dotCoverage*edge*reveal*(1.0-smoothstep(0.0,.72,uExit)));
                return;
            }
            vec2 p=gl_PointCoord-.5;
            float core=1.0-smoothstep(.22,.34,max(abs(p.x),abs(p.y)));
            float glow=exp(-dot(p,p)*15.0)*.24;
            float coverage=mix(min(1.0,core+glow),exp(-dot(p,p)*9.0),vDetail);
            gl_FragColor=vec4(vec3(vLight),vAlpha*coverage);
        }`;
    const shader=(type:number,source:string)=>{
        const s=gl!.createShader(type);
        if(!s)throw new Error("Portrait shader allocation failed");
        try{
            gl!.shaderSource(s,source);gl!.compileShader(s);
            if(!gl!.getShaderParameter(s,gl!.COMPILE_STATUS))throw new Error(gl!.getShaderInfoLog(s)||"Portrait shader failed");
            return s;
        }catch(error){gl!.deleteShader(s);throw error;}
    };
    let vs:WebGLShader|null=null,fs:WebGLShader|null=null,program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null,texture:WebGLTexture|null=null;
    const releaseGpu=()=>{
        if(buffer)gl!.deleteBuffer(buffer);if(program)gl!.deleteProgram(program);if(texture)gl!.deleteTexture(texture);
        if(vs)gl!.deleteShader(vs);if(fs)gl!.deleteShader(fs);
        buffer=null;program=null;vs=null;fs=null;texture=null;
    };
    // The underpainting uses a small deformable grid, sharing the point field's
    // geometry and perspective. High-frequency facial tones stay source-faithful.
    const geometry:number[]=[];
    for(let i=0;i<points.length;i+=7)geometry.push(...points.slice(i,i+7),0,0);
    const surfaceStart=geometry.length/9;
    const surfaceVertex=(x:number,y:number)=>{
        geometry.push((x-.5)*aspect,.5-y,depth(x,y),.5,.8,0,headWeight(y),x,y);
    };
    for(let y=0;y<24;y++)for(let x=0;x<24;x++){
        const x0=x/24,x1=(x+1)/24,y0=y/24,y1=(y+1)/24;
        surfaceVertex(x0,y0);surfaceVertex(x1,y0);surfaceVertex(x0,y1);
        surfaceVertex(x1,y0);surfaceVertex(x1,y1);surfaceVertex(x0,y1);
    }
    const surfaceCount=geometry.length/9-surfaceStart;
    try{
        vs=shader(gl.VERTEX_SHADER,vertex);fs=shader(gl.FRAGMENT_SHADER,fragment);
        program=gl.createProgram();if(!program)throw new Error("Portrait program allocation failed");
        gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"Portrait program failed");
        gl.useProgram(program);buffer=gl.createBuffer();if(!buffer)throw new Error("Portrait buffer allocation failed");
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geometry),gl.STATIC_DRAW);
        texture=gl.createTexture();if(!texture)throw new Error("Portrait texture allocation failed");
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sample);
        for(const [name,size,offset] of [["aPosition",3,0],["aDetail",4,12],["aUV",2,28]] as const){
            const location=gl.getAttribLocation(program,name);
            gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,36,offset);
        }
    }catch(_){releaseGpu();return fallback();}
    canvas.style.removeProperty("background");canvas.style.removeProperty("image-rendering");canvas.style.removeProperty("filter");
    const uniforms=Object.fromEntries(["uResolution","uMouse","uTurn","uTime","uIntro","uExit","uReduced","uDpr","uSurface","uImage","uAspect"].map(name=>[name,gl!.getUniformLocation(program!,name)]));
    gl.enable(gl.BLEND);
    // RGB is already premultiplied by blending. Do not multiply it a second time
    // during browser compositing, or square alpha in the transparent framebuffer.
    gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0,0,0,0);
    let frame=0,running=true,disposed=false,suspended=false;
    let turnX=0,turnY=0,targetX=0,targetY=0;
    let mouseX=9,mouseY=9,targetMouseX=9,targetMouseY=9;
    let elapsed=0,last=0,dpr=1,quality=1,frameMean=16.7,slowFrames=0,lastQualityChange=0;
    let bounds=canvas.getBoundingClientRect();
    const resize=()=>{
        bounds=canvas.getBoundingClientRect();
        const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height);
        const budget=width<700?900000:1800000;
        dpr=Math.min(devicePixelRatio||1,1.5,Math.sqrt(budget/(width*height)))*quality;
        const targetWidth=Math.max(1,Math.round(width*dpr)),targetHeight=Math.max(1,Math.round(height*dpr));
        if(canvas.width!==targetWidth||canvas.height!==targetHeight){
            canvas.width=targetWidth;canvas.height=targetHeight;
            gl!.viewport(0,0,canvas.width,canvas.height);
        }
        canvas.dataset.renderScale=dpr.toFixed(3);
        const scale=Math.min(1.76,width/height*1.86/aspect);
        canvas.parentElement?.style.setProperty("--portal-floor",(50+(.49*Math.cos(.12)*scale-.045)*50)+"%");
        canvas.parentElement?.style.setProperty("--portal-span",(height*scale*.5)+"px");
    };
    const move=(event:PointerEvent)=>{
        if(reduced||event.pointerType==="touch")return;
        const x=Math.max(-.5,Math.min(.5,(event.clientX-bounds.left)/bounds.width-.5));
        const y=Math.max(-.5,Math.min(.5,(event.clientY-bounds.top)/bounds.height-.5));
        const turnZone=Math.min(bounds.width*.9,bounds.height*.78);
        const turnInput=Math.max(-.5,Math.min(.5,(event.clientX-bounds.left-bounds.width*.5)/turnZone));
        targetX=turnInput*.92;targetY=y*.28;
        const ratio=bounds.width/bounds.height,scale=Math.min(1.76,ratio*1.86/aspect);
        targetMouseX=x*2*ratio/scale;targetMouseY=(-y*2-.045)/scale;
        if(mouseX===9){mouseX=targetMouseX;mouseY=targetMouseY;}
    };
    const paint=(now:number)=>{
        frame=0;if(!running||suspended||document.hidden)return;
        const frameTime=last?now-last:16.7;
        const dt=Math.min(frameTime/1000,.05);last=now;elapsed+=dt;
        frameMean+=(frameTime-frameMean)*.08;
        if(!reduced&&elapsed>2.4&&frameMean>28)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);
        if(slowFrames>=48&&quality>.8&&elapsed-lastQualityChange>1.5){
            quality=Math.max(.8,quality*.85);lastQualityChange=elapsed;slowFrames=0;resize();
        }
        const ease=1-Math.exp(-dt*8.5);
        turnX+=(targetX-turnX)*ease;turnY+=(targetY-turnY)*ease;
        mouseX+=(targetMouseX-mouseX)*ease;mouseY+=(targetMouseY-mouseY)*ease;
        gl!.clear(gl!.COLOR_BUFFER_BIT);
        gl!.uniform2f(uniforms.uResolution,canvas.width,canvas.height);gl!.uniform2f(uniforms.uMouse,mouseX,mouseY);
        gl!.uniform2f(uniforms.uTurn,reduced?-.035:-.035+turnX,reduced?.12:.12+turnY);
        gl!.uniform1f(uniforms.uTime,reduced?4.5:elapsed);gl!.uniform1f(uniforms.uIntro,reduced?1:Math.min(1,elapsed/1.8));
        const exit=Math.max(0,Math.min(1,Number(canvas.dataset.exit||0)));
        gl!.uniform1f(uniforms.uExit,exit);
        gl!.uniform1f(uniforms.uReduced,reduced?1:0);gl!.uniform1f(uniforms.uDpr,dpr);
        gl!.blendFuncSeparate(gl!.SRC_ALPHA,gl!.ONE,gl!.ONE,gl!.ONE_MINUS_SRC_ALPHA);
        gl!.uniform1i(uniforms.uImage,0);
        gl!.uniform1f(uniforms.uAspect,aspect);
        if(exit<.72){gl!.uniform1f(uniforms.uSurface,1);gl!.drawArrays(gl!.TRIANGLES,surfaceStart,surfaceCount);}
        gl!.uniform1f(uniforms.uSurface,0);gl!.drawArrays(gl!.POINTS,0,lightCount);
        if(!reduced)frame=requestAnimationFrame(paint);
    };
    const wake=()=>{if(running&&!suspended&&!document.hidden&&!frame)frame=requestAnimationFrame(paint);};
    const pause=()=>{cancelAnimationFrame(frame);frame=0;last=0;};
    const leave=()=>{targetMouseX=9;targetMouseY=9;targetX=0;targetY=0;};
    const onVisibility=()=>{if(document.hidden)pause();else wake();};
    const onPageHide=()=>{suspended=true;pause();};
    const onPageShow=()=>{suspended=false;wake();};
    const observer=new ResizeObserver(()=>{if(running){resize();wake();}});
    const contextLost=(event:Event)=>{event.preventDefault();running=false;pause();fallback();};
    const contextRestored=()=>{dispose();fallback();};
    const dispose=()=>{
        if(disposed)return;disposed=true;running=false;pause();observer.disconnect();
        window.removeEventListener("pointermove",move);document.documentElement.removeEventListener("pointerleave",leave);
        document.removeEventListener("visibilitychange",onVisibility);
        window.removeEventListener("pagehide",onPageHide);window.removeEventListener("pageshow",onPageShow);
        canvas.removeEventListener("webglcontextlost",contextLost);canvas.removeEventListener("webglcontextrestored",contextRestored);
        releaseGpu();
    };
    window.addEventListener("pointermove",move,{passive:true});
    document.documentElement.addEventListener("pointerleave",leave);
    document.addEventListener("visibilitychange",onVisibility);
    window.addEventListener("pagehide",onPageHide);window.addEventListener("pageshow",onPageShow);
    canvas.addEventListener("webglcontextlost",contextLost);canvas.addEventListener("webglcontextrestored",contextRestored);
    observer.observe(canvas);resize();wake();canvas.dataset.renderer="webgl-points";
    return dispose;
}

