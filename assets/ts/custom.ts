const copyText = async (text: string): Promise<void> => {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.top = "-1000px";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
};

type SiteLanguage = "en" | "zh";

type SiteLanguageConfig = {
    currentLanguage: SiteLanguage;
    englishTarget: string;
    chineseTarget: string;
    excludePrompt: boolean;
};

const languagePreferenceKey = "liquid-stack-language-preference";
const languagePromptSeenKey = "liquid-stack-language-prompt-seen";
const translationHintDismissedKey = "liquid-stack-translation-hint-dismissed";

const readSiteStorage = (key: string) => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeSiteStorage = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // The choice remains effective for the current navigation when storage is unavailable.
    }
};

const getSiteLanguageConfig = (): SiteLanguageConfig | null => {
    const configElement = document.getElementById("site-language-config");
    if (!configElement?.textContent) return null;

    try {
        const config = JSON.parse(configElement.textContent) as Partial<SiteLanguageConfig>;
        if (
            (config.currentLanguage !== "en" && config.currentLanguage !== "zh") ||
            typeof config.englishTarget !== "string" ||
            typeof config.chineseTarget !== "string"
        ) {
            return null;
        }

        return {
            currentLanguage: config.currentLanguage,
            englishTarget: config.englishTarget,
            chineseTarget: config.chineseTarget,
            excludePrompt: config.excludePrompt === true,
        };
    } catch {
        return null;
    }
};

const getBrowserLanguageCodes = () => {
    const locales = [...(navigator.languages || []), navigator.language].filter(
        (locale, index, values): locale is string => Boolean(locale) && values.indexOf(locale) === index,
    );

    return (locales.length > 0 ? locales : ["en"]).map(
        (locale) => locale.trim().replace(/_/g, "-").split("-")[0]?.toLowerCase() || "en",
    );
};

const languageFromURL = (url: URL): SiteLanguage => (url.pathname === "/zh" || url.pathname.startsWith("/zh/") ? "zh" : "en");

const initLocalizedArticleDates = () => {
    try {
        const formatter = new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "numeric",
            day: "numeric",
        });

        document
            .querySelectorAll<HTMLTimeElement>("time.article-time--published, .article-list--compact time[datetime]")
            .forEach((element) => {
                const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(element.dateTime);
                if (!match) return;

                const year = Number(match[1]);
                const month = Number(match[2]);
                const day = Number(match[3]);
                const date = new Date(year, month - 1, day);

                if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return;
                element.textContent = formatter.format(date);
            });
    } catch {
        // Keep Hugo's rendered date when browser locale formatting is unavailable.
    }
};

const navigateToLanguage = (target: string) => {
    const targetURL = new URL(target, window.location.origin);
    targetURL.search = window.location.search;
    targetURL.hash = window.location.hash;
    window.location.assign(targetURL.href);
};

const protectTechnicalTextFromTranslation = () => {
    document.querySelectorAll<HTMLElement>("pre, code, kbd, samp, var, [data-no-translate]").forEach((element) => {
        element.setAttribute("translate", "no");
        element.classList.add("notranslate");
    });
};

const createLanguageNotice = (
    kind: "switch" | "translation",
    config: SiteLanguageConfig,
) => {
    const notice = document.createElement("aside");
    notice.className = `site-language-notice site-language-notice--${kind}`;
    notice.setAttribute("role", "dialog");
    notice.setAttribute("aria-modal", "false");
    notice.setAttribute("aria-labelledby", "site-language-notice-title");

    const closeLabel = kind === "switch" ? "Close language suggestion" : "Close translation tip";
    const title = kind === "switch" ? "Switch to Simplified Chinese? / 切换到简体中文？" : "Read in your language";
    const message =
        kind === "switch"
            ? "Chinese appears in your browser language preferences. 中文在您的浏览器语言偏好中。"
            : "This page is in English. You can use your browser’s built-in webpage translation feature.";

    notice.innerHTML = `
        <button class="site-language-notice__close" type="button" aria-label="${closeLabel}" title="${closeLabel}">×</button>
        <div class="site-language-notice__copy">
            <strong id="site-language-notice-title">${title}</strong>
            <p>${message}</p>
        </div>
        <div class="site-language-notice__actions"></div>
    `;

    const actions = notice.querySelector<HTMLElement>(".site-language-notice__actions");
    const closeButton = notice.querySelector<HTMLButtonElement>(".site-language-notice__close");
    if (!actions || !closeButton) return;

    const dismiss = () => {
        notice.classList.remove("is-visible");
        window.setTimeout(() => notice.remove(), 180);
    };

    closeButton.addEventListener("click", () => {
        if (kind === "translation") writeSiteStorage(translationHintDismissedKey, "true");
        dismiss();
    });

    if (kind === "switch") {
        const chineseButton = document.createElement("button");
        chineseButton.className = "site-language-notice__button site-language-notice__button--primary";
        chineseButton.type = "button";
        chineseButton.textContent = "切换中文";
        chineseButton.addEventListener("click", () => {
            writeSiteStorage(languagePreferenceKey, "zh");
            navigateToLanguage(config.chineseTarget);
        });

        const englishButton = document.createElement("button");
        englishButton.className = "site-language-notice__button";
        englishButton.type = "button";
        englishButton.textContent = "Stay in English";
        englishButton.addEventListener("click", () => {
            writeSiteStorage(languagePreferenceKey, "en");
            dismiss();
        });

        actions.append(chineseButton, englishButton);
    } else {
        const understoodButton = document.createElement("button");
        understoodButton.className = "site-language-notice__button site-language-notice__button--primary";
        understoodButton.type = "button";
        understoodButton.textContent = "Got it";
        understoodButton.addEventListener("click", () => {
            writeSiteStorage(translationHintDismissedKey, "true");
            dismiss();
        });
        actions.append(understoodButton);
    }

    document.body.appendChild(notice);
    window.requestAnimationFrame(() => {
        notice.classList.add("is-visible");
        notice.querySelector<HTMLButtonElement>(".site-language-notice__button--primary")?.focus({ preventScroll: true });
    });
};

