---
title: OBS 人物吸附 Demo
slug: obs-character-snap-demo
description: 基于 YOLO 的实时游戏画面人物检测与吸附 Demo：屏幕捕获 → 人物头部检测 → 目标锁定与平滑吸附跟随，Tkinter 实时调参面板。
date: 2026-08-11T13:05:00+08:00
image: ''
categories: []
tags:
  - 个人项目
  - Python
  - YOLO
  - OpenCV
  - Tkinter
  - 计算机视觉
links:
  - title: 代码仓库
    website: https://github.com/beitian-xhx/obs-character-snap-demo
---

最近做了一个计算机视觉方向的练习项目：实时识别游戏画面中的人物，并实现"跟拍锁定"功能。把完整过程记录如下，包括思路、踩过的坑和用到的工具。

## 一、屏幕捕获

第一步是把游戏窗口的画面实时抓下来，交给模型检测。抓屏没有依赖 mss、dxcam 这类第三方库，直接用 ctypes 调用 Win32 的 BitBlt。抓屏放在一个后台线程里持续执行，主循环只取最新一帧，这样抓屏与推理并行，帧率由较慢的一方决定。窗口移动或缩放时，每帧重新获取客户区坐标，画面不会偏移。

这里遇到第一个坑：屏幕分辨率对不上。系统返回 1707×1067，而实际分辨率是 2560×1600，抓出来的画面整体错位。原因是进程没有开启 DPI 感知，Win32 API 返回的是逻辑像素。调用 SetProcessDPIAware() 后问题解决，这个细节排查花了些时间。

## 二、数据集与微调（失败记录）

最初的思路是训练一个针对游戏角色的专用模型，流程比较标准：

1. 录制游戏视频，写脚本按固定间隔抽帧（每秒一帧）；

2. 用 labelImg 手工标注人物框；

3. 编写脚本把标注结果整理成 YOLO 格式，按时间顺序划分训练集与验证集（80/20），未标注的帧作为背景样本放入训练集；

4. 基于 YOLO26n 微调，训练 43 个 epoch，在第 23 轮触发早停。

结果并不理想：mAP50 约 0.5，召回率 0.27。小样本微调带来了明显的灾难性遗忘，模型对"人"这一通用类别的识别能力反而下降。

结论是放弃微调，改用原始 yolo26n（COCO 预训练权重），检测时只保留 person 类（classes=[0]）。数据量不足时，通用预训练模型是更可靠的选择，这条经验后来也记录了下来。

## 三、吸附与跟拍

检测稳定后，开始实现"视角吸附"：当屏幕中心靠近某个人物时，视角平滑地吸附过去并跟随目标移动，用于录屏、直播等需要跟拍的场景。

实现逻辑分为几步：

1. 目标点：取人物框水平中心，垂直位置通过参数 aim_y 调节（0 为头顶，0.3 为胸口，默认 0.3）；

2. 目标选择：屏幕中心进入吸附半径后，选择距离最近的人物锁定；锁定后优先延续上一帧目标，目标丢失则自动重新锁定最近目标；

3. 平滑输出：吸附点先做一次 EMA 平滑，抑制检测框的帧间抖动；移动量再做一次 EMA 平滑控制跟手程度；单帧移动量限幅防止视角跳变；两次移动之间加入约 0.1s 的冷却，减少高频微移。

最初直接按检测结果移动视角，画面抖动非常明显。经过多次调整，最终采用"目标点平滑 + 移动平滑 + 限幅 + 冷却"的组合才达到稳定效果。

## 四、控制面板

吸附强度、灵敏度、半径、吸附点位置、平滑系数、冷却时间等参数，运行时才知道是否合适。为此加入了一个 Tkinter 置顶控制面板：参数用滑动条实时调节，总开关用复选框控制（关闭后视角完全自由），状态栏实时显示帧率、检测人数和目标距离。

面板置顶且不抢焦点，配合游戏的无边框窗口模式可以一直悬浮显示。另外，原来用 ESC 退出与游戏按键冲突，改为关闭面板窗口即退出。

## 五、整体流程

\`屏幕/游戏窗口 → BitBlt 抓屏（后台线程）→ YOLO person 检测 → 吸附点定位 → 目标选择（半径 + 最近 + 上一帧延续）→ 平滑处理 → 视角吸附输出\`

运行环境：RTX 5060 Laptop（8GB 显存）、ultralytics 8.4.116、torch 2.11.0+cu128。输入尺寸 1280 时单帧推理约 46ms，远距离小目标的检测效果比 640 明显更好。

## 六、工具清单

| 工具 | 用途 | 下载链接 |

|---|---|---|

| Python 3.12 | 运行环境 | https://www.python.org/downloads/ |

| Miniconda | 虚拟环境 | https://docs.conda.io/en/latest/miniconda.html |

| PyTorch (CUDA) | 推理框架 | https://pytorch.org/get-started/locally/ |

| Ultralytics YOLO | 检测模型（yolo26n） | https://github.com/ultralytics/ultralytics |

| OpenCV | 视频/图像处理 | https://opencv.org/ |

| NumPy | 数组运算 | https://numpy.org/ |

| labelImg | 数据集标注 | https://github.com/HumanSignal/labelImg |

| CUDA Toolkit | GPU 加速 | https://developer.nvidia.com/cuda-downloads |

| OBS Studio | 录屏/直播采集 | https://obsproject.com/ |

| Steam | 测试用游戏 | https://store.steampowered.com/ |

| Git | 版本管理 | https://git-scm.com/ |

## 小结

项目目前包含两个入口：main.py（检测并绘制边框）和 head_track.py（检测 + 吸附 + 控制面板）。实现仅依赖 ctypes、OpenCV 与 Ultralytics，没有使用额外的屏幕捕获库。代码已开源在 github.com/beitian-xhx/obs-character-snap-demo。

回顾整个开发过程，最有价值的是那次微调失败——它让我更清楚地理解了小样本下微调的局限，也直接决定了后续的技术选型。
