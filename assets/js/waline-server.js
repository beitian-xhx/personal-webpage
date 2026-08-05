const resolvedServerURLs = new Map();

const normalizeServerURL = (url) => String(url || "").replace(/\/+$/, "");

const probeServer = async (serverURL, timeoutMs, fetchImpl) => {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    const path = encodeURIComponent("/__waline_healthcheck__/");
    const probeURL = `${serverURL}/api/comment?path=${path}&page=1&pageSize=1&sortBy=insertedAt_desc`;

    try {
        const response = await fetchImpl(probeURL, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal,
        });

        if (!response.ok) return false;
        const payload = await response.json();
        return payload?.errno === 0;
    } catch {
        return false;
    } finally {
        globalThis.clearTimeout(timeout);
    }
};

export const resolveWalineServerURL = ({
    primaryURL,
    fallbackURL,
    timeoutMs = 2500,
    fetchImpl = globalThis.fetch,
}) => {
    const primary = normalizeServerURL(primaryURL);
    const fallback = normalizeServerURL(fallbackURL);

    if (!primary || !fallback || primary === fallback || typeof fetchImpl !== "function") {
        return Promise.resolve(primary || fallback);
    }

    const cacheKey = `${primary}|${fallback}`;
    if (!resolvedServerURLs.has(cacheKey)) {
        resolvedServerURLs.set(
            cacheKey,
            probeServer(primary, timeoutMs, fetchImpl).then((available) => available ? primary : fallback),
        );
    }

    return resolvedServerURLs.get(cacheKey);
};
