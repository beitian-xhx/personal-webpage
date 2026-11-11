# 三图人物点阵开屏

## 展示与操作

开屏使用三张透明人物图，分别映射到六面结构的三组对面。默认正对头像，静止时以单个人物为视觉中心；鼠标移动或按住拖拽时显出相邻面，停止后短暂惯性并平滑对齐最近人物面。隐藏硬边线，脸、头发和肩部以不同深度起伏表达体积。

触屏支持横向拖动转面。开屏采用 `touch-action: pan-y`，纵向手势由浏览器滚动处理，继续沿用向下滚动进入主页的流程。

环境粒子包括远景星尘、三组弧形粒子流和近景游离光点。中心人物与标题附近降低亮度和密度。环境与人物的入场渐入相协调，指针提供远近视差，音乐的真实 FFT 数据影响扩散、亮度与闪烁。暂停音乐仍保留常态慢流；离开开屏或隐藏页面时停止绘制。

音乐播放器沿用原版模板、样式与控制逻辑。

## 修改入口

| 文件 | 职责 |
| --- | --- |
| `data/hologram.json` | 三图路径和基础素材信息 |
| `static/img/experience/cube/` | 三张透明 WebP 及来源说明 |
| `layouts/_partials/head/head.html` | 仅开屏时预加载三图 |
| `layouts/_partials/experience/portal.html` | 通过 `data-cube-images` 提供本站图片地址 |
| `assets/ts/hologram.ts` | 透明筛点、分层深度、几何遮挡、惯性及停靠 |
| `assets/ts/audio-field.ts` | 环境点阵、指针视差与音乐联动 |
| `assets/scss/_portal.scss` | 构图、画布显示与触屏滚动契约 |

保持 `mountHologram(canvas, reduced)` 的清理函数接口与原 `data-exit` / ready 约定。音频环境复用既有分析器，不创建第二个播放器或 FFT 上下文。资源地址经过 `relURL`，支持 `/personal-webpage/` 部署前缀。
