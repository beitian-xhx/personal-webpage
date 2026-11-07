import { mountHologram } from "./hologram";
import { mountFluid } from "./fluid";
import { glassDeparture, prepareGlassEntry, warmGlass, clearGlassBridge, type GlassEntry } from "./glass-transition";

export function initExperience() {
    const root = document.documentElement;
    if (root.dataset.experience !== "true" || root.dataset.expReady === "true") return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const nav = document.querySelector<HTMLElement>("[data-exp-nav]");
    const portal = document.querySelector<HTMLElement>(".hologram-portal");
    const portrait = portal?.querySelector<HTMLCanvasElement>("canvas[data-portrait]");
    const contentLayers = [...document.querySelectorAll<HTMLElement>(".main-container,.experience-nav")];
    let portraitDispose: (() => void) | undefined, portalGeneration = 0;
    let portraitRunning = false, portalScrollActive = false, portalScrollFrame = 0;
    let fluidDispose: (() => void) | undefined;
    let pageSuspended = document.hidden;
    const canAnimate = () => !pageSuspended && !document.hidden && !reduced.matches;
    const notifyPortal = () => document.dispatchEvent(new Event("site:portal"));
    const inertContent = (value: boolean) => {
        contentLayers.forEach(element => { element.inert = value; });
    };
    const stopPortalScroll = () => { cancelAnimationFrame(portalScrollFrame); portalScrollFrame = 0; };
    const smooth = (from: number, to: number, value: number) => {
        const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
        return t * t * (3 - 2 * t);
    };
    const stopPortrait = () => {
        ++portalGeneration; portraitRunning = false;
        portraitDispose?.(); portraitDispose = undefined;
    };
    const startPortrait = () => {
        if (!portrait || portraitRunning) return;
        portraitRunning = true;
        const generation = ++portalGeneration;
        void mountHologram(portrait, reduced.matches).then(dispose => {
            if (generation !== portalGeneration || portal?.hidden) dispose?.();
            else portraitDispose = dispose;
            requestAnimationFrame(() => document.dispatchEvent(new Event("site:portrait-ready")));
        }).catch(() => {
            if (generation !== portalGeneration || portal?.hidden) return;
            portrait.dataset.renderer = "image-fallback";
            portrait.style.background = `url("${portrait.dataset.portraitOriginal || portrait.dataset.portrait}") center/auto 80% no-repeat`;
            portrait.style.imageRendering = "pixelated";
            portrait.style.filter = "grayscale(1)";
            document.dispatchEvent(new Event("site:portrait-ready"));
        });
    };
    // Keep the intro's document height after exit, so scrolling back can restore it.
    const paintPortalScroll = () => {
        portalScrollFrame = 0;
        if (!portal || !portalScrollActive) return;
        if (reduced.matches) {
            portal.hidden = true;
            delete root.dataset.portal; delete root.dataset.portalLeaving; delete root.dataset.portalMotion;
            delete root.dataset.portalScroll;
            portal.removeAttribute("aria-hidden");
            contentLayers.forEach(element => element.style.removeProperty("opacity"));
            inertContent(false); stopPortrait(); notifyPortal();
            return;
        }
        portal.hidden = false;
        root.dataset.portalScroll = "true";
        const t = Math.max(0, Math.min(1, scrollY / Math.max(1, portal.offsetHeight)));
        const wasOpen = root.dataset.portal === "open";
        const motion = t >= .30 && t < 1;
        const motionChanged = (root.dataset.portalMotion === "true") !== motion;
        if (t < 1) root.dataset.portal = "open";
        else delete root.dataset.portal;
        if (motion) root.dataset.portalMotion = "true";
        else delete root.dataset.portalMotion;
        if (t > 0 && t < 1) root.dataset.portalLeaving = "true";
        else delete root.dataset.portalLeaving;
        portal.dataset.leaving = String(t > 0);
        portal.dataset.complete = String(t >= 1);
        portal.setAttribute("aria-hidden", String(t >= 1));
        portal.inert = t >= 1;
        if (portrait) portrait.dataset.exit = String(smooth(0, .80, t));
        portal.style.setProperty("--portal-fade", String(smooth(.05, 1, t)));
        portal.style.setProperty("--portal-progress", String(t));
        portal.style.setProperty("--portal-blue", String(smooth(.05, .85, t)));
        portal.style.setProperty("--portal-bloom", String(Math.sin(Math.PI * t) * .28));
        const homeOpacity = smooth(.12, .94, t);
        portal.style.setProperty("--portal-home-opacity", String(homeOpacity));
        contentLayers.forEach(element => {
            if (t >= 1) element.style.removeProperty("opacity");
            else element.style.setProperty("opacity", String(homeOpacity));
        });
        inertContent(t < 1);
        if (t >= 1) {
            if (wasOpen) {
                try { sessionStorage.setItem("beitian-entry-v1", "entered"); } catch (_) {}
            }
            if (portraitRunning) stopPortrait();
        } else if (!pageSuspended && !document.hidden) startPortrait();
        if (wasOpen !== (t < 1) || motionChanged) notifyPortal();
    };
    const queuePortalScroll = () => {
        if (portalScrollActive && !portalScrollFrame && !pageSuspended && !document.hidden) {
            portalScrollFrame = requestAnimationFrame(paintPortalScroll);
        }
    };
    const showPortal = (replay = false) => {
        if (!portal || !portrait) return;
        portalScrollActive = true;
        portal.dataset.ready = "true";
        if (replay) {
            // Override CSS smooth scrolling: replay must start at the real document top.
            window.scrollTo({ top: 0, behavior: "instant" });
        }
        paintPortalScroll();
        notifyPortal();
    };
    document.querySelector("[data-exp-replay]")?.addEventListener("click", () => showPortal(true));
    // Only the explicit prompt is a shortcut. Portal/player clicks and native keys stay native.
    portal?.querySelector("[data-portal-enter]")?.addEventListener("click", () => {
        if (!portalScrollActive || !portal) return;
        window.scrollTo({ top: portal.offsetHeight, behavior: reduced.matches ? "instant" : "smooth" });
    });
    window.addEventListener("scroll", queuePortalScroll, { passive: true });
    window.addEventListener("resize", queuePortalScroll, { passive: true });
    if (root.dataset.portal === "open") showPortal();
    const initFluid = (restart = false) => {
        if (fluidDispose && !restart) return;
        fluidDispose?.(); fluidDispose = undefined;
        const canvas = document.querySelector<HTMLCanvasElement>(".experience-fluid canvas");
        const host = canvas?.parentElement;
        if (canvas && host && !reduced.matches && !pageSuspended && !document.hidden) {
            try { fluidDispose = mountFluid(canvas, host); } catch (error) { console.warn("流体背景已降级", error); }
        }
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(initFluid, { timeout: 1500 });
    else window.setTimeout(initFluid, 100);
    document.querySelector("[data-exp-theme]")?.addEventListener("click", () => {
        root.dataset.scheme = root.dataset.scheme === "dark" ? "light" : "dark";
        try { localStorage.setItem("StackColorScheme", root.dataset.scheme); } catch (_) {}
        window.dispatchEvent(new CustomEvent("onColorSchemeChange", { detail: root.dataset.scheme }));
    });
    const menu = document.querySelector<HTMLButtonElement>("[data-exp-menu]");
    const closeMenu = () => { nav?.removeAttribute("data-menu-open"); menu?.setAttribute("aria-expanded", "false"); };
    menu?.addEventListener("click", () => {
        const open = menu.getAttribute("aria-expanded") !== "true";
        menu.setAttribute("aria-expanded", String(open)); nav?.setAttribute("data-menu-open", String(open));
    });
    nav?.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeMenu(); });

    const reveals = [...document.querySelectorAll<HTMLElement>("[data-exp-reveal]")];
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.visible = "true"; observer.unobserve(entry.target);
    }), { rootMargin: "0px 0px -24px 0px", threshold: .08 });
    reveals.forEach(element => {
        if (reduced.matches) element.dataset.visible = "true";
        else observer.observe(element);
    });
    const filters = [...document.querySelectorAll<HTMLButtonElement>("[data-exp-filter]")];
    const rows = [...document.querySelectorAll<HTMLAnchorElement>("[data-exp-row]")];
    const categoriesByRow = new Map(rows.map(row => [row, new Set((row.dataset.categories || "").split("|").filter(Boolean))]));
    const countOutput = document.querySelector("[data-exp-count]");
    const prefetched = new Set<string>();
    const warmArticle = (link: HTMLAnchorElement) => {
        if (!reduced.matches) void warmGlass().catch(() => undefined);
        if (prefetched.has(link.href)) return;
        prefetched.add(link.href);
        const hint = document.createElement("link"); hint.rel = "prefetch"; hint.href = link.href; hint.as = "document"; document.head.append(hint);
    };
    [...rows,...document.querySelectorAll<HTMLAnchorElement>(".right-sidebar a.recent-project")].forEach(link => {
        link.addEventListener("pointerenter", () => warmArticle(link), { once: true });
        link.addEventListener("focus", () => warmArticle(link), { once: true });
        link.addEventListener("touchstart", () => warmArticle(link), { once: true, passive: true });
    });
    filters.forEach(button => button.addEventListener("click", () => {
        const filter = button.dataset.expFilter || "";
        filters.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        let count = 0;
        rows.forEach(row => {
            row.hidden = Boolean(filter && !categoriesByRow.get(row)!.has(filter));
            if (!row.hidden) { count++; if (reduced.matches) row.dataset.visible = "true"; else if (row.dataset.visible !== "true") observer.observe(row); }
        });
        if (countOutput) countOutput.textContent = String(count);
        const menu = button.closest("details"); if (menu) menu.open = false;
    }));
    const rowRafControls: Array<{ pause: () => void; resume: () => void }> = [];
    const floatingPreview=!document.body.classList.contains("experience-home-restored");
    rows.forEach(row => {
        const title = row.querySelector("h3")?.textContent || "";
        row.querySelectorAll(".exp-row__marquee span").forEach((span, index) => { if (index % 2 === 0) span.textContent = title; });
        let phase = 0, raf = 0, targetX = 0, x = 0, last = 0;
        const track = row.querySelector<HTMLElement>(".exp-row__marquee");
        const paint = (now: number) => {
            raf = 0;
            if (!canAnimate() || row.dataset.active !== "true") return;
            const dt = Math.min((now - last) / 1000 || .016, .04); last = now;
            phase = (phase + dt * 24) % 1600; x += (targetX - x) * (1 - Math.exp(-dt * 9));
            track?.style.setProperty("transform", `translate3d(${-phase}px,0,0)`);
            if(floatingPreview)row.style.setProperty("--preview-x", `${x}px`);
            raf = requestAnimationFrame(paint);
        };
        const pause = () => { cancelAnimationFrame(raf); raf = 0; };
        const resume = () => {
            if (row.dataset.active !== "true" || !canAnimate() || raf) return;
            last = performance.now(); raf = requestAnimationFrame(paint);
        };
        rowRafControls.push({ pause, resume });
        const activate = (event?: PointerEvent) => {
            if (event && (!fine.matches || event.pointerType === "touch")) return;
            const bounds = row.getBoundingClientRect();
            row.style.setProperty("--entry-side", event && event.clientY > bounds.top + bounds.height / 2 ? "bottom" : "top");
            row.dataset.active = "true";
            resume();
        };
        const reset = () => { delete row.dataset.active; pause(); };
        row.addEventListener("pointerenter", activate);
        if(floatingPreview)row.addEventListener("pointermove", event => {
            if (!canAnimate() || !fine.matches || event.pointerType === "touch") return;
            const bounds = row.getBoundingClientRect();
            targetX = Math.max(-32, Math.min(32, (event.clientX - bounds.left - bounds.width * .7) * .05));
            row.style.setProperty("--preview-y", `${(event.clientY - bounds.top - bounds.height / 2) * .12}px`);
        }, { passive: true });
        row.addEventListener("pointerleave", reset); row.addEventListener("pointercancel", reset);
        row.addEventListener("focusin", () => activate()); row.addEventListener("focusout", reset);
    });

    const cursor = document.querySelector<HTMLElement>(".experience-cursor");
    let cursorFrame = 0, cx = -100, cy = -100, tx = -100, ty = -100, cursorLast = 0, cursorPaintLast = 0;
    const paintCursor = (now: number) => {
        cursorFrame = 0;
        if (!cursor || !canAnimate() || !fine.matches || root.dataset.portal === "open") { cursor?.removeAttribute("data-visible"); return; }
        const dt=cursorPaintLast?Math.min(.05,(now-cursorPaintLast)/1000):1/60;
        cursorPaintLast=now;
        const ease=1-Math.exp(-dt*15);
        cx += (tx - cx) * ease; cy += (ty - cy) * ease;
        cursor.style.setProperty("--cursor-x", `${cx}px`); cursor.style.setProperty("--cursor-y", `${cy}px`);
        cursor.dataset.visible = "true";
        if (Math.hypot(tx - cx, ty - cy) > .2 && now - cursorLast < 1500) cursorFrame = requestAnimationFrame(paintCursor);
    };
    window.addEventListener("pointermove", event => {
        if (event.pointerType === "touch" || !canAnimate() || root.dataset.portal === "open") return;
        tx = event.clientX; ty = event.clientY; cursorLast = performance.now();
        if(cx===-100){cx=tx;cy=ty;cursorPaintLast=0;}
        const target = event.target instanceof Element ? event.target.closest("a,button") : null;
        if (cursor) cursor.dataset.mode = target ? "link" : "default";
        if (!cursorFrame) cursorFrame = requestAnimationFrame(paintCursor);
    }, { passive: true });
    const magnets = [...document.querySelectorAll<HTMLElement>("[data-exp-magnet],.experience-nav__links a")];
    const magnetResets: Array<() => void> = [];
    let geometryEpoch=0;
    window.addEventListener("resize",()=>{geometryEpoch++;},{passive:true});
    const clearPointerEffects = () => {
        cancelAnimationFrame(cursorFrame); cursorFrame = 0;
        cx = cy = tx = ty = -100; cursorPaintLast=0; cursor?.removeAttribute("data-visible");
        magnetResets.forEach(reset=>reset());
    };
    const clearOnPointerExit = (event?: PointerEvent) => {
        if (!event || event.relatedTarget === null) clearPointerEffects();
    };
    document.documentElement.addEventListener("pointerleave", () => clearPointerEffects());
    window.addEventListener("pointerout", clearOnPointerExit);
    window.addEventListener("blur", () => clearPointerEffects());
    magnets.forEach(element => {
        let bounds:DOMRect|undefined,epoch=-1,frame=0,x=0,y=0;
        const reset=()=>{cancelAnimationFrame(frame);frame=0;bounds=undefined;element.style.removeProperty("--magnet-x");element.style.removeProperty("--magnet-y");};
        magnetResets.push(reset);
        element.addEventListener("pointermove", event => {
            if (!canAnimate() || !fine.matches) return;
            if(!bounds||epoch!==geometryEpoch){bounds=element.getBoundingClientRect();epoch=geometryEpoch;}
            x=(event.clientX-bounds.left-bounds.width/2)*.12;
            y=(event.clientY-bounds.top-bounds.height/2)*.12;
            if(!frame)frame=requestAnimationFrame(()=>{
                frame=0;if(!canAnimate())return;
                element.style.setProperty("--magnet-x",`${x}px`);element.style.setProperty("--magnet-y",`${y}px`);
            });
        }, { passive: true });
        element.addEventListener("pointerleave", reset);
    });
    let scrollFrame = 0;
    const heroTitle=document.querySelector<HTMLElement>(".exp-hero__title");
    const visibleImages=new Set<HTMLElement>();
    const imageObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(entry.isIntersecting)visibleImages.add(entry.target as HTMLElement);else visibleImages.delete(entry.target as HTMLElement);
    }),{rootMargin:"100px"});
    document.querySelectorAll<HTMLElement>(".article-content figure img,.article-header .article-image img").forEach(image=>imageObserver.observe(image));
    const paintScroll = () => {
        scrollFrame = 0;
        const scrolled=String(scrollY>30);if(nav?.dataset.scrolled!==scrolled)nav?.setAttribute("data-scrolled",scrolled);
        if (!canAnimate()||!fine.matches) return;
        if(heroTitle&&!heroTitle.closest('.home-profile'))heroTitle.style.setProperty("--hero-y",`${Math.min(scrollY,innerHeight)*.10}px`);
        const updates=[...visibleImages].map(image=>{
            const box = image.getBoundingClientRect();
            return {image,y:Math.max(-8,Math.min(8,(box.top-innerHeight/2)*.018))};
        });
        updates.forEach(({image,y})=>image.style.setProperty("--image-y",`${y}px`));
    };
    window.addEventListener("scroll", () => {
        geometryEpoch++;
        if (!canAnimate()) { if (reduced.matches) paintScroll(); return; }
        if (!scrollFrame) scrollFrame = requestAnimationFrame(paintScroll);
    }, { passive: true });
    paintScroll();
    const wipe = document.querySelector<HTMLElement>(".experience-transition");
    let glassNavigating = false;
    document.addEventListener("click", event => {
        if (reduced.matches || root.dataset.portal === "open" || (event.target instanceof Element && event.target.closest(".site-audio,audio,video"))) return;
        const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
        if (target && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !target.download && (!target.target || target.target === "_self")) {
            const url = new URL(target.href);
            if (url.origin === location.origin && url.pathname !== location.pathname && /\/$/.test(url.pathname) && !/\/admin\//.test(url.pathname)) {
                event.preventDefault();
                if (target.matches("[data-exp-row], .right-sidebar a.recent-project") && document.body.classList.contains("home-profile-layout")) {
                    if (glassNavigating) return;
                    glassNavigating = true;
                    root.dataset.glassDeparture = "true";
                    root.dataset.glassPreparing = "true";
                    notifyPortal();
                    const glassAbort = new AbortController();
                    const navigate = (entry?: GlassEntry) => {
                        if (!glassNavigating) return;
                        glassNavigating = false;
                        glassAbort.abort();
                        try {
                            sessionStorage.setItem("site-glass-arrival", JSON.stringify({to: url.pathname, time: Date.now(), ...entry}));
                        } catch (_) {
                            try { sessionStorage.setItem("site-glass-arrival", JSON.stringify({to: url.pathname, time: Date.now()})); } catch (_) {}
                        }
                        location.assign(url.href);
                    };
                    const deadline = window.setTimeout(() => navigate(), 2500);
                    void prepareGlassEntry(event.clientX, event.clientY, glassAbort.signal).catch(() => undefined).then(entry => {
                        clearTimeout(deadline); navigate(entry);
                    });
                    return;
                }
                location.assign(url.href);
                return;
            }
        }
        if(event.target instanceof Element&&event.target.closest("a,button,input,summary,label,select,textarea"))return;
        const wave = document.createElement("span"); wave.className = "experience-click-wave";
        wave.style.left = `${event.clientX}px`; wave.style.top = `${event.clientY}px`;
        document.body.append(wave); window.setTimeout(() => wave.remove(), 850);
    });
    const suspendMotion = () => {
        pageSuspended = true;
        rowRafControls.forEach(control => control.pause());
        cancelAnimationFrame(cursorFrame); cursorFrame = 0;
        cancelAnimationFrame(scrollFrame); scrollFrame = 0;
        stopPortalScroll(); clearPointerEffects();
    };
    const resumeMotion = () => {
        if (document.hidden) { suspendMotion(); return; }
        pageSuspended = false;
        rowRafControls.forEach(control => control.resume());
        paintScroll(); paintPortalScroll();
    };
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) suspendMotion();
        else { resumeMotion(); if (!fluidDispose) initFluid(); }
    });
    window.addEventListener("pageshow", event => {
        delete root.dataset.glassTransition; delete root.dataset.glassDeparture; delete root.dataset.glassPreparing; glassNavigating = false; notifyPortal();
        if(root.dataset.glassReveal!=="true")clearGlassBridge();
        if (event.persisted) { wipe?.removeAttribute("data-active"); closeMenu(); }
        resumeMotion();
        if (event.persisted) initFluid();
    });
    window.addEventListener("pagehide", () => {
        suspendMotion(); fluidDispose?.(); fluidDispose = undefined;
    });
    reduced.addEventListener("change", () => {
        initFluid(true); if (reduced.matches) reveals.forEach(element => element.dataset.visible = "true");
        if (reduced.matches) {
            rowRafControls.forEach(control => control.pause());
            cancelAnimationFrame(cursorFrame); cursorFrame = 0;
            cancelAnimationFrame(scrollFrame); scrollFrame = 0;
            clearPointerEffects(); paintScroll();
            paintPortalScroll();
        } else {
            rowRafControls.forEach(control => control.resume());
            paintScroll();
        }
        if (!reduced.matches) paintPortalScroll();
    });
    root.dataset.expReady = "true";
    const entryWindow = window as Window & { __glassEntry?: GlassEntry };
    const glassEntry = entryWindow.__glassEntry;
    delete entryWindow.__glassEntry;
    if (glassEntry && root.dataset.glassReveal === "true") {
        const revealAbort = new AbortController();
        const stopReveal = () => revealAbort.abort();
        window.addEventListener("pagehide", stopReveal, { once: true });
        void glassDeparture(glassEntry.pointerX * innerWidth / glassEntry.width,
            glassEntry.pointerY * innerHeight / glassEntry.height, revealAbort.signal, glassEntry)
            .catch(() => undefined).finally(() => {
                window.removeEventListener("pagehide", stopReveal);
                delete root.dataset.glassHandoff; delete root.dataset.glassReveal; delete root.dataset.glassTransition;
                root.style.removeProperty("--glass-snapshot");
                clearGlassBridge();
                notifyPortal();
            });
    }
}