const initSiteLanguageExperience = () => {
    const config = getSiteLanguageConfig();
    if (!config) return;

    protectTechnicalTextFromTranslation();

    document.addEventListener(
        "change",
        (event) => {
            const select = event.target instanceof HTMLSelectElement ? event.target : null;
            if (!select?.matches("#i18n-switch select")) return;

            const selectedURL = new URL(select.value, window.location.origin);
            if (selectedURL.origin === window.location.origin) {
                writeSiteStorage(languagePreferenceKey, languageFromURL(selectedURL));
            }
        },
        true,
    );

    document.addEventListener(
        "click",
        (event) => {
            const target =
                event.target instanceof Element
                    ? event.target.closest<HTMLAnchorElement>(".article-meta .inline-meta a.link[href]")
                    : null;
            if (!target) return;

            const targetURL = new URL(target.href, window.location.href);
            if (targetURL.origin !== window.location.origin) return;

            const targetLanguage = languageFromURL(targetURL);
            if (targetLanguage !== config.currentLanguage) writeSiteStorage(languagePreferenceKey, targetLanguage);
        },
        true,
    );

    if (
        config.currentLanguage !== "en" ||
        config.excludePrompt ||
        readSiteStorage(languagePreferenceKey) ||
        readSiteStorage(languagePromptSeenKey)
    ) {
        return;
    }

    const languageCodes = getBrowserLanguageCodes();
    const primaryLanguage = languageCodes[0] || "en";
    const hasChinese = languageCodes.includes("zh");
    const shouldSuggestChinese = primaryLanguage === "yue" || (primaryLanguage !== "zh" && hasChinese);
    const shouldSuggestTranslation = primaryLanguage !== "en" && primaryLanguage !== "zh" && !hasChinese;

    if (!shouldSuggestChinese && !shouldSuggestTranslation) return;
    if (shouldSuggestTranslation && readSiteStorage(translationHintDismissedKey)) return;

    writeSiteStorage(languagePromptSeenKey, "true");
    createLanguageNotice(shouldSuggestChinese ? "switch" : "translation", config);
};

const initArticleShare = () => {
    document.querySelectorAll<HTMLElement>("[data-article-share]").forEach((share) => {
        const url = share.dataset.shareUrl || window.location.href;
        const title = share.dataset.shareTitle || document.title;
        const copiedLabel = share.dataset.copiedLabel || "Copied";
        const copyLabel = share.dataset.copyLabel || "Copy link";
        const copyErrorLabel = share.dataset.copyErrorLabel || "Copy failed";
        const nativeButton = share.querySelector<HTMLButtonElement>("[data-native-share]");

        share.querySelectorAll<HTMLButtonElement>("[data-share-print]").forEach((button) => {
            button.addEventListener("click", () => {
                window.print();
            });
        });

        if (nativeButton) {
            const nativeLabel = nativeButton.getAttribute("aria-label") || title;
            if (navigator.share) nativeButton.hidden = false;
            nativeButton.addEventListener("click", async () => {
                try {
                    if (navigator.share) {
                        await navigator.share({ title, url });
                        return;
                    }

                    await copyText(url);
                    nativeButton.dataset.feedbackLabel = copiedLabel;
                    nativeButton.setAttribute("aria-label", copiedLabel);
                    nativeButton.classList.add("is-copied");

                    window.setTimeout(() => {
                        nativeButton.classList.remove("is-copied");
                        nativeButton.setAttribute("aria-label", nativeLabel);
                    }, 1800);
                } catch {
                    // The user can cancel the native share sheet; no UI state is needed.
                }
            });
        }

        share.querySelectorAll<HTMLButtonElement>("[data-share-copy]").forEach((button) => {
            button.addEventListener("click", async () => {
                try {
                    await copyText(url);
                    button.dataset.feedbackLabel = copiedLabel;
                    button.classList.add("is-copied");
                    button.setAttribute("aria-label", copiedLabel);
                    button.setAttribute("title", copiedLabel);

                    window.setTimeout(() => {
                        button.classList.remove("is-copied");
                        button.setAttribute("aria-label", copyLabel);
                        button.setAttribute("title", copyLabel);
                    }, 1800);
                } catch {
                    button.setAttribute("aria-label", copyErrorLabel);
                    button.setAttribute("title", copyErrorLabel);
                }
            });
        });

        initArticleShareHover(share);
    });
};

const initArticleShareHover = (share: HTMLElement) => {
    if (share.dataset.hoverReady === "true") return;

    share.dataset.hoverReady = "true";

    const getButtons = () => Array.from(share.querySelectorAll<HTMLElement>(".article-share__button:not([hidden])"));
    let activeButton: HTMLElement | null = null;
    let frame = 0;

    const updateHighlight = (button: HTMLElement | null) => {
        if (!button) {
            share.style.setProperty("--share-hover-opacity", "0");
            return;
        }

        const shareRect = share.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();

        if (shareRect.width === 0 || buttonRect.width === 0 || buttonRect.height === 0) {
            share.style.setProperty("--share-hover-opacity", "0");
            return;
        }

        const extraSize = 3;
        const top = buttonRect.top - shareRect.top + share.scrollTop - extraSize;
        const left = buttonRect.left - shareRect.left + share.scrollLeft - extraSize;
        const size = Math.max(buttonRect.width, buttonRect.height) + extraSize * 2;

        share.style.setProperty("--share-hover-top", `${top}px`);
        share.style.setProperty("--share-hover-left", `${left}px`);
        share.style.setProperty("--share-hover-size", `${size}px`);
        share.style.setProperty("--share-hover-opacity", "1");
    };

    const setActiveButton = (button: HTMLElement | null) => {
        activeButton?.classList.remove("is-share-hovered");
        activeButton = button;
        activeButton?.classList.add("is-share-hovered");
        updateHighlight(activeButton);
    };

    const scheduleUpdate = () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => updateHighlight(activeButton));
    };

    getButtons().forEach((button) => {
        button.addEventListener("mouseenter", () => setActiveButton(button));
        button.addEventListener("focusin", () => setActiveButton(button));
    });

    share.addEventListener("mouseleave", () => setActiveButton(null));
    share.addEventListener("focusout", () => {
        window.setTimeout(() => {
            if (!share.contains(document.activeElement)) setActiveButton(null);
        }, 0);
    });

    window.addEventListener("resize", scheduleUpdate);

    new MutationObserver(scheduleUpdate).observe(share, {
        attributes: true,
        subtree: true,
        attributeFilter: ["hidden", "class"],
    });
};

const initHomeSocialHover = () => {
    document.querySelectorAll<HTMLElement>(".home-profile__social").forEach((social) => {
        if (social.dataset.hoverReady === "true") return;

        social.dataset.hoverReady = "true";

        const getLinks = () => Array.from(social.querySelectorAll<HTMLElement>("a"));
        let activeLink: HTMLElement | null = null;
        let frame = 0;

        const updateHighlight = (link: HTMLElement | null) => {
            if (!link) {
                social.style.setProperty("--social-hover-opacity", "0");
                return;
            }

            const socialRect = social.getBoundingClientRect();
            const linkRect = link.getBoundingClientRect();

            if (socialRect.width === 0 || linkRect.width === 0 || linkRect.height === 0) {
                social.style.setProperty("--social-hover-opacity", "0");
                return;
            }

            const extraSize = 4;
            const size = Math.max(linkRect.width, linkRect.height) + extraSize * 2;
            const top = linkRect.top - socialRect.top + social.scrollTop - extraSize;
            const left = linkRect.left - socialRect.left + social.scrollLeft - extraSize;

            social.style.setProperty("--social-hover-top", `${top}px`);
            social.style.setProperty("--social-hover-left", `${left}px`);
            social.style.setProperty("--social-hover-size", `${size}px`);
            social.style.setProperty("--social-hover-opacity", "1");
        };

        const setActiveLink = (link: HTMLElement | null) => {
            activeLink?.classList.remove("is-social-hovered");
            activeLink = link;
            activeLink?.classList.add("is-social-hovered");
            updateHighlight(activeLink);
        };

        const scheduleUpdate = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => updateHighlight(activeLink));
        };

        getLinks().forEach((link) => {
            link.addEventListener("mouseenter", () => setActiveLink(link));
            link.addEventListener("focusin", () => setActiveLink(link));
        });

        social.addEventListener("mouseleave", () => setActiveLink(null));
        social.addEventListener("focusout", () => {
            window.setTimeout(() => {
                if (!social.contains(document.activeElement)) setActiveLink(null);
            }, 0);
        });

        window.addEventListener("resize", scheduleUpdate);

        if ("fonts" in document) {
            document.fonts.ready.then(scheduleUpdate).catch(() => undefined);
        }
    });
};

