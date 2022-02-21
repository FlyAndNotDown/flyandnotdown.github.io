---
title: "GDC 笔记 - 'Ghost Recon Wildlands': Terrain Tools and Technology"
description: "育碧 Ghost Recon 地表工具和技术的分享，地表 IdMap 方案的经典 Talk。"
date: "2022-02-21"
slug: "51"
categories:
    - 技术
tags:
    - GDC
keywords:
    - idmap
    - splat
    - ubi
    - ghost recon
    - terrain
---

> 原文链接：['Ghost Recon Wildlands': Terrain Tools and Technology](https://www.gdcvault.com/play/1024708/-Ghost-Recon-Wildlands-Terrain)

![](1.png)

地图规格。

![](2.png)

11 种生态群落，140 种地表材质。

![](3.png)

河流面积与顶点。

![](4.png)

植被与石头。

![](5.png)

道路、贴花。

![](6.png)

铁路网。

![](7.png)

建筑与聚落。

![](8.png)

GPU 雕刻工具的介绍。

![](9.png)

基于 World Machine 开发了一套程序化生成的管线，用于自动生成高度图，作为后续地形编辑的 Input。

![](10.png)

美术规格。

![](11.png)

做了一个非常快速的 GPU-Based 的地形雕刻工具，最多可以一次雕刻 2km x 2km 的地块。

![](12.png)

对高度图做了分层，Base 层是 World Matchine 的输出，不会被改变，Editor 产生的修改被放到 Macro 层。DCC 层专门放置 Houdini 生成的修改，后面会具体讲。Micro 则存放关卡美术做的微小调整。

![](13.png)

地表。

![](14.png)

目标是生成真实、高质量的地表，然而这么大的地图纯手刷不可能搞定。

![](15.png)

尝试了一个简单的规则，按照地形的 Normal 做灰色到白色的插值，其实就能生成一个不错的山脉地表了，可以按照这个思路扩展地表的生成规则。

![](16.png)

最终定下来的用于程序化生成的参数有四个，坡度、高度、噪声、曲率，按照这几个参数在 Pixel Shader 里面实时计算。

![](17.png)

美术工具截图，修改参数就可以实时生成地表看到效果，非常方便。

![](18.png)

虽然现在可以一键生成地表了，但是有些过渡的地方还是显得不太自然。于是又支持了美术手刷地表。

![](19.png)

![](20.png)

地表最终会被保存为两张纹理，分别叫 Splatting Texture (R8) 和 Vista Texture (BC5)，Splatting Texture 中保存了当前地表所对应的材质索引，Vista Texture 保存的是一个简单的 Albedo，用于远处地表的渲染。

![](21.png)

地块是按照四叉树存储的，每一个四叉树节点都带 Payload，包含 LOD、Culling、Streaming 信息。这些节点会根据距离相机的距离进行 Streaming In / Out。

![](22.png)

地表材质。

![](23.png)

地表材质当然包含经典 PBR 纹理。

![](24.png)

还包含一张 Displacement 纹理，用于地形曲面细分的。

![](25.png)

地表基本都是由四层材质混合的（Splatting Map 是双线性插值，所以是四层），所有地表材质一共有 143 种，所以一次把所有纹理加载进来是不可能的。

![](26.png)

做法是动态将地块用到的纹理合成一组 Texture2DArray，这里 Array 最多 32 层，也就意味着每一个地块最多只能使用 32 种材质。由于是动态合成的 Array，在 Shader 里还会有一次 Index 的转换。

![](27.png)

近景渲染。

![](28.png)

先看最终效果，下面会依次分析渲染流程。

![](29.png)

先看单个地表材质（点采样）的渲染，因为只取了一种材质的纹理，所以看起来是格子状的。整个流程是先去采样 Splatting Texture 拿到 Material Index，然后拿到 Material Index 转换到 Texture Array Index，然后再采样 Texture Array 拿到材质的纹理进行渲染。

![](30.png)

实际上渲染当然不会只做一次点采样，实际上对 Splatting Texture 进行采样的时候会借助双线性插值的思想，取相邻的四个像素取得四个 Material Index，然后根据离临近像素的距离来做权重混合。

![](31.png)

最终效果就会好很多。

![](32.png)

老生常谈的 Slope 渲染问题，因为地表纹理的 UV 变化是按照世界空间的 x 和 y 来的，在比较陡峭的地方变化就会很剧烈，导致拉伸，处理方法一般是 Tri-Planar，就是按三个轴投影，然后按 Normal 做混合。Ghost Recon 的做法好像只是按 x 和 y 两个轴投影。

![](33.png)

首先双线性插值一套操作下来就要采样 Splatting Texture 4 次（不是最终采样数，最终采样数还需要计算材质纹理的采样）了，然后处理崖壁又要按两个轴投影，然后直接 x2，变成 8 次，性能堪忧。

![](34.png)

优化就是把地表块分成三种，使用不同的 Shader。

![](35.png)

普通地表就直接双线性采 4 次就完事了。

![](36.png)

Slope 8 次逃不掉。

![](37.png)

过渡要两种都采，然后做混合。

![](38.png)

实测下来效果还行，80% 的地表都只需要采 4 次 Splatting Texture。

![](39.png)

道路是直接画在地形上的，然而地形的分辨率不够，导致细节丢失，在一个就是用 Splatting Id 的方案过渡很僵硬。

![](40.png)

屏幕空间贴花看起来效果不错。

![](41.png)

但是开销太大了。

![](42.png)

Virtual Texture 在地形中的应用。

![](43.png)

就是 UE 里的 Runtime Virtual Texture，大家都比较熟悉了，这个技术跟地形很般配。

![](44.png)

VT Feedback Pass 必不可少，但是 Ghost Recon 做了一些改进。

![](45.png)

判断哪些 Page 需要加载进 Physical Texture，最简单的方法就是直接光栅化整个场景，把结果画到一个屏幕空间的 Buffer 上，然后再读回 CPU，如果是 4k 的屏幕开销更离谱。但是如果换低分辨率的 RT 又会损失一些细节。

![](46.png)

优化方法就是不再单独开 Pass，直接在 G-Buffer Pass 里面完成计算，输出到一张 3D Texture 中，输出的时候拿 (uv, mipLevel) 作为坐标。

![](47.png)

直接用 Compute Pass 算出缺少的部分，然后回读会 CPU。

![](48.png)

如果按照 10 Texels / cm 的分辨率，大概需要 2PB 的存储空间，蓝光光盘都塞不下。

![](49.png)

压缩和 Tiles 的实时生成。

![](50.png)

最终的一些参数。

![](51.png)

Xbox One 上的性能。

![](52.png)

地形相关的一些其他玩意。

![](53.png)

地形不止高度和地表，还保存了一些其他的信息。

![](54.png)

道路的生成需要定义一组 Waypoints，然后自动生成路径来连接各个点，形成道路。

![](55.png)

正常性网格的连接，效果不太行。

![](56.png)

随机连接，效果好很多。

![](57.png)

![](58.png)

道路生成的流程。

![](59.png)

输入输出。

![](60.png)

根据生成的道路会顺便生成一些其他的玩意。

![](61.png)

火车道也是类似。

![](62.png)

河流。

![](63.png)

聚落。

![](64.png)

种田。

![](65.png)

自动摆石头。

![](66.png)

植被。

![](67.png)

声音。

![](68.png)

145 个工具，一套自动化管线，4 个 TA 负责。

总结，最有价值的的就是 Material Id 的地表算法，在开放世界地表渲染领域基本已经成为了政治正确的方案，兼顾性能和效果，各种基于 Material Id 的优化方案层出不穷。本篇 GDC 更多关注的是程序化生成方面，渲染方面讲得比较少。