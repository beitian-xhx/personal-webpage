---
title: "GitHub 周报 · Trending 报告工具"
description: "一个生成 GitHub 每周 Trending 报告的桌面应用：自动抓取本周新晋高星仓库，按编程语言分组展示 Top 20，并用 AI 生成中文一句话摘要，一键导出 Markdown 周报"
date: "2026-07-27"
slug: "github-weekly-report"
categories: ["桌面应用", "开发工具", "AI 摘要", "个人项目"]
tags: ["Electron", "React", "TypeScript", "Vite", "Ant Design", "GitHub API"]
image: "/img/article-covers/github-weekly-report.svg"
gradient:
  a: "#0284c7"
  b: "#38bdf8"
links:
  - title: "代码仓库"
    website: "https://github.com/northernday/Github-weekly-repory"
toc: true
comments: false
license: false
---

## 项目简介

一款 Windows 桌面应用，解决"每天刷 GitHub 跟不上业界新动态"的痛点。它通过 **GitHub Search API** 抓取本周内新建的高星仓库（`created:>本周一` 按 `stars` 降序），取 **Star 数 Top 20**，并按编程语言自动分组，输出一份结构化的 Markdown 周报。

每个仓库会附带 **AI 生成的中文一句话摘要**：配置 API Key 后可调用 Claude 或 OpenAI，用 ≤40 字讲清仓库核心功能与本周值得关注的原因；没有 Key 时自动降级为 `[超千星]` / `[热门]` / `[新晋]` 标签 + 原生描述，开箱即用。生成的报告支持历史记录管理（查看 / 导出 / 删除），可在设置页按 **最低 Star 数** 与 **编程语言** 过滤内容。

## 成果

- 🚀 完整交付一款可运行的 **Electron 桌面应用**，打包为便携式 `GitHub周报.exe`（🐙 图标），数据目录跟随 exe，免安装即用
- 📊 实现"本周高星仓库 → 按语言分组 → AI 中文摘要"的完整周报生成链路，报告可一键导出 Markdown
- 🤖 接入 **Claude / OpenAI 双模型** AI 摘要，无 Key 时优雅降级，并带本地缓存（避免重复请求）
- 🌐 采用 Electron `net.fetch`（Chromium 网络栈自动走系统代理），解决国内直连 `api.github.com` 的网络问题
- 🔧 实战踩坑并修复多个 Electron 生态难题：`require('electron')` 模块解析 Bug（#49034）、Search API 的 `sort` / `order` 参数陷阱、ESM 导入 CJS 的 default 包装等，沉淀为可复用的经验

## 失败

最后还是没能做出我想要的效果，分析下问题所在吧，首先，我试图给每个项目做简介的想法就是完全错误的，做简介必然需要 ai 的 api 的介入，或者接**大体量的复杂工具**，这违背了一个小项目的基本原则。其次，我没有考虑到 github 是个纯英文网站，我就算能总结，又得去翻译英文，这又得用 ai 或者接翻译工具。再其次，我当时对于 github 的使用可谓是完全不懂，说实话用这个的效率还不如去网上乱翻，我做这个的时候想着看近 20 天的高 star 内容，问题是本来优质内容就很少，我凭什么要求 20 天内就有？？我又不是什么用了好几年的老程序员，每一篇帖子我都看过了，何必这么干？

不过还是有点用的，起码练了练 ai 用 electron 框架的能力，明显比轻松记账项目走的顺多了，就这样吧。