const getCurrentSchemeBackground = () => (document.documentElement.dataset.scheme === "dark" ? "#303030" : "#f5f5fa");

const showNavigationVeil = () => {
    if (document.querySelector(".page-navigation-veil")) return;

    const veil = document.createElement("div");
    veil.className = "page-navigation-veil";
    veil.style.background = getCurrentSchemeBackground();
    document.body.appendChild(veil);

    window.requestAnimationFrame(() => {
        veil.classList.add("is-visible");
    });
};

const hideNavigationVeil = () => {
    document.querySelector(".page-navigation-veil")?.remove();
};

const initNavigationSmoothing = () => {
    const internalLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("#main-menu > li:not(.menu-bottom-section) > a"));
    const seen = new Set<string>();

    internalLinks.forEach((link) => {
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin || seen.has(url.href)) return;

        seen.add(url.href);

        const prefetch = document.createElement("link");
        prefetch.rel = "prefetch";
        prefetch.href = url.href;
        prefetch.as = "document";
        document.head.appendChild(prefetch);
    });

    internalLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (link.target && link.target !== "_self") return;

            const target = new URL(link.href, window.location.href);
            if (target.origin !== window.location.origin || target.href === window.location.href) return;

            showNavigationVeil();
        });
    });

    window.addEventListener("pagehide", showNavigationVeil);
    window.addEventListener("pageshow", hideNavigationVeil);
};

const initSidebarMenuHover = () => {
    document.querySelectorAll<HTMLElement>("#main-menu").forEach((menu) => {
        if (menu.dataset.hoverReady === "true") return;

        const items = Array.from(menu.querySelectorAll<HTMLElement>(":scope > li:not(.menu-bottom-section)"));
        if (items.length === 0) return;

        menu.dataset.hoverReady = "true";

        let activeItem: HTMLElement | null = null;
        let frame = 0;

        const getDefaultItem = () => menu.querySelector<HTMLElement>(":scope > li.current:not(.menu-bottom-section)") || items[0];

        const updateHighlight = (item: HTMLElement | null) => {
            if (!item) {
                menu.style.setProperty("--menu-hover-opacity", "0");
                return;
            }

            const link = item.querySelector<HTMLElement>("a");
            if (!link) return;

            const menuRect = menu.getBoundingClientRect();
            const linkRect = link.getBoundingClientRect();

            if (menuRect.width === 0 || linkRect.width === 0 || linkRect.height === 0) {
                menu.style.setProperty("--menu-hover-opacity", "0");
                return;
            }

            const extraY = 2;
            const top = linkRect.top - menuRect.top + menu.scrollTop - extraY;
            const left = linkRect.left - menuRect.left + menu.scrollLeft;
            const width = linkRect.width;
            const height = linkRect.height + extraY * 2;

            menu.style.setProperty("--menu-hover-top", `${top}px`);
            menu.style.setProperty("--menu-hover-left", `${left}px`);
            menu.style.setProperty("--menu-hover-width", `${width}px`);
            menu.style.setProperty("--menu-hover-height", `${height}px`);
            menu.style.setProperty("--menu-hover-opacity", "1");
        };

        const setActiveItem = (item: HTMLElement | null, isHovering = false) => {
            activeItem?.classList.remove("is-menu-hovered");
            activeItem = item;
            activeItem?.classList.add("is-menu-hovered");
            menu.classList.toggle("is-hovering-menu", isHovering);
            updateHighlight(activeItem);
        };

        const scheduleUpdate = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => updateHighlight(activeItem || getDefaultItem()));
        };

        items.forEach((item) => {
            item.addEventListener("mouseenter", () => setActiveItem(item, true));
            item.addEventListener("focusin", () => setActiveItem(item, true));
        });

        menu.addEventListener("mouseleave", () => setActiveItem(getDefaultItem(), false));
        menu.addEventListener("focusout", () => {
            window.setTimeout(() => {
                if (!menu.contains(document.activeElement)) setActiveItem(getDefaultItem(), false);
            }, 0);
        });

        menu.addEventListener("scroll", scheduleUpdate, { passive: true });
        window.addEventListener("resize", scheduleUpdate);

        new MutationObserver(scheduleUpdate).observe(menu, {
            attributes: true,
            attributeFilter: ["class"],
        });

        if ("fonts" in document) {
            document.fonts.ready.then(scheduleUpdate).catch(() => undefined);
        }

        setActiveItem(getDefaultItem(), false);
    });
};

