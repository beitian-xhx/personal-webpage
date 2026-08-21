---
title: 沪江天际线demo
slug: shanghai-lujiazui-3d-dev-process
description: 最近做了一个能在浏览器里漫游的上海陆家嘴 3D 场景：以黄浦江为轴，陆家嘴的天际线和外滩的万国建筑群一江两岸同时铺开。整个项目从数据准备、程序化建模到相机漫游分几步完成，记录一下开发过程，工具清单放最后。
date: 2026-08-21T22:47:00+08:00
image: ''
categories:
  - Web 开发
tags:
  - 数据可视化
links:
  - title: 代码仓库
    website: https://github.com/beitian-xhx/shanghai-lujiazui-3d
---

![](/img//https-beitian-xhx.github.io-personal-webpage-p-shanghai-lujiazui-3d-dev-process/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-08-21%20214059.png)

## **一、数据准备：从 OSM 到 3,201 栋建筑**

数据源选了 OpenStreetMap：免费、公开、覆盖全上海。拉了陆家嘴—外滩区域的原始 XML（16 MB），写了个 Python 脚本清洗成建筑 GeoJSON（2.1 MB，3,201 栋），每栋楼都保留自己的真实 footprint 轮廓。

OSM 不是测绘数据，立面材质、窗格、屋顶设备和楼高信息并不完整，很多楼没有高度标签。脚本里高度做了三级回退——height 标签 → building:levels（按 3.2 米/层估算）→ 按建筑类型默认值，并为每个建筑记录 heightSource 来源标记（实测/按层数估/按类型估），后续材质和颜色推断也基于这套属性。

清洗脚本用 iterparse 流式读取 XML，避免大文件一次性进内存；轮廓做闭环处理，小于 4 米或大于 800 米的 footprint 过滤掉；经纬度、宽深、楼高一并算进属性，前端可以直接使用。

## 二、工具链与技术选型

技术路线是"CesiumJS 管地理、Three.js 管局部"的混合方案：

- **CesiumJS** 负责 WGS84 坐标、相机漫游、鼠标拾取和视锥优先加载；
- **Three.js** 已装好，留给局部自定义模型和特效；
- **Blender** 负责重点地标（上海中心、东方明珠等）的 GLB 资产，后续替换程序化体块；
- **Vite** 负责开发与构建，vite-plugin-cesium 把 Cesium 静态资源一起打包进 dist。

环境方面，QGIS 首期未安装，用 Python 脚本 + Node 处理地理数据；3D Tiles 瓦片化工具链暂不具备条件（better-sqlite3 在 Node 24 下没有预编译包），首期用 Cesium 原生的屏幕空间误差，瓦片化留到后续。同时给 GLB 资产定了性能红线：单资产不超过 8 MB（硬上限 15 MB）、6 万三角面以内、贴图 1024 像素以内。

## 三、程序化建模：让每栋楼都有细节

3,201 栋楼没有用统一的拉伸方块，而是由六类部件程序化拼装：裙房、主体、屋顶、楼层腰线、立面竖梃、屋顶设备。轮廓使用真实 footprint，主体带收分（高楼缩进更明显），腰线和竖梃的数量随楼高浮动——高层 9 道腰线，矮楼 6 道。

配色按立面材质（玻璃/钢→青灰、砖/石→米黄、混凝土→灰白）和建筑类型（酒店、商业、工业、学校等）映射，最后用哈希调色板兜底，保证每栋楼都有细微差异。点击任意建筑会弹出详情卡，显示名称、高度、区域和一句简介。

每栋楼十几二十个部件，3,201 栋合计数万实体，本地原型可以流畅运行；后续范围扩大或上移动端时，计划把稳定的建筑体块转成 3D Tiles 做 LOD。

## 四、交互与容错

重点地标（上海中心 632 m、环球金融中心 492 m、东方明珠 468 m、金茂大厦 420.5 m、外滩建筑群）用真实坐标单独处理，侧边栏一键飞往。相机支持自由漫游：拖拽环绕、滚轮缩放、WASD 前后左右、Q/E 升降、方向键转头、Shift 三倍速；速度随相机高度自适应（飞高了走得快，贴地走得慢），关闭碰撞检测后可以穿行楼群。

场景运行做了几层保障：直接双击 index.html 时，浏览器安全策略会禁止读取本地数据，页面检测到 file: 协议后会给出明确提示，引导使用随包附带的 start-web.bat 启动本地服务；GeoJSON 加载失败时自动回退到程序化街区建筑，并在状态栏明确提示；底图和地形全部使用本地数据，不依赖在线地图服务，断网也能运行。

## 五、整体流程

OSM 原始 XML（16 MB）→ 流式清洗（关环/过滤/抽高/打来源标记）→ GeoJSON（3,201 栋 / 2.1 MB）→ Cesium 程序化装配（真实 footprint + 六类部件）→ 重点地标 GLB（规划中，Blender 制作）→ 浏览器漫游（拖拽/滚轮/WASD/点击详情）→ 失败自动回退（程序化街区/明确提示）

data/raw 原始数据只进不出，转换产物全部带来源标记；npm run build 产出 16 MB 静态站点（含 Cesium 资源），拷到任意静态服务器即可运行，不依赖构建环境。

## 六、工具清单

| 工具 | 用途 | 下载链接 |
| --- | --- | --- |
| OpenStreetMap | 建筑轮廓数据源 | [https://www.openstreetmap.org/](https://www.openstreetmap.org/) |
| CesiumJS | 地理场景、相机漫游、拾取 | [https://cesium.com/cesiumjs/](https://cesium.com/cesiumjs/) |
| Three.js | 轻量自定义模型和局部交互 | [https://threejs.org/](https://threejs.org/) |
| Blender | 重点建筑 GLB 制作 | [https://www.blender.org/](https://www.blender.org/) |
| glTF-Transform | GLB 压缩与检查 | [https://gltf-transform.dev/](https://gltf-transform.dev/) |
| Vite | 开发与构建 | [https://vite.dev/](https://vite.dev/) |
| vite-plugin-cesium | 打包 Cesium 静态资源 | [https://github.com/nshen/vite-plugin-cesium](https://github.com/nshen/vite-plugin-cesium) |
| Node.js | 数据管线与构建 | [https://nodejs.org/](https://nodejs.org/) |
| Python | OSM 清洗脚本 | [https://www.python.org/](https://www.python.org/) |
| QGIS（暂缺） | GIS 分析（首期用脚本替代） | [https://qgis.org/](https://qgis.org/) |

## 结尾

回头看，这个项目的核心思路是把工作分成三层：真实数据负责位置和轮廓，程序化生成负责细节和批量，重点地标留给手工美术。每一层独立升级、互不拖累。等 GLB 地标和 3D Tiles 接上，场景会进一步完善。
