---
title: "我用 Blender 把 ZGMF-X10A 自由高达搬进了浏览器"
slug: freedom-gundam-dev-process
description: "从一张灰模三视图出发，用 Blender 程序化重建 ZGMF-X10A 自由高达——骨架 38 骨、357 个部件、程序化喷涂材质、单文件 HTML 查看器与「翅膀展开」硬切姿势，记录开发过程与工具清单"
date: 2026-08-31T23:17:00+08:00
image: ''
categories: ["Web 三维", "机甲建模", "个人项目"]
tags: ["Blender", "Three.js", "程序化建模", "glTF", "开发记录"]
links:
  - title: 项目demo展示
    website: https://deepdemos.top/demo/freedom-gundam-b2769916
---

做一个能在浏览器里直接展开的 ZGMF-X10A「自由高达」3D 模型：从一张灰模三视图出发，用 Blender 全流程建模，最后渲染成一个可双击打开的单文件 HTML——没有服务器、没有网络请求、没有外部模型或贴图，全部几何和材质都在本地程序化生成。配图用建模早期的灰模图和最终上色后的效果图，demo 在最底下。记录一下开发过程，工具清单放最后。

![](/img/freedom-gundam-dev-process/gray-front.png "建模灰模图")

## 一、几何来源：严格按灰模三视图重建

这个项目第一优先级是"形要对"。机体不是从零创意，而是严格按一张灰模三视图逐区重建：正面 + 侧面 + 背面的翼架状态、颜色分区说明、武器标注全都要对上。参考图按部位切成 `ref_front_head / ref_front_legs / ref_front_waist / ref_side_full / ref_threeview` 等，做哪个部位就对哪张特写，绝不整体凭感觉。

实现上按部位拆成独立脚本：`b01_head`（头部）、`b02_torso`（胸躯）、`b03_arms`（手臂）、`b04_skirts`（裙甲）、`b05_legs`（腿部）、`b06_wings`（五辐射翼），每个脚本只负责一个分区的几何构建，源码即文档。部件全部用棱柱、放样、斜切这些硬表面手段拼出来，而不是方盒子堆叠——要的就是参考图那种装甲的斜面与棱角感。

## 二、工具链与技术选型

技术路线是"Blender 建模 → glTF 蒙皮导出 → Three.js 单文件打包"：

- **Blender 4.5** 负责全部几何、程序化材质、骨骼绑定与姿势烘焙；
- **glTF 导出器**（Blender 内置）把带蒙皮 + 动画的模型压成 `.glb`；
- **Three.js r147** 负责浏览器端的渲染、相机与 AnimationMixer；
- **scripts/build_html.py** 自研打包器：把 `three.js`、`OrbitControls`、GLTFLoader、应用逻辑和 base64 后的 GLB 全部内联进一个 `<script>`，输出单文件 HTML，解决 `file://` 下 CORS 拦 ESM 的问题——这也是"双击即开"的关键。

有个技术选型上的取舍值得记一笔：程序化材质带 `KHR_materials_clearcoat` 扩展，旧版 three.js 的 GLTFLoader 会直接卡死加载，所以查看器被迫锁在 **r147**，不能用更新的大版本。环境依赖为零，几何和材质全部本地程序化，不引外部网格或贴图资产。

![](/img/freedom-gundam-dev-process/spread-effect.png "上色后展开效果图")

## 三、核心实现：从骨架到蒙皮再到姿势

**1. 骨架与刚性蒙皮。** 模型建了一套 38 骨的骨架（`s00_armature.py`），357 个网格部件。最初用的是"骨骼父级绑定"方案，后来为了走标准 glTF 蒙皮通道，改成**刚性蒙皮**：每个网格建一个顶点组（全部顶点权重 1.0）指向控制骨，再加一个 Armature 修改器，并把父级设为骨架对象。三者齐备，glTF 导出器才会写入 `skins`。

**2. 程序化喷涂材质。** 没有引外部纹理包，全部用节点程序化搭建（`s31_mats2.py`）。配色按三视图的颜色分区：净白主装甲 `white`、群青蓝辅甲 `blue`（0.055/0.250/0.760）、深蓝翼架 `navy`、亮红高光 `red`、金黄天线 `gold`、深灰关节 `frame/gun`。质感上完整走 Principled 参数——清漆 Coat、金属度、噪声→粗糙度变化、Pointiness 边缘磨损、噪声→Bump 表面凹凸，营造烤漆金属装甲板的感觉。

**3. 姿势：硬切，只动翅膀。** 项目经历了多轮方向调整，最终收敛为极简交互：**姿态按钮只剩两个——「初始形态」和「翅膀展开」**，且是**硬切、无过渡动画**。姿势只对 12 根翼骨（`wing_rack.L/R` + `wingA-E.L/R`）打关键帧，身体、手臂、盾牌骨**零关键帧**。

