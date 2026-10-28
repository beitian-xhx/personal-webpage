type PageTransition = {
    ready: Promise<void>;
    finished: Promise<void>;
    updateCallbackDone?: Promise<void>;
    skipTransition: () => void;
};

type PageActivation = {
    from?: { url: string };
    entry?: { url: string };
};

type TransitionEvent = Event & {
    viewTransition?: PageTransition;
    activation?: PageActivation;
};

const motionRoot = document.documentElement;
const motionBase = new URL(motionRoot.dataset.siteBase || "/", location.origin).pathname;
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const coverStorageKey = "site-motion-cover";
const arrivalStorageKey = "site-vt-arrival";
let selectedCover: HTMLElement | null = null;
let transitionFinished: Promise<void> = Promise.resolve();
let activeTransition: PageTransition | undefined;
let pendingDestination = "";
let transitionDeadline = 0;

const pageURL = (value: string) => {
    const url = new URL(value, location.href);
    return url.origin + url.pathname;
};

const isSitePage = (value: string) => {
    const url = new URL(value, location.href);
    const relative = url.pathname.slice(motionBase.length);
    return url.origin === location.origin && url.pathname.startsWith(motionBase) &&
        !/^admin(?:\/|$)/.test(relative) && !/\.[a-z0-9]+$/i.test(url.pathname);
};

const clearCover = () => {
    selectedCover?.style.removeProperty("view-transition-name");
    selectedCover = null;
    delete motionRoot.dataset.transitionCover;
};

const setTransitionState = (state: string) => {
    motionRoot.dataset.transitionState = state;
    window.dispatchEvent(new CustomEvent("site:transition", {
        detail: { state, key: motionRoot.dataset.transitionCover || null },
    }));
};

const resetTransition = () => {
    clearTimeout(transitionDeadline);
    transitionDeadline = 0;
    clearCover();
    activeTransition = undefined;
    pendingDestination = "";
    document.body?.classList.remove("is-home-profile-leaving", "is-arriving-from-home");
    document.querySelector(".page-navigation-veil")?.remove();
    setTransitionState("idle");
};

const selectCover = (key: string) => {
    clearCover();
    if (motionPreference.matches || matchMedia("(max-width: 720px)").matches) return;
    const container = [...document.querySelectorAll<HTMLElement>("[data-transition-key]")]
        .find(element => element.dataset.transitionKey === key);
    const cover = container?.querySelector<HTMLElement>("[data-transition-cover]");
    if (!cover || !cover.getClientRects().length) return;
    cover.style.viewTransitionName = "article-cover";
    selectedCover = cover;
    motionRoot.dataset.transitionCover = key;
};

const watchTransition = (transition: PageTransition) => {
    transition.ready.then(() => {
        const startTime = document.timeline.currentTime;
        if (activeTransition !== transition || typeof startTime !== "number") return;
        document.getAnimations().forEach(animation => {
            const effect = animation.effect as KeyframeEffect | null;
            if (animation.pending && effect?.pseudoElement?.startsWith("::view-transition-")) animation.startTime = startTime;
        });
    }).catch(() => undefined);
    transition.updateCallbackDone?.catch(() => undefined);
    activeTransition = transition;
    clearTimeout(transitionDeadline);
    transitionDeadline = window.setTimeout(() => {
        if (activeTransition !== transition) return;
        transition.skipTransition();
        resetTransition();
    }, 420);
    transitionFinished = transition.finished.catch(() => undefined).then(() => {
        if (activeTransition === transition) resetTransition();
    });
};

motionRoot.dataset.transitionState = "idle";

Object.assign(window, {
    SiteMotion: {
        supported: "onpageswap" in window && "onpagereveal" in window,
        get state() { return motionRoot.dataset.transitionState; },
        get coverKey() { return motionRoot.dataset.transitionCover || null; },
        get finished() { return transitionFinished; },
        settle: () => transitionFinished,
    },
});

document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
        link.hasAttribute("download") || link.target && link.target !== "_self" || link.relList.contains("external")) return;
    if (!isSitePage(link.href) || pageURL(link.href) === pageURL(location.href)) return;
    pendingDestination = pageURL(link.href);
});

window.addEventListener("pageswap", ((event: TransitionEvent) => {
    window.dispatchEvent(new Event("site:motion-reset"));
    const transition = event.viewTransition;
    if (!transition) return;
    if (motionRoot.dataset.glassDeparture === "true") {
        // Keep the outgoing snapshot until the destination has its glass cover.
        // The destination skips the transition after its first paint is ready.
        transition.ready.catch(() => undefined);
        transition.finished.catch(() => undefined);
        transition.updateCallbackDone?.catch(() => undefined);
        return;
    }
    watchTransition(transition);
    const target = event.activation?.entry?.url || pendingDestination;
    if (motionPreference.matches || !target || !isSitePage(target) || !isSitePage(location.href) || pageURL(target) === pageURL(location.href)) {
        transition.skipTransition();
        resetTransition();
        return;
    }
    const containers = [...document.querySelectorAll<HTMLElement>("[data-transition-key]")];
    const targetPath = new URL(target, location.href).pathname;
    const destination = containers.find(element => element.dataset.transitionKey === targetPath);
    const currentArticle = containers.find(element => element.matches(".main-article") && element.dataset.transitionKey === location.pathname);
    const key = (destination || currentArticle)?.dataset.transitionKey;
    if (key) selectCover(key);
    try {
        sessionStorage.setItem(coverStorageKey, JSON.stringify({ from: pageURL(location.href), to: pageURL(target), key: key || "", time: Date.now() }));
        sessionStorage.setItem(arrivalStorageKey, JSON.stringify({ to: pageURL(target), time: Date.now() }));
    } catch (_) {}
    setTransitionState("leaving");
}) as EventListener);

window.addEventListener("pagereveal", ((event: TransitionEvent) => {
    const transition = event.viewTransition;
    if (!transition) {
        resetTransition();
        return;
    }
    if (motionRoot.dataset.glassArrival === "true") {
        transition.ready.catch(() => undefined);
        transition.finished.catch(() => undefined);
        transition.updateCallbackDone?.catch(() => undefined);
        transition.skipTransition(); resetTransition(); return;
    }
    watchTransition(transition);
    const activation = (window as Window & { navigation?: { activation?: PageActivation } }).navigation?.activation;
    const source = activation?.from?.url;
    if (motionPreference.matches || !isSitePage(location.href) || source && (!isSitePage(source) || pageURL(source) === pageURL(location.href))) {
        transition.skipTransition();
        resetTransition();
        return;
    }
    let key = "";
    try {
        const record = JSON.parse(sessionStorage.getItem(coverStorageKey) || "null");
        sessionStorage.removeItem(coverStorageKey);
        if (record && record.to === pageURL(location.href) && (!source || record.from === pageURL(source)) && Date.now() - record.time < 15000) key = record.key;
    } catch (_) {}
    if (!key) {
        const current = document.querySelector<HTMLElement>(".main-article[data-transition-key]");
        key = current?.dataset.transitionKey || (source ? new URL(source).pathname : "");
    }
    if (key) selectCover(key);
    motionRoot.dataset.transitionEntered = "true";
    window.dispatchEvent(new Event("site:motion-reset"));
    setTransitionState("entering");
}) as EventListener);

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        resetTransition();
        window.dispatchEvent(new Event("site:motion-reset"));
    }
});

motionPreference.addEventListener("change", () => {
    if (motionPreference.matches) {
        activeTransition?.skipTransition();
        resetTransition();
    }
});