const initHomeProfile = () => {
    const profile = document.querySelector<HTMLElement>(".home-profile");
    const greeting = document.querySelector<HTMLElement>("[data-home-greeting]");
    const arriveFromHomeKey = "homeProfileArrive";

    if (window.sessionStorage.getItem(arriveFromHomeKey) === "true") {
        window.sessionStorage.removeItem(arriveFromHomeKey);
        document.body.classList.add("is-arriving-from-home");

        window.setTimeout(() => {
            document.body.classList.remove("is-arriving-from-home");
        }, 700);
    }

    if (greeting) {
        const hour = new Date().getHours();
        const key = hour >= 6 && hour < 12 ? "greetingMorning" : hour >= 12 && hour < 18 ? "greetingAfternoon" : hour >= 18 && hour < 22 ? "greetingEvening" : "greetingNight";
        const label = greeting.dataset[key];

        if (label) greeting.textContent = label;
    }

    if (!profile) return;

    const announcement = profile.querySelector<HTMLElement>("[data-home-announcement]");
    const announcementToggle = announcement?.querySelector<HTMLButtonElement>("[data-home-announcement-toggle]");
    const announcementBubble = announcement?.querySelector<HTMLElement>("[data-home-announcement-bubble]");
    const announcementBadge = announcement?.querySelector<HTMLElement>("[data-home-announcement-badge]");

    if (announcement && announcementToggle && announcementBubble) {
        const announcementID = announcement.dataset.announcementId || "current";
        const readKey = `home-announcement-read:${announcementID}`;
        const openLabel = announcementToggle.dataset.announcementOpenLabel || "Open website announcement";
        const closeLabel = announcementToggle.dataset.announcementCloseLabel || "Close website announcement";
        const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let closeTimer = 0;
        let hasBeenRead = readSiteStorage(readKey) === "true";

        const markAsRead = () => {
            if (hasBeenRead) return;

            hasBeenRead = true;
            writeSiteStorage(readKey, "true");
            announcementBadge?.classList.add("is-read");
        };

        const openAnnouncement = () => {
            window.clearTimeout(closeTimer);
            announcementBubble.hidden = false;
            announcementToggle.setAttribute("aria-expanded", "true");
            announcementToggle.setAttribute("aria-label", closeLabel);
            markAsRead();

            window.requestAnimationFrame(() => {
                announcement.classList.add("is-announcement-open");
            });
        };

        const closeAnnouncement = () => {
            announcement.classList.remove("is-announcement-open");
            announcementToggle.setAttribute("aria-expanded", "false");
            announcementToggle.setAttribute("aria-label", openLabel);

            closeTimer = window.setTimeout(
                () => {
                    announcementBubble.hidden = true;
                },
                prefersReducedMotion() ? 0 : 180,
            );
        };

        if (hasBeenRead) {
            announcementBadge?.classList.add("is-read");
            announcementToggle.setAttribute("aria-label", openLabel);
        }

        announcementToggle.addEventListener("click", () => {
            if (announcement.classList.contains("is-announcement-open")) {
                closeAnnouncement();
            } else {
                openAnnouncement();
            }
        });

        document.addEventListener("click", (event) => {
            if (!announcement.classList.contains("is-announcement-open")) return;
            if (event.target instanceof Node && announcement.contains(event.target)) return;
            closeAnnouncement();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || !announcement.classList.contains("is-announcement-open")) return;
            closeAnnouncement();
            announcementToggle.focus();
        });
    }

    document.querySelectorAll<HTMLAnchorElement>("#main-menu > li:not(.menu-bottom-section) > a").forEach((link) => {
        link.addEventListener("click", (event) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (link.target && link.target !== "_self") return;

            const target = new URL(link.href, window.location.href);
            if (target.origin !== window.location.origin) return;
            if (target.href === window.location.href) return;

            event.preventDefault();
            window.sessionStorage.setItem(arriveFromHomeKey, "true");
            document.body.classList.add("is-home-profile-leaving");
            window.setTimeout(showNavigationVeil, 120);

            window.setTimeout(() => {
                window.location.href = target.href;
            }, 180);
        });
    });
};

