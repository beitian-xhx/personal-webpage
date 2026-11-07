export const initSiteRuntime = () => {
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

export const initDashboard = () => {
    const dataElement = document.getElementById("dashboard-data");
    if (!dataElement?.textContent) return;

    let data: DashboardData;

    try {
        data = JSON.parse(dataElement.textContent) as DashboardData;
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
    const counts = new Map<string, number>();

    data.dates.forEach((dateString) => {
        const day = dateString.slice(0, 10);
        counts.set(day, (counts.get(day) || 0) + 1);
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
