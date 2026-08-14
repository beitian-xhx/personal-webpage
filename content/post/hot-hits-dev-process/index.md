---
title: 从海外热点到公众号文章
slug: hot-hits-dev-process
description: 从抓海外热点、接 LLM、防事实幻觉，到做出一套带人工审核的中文公众号出稿流水线——记录 Hot Hits 桌面应用的完整开发过程，含全部工具与踩坑详解。
date: 2026-08-14T10:00:00+08:00
image: ''
categories:
  - 桌面应用
  - 效率工具
  - 个人项目
tags:
  - Electron
  - React
  - TypeScript
  - AI 写作
  - 开发记录
links:
  - title: 代码仓库
    website: https://github.com/beitian-xhx/Hot-hits
---

最近想搞个能自动出稿的工具：把 YouTube、国际新闻这些海外热点，转成本土化的中文公众号底稿，每天批量来 1–3 篇。本来以为核心就是"接个 LLM 让 AI 写"，做着做着发现最难的压根不是写，而是"怎么让它不瞎编"和"怎么让审核真正把关"。踩的坑比写的代码还多，记录一下，工具清单放最后。

## 一、先解决"抓得到"

第一步是把海外内容抓下来。原计划 Reddit + YouTube 双通道，结果 Reddit 官方 API 要人工审批，免费档还限非商用，直接放弃；YouTube Data API v3 每天 1 万配额，`videos.list`、`commentThreads.list` 都只占 1 配额，够用。后来又补了 Google News RSS（免 key）和 GDELT DOC 2.0（免 key，但硬限速每 5 秒 1 次）当新闻源。

这里有个隐蔽的坑：YouTube 的 `mostPopular` 接口 2025 年起明显偏音乐/影视/游戏，想追综合热点得用 `search.list`（独立每日 100 次限制）或按新闻频道定向抓。最后选了频道模式：填一串新闻频道 ID（BBC、Reuters、Al Jazeera 这些），走 `channels → playlistItems → videos + commentThreads`，频道最新上传就是选题池。

还有个逃不掉的坑是网络。国内直连 YouTube 不通，外部请求必须走应用内代理：用 Electron 的 `net.fetch`（Chromium 网络栈）配 `session.setProxy({mode:'fixed_servers', proxyRules})`，简写 `127.0.0.1:7890` 会自动转成 `http=...;https=...`。Node 原生 fetch 不跟随系统代理，这里用错就是一堆超时。

## 二、LLM 接入：协议都得试一遍

LLM 走 OpenCode Go，Base URL 是 `https://opencode.ai/zen/go/v1`。坑在接口协议：`deepseek-v4-flash` 这批模型走 `/chat/completions`，而 `gpt-5.6-luna` 走 `/responses`，响应结构不一样，得分别解析。Base URL 也各种填错——官网首页、`/chat/completions`、漏 `/v1`——404 和授权失败来回踩。后来做了自动补 `/v1`、旧配置迁移、超时提到 180s 加自动重试才消停。180s 是拿真实出稿试出来的：一篇 1800–2600 字的文章，LLM 单次要跑挺久，调小了就频繁"网络请求失败"。

## 三、最难的是"不瞎编"

接好 LLM 之后第一个版本就是灾难：AI 写出来的文章看着通顺，数字、日期、人名全靠编。公众号这种稿子，事实错了等于翻车。

想明白一件事：\*\*不能让 LLM 自己决定"哪些是事实"\*\*。于是加了个专门的 extract 阶段，先把来源文本里的确定性事实（数字/日期/姓名/引语）抽成 `factList` 素材卡，再算个 `factsHash`；后面所有写作阶段只能基于这张卡扩写。程序还强制校验：标题里出现的数字必须都在事实清单里，否则丢弃。机器检查做成硬门槛——事实 diff、敏感词、事实哈希不一致，直接阻断"批准出稿"；字数、小节数只是警告，不阻断。

## 四、从"能出文"到"能审核"

出文只是开始，真正的产品是审核闭环。草稿走一长串状态机：`collected → scored → selected → material → expanded → formatted → deai → machine_checked → human_review → approved/rejected → bundle_exported`，每一步留痕，人工编辑过会自动回退 human_review 重新检查。

这里踩的坑是 Reviewer 复查一个个揪出来的：

- 调度器挂了没挂载，定时任务根本不触发；
- IPC 入口没校验，renderer 传啥都信；
- JSON 文件损坏时静默清空——改成原子写入（tmp + rename）+ schemaVersion 迁移；
- 事实检查不完整，正文里改掉的数字漏查；
- 单个任务失败拖垮整批——加了批次状态推导（partial_failed/empty），失败任务单独重试。

UI 也按反馈迭代：`alert/prompt/confirm` 全移除改 inline 状态；版本历史从"全文预览"改成真正的逐行 diff；驳回理由持久化，下次重写时当最高优先级要求注入。还有"去 AI 味"pass，把"值得一提""赋能""闭环"这类套话词直接 lint 掉。

## 五、整体逻辑串一遍

`YouTube/Google News/GDELT → 代理抓取（net.fetch）→ 评分去重（跨批次）→ 选题 1–3 篇 → 素材卡（factList + factsHash）→ LLM 扩写 1800–2600 字 → 排版 → 去 AI 味 → 机器检查 → 人工审核（approve/reject/regenerate）→ 导出出稿包（定稿 MD + 配图需求 JSON/MD）`

技术上的坚持：业务逻辑零第三方运行时依赖，存储只用 JSON 文件 + Node 原生模块（fs/promises、crypto、node:test），49 项自动化测试全用 fake transport，不真实联网。最后用 electron-builder 打包成 `Hot Hits.exe`，用户填好 API key 就能真实出稿——这条链路已经在本地验证成功过。

## 六、工具清单

| 工具 | 用途 | 下载链接 |
| --- | --- | --- |
| Node.js | 运行环境 | https://nodejs.org/ |
| Electron | 桌面应用框架 | https://www.electronjs.org/ |
| electron-vite | 构建工具链 | https://electron-vite.org/ |
| React | 界面 | https://react.dev/ |
| TypeScript | 类型与工程化 | https://www.typescriptlang.org/ |
| Zustand | 状态管理 | https://github.com/pmndrs/zustand |
| OpenCode Go | LLM 套餐 | https://opencode.ai/auth |
| YouTube Data API v3 | 视频源 | https://developers.google.com/youtube/v3 |
| Google News RSS | 新闻源 | https://news.google.com/ |
| GDELT DOC 2.0 | 新闻源 | https://www.gdeltproject.org/ |
| electron-builder | 打包 EXE | https://www.electron.build/ |

## 结尾

回头看，这个项目最有价值的不是"AI 能写文章"，而是想明白一件事：**把生成交给 AI，把事实交给程序，把判断交给人工**。AI 负责扩写和表达，程序锁死事实、跑机器检查，最终拍板永远是人——既享受了自动化的效率，又没把内容安全交给一个会幻觉的模型。
