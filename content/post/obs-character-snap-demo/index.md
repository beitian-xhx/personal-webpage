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
---

最近想练练计算机视觉，就挑了个「游戏画面人物识别」的选题：实时读屏幕，把画面里的人框出来。做着做着没刹住，从"能框人"一路做到"自动跟拍锁定"，中间踩的坑比写的代码还多。记录一下整个过程，工具清单放最后。

## 一、先解决"能看到画面"

第一步很朴素：把游戏窗口的画面实时抓下来，喂给模型，画框显示。抓屏没用现成的 mss/dxcam 这些库，直接用 ctypes 调 Win32 的 BitBlt，一个后台线程不停抓，主循环只取最新一帧，抓屏和推理并行跑，帧率由慢的一方决定。窗口移动、缩放时每帧重新取客户区，画面不会漂。

这里踩了个大坑：屏幕分辨率对不上。系统报 1707×1067，实际是 2560×1600，抓出来的图全是偏的。原因是进程没开 DPI 感知，Win32 返回的是逻辑像素。加了一行 SetProcessDPIAware() 就好，但这个坑耗了我不少时间。

## 二、自己标数据、自己训练，然后失败

当时天真地觉得"通用模型肯定认不准游戏角色"，于是老老实实走了一条标准的造数据集流程：

- 录游戏视频，写脚本每秒抽一帧（extract_frames.py）

- 用 labelImg 一帧帧手动框人，抽了快 200 张、标了 60 多张，挺费眼睛

- 写整理脚本（prepare_dataset.py），把标签转成 YOLO 格式，按时间顺序 80/20 切训练/验证集，没标签的帧当背景样本

- 用 YOLO26n 微调，跑到 43 个 epoch，早停在第 23 轮

结果 mAP50 只有 0.5，召回率 0.27——小数据集微调直接灾难性遗忘，模型把"人"都忘掉大半。认人这种能力，预训练权重里早就有，我拿 60 张图去教它，等于把好学生教傻了。

结论：换回原始 yolo26n（COCO 预训练），只跑 person 类（classes=[0]），识别能力立刻回来，还省了训练时间。这条教训后来被我写进笔记里：小数据集微调，别碰。

## 三、从"框人"到"跟拍锁定"

框出来只是第一步。后面想要的是：画面中心靠近某个人物时，视角平滑"吸"过去，锁定跟着他走——这样录屏、直播的时候镜头能自动跟上想讲的人物。

吸附的逻辑拆开是这样：

1. 检测所有人，取每个人物框的水平中心 + 可调垂直比例作为吸附点（aim_y，0 是头顶、0.3 是胸口，默认 0.3，因为吸头顶视角会偏上）

2. 屏幕中心进入某人的吸附半径（可调）内，就选离中心最近的那个锁定

3. 锁上之后优先延续上一帧那个目标，目标丢了自动换最近的重锁

4. 输出不是把鼠标直接甩过去，而是分几步平滑：吸附点先做一层 EMA 把检测框的帧间抖动抹掉，移动量再做一层 EMA 控制跟手程度，单帧移动量限幅防大跳，最后两次移动之间加 0.1s 的 CD 把高频微移砍掉

这几层平滑是一点点试出来的。一开始镜头晃得没法看，加了点平滑好一点，加大又拖沓，最后"点平滑 + 移动平滑 + 限幅 + CD"四件套齐了才稳。

## 四、控制面板：参数得边跑边调

吸附强度、灵敏度、半径、吸附点高低、平滑度、CD……这些参数不跑起来根本不知道合不合适，总不能改一次重启一次。于是加了个 Tkinter 置顶小面板：全部滑动条，勾选框当总开关（取消勾选=暂停，视角完全自由），状态行实时显示 FPS、检测人数、目标离中心的距离。置顶窗口不抢焦点，游戏用无边框窗口模式时能一直浮着。

还有个使用上的坑：ESC 会跟游戏里的暂停键冲突，最后把退出方式改成"关面板窗口即退出"，眼不见心不烦。

## 五、整体逻辑串一遍

\`游戏窗口/屏幕 → BitBlt 抓屏（后台线程）→ YOLO person 检测 → 吸附点定位 → 目标选择（半径+最近+上帧延续）→ 点平滑 + 移动平滑 + 限幅 + CD → SendInput 相对移动，把视角中心平滑吸到目标上\`

我的环境：RTX 5060 Laptop（8G 显存），ultralytics 8.4.116，torch 2.11.0+cu128，推理一张 1280 的帧大概 46ms，小目标明显比 640 好捡。

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

## 结尾

现在这个 demo 就俩入口：main.py 纯检测画框，head_track.py 检测+吸附+控制面板。全程没装额外的抓屏库，核心就 ctypes + OpenCV + ultralytics。代码在 github.com/beitian-xhx/obs-character-snap-demo。

回头看，最有价值的不是最后的代码，而是那个"小数据集微调失败"的教训——数据量不够的时候，通用预训练模型永远是第一选择。
