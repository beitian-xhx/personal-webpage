import { mountAudioField } from './audio-field';

export function initSiteAudio() {
    const host=document.querySelector<HTMLElement>('[data-site-audio]');
    if(!host||host.dataset.ready==='true')return;
    host.dataset.ready='true';
    const audio=host.querySelector<HTMLAudioElement>('audio')!;
    const play=host.querySelector<HTMLButtonElement>('[data-audio-play]')!;
    const volume=host.querySelector<HTMLInputElement>('[data-audio-volume]')!;
    const status=host.querySelector<HTMLElement>('[data-audio-status]')!;
    let context:AudioContext|undefined,analyser:AnalyserNode|undefined,data:Uint8Array<ArrayBuffer>|undefined;
    let dispose:(()=>void)|undefined,energyFrame=0,lastEnergy=0,waitingGesture=false,wantsPlay=true,starting=false;
    try{const saved=JSON.parse(localStorage.getItem('beitian-audio-v1')||'null');if(saved&&Number.isFinite(saved.volume))volume.value=String(Math.max(0,Math.min(1,saved.volume)));}catch(_){}
    audio.volume=Number(volume.value);
    const persist=()=>{try{localStorage.setItem('beitian-audio-v1',JSON.stringify({volume:audio.volume}));}catch(_){}};
    const sync=()=>{const active=!audio.paused&&!waitingGesture;play.textContent=active?'Ⅱ':'▶';play.setAttribute('aria-label',active?'暂停背景音乐':'播放背景音乐');play.setAttribute('aria-pressed',String(active));host.dataset.playing=String(active);status.textContent=waitingGesture?'点击页面启用声音':active?'太空漫步 · HOYO-MiX':'太空漫步 · 已暂停';};
    const start=async()=>{
        if(starting)return;starting=true;
        try{
            if(!context){context=new AudioContext();context.addEventListener('statechange',()=>{if(context?.state==='running'&&!audio.paused){waitingGesture=false;sync();}});analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.76;context.createMediaElementSource(audio).connect(analyser);analyser.connect(context.destination);data=new Uint8Array(analyser.frequencyBinCount);}
            // A blocked AudioContext.resume() may stay pending until a gesture.
            // Do not wait for it before requesting media playback.
            void context.resume().catch(()=>{});await audio.play();
            waitingGesture=context.state!=='running';sync();
            if(waitingGesture)status.textContent='点击页面启用声音';
            if(!energyFrame)energyFrame=requestAnimationFrame(publish);
        }catch(error){audio.pause();sync();
            if(error instanceof DOMException&&error.name==='NotAllowedError'){waitingGesture=true;status.textContent='点击页面启用声音';}
            else{waitingGesture=false;status.textContent='播放失败，请重试';console.warn('Background audio failed',error);}
        }finally{starting=false;}
    };
    play.addEventListener('click',()=>{
        if(!audio.paused&&context?.state==='running'){wantsPlay=false;waitingGesture=false;audio.pause();}
        else{wantsPlay=true;void start();}
    });
    const unlock=(event:Event)=>{
        if(!waitingGesture||!wantsPlay||host.contains(event.target as Node))return;
        if(event instanceof KeyboardEvent&&!['Enter',' '].includes(event.key))return;
        void start();
    };
    document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
    volume.addEventListener('input',()=>{audio.volume=Number(volume.value);persist();});
    audio.addEventListener('play',sync);audio.addEventListener('pause',sync);
    audio.addEventListener('error',()=>{sync();status.textContent='音乐加载失败';});
    audio.addEventListener('waiting',()=>{status.textContent='正在加载音乐…';});audio.addEventListener('playing',sync);
    const read=()=>{
        if(!analyser||!data||audio.paused)return{bass:0,mid:0,treble:0,level:0,playing:false};
        analyser.getByteFrequencyData(data);
        const band=(a:number,b:number)=>{let sum=0;for(let i=a;i<b;i++)sum+=data![i];return sum/Math.max(1,b-a)/255;};
        return{bass:band(1,9),mid:band(9,70),treble:band(70,240),level:band(1,160),playing:true};
    };
    const publish=()=>{
        energyFrame=0;if(document.hidden||audio.paused)return;
        const now=performance.now();
        if(now-lastEnergy>=80){lastEnergy=now;document.dispatchEvent(new CustomEvent('site:audio-energy',{detail:read()}));}
        energyFrame=requestAnimationFrame(publish);
    };
    const stopEnergy=()=>{cancelAnimationFrame(energyFrame);energyFrame=0;document.dispatchEvent(new CustomEvent('site:audio-energy',{detail:{bass:0,mid:0,treble:0,level:0,playing:false}}));};
    audio.addEventListener('play',()=>{if(!energyFrame)energyFrame=requestAnimationFrame(publish);});
    audio.addEventListener('pause',stopEnergy);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopEnergy();else if(!audio.paused&&!energyFrame)energyFrame=requestAnimationFrame(publish);});
    const canvas=document.querySelector<HTMLCanvasElement>('[data-audio-field]');
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const mount=()=>{dispose?.();if(canvas)dispose=mountAudioField(canvas,read,motion.matches);};
    mount();motion.addEventListener('change',mount);
    audio.addEventListener('loadedmetadata',()=>{try{const position=Number(sessionStorage.getItem('beitian-audio-position'));if(Number.isFinite(position)&&position>0&&Number.isFinite(audio.duration)&&position<audio.duration)audio.currentTime=position;}catch(_){}});
    window.addEventListener('pagehide',()=>{try{sessionStorage.setItem('beitian-audio-position',String(audio.currentTime));}catch(_){}dispose?.();stopEnergy();audio.pause();void context?.suspend();});
    window.addEventListener('pageshow',event=>{if(event.persisted)mount();});
    void start();
}