const initAppLaunchpad = () => {
    document.querySelectorAll<HTMLElement>("[data-app-launchpad]").forEach((launchpad) => {
        if (launchpad.dataset.launchpadReady === "true") return;

        const apps = Array.from(launchpad.querySelectorAll<HTMLButtonElement>("[data-launchpad-app]"));
        const preview = document.querySelector<HTMLElement>("[data-app-preview]");
        const previewImage = preview?.querySelector<HTMLElement>("[data-app-preview-image]");
        const closeButton = preview?.querySelector<HTMLButtonElement>("[data-app-preview-close]");
        const dismissLayer = preview?.querySelector<HTMLElement>("[data-app-preview-dismiss]");
        const title = preview?.querySelector<HTMLElement>("[data-app-preview-title]");
        const screenshot = preview?.querySelector<HTMLImageElement>("[data-app-preview-screenshot]");
        const article = preview?.querySelector<HTMLAnchorElement>("[data-app-preview-article]");

        if (apps.length === 0 || !preview || !previewImage || !closeButton || !dismissLayer || !title || !screenshot || !article) return;

        launchpad.dataset.launchpadReady = "true";

        let previousFocus: HTMLElement | null = null;
        let closeTimer = 0;

        const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const closePreview = () => {
            if (preview.hidden) return;

            window.clearTimeout(closeTimer);
            preview.classList.remove("is-open");
            document.body.classList.remove("app-preview-open");

            closeTimer = window.setTimeout(
                () => {
                    preview.hidden = true;
                    screenshot.removeAttribute("src");
                    screenshot.alt = "";
                    previousFocus?.focus();
                    previousFocus = null;
                },
                prefersReducedMotion() ? 0 : 230,
            );
        };

        const openPreview = (app: HTMLButtonElement) => {
            const screenshotURL = app.dataset.appScreenshot;
            if (!screenshotURL) return;

            window.clearTimeout(closeTimer);
            previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : app;

            title.textContent = app.dataset.appTitle || "";
            screenshot.src = screenshotURL;
            screenshot.alt = app.dataset.appScreenshotAlt || app.dataset.appTitle || "";
            previewImage.style.setProperty("--app-preview-close-x", `${app.dataset.appCloseX || "7.4"}%`);
            previewImage.style.setProperty("--app-preview-close-y", `${app.dataset.appCloseY || "7"}%`);
            article.href = app.dataset.appArticle || "/";

            preview.hidden = false;
            document.body.classList.add("app-preview-open");

            window.requestAnimationFrame(() => {
                preview.classList.add("is-open");
                closeButton.focus();
            });
        };

        apps.forEach((app) => {
            app.addEventListener("click", () => openPreview(app));
        });

        previewImage.addEventListener("pointermove", (event) => {
            if (event.pointerType === "touch" || (event.target as HTMLElement).closest("[data-app-preview-article]")) return;

            const bounds = previewImage.getBoundingClientRect();
            const gap = 16;
            const articleWidth = article.offsetWidth;
            const articleHeight = article.offsetHeight;
            const left = Math.min(Math.max(event.clientX - bounds.left + gap, 10), bounds.width - articleWidth - 10);
            const top = Math.min(Math.max(event.clientY - bounds.top + gap, 10), bounds.height - articleHeight - 10);

            article.style.setProperty("--app-preview-article-left", `${left}px`);
            article.style.setProperty("--app-preview-article-top", `${top}px`);
        });

        previewImage.addEventListener("click", (event) => {
            if ((event.target as HTMLElement).closest("[data-app-preview-close], [data-app-preview-article]")) return;
            window.location.href = article.href;
        });

        closeButton.addEventListener("click", closePreview);
        dismissLayer.addEventListener("click", closePreview);

        document.addEventListener("keydown", (event) => {
            if (preview.hidden) return;

            if (event.key === "Escape") {
                event.preventDefault();
                closePreview();
                return;
            }

            if (event.key !== "Tab") return;

            const first = closeButton;
            const last = article;

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    });
};

const initPhotoGallery = () => {
    document.querySelectorAll<HTMLElement>("[data-photo-gallery]").forEach((gallery) => {
        if (gallery.dataset.galleryReady === "true") return;

        const items = Array.from(gallery.querySelectorAll<HTMLElement>("[data-gallery-item]"));
        const backdrop = gallery.querySelector<HTMLElement>("[data-gallery-close]");
        if (items.length === 0) return;

        gallery.dataset.galleryReady = "true";

        const localeParts = (value: string) => {
            const parts = value.trim().replace(/_/g, "-").split("-").filter(Boolean);
            const language = (parts[0] || "").toLowerCase();
            const region = parts.slice(1).find((part) => /^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part));

            return {
                language,
                region: region?.toUpperCase(),
            };
        };

        const resolveDateLocale = () => {
            const pageLocale = document.documentElement.lang || "en";
            const pageLanguage = localeParts(pageLocale).language || "en";
            const userLocales = [...(navigator.languages || []), navigator.language]
                .filter((locale, index, locales): locale is string => Boolean(locale) && locales.indexOf(locale) === index);
            const matchingLocale = userLocales.find((locale) => localeParts(locale).language === pageLanguage);

            if (matchingLocale) return matchingLocale;

            const userRegion = userLocales.map((locale) => localeParts(locale).region).find(Boolean);
            return userRegion ? `${pageLanguage}-${userRegion}` : pageLocale;
        };

        const localizeDates = () => {
            try {
                const formatter = new Intl.DateTimeFormat(resolveDateLocale(), {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                });

                gallery.querySelectorAll<HTMLTimeElement>("[data-gallery-date]").forEach((dateElement) => {
                    const value = dateElement.dateTime;
                    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
                    if (!match) return;

                    const year = Number(match[1]);
                    const month = Number(match[2]);
                    const day = Number(match[3]);
                    const date = new Date(year, month - 1, day);

                    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return;
                    dateElement.textContent = formatter.format(date);
                });
            } catch {
                // Keep the ISO date rendered by Hugo when Intl or a locale is unavailable.
            }
        };

        localizeDates();

        let zoomedItem: HTMLElement | null = null;
        let zoomClone: HTMLElement | null = null;
        let frame = 0;
        let dragState: {
            item: HTMLElement;
            pointerId: number;
            startX: number;
            startY: number;
            offsetX: number;
            offsetY: number;
            moved: boolean;
        } | null = null;

        const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const canDrag = () => window.matchMedia("(pointer: fine) and (min-width: 721px)").matches;
        const storageKey = (item: HTMLElement) => `photo-gallery-offset:${item.dataset.galleryId || ""}`;

        const hashString = (value: string) => {
            let hash = 0;
            for (let index = 0; index < value.length; index += 1) {
                hash = (hash << 5) - hash + value.charCodeAt(index);
                hash |= 0;
            }
            return Math.abs(hash);
        };

        const readOffset = (item: HTMLElement) => {
            try {
                const saved = window.localStorage.getItem(storageKey(item));
                if (!saved) return { x: 0, y: 0 };

                const parsed = JSON.parse(saved) as { x?: number; y?: number };
                return {
                    x: Number(parsed.x) || 0,
                    y: Number(parsed.y) || 0,
                };
            } catch {
                return { x: 0, y: 0 };
            }
        };

        const writeOffset = (item: HTMLElement, offset: { x: number; y: number }) => {
            try {
                window.localStorage.setItem(storageKey(item), JSON.stringify(offset));
            } catch {
                // localStorage can be unavailable in private browsing; dragging still works for the current session.
            }
        };

        const applyOffset = (item: HTMLElement, offset: { x: number; y: number }) => {
            item.dataset.dragX = `${offset.x}`;
            item.dataset.dragY = `${offset.y}`;
            item.style.setProperty("--gallery-drag-x", `${offset.x}px`);
            item.style.setProperty("--gallery-drag-y", `${offset.y}px`);
        };

        const applyImageShape = (item: HTMLElement) => {
            const image = item.querySelector<HTMLImageElement>("img");
            if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return;

            const ratio = image.naturalWidth / image.naturalHeight;
            item.classList.toggle("is-portrait", ratio < 0.86);
            item.classList.toggle("is-wide", ratio > 1.28);

            const maxWidth = ratio < 0.86 ? 520 : ratio > 1.28 ? 820 : 680;
            const viewportWidth = ratio < 0.86 ? "72vw" : "86vw";
            const heightConstrainedWidth = `calc(${(66 * ratio).toFixed(3)}vh + 20px)`;
            item.style.setProperty("--gallery-zoom-width", `min(${viewportWidth}, ${maxWidth}px, ${heightConstrainedWidth})`);
        };

        const layoutItems = () => {
            const rect = gallery.getBoundingClientRect();
            const width = Math.max(rect.width, 320);

            if (window.matchMedia("(max-width: 720px)").matches || prefersReducedMotion()) {
                gallery.style.removeProperty("height");
                gallery.classList.add("is-ready");
                return;
            }

            const columns = width >= 1160 ? 4 : width >= 860 ? 3 : 2;
            const rowCounts: number[] = [];
            let remaining = items.length;
            let rowIndex = 0;

            while (remaining > 0) {
                const preferredCount = rowIndex % 2 === 0 ? columns : Math.max(2, columns - 1);
                const count = Math.min(preferredCount, remaining);
                rowCounts.push(count);
                remaining -= count;
                rowIndex += 1;
            }

            const edgePadding = Math.min(72, Math.max(34, width * 0.055));
            // Keep the first row close to the page header while preserving the
            // loose, draggable composition on larger screens.
            const topPadding = Math.min(120, Math.max(72, width * 0.07));
            const rowPitch = Math.min(320, Math.max(280, width * 0.22));
            const height = topPadding * 2 + rowCounts.length * rowPitch;
            const centerX = width / 2;
            const centerY = height / 2;
            const usableWidth = width - edgePadding * 2;
            let itemIndex = 0;

            gallery.style.height = `${Math.round(height)}px`;

            rowCounts.forEach((count, currentRow) => {
                const isShortRow = count < columns;
                const rowWidth = usableWidth * (isShortRow ? Math.min(0.84, count / columns + 0.18) : 1);
                const cellWidth = rowWidth / count;

                for (let slot = 0; slot < count; slot += 1) {
                    const item = items[itemIndex];
                    const id = item.dataset.galleryId || `${itemIndex}`;
                    const hash = hashString(id);
                    const jitterX = ((hash % 101) / 100 - 0.5) * Math.min(56, cellWidth * 0.2);
                    const jitterY = (((hash >> 5) % 101) / 100 - 0.5) * 62;
                    const staggerY = (slot % 2 === 0 ? -1 : 1) * Math.min(24, rowPitch * 0.07);
                    const rowDrift = (((hashString(`row-${currentRow}`) % 101) / 100 - 0.5) * Math.min(44, edgePadding)) / 2;
                    const itemCenterX = centerX - rowWidth / 2 + cellWidth * (slot + 0.5) + jitterX + rowDrift;
                    const itemCenterY = topPadding + rowPitch * (currentRow + 0.5) + jitterY + staggerY;
                    const x = itemCenterX - centerX;
                    const y = itemCenterY - centerY;
                    const rotate = ((hash >> 8) % 221) / 10 - 11;

                    item.style.setProperty("--gallery-x", `${x.toFixed(1)}px`);
                    item.style.setProperty("--gallery-y", `${y.toFixed(1)}px`);
                    item.style.setProperty("--gallery-rotate", `${rotate.toFixed(1)}deg`);
                    item.style.setProperty("--gallery-hover-rotate", `${(rotate * 0.35).toFixed(1)}deg`);
                    item.style.setProperty("--gallery-active-rotate", `${(rotate * 0.25).toFixed(1)}deg`);
                    itemIndex += 1;
                }
            });

            gallery.classList.add("is-ready");
        };

        const setFloatingRect = (item: HTMLElement, rect: { left: number; top: number; width: number }, rotate = "0deg") => {
            item.style.setProperty("--gallery-float-left", `${rect.left}px`);
            item.style.setProperty("--gallery-float-top", `${rect.top}px`);
            item.style.setProperty("--gallery-float-width", `${rect.width}px`);
            item.style.setProperty("--gallery-float-rotate", rotate);
        };

        const showBackdrop = () => {
            if (backdrop) {
                backdrop.hidden = false;
                backdrop.getBoundingClientRect();
            }

            gallery.classList.add("is-zooming");
            document.body.classList.add("photo-gallery-open");
        };

        const hideBackdrop = () => {
            gallery.classList.remove("is-zooming");

            window.setTimeout(() => {
                if (!gallery.classList.contains("is-zooming") && backdrop) backdrop.hidden = true;
            }, prefersReducedMotion() ? 0 : 260);
        };

        const closeZoom = () => {
            if (!zoomedItem || !zoomClone) return;

            const item = zoomedItem;
            const clone = zoomClone;
            const origin = item.getBoundingClientRect();

            if (origin) {
                setFloatingRect(clone, origin, item.dataset.originRotate || "0deg");
            }

            clone.classList.remove("is-zoomed");
            hideBackdrop();

            let finished = false;
            let handleCloseTransitionEnd: ((event: TransitionEvent) => void) | null = null;
            const finish = () => {
                if (finished) return;

                finished = true;
                if (handleCloseTransitionEnd) clone.removeEventListener("transitionend", handleCloseTransitionEnd);
                clone.remove();
                delete item.dataset.originRect;
                document.body.classList.remove("photo-gallery-open");
                window.requestAnimationFrame(() => {
                    item.classList.remove("is-zoom-origin");
                });
                if (zoomedItem === item) zoomedItem = null;
                if (zoomClone === clone) zoomClone = null;
            };

            handleCloseTransitionEnd = (event: TransitionEvent) => {
                if (event.target !== clone) return;
                if (!["transform", "left", "top", "width"].includes(event.propertyName)) return;
                finish();
            };

            if (prefersReducedMotion()) {
                finish();
            } else {
                clone.addEventListener("transitionend", handleCloseTransitionEnd);
                window.setTimeout(finish, 560);
            }
        };

        const openZoom = (item: HTMLElement) => {
            if (zoomedItem === item) {
                closeZoom();
                return;
            }

            if (zoomedItem) closeZoom();

            const originRect = item.getBoundingClientRect();
            const rotate = getComputedStyle(item).getPropertyValue("--gallery-rotate").trim() || "0deg";

            item.dataset.originRect = JSON.stringify({
                left: originRect.left,
                top: originRect.top,
                width: originRect.width,
            });
            item.dataset.originRotate = rotate;

            const clone = item.cloneNode(true) as HTMLElement;
            clone.removeAttribute("data-gallery-item");
            clone.classList.remove("is-menu-hovered", "is-dragging", "is-zoom-origin");
            clone.classList.add("is-gallery-clone");
            clone.tabIndex = -1;
            clone.setAttribute("aria-hidden", "true");
            setFloatingRect(clone, originRect, rotate);

            document.body.appendChild(clone);
            clone.getBoundingClientRect();
            item.classList.add("is-zoom-origin");
            showBackdrop();

            zoomedItem = item;
            zoomClone = clone;

            clone.addEventListener("click", (event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                closeZoom();
            });

            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                    clone.classList.add("is-zoomed");
                });
            });
        };

        const scheduleLayout = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(layoutItems);
        };

        items.forEach((item) => {
            item.tabIndex = 0;
            applyOffset(item, readOffset(item));
            applyImageShape(item);

            const image = item.querySelector<HTMLImageElement>("img");
            image?.addEventListener("load", () => {
                applyImageShape(item);
                scheduleLayout();
            });

            item.addEventListener("pointerdown", (event) => {
                if (!canDrag() || zoomedItem || (event.target as HTMLElement).closest("a")) return;

                const offset = {
                    x: Number(item.dataset.dragX) || 0,
                    y: Number(item.dataset.dragY) || 0,
                };

                dragState = {
                    item,
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    offsetX: offset.x,
                    offsetY: offset.y,
                    moved: false,
                };

                item.setPointerCapture(event.pointerId);
            });

            item.addEventListener("pointermove", (event) => {
                if (!dragState || dragState.item !== item || dragState.pointerId !== event.pointerId) return;

                const dx = event.clientX - dragState.startX;
                const dy = event.clientY - dragState.startY;

                if (!dragState.moved && Math.hypot(dx, dy) < 4) return;

                dragState.moved = true;
                item.classList.add("is-dragging");
                applyOffset(item, {
                    x: dragState.offsetX + dx,
                    y: dragState.offsetY + dy,
                });
            });

            item.addEventListener("pointerup", (event) => {
                if (!dragState || dragState.item !== item || dragState.pointerId !== event.pointerId) return;

                item.releasePointerCapture(event.pointerId);
                item.classList.remove("is-dragging");

                if (dragState.moved) {
                    writeOffset(item, {
                        x: Number(item.dataset.dragX) || 0,
                        y: Number(item.dataset.dragY) || 0,
                    });
                    item.dataset.suppressGalleryClick = "true";
                    window.setTimeout(() => {
                        delete item.dataset.suppressGalleryClick;
                    }, 0);
                }

                dragState = null;
            });

            item.addEventListener("pointercancel", () => {
                item.classList.remove("is-dragging");
                dragState = null;
            });

            item.addEventListener("click", (event) => {
                if (item.dataset.suppressGalleryClick === "true") return;
                if ((event.target as HTMLElement).closest("a")) return;
                openZoom(item);
            });

            item.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;

                event.preventDefault();
                openZoom(item);
            });
        });

        backdrop?.addEventListener("click", closeZoom);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeZoom();
        });

        window.addEventListener("resize", scheduleLayout);

        if ("fonts" in document) {
            document.fonts.ready.then(scheduleLayout).catch(() => undefined);
        }

        scheduleLayout();
    });
};

type ClockParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
};

const getClockParts = (date: Date, timeZone: string): ClockParts => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        calendar: "gregory",
        numberingSystem: "latn",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const values: Partial<ClockParts> = {};

    formatter.formatToParts(date).forEach((part) => {
        if (part.type !== "literal") {
            values[part.type as keyof ClockParts] = Number(part.value);
        }
    });

    return values as ClockParts;
};

const initWorldClocks = () => {
    document.querySelectorAll<HTMLElement>("[data-world-clock]").forEach((widget) => {
        const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const localClock = widget.querySelector<HTMLElement>('[data-clock="local"]');
        if (!localClock) return;

        const paintClock = (
            clock: HTMLElement,
            now: Date,
            timeZone: string,
        ) => {
            const parts = getClockParts(now, timeZone);
            const minuteAngle = parts.minute * 6;
            const hourAngle = (parts.hour % 12) * 30 + minuteAngle / 12;
            const secondAngle = parts.second * 6;

            clock
                .querySelector<HTMLElement>(".world-clock-widget__hand--hour")
                ?.style.setProperty("--clock-rotation", `${hourAngle}deg`);
            clock
                .querySelector<HTMLElement>(".world-clock-widget__hand--minute")
                ?.style.setProperty("--clock-rotation", `${minuteAngle}deg`);
            clock
                .querySelector<HTMLElement>(".world-clock-widget__hand--second")
                ?.style.setProperty("--clock-rotation", `${secondAngle}deg`);

            const label = clock.querySelector<HTMLElement>(".world-clock-widget__label")?.textContent?.trim() || "";
            const time = [parts.hour, parts.minute, parts.second]
                .map((part) => String(part).padStart(2, "0"))
                .join(":");
            const accessibleLabel = `${label}: ${time}`;
            const dial = clock.querySelector<HTMLElement>(".world-clock-widget__dial");
            dial?.classList.toggle("is-night", parts.hour < 7 || parts.hour >= 19);
            dial?.setAttribute("aria-label", accessibleLabel);
            clock.title = accessibleLabel;
        };

        const tick = () => {
            const now = new Date();
            paintClock(localClock, now, localZone);
        };

        tick();
        window.setInterval(tick, 1000);
    });
};