这里踩过一个反复出现的坑：最初用"骨骼父级绑定 + 手动套坐标变换"做姿势，浏览器里一旦切姿势，大腿/小腿会断开、手臂部件会消失。逐项排查后发现真正的根因不是蒙皮绑定，而是**关键帧外推**——`set_pose()` 只重置自己用到的骨骼，结果某些骨骼在 frame1（初始形态）没有关键帧，glTF 会把它们的姿势值**外推到整条时间轴**，初始帧直接变成蹲姿 + 抬臂 + 展翅的叠合，于是"腿断开、手臂消失"。修复方式是重写为**自包含姿势**：每个姿势先把全部相关骨骼重置为 rest，再叠加本姿势的 delta，并对全部骨骼打关键帧；frame1（初始形态）全 0，才是真 rest。

**4. 盾牌朝向与"手会不会动"。** 盾牌一度嵌在手心、法线朝向机体后方。因为模型用 `export_yup=True` 导出（Blender Z-up → glTF Y-up），Blender 里让盾面朝 -Y，导出后就变成了 +Z（背向镜头）。修复是整组绕 Z 转 180°，让盾面法线朝 -Z（机体重心方向）。"手会动"则在浏览器里扫描所有 SkinnedMesh 的采样顶点，定位到是**翼架基座装甲 `binder_*` 绑在了 `wing_rack` 骨上**，翅膀一展开就被带着飞出 8 个单位、扫过手部区域造成"手动"错觉——把它改绑到 `chest` 后，手/臂/盾牌在两种状态下逐值零移动。

## 四、交互与验证

查看器提供几种观察方式：左键拖拽旋转、滚轮缩放、右键拖拽平移，加上 6 个视角预设（3/4、正面、背面、左、右、顶部）、自动旋转、线框模式，以及「初始形态 / 翅膀展开」两个硬切姿势按钮。

验证走三套自检，不靠猜：

- **Blender 内逐姿势渲染**（`s33_pose_renders.py`，内建灯光）确认腿臂连贯、武器跟手；
- **无头 Chrome（CDP）** 打开单文件 HTML，采集 `loadState / errors`，并用 `AnimationMixer` 读 `clips / tracks / duration`，确认两个姿势都 `applied=1`；
- **浏览器蒙皮顶点实测**：对 fold / spread 两种状态逐个采样 `boneTransform` 蒙皮顶点，手/前臂/盾牌逐值完全相等，证明"手动"bug 真正消除。

导出结果：GLB 3.44 MB，`skins=1`，动画 114 通道、0.0417–0.4167 s、含 STEP 插值（硬切）；HTML 5.31 MB。

## 五、整体流程

```
灰模三视图 → 部位独立脚本(b01-b06) → 38骨骨架 + 357部件刚性蒙皮
→ 程序化喷涂材质(Principled+节点) → 双姿势硬切(只动12根翼骨)
→ Blender 逐姿势渲染自检 → glTF 蒙皮导出 → build_html 单文件打包
→ CDP 无头浏览器验证(姿势+蒙皮顶点) → 双击即开
```

工程上有一条约定：`build_html.py` 是唯一的单文件来源，改源码后重新打包即可；渲染与浏览器自检脚本只做验证，不参与构建，保证结果可复现。另外 Blender 的 GUI 与无头批处理**不要同时保存**同一个 .blend（会互相覆盖、丢灯光），姿态或材质大改都走 mcp 桥接让用户在 GUI 里实时可见。

## 六、工具清单

| 工具 | 用途 | 官网 |
|---|---|---|
| Blender 4.5 | 几何建模、程序化材质、骨骼绑定、姿势烘焙 | https://www.blender.org/ |
| Three.js r147 | 浏览器渲染、OrbitControls、AnimationMixer | https://threejs.org/ |
| glTF | 带蒙皮 + 动画的模型交换格式 | https://www.khronos.org/gltf/ |
| Chrome DevTools Protocol | 无头浏览器截图与报错采集 | https://chromedevtools.github.io/devtools-protocol/ |
| Python | 建模脚本、材质脚本、打包器 | https://www.python.org/ |
| Blender Principled BSDF | 清漆/金属度/噪声粗糙度/边缘磨损/凹凸 | https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/bsdf_principled.html |

回头看，这个项目最值得记的一点是**分层**：几何层（分部位脚本 + 38 骨 × 357 件）、材质层（程序化节点喷涂）、动画层（只动翼骨的硬切姿势）各管各的，靠自包含姿势和刚性蒙皮把"切换姿势"收敛成一个稳定可复现的动作。后续计划是把翅膀展开再往 HiMAT 参考图的方向收敛一版翼形，顺便把查看器的 HUD 交互做完整一点。
