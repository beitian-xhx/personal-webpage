# Lato 本地字体来源

## 网站原始引用

`layouts/_partials/head/custom-font.html` 原引用：

`https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap`

2026-11-06 使用 Chrome/Edge/Firefox 现代浏览器 User-Agent 请求该 CSS。返回 Google Fonts `v25` 的 6 个 `@font-face`，涵盖 300/400/700 三个权重及 `latin`/`latin-ext` 两个分段。原始响应逐字保存于 `google-fonts-css2-v25.txt`，SHA-256 为 `23fbe3575c72739a0ecbcc6489be6b81872b55cff6f65435fffc8d85fde7ba1a`。

同一 URL 对 Safari User-Agent 会返回一组名称不同、体积更小的 `v25` woff2。使用 fontTools 4.63.0 逐对比较后确认：两组的字形轮廓、字符映射、字宽、GPOS/GSUB/name 表一致，`head` 表仅 `checkSumAdjustment` 随文件变化；Safari 版本移除了旧式 TrueType hinting 表与指令。这里保留 Google 向现代 Chrome/Edge/Firefox 返回的原文件，没有引入 Google Fonts 之外的字体版本。模板内联的 `font-family`、`font-style`、`font-weight`、`font-display`、分段注释及 `unicode-range` 与原始 CSS 逐项一致；只把 `src` 改为 `{{ "fonts/lato/<原文件名>" | relURL }}`，以便同一构建在 `/personal-webpage/` 子路径和网站根路径下都指向同源静态文件。

所有 woff2 按 Google Fonts CSS 中的原文件名下载并逐字保存，未重新打包或修改。

## 字体文件清单

| 权重 | 分段 | 来源 URL | 本地文件 | 字节数 | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| 300 | latin-ext | https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh7USSwaPGR_p.woff2 | `S6u9w4BMUTPHh7USSwaPGR_p.woff2` | 5820 | `5627143aaeb49ba46b4614d4fefb967ad8d163fb0743a2fa9c7e53930e559062` |
| 300 | latin | https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh7USSwiPGQ.woff2 | `S6u9w4BMUTPHh7USSwiPGQ.woff2` | 23236 | `115f6a626ca115d4ad5581b59275327e0e860b30330a52b0f785561332dd2429` |
| 400 | latin-ext | https://fonts.gstatic.com/s/lato/v25/S6uyw4BMUTPHjxAwXjeu.woff2 | `S6uyw4BMUTPHjxAwXjeu.woff2` | 5612 | `8b9fc9737043f88c1a9a7195c27a239bd329cc33d928ffb67736c61ae7a1dbbd` |
| 400 | latin | https://fonts.gstatic.com/s/lato/v25/S6uyw4BMUTPHjx4wXg.woff2 | `S6uyw4BMUTPHjx4wXg.woff2` | 23580 | `918b7dc3e2e2d015c16ce08b57bcb64d2253bafc1707658f361e72865498e537` |
| 700 | latin-ext | https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh6UVSwaPGR_p.woff2 | `S6u9w4BMUTPHh6UVSwaPGR_p.woff2` | 5552 | `3a5797f440bc67b59830cad81e59a71011e35cb45ed7f747b61a69b0a9b0d6ae` |
| 700 | latin | https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh6UVSwiPGQ.woff2 | `S6u9w4BMUTPHh6UVSwiPGQ.woff2` | 23040 | `c447dd7677b419db7b21dbdfc6277c7816a913ffda76fd2e52702df538de0e49` |

每个本地文件均已验证 WOFF2 文件头 `wOF2`。六个文件中的 name table 记录 `Version 1.104; Western+Polish opensource`，版权人为 tyPoland Łukasz Dziedzic，许可为 SIL Open Font License 1.1。

## 许可与上游

- 字体作者：Łukasz Dziedzic（tyPoland），保留字体名称 `Lato`。
- 许可：SIL Open Font License, Version 1.1，完整文本见本目录 `OFL.txt`。
- 许可文本来源：https://raw.githubusercontent.com/google/fonts/main/ofl/lato/OFL.txt （Google Fonts `main` 提交 `24ddc1f324cac5d9f5aedca126d298f56e3f1640`，2026-11-06 获取；该许可文件自提交 `90abd17b4f97671435798b6147b698aa9087612f` 起未变更）。`OFL.txt` SHA-256：`74ba064d03f1f1c4a952da936c3eb71866c34404916734de3cae73b34357e59e`。
- 上游字体源码：https://github.com/googlefonts/lato ；Google Fonts 元数据记录的源码提交：`3a099680152e3455ef6bc3eb4118ec5ef60e7e54`。
- Google Fonts 字体页：https://fonts.google.com/specimen/Lato 。
- Google Fonts 的 CSS 和 woff2 URL 受服务版本及 User-Agent 影响；本清单和快照记录 2026-11-06 实际下载内容。

许可全文与各 woff2 一起分发，符合 OFL 1.1 第 2 条。字体文件保持原始版本，未使用保留字体名称命名衍生字体。