const initSiteRuntime = () => {
    const runtimeElements = [...document.querySelectorAll<HTMLElement>("[data-site-runtime][data-launch-date]")];
    if (!runtimeElements.length) return;

    const formatter = new Intl.NumberFormat(document.documentElement.lang || undefined);
    const today = new Date();

    runtimeElements.forEach((element) => {
        const launchDate = element.dataset.launchDate;
        if (!launchDate) return;

        const launched = new Date(`${launchDate}T00:00:00`);
        if (Number.isNaN(launched.getTime())) return;

        const elapsed = Math.max(0, Math.floor((today.getTime() - launched.getTime()) / 86_400_000));
        element.textContent = formatter.format(elapsed);
    });
};

type DashboardData = {
    dates: string[];
    locale: string;
    weekdays: string[];
    postSingular: string;
    postPlural: string;
    emptyHours: string;
};

const initDashboard = () => {
    const dataElement = document.getElementById("dashboard-data");
    if (!dataElement?.textContent) return;

    let data: DashboardData;

    try {
        const parsed = JSON.parse(dataElement.textContent) as DashboardData | string;
        data = typeof parsed === "string" ? JSON.parse(parsed) as DashboardData : parsed;
    } catch {
        return;
    }

    if (!Array.isArray(data.dates) || !Array.isArray(data.weekdays)) return;

    const locale = data.locale || document.documentElement.lang || "en";
    const numberFormatter = new Intl.NumberFormat(locale);

    document.querySelectorAll<HTMLElement>("[data-dashboard-number]").forEach((element) => {
        const value = Number(element.dataset.dashboardNumber);
        if (Number.isFinite(value)) element.textContent = numberFormatter.format(value);
    });

    const weekdays = new Array(7).fill(0);
    const hours = new Array(24).fill(0);

    data.dates.forEach((dateString) => {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return;
        weekdays[date.getDay()] += 1;
        hours[date.getHours()] += 1;
    });

    const renderHabitChart = (
        container: HTMLElement | null,
        values: number[],
        labels: string[],
        filterEmpty: boolean,
    ) => {
        if (!container) return;

        const entries = values
            .map((value, index) => ({ value, label: labels[index] || String(index) }))
            .filter((entry) => !filterEmpty || entry.value > 0);

        if (!entries.length) {
            const empty = document.createElement("p");
            empty.className = "dashboard-empty";
            empty.textContent = data.emptyHours;
            container.replaceChildren(empty);
            return;
        }

        const maximum = Math.max(...entries.map((entry) => entry.value), 1);
        const rows = entries.map((entry) => {
            const row = document.createElement("div");
            row.className = "dashboard-habit-row";

            const label = document.createElement("span");
            label.className = "dashboard-habit-row__label";
            label.textContent = entry.label;

            const track = document.createElement("span");
            track.className = "dashboard-habit-row__track";
            const fill = document.createElement("span");
            fill.dataset.dashboardWidth = `${(entry.value / maximum) * 100}%`;
            track.append(fill);

            const value = document.createElement("strong");
            value.className = "dashboard-habit-row__value";
            value.textContent = numberFormatter.format(entry.value);

            row.append(label, track, value);
            return row;
        });

        container.replaceChildren(...rows);
        window.requestAnimationFrame(() => {
            container.querySelectorAll<HTMLElement>("[data-dashboard-width]").forEach((fill) => {
                fill.style.width = fill.dataset.dashboardWidth || "0";
            });
        });
    };

    renderHabitChart(
        document.querySelector<HTMLElement>("[data-dashboard-weekly]"),
        weekdays,
        data.weekdays,
        false,
    );
    renderHabitChart(
        document.querySelector<HTMLElement>("[data-dashboard-hourly]"),
        hours,
        hours.map((_, hour) => `${String(hour).padStart(2, "0")}:00`),
        true,
    );

    const heatmap = document.querySelector<HTMLElement>("[data-dashboard-heatmap]");
    if (!heatmap) return;

    const counts = data.dates.reduce<Map<string, number>>((map, value) => {
        const day = value.slice(0, 10);
        map.set(day, (map.get(day) || 0) + 1);
        return map;
    }, new Map());

    const days = document.createElement("div");
    days.className = "dashboard-heatmap__days";
    days.append(document.createElement("span"));

    data.weekdays.forEach((day, index) => {
        const label = document.createElement("span");
        label.textContent = index === 1 || index === 3 || index === 5 ? day : "";
        days.append(label);
    });

    const weeks = document.createElement("div");
    weeks.className = "dashboard-heatmap__weeks";

    const endDate = new Date();
    endDate.setHours(12, 0, 0, 0);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 52 * 7 - startDate.getDay());

    const monthFormatter = new Intl.DateTimeFormat(locale, { month: "short" });
    const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
    let previousMonth = -1;

    for (let weekIndex = 0; weekIndex < 53; weekIndex += 1) {
        const week = document.createElement("div");
        week.className = "dashboard-heatmap__week";

        const weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() + weekIndex * 7);

        const month = document.createElement("span");
        month.className = "dashboard-heatmap__month";
        const monthIndex = weekStart.getMonth();
        month.textContent = monthIndex !== previousMonth ? monthFormatter.format(weekStart) : "";
        previousMonth = monthIndex;
        week.append(month);

        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
            const currentDate = new Date(weekStart);
            currentDate.setDate(weekStart.getDate() + dayIndex);
            const dateKey = [
                currentDate.getFullYear(),
                String(currentDate.getMonth() + 1).padStart(2, "0"),
                String(currentDate.getDate()).padStart(2, "0"),
            ].join("-");
            const count = counts.get(dateKey) || 0;
            const level = count === 0 ? 0 : Math.min(4, count);

            const cell = document.createElement("span");
            cell.className = `dashboard-heatmap-cell dashboard-heatmap-cell--${level}`;
            const postLabel = count === 1 ? data.postSingular : data.postPlural;
            const accessibleLabel = `${dateFormatter.format(currentDate)}: ${numberFormatter.format(count)} ${postLabel}`;
            cell.title = accessibleLabel;
            if (count > 0) {
                cell.setAttribute("role", "img");
                cell.setAttribute("aria-label", accessibleLabel);
            } else {
                cell.setAttribute("aria-hidden", "true");
            }
            week.append(cell);
        }

        weeks.append(week);
    }

    heatmap.replaceChildren(days, weeks);
    const heatmapScroll = document.querySelector<HTMLElement>("[data-dashboard-heatmap-scroll]");
    if (heatmapScroll) heatmapScroll.scrollLeft = heatmapScroll.scrollWidth;
};

