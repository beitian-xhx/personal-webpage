export const initMotion = () => {
    const root = document.documentElement;
    if (root.dataset.motionReady === "true") return;
    root.dataset.motionReady = "true";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    const animations = new Set<Animation>();
    let observer: IntersectionObserver | undefined;
    let activeCard: HTMLElement | null = null;
    let pointerFrame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let cardBounds: DOMRect | undefined;
    let progressFrame = 0;
    const progress = document.querySelector<HTMLElement>(".reading-progress");
    const palette = document.querySelector<HTMLElement>(".main-article, .article-list [data-motion-card]");
    if (palette && progress) {
        const style = getComputedStyle(palette);
        progress.style.setProperty("--progress-a", style.getPropertyValue("--card-grad-a"));
        progress.style.setProperty("--progress-b", style.getPropertyValue("--card-grad-b"));
    }

    const paintProgress = () => {
        progressFrame = 0;
        const distance = document.documentElement.scrollHeight - innerHeight;
        const value = distance > 0 ? Math.max(0, Math.min(1, scrollY / distance)) : 0;
        progress?.style.setProperty("--reading-progress", value.toFixed(4));
    };

    const scheduleProgress = () => {
        if (!progressFrame && !document.hidden) progressFrame = requestAnimationFrame(paintProgress);
    };

    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(scheduleProgress).observe(document.body);
    paintProgress();

    const resetCard = () => {
        cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
        if (!activeCard) return;
        ["--motion-lift", "--motion-rotate-x", "--motion-rotate-y", "--motion-gloss-x", "--motion-gloss-y"]
            .forEach(property => activeCard?.style.removeProperty(property));
        activeCard.style.removeProperty("will-change");
        delete activeCard.dataset.motionActive;
        activeCard = null;
        cardBounds = undefined;
    };

    const reset = () => {
        resetCard();
        cancelAnimationFrame(progressFrame);
        progressFrame = 0;
        animations.forEach(animation => animation.cancel());
        animations.clear();
    };

    if (root.dataset.glassArrival !== "true" && !reduced.matches && "IntersectionObserver" in window && "animate" in Element.prototype) {
        try {
            const reveal = (element: HTMLElement, index: number) => {
                if (element.dataset.motionRevealed === "true" || reduced.matches || document.hidden) return;
                element.dataset.motionRevealed = "true";
                try {
                    const animation = element.animate([
                        { opacity: 0, translate: "0 24px" },
                        { opacity: 1, translate: "0 0" },
                    ], { duration: 380, delay: Math.min(index * 40, 160), easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" });
                    if (typeof document.timeline.currentTime === "number") animation.startTime = document.timeline.currentTime;
                    animations.add(animation);
                    animation.finished.catch(() => undefined).then(() => animations.delete(animation));
                } catch (_) {}
            };
            observer = new IntersectionObserver(entries => {
                let batchIndex = 0;
                entries.filter(entry => entry.isIntersecting).forEach(entry => {
                    const element = entry.target as HTMLElement;
                    observer?.unobserve(element);
                    reveal(element, batchIndex++);
                });
            }, { threshold: 0.08, rootMargin: "0px 0px -16px 0px" });
            let initialIndex = 0;
            document.querySelectorAll<HTMLElement>('[data-motion="reveal"], .article-list [data-motion-card], .article-list--compact [data-motion-card], .article-list--tile [data-motion-card]').forEach(element => {
                if (element.matches(".article-list") && element.querySelector("[data-motion-card]")) return;
                if (element.matches(".home-profile, .home-feature-card")) return;
                const bounds = element.getBoundingClientRect();
                if (bounds.top < innerHeight && bounds.bottom > 0) reveal(element, initialIndex++);
                else observer?.observe(element);
            });
        } catch (_) {
            observer?.disconnect();
        }
    }

    const paintPointer = () => {
        pointerFrame = 0;
        if (!activeCard || reduced.matches || !finePointer.matches || document.hidden) {
            resetCard();
            return;
        }
        const bounds = cardBounds || activeCard.getBoundingClientRect();
        const horizontal = Math.max(-0.5, Math.min(0.5, (pointerX - bounds.left) / Math.max(bounds.width, 1) - 0.5));
        const vertical = Math.max(-0.5, Math.min(0.5, (pointerY - bounds.top) / Math.max(bounds.height, 1) - 0.5));
        activeCard.style.setProperty("--motion-rotate-x", `${(-vertical * 4).toFixed(2)}deg`);
        activeCard.style.setProperty("--motion-rotate-y", `${(horizontal * 4).toFixed(2)}deg`);
        activeCard.style.setProperty("--motion-gloss-x", `${(horizontal + 0.5) * 100}%`);
        activeCard.style.setProperty("--motion-gloss-y", `${(vertical + 0.5) * 100}%`);
    };

    document.querySelectorAll<HTMLElement>("[data-motion-card]").forEach(card => {
        if (card.closest("[data-photo-gallery], .article-content")) return;
        card.addEventListener("pointerenter", event => {
            if (event.pointerType === "touch" || reduced.matches || !finePointer.matches) return;
            resetCard();
            activeCard = card;
            cardBounds = card.getBoundingClientRect();
            pointerX = event.clientX;
            pointerY = event.clientY;
            card.dataset.motionActive = "true";
            card.style.willChange = "transform";
            card.style.setProperty("--motion-lift", "-7px");
            pointerFrame = requestAnimationFrame(paintPointer);
        });
        card.addEventListener("pointermove", event => {
            if (activeCard !== card || event.pointerType === "touch") return;
            pointerX = event.clientX;
            pointerY = event.clientY;
            if (!pointerFrame) pointerFrame = requestAnimationFrame(paintPointer);
        }, { passive: true });
        card.addEventListener("pointerleave", resetCard);
        card.addEventListener("pointercancel", resetCard);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) reset();
        else scheduleProgress();
    });
    window.addEventListener("pagehide", reset);
    window.addEventListener("site:motion-reset", resetCard);
    window.addEventListener("pageshow", event => {
        if (event.persisted) reset();
        scheduleProgress();
    });
    window.addEventListener("scroll", resetCard, { passive: true });
    reduced.addEventListener("change", () => {
        reset();
        if (reduced.matches) observer?.disconnect();
    });
    finePointer.addEventListener("change", resetCard);
};