const initDashboardAdminGesture = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    document.querySelectorAll<HTMLElement>("[data-dashboard-admin-gesture]").forEach((button) => {
        let dwellTimer: number | undefined;

        const gearAnimations = () =>
            button
                .getAnimations({ subtree: true })
                .filter((animation) => (animation as CSSAnimation).animationName === "dashboard-gear-index");

        const play = () => {
            if (button.hasAttribute("data-gear-go")) return;
            button.setAttribute("data-gear-go", "");

            window.requestAnimationFrame(() => {
                const running = gearAnimations();
                if (!running.length) {
                    button.removeAttribute("data-gear-go");
                    return;
                }

                void Promise.allSettled(running.map((animation) => animation.finished)).then(() => {
                    button.removeAttribute("data-gear-go");
                });
            });
        };

        button.addEventListener("pointerenter", () => {
            if (button.hasAttribute("data-gear-go") || dwellTimer !== undefined) return;
            dwellTimer = window.setTimeout(() => {
                dwellTimer = undefined;
                play();
            }, 130);
        });

        button.addEventListener("pointerleave", () => {
            if (dwellTimer !== undefined) {
                window.clearTimeout(dwellTimer);
                dwellTimer = undefined;
                return;
            }

            gearAnimations().forEach((animation) => animation.updatePlaybackRate(2.2));
        });
    });
};

const initSidebarManagementMenu = () => {
    document.querySelectorAll<HTMLButtonElement>("[data-sidebar-management-toggle]").forEach((toggle) => {
        const menuID = toggle.getAttribute("aria-controls");
        const menu = menuID ? document.getElementById(menuID) : null;
        if (!(menu instanceof HTMLElement) || toggle.dataset.managementReady === "true") return;

        toggle.dataset.managementReady = "true";
        let closeTimer = 0;

        const openMenu = (focusFirstItem = false) => {
            window.clearTimeout(closeTimer);
            menu.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
            window.requestAnimationFrame(() => {
                menu.classList.add("is-open");
                if (focusFirstItem) {
                    menu.querySelector<HTMLAnchorElement>('[role="menuitem"]')?.focus({ preventScroll: true });
                }
            });
        };

        const closeMenu = (restoreFocus = false) => {
            menu.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
            closeTimer = window.setTimeout(
                () => {
                    menu.hidden = true;
                },
                window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
            );
            if (restoreFocus) toggle.focus({ preventScroll: true });
        };

        toggle.addEventListener("click", (event) => {
            if (toggle.getAttribute("aria-expanded") === "true") {
                closeMenu();
            } else {
                openMenu(event.detail === 0);
            }
        });

        document.addEventListener("click", (event) => {
            if (menu.hidden || !(event.target instanceof Node)) return;
            if (!menu.contains(event.target) && !toggle.contains(event.target)) closeMenu();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || menu.hidden) return;
            event.preventDefault();
            closeMenu(true);
        });
    });
};

const initRocketGestures = () => {
    document.querySelectorAll<HTMLElement>("[data-rocket-gesture]").forEach((element) => {
        if (element.dataset.rocketReady === "true") return;

        element.dataset.rocketReady = "true";
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let dwellTimer = 0;

        const rocketAnimations = () =>
            element
                .getAnimations({ subtree: true })
                .filter(
                    (animation) =>
                        (animation as Animation & { animationName?: string }).animationName === "home-rocket-launch",
                );

        element.addEventListener("pointerenter", () => {
            if (reducedMotion.matches || element.hasAttribute("data-go") || dwellTimer) return;

            dwellTimer = window.setTimeout(() => {
                dwellTimer = 0;
                element.setAttribute("data-go", "");
                const running = rocketAnimations();
                if (!running.length) {
                    element.removeAttribute("data-go");
                    return;
                }

                void Promise.allSettled(running.map((animation) => animation.finished)).then(() => {
                    element.removeAttribute("data-go");
                });
            }, 130);
        });

        element.addEventListener("pointerleave", () => {
            if (dwellTimer) {
                window.clearTimeout(dwellTimer);
                dwellTimer = 0;
                return;
            }

            rocketAnimations().forEach((animation) => animation.updatePlaybackRate(2.2));
        });
    });
};

const initCustomScripts = () => {
    initSiteLanguageExperience();
    initLocalizedArticleDates();
    initArticleShare();
    initHomeSocialHover();
    initNavigationSmoothing();
    initSidebarMenuHover();
    initHomeProfile();
    initAppLaunchpad();
    initPhotoGallery();
    initWorldClocks();
    initSiteRuntime();
    initDashboard();
    initDashboardAdminGesture();
    initSidebarManagementMenu();
    initRocketGestures();
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCustomScripts);
} else {
    initCustomScripts();
}
