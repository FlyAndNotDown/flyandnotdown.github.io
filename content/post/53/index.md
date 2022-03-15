---
title: "GDC 笔记 - Quadtree Displacement Mapping with Height Blending"
description: "利用四叉树优化 Displacement Mapping 的一个方案。"
date: "2022-03-15"
slug: "53"
categories:
    - 技术
tags:
    - GDC
keywords:
    - qdm
    - self
    - shadow
---

> 原文链接：[Quadtree Displacement Mapping with Height Blending](https://www.gamedevs.org/uploads/quadtree-displacement-mapping-with-height-blending.pdf)

![](1.png)

![](2.png)

目录

![](3.png)

下一代渲染的一些要素与目标。

![](4.png)

然而现实是现在的 Surface Rendering 差距甚远。

![](5.png)

地形的 Surface Rendering 是很费的，而且需要做混合，混合意味着不能拥有较高的几何复杂度。

![](6.png)

Surface 的几何细节包括体积、深度、各种频率的细节。他们结合起来可以产生一些其他的效果：深度视差、自阴影、光反应性。

![](7.png)

Surface Rendering 要实现光照交互依赖 Surface 的微观结构，目前已经有一些理论研究（比如烘焙 Terrance BDRF）了。要体现出几何的复杂性，可以通过修改三角面或者走光追。但是三角面相关的方法都比较费，比如直接增加面数，顶点的 Transform 和显存开销都会相应增加，更实用的做法是实用 Tessellation 在管线中倍增三角面。

![](8.png)

做这套方案的动机：

- 应对不同的 Surface：地形、静态/动态物体
- 高性能：支持当前的硬件
- 最小化显存开销：开销与传统的 Normal Mapping 相当，能在当前的主机平台顺利运行

![](9.png)

所以这套方案需要支持：

- 获取任意角度下的精确深度
- 自阴影
- AO
- 快速、准确的混合

![](10.png)

![](11.png)

效果对比图。

![](12.png)

现有的提高深度复杂度的解决方案无非两种：

- 寻找真正的 Surface 的深度，即寻找 View Ray 和 Height Field 的真正交点
- 通过计算好的 Depth Offset 来进行光照计算

![](13.png)

比如上面这张图，在无视高度细节的情况下交点实际上是错误的。

![](14.png)

正确的交点应该是图中虚线和 View Ray 的交点。

![](15.png)

一种做法是对 Height Field 数据做 Ray Tracing，这意味着额外的显存消耗。

![](16.png)

Relief Mapping (RM) 和 Parallax Oclussion Mapping (POM) 都是光追做法。

![](17.png)

传统的固定步长的 Linear Search Ray Tracing，可以看见 Tracing 的结果（实箭头的终点）和正确的交点还是有一定的误差。

![](18.png)

POM 则是在 Linear Search 的基础上加了一次线性近似。

![](19.png)

如图所示，Linear Search 有一个问题，就是步长太长的话可能导致求交出错。

![](20.png)

上面这张图就是步长设置不对的情况。

![](21.png)

此外还有一些基于距离场的预处理的方案:

- Per-pixel Displacement with Distance Function
- Cone Step Mapping
- Relaxed Cone Step Mapping

![](22.png)

因为是预处理，所以可以包含更多的信息来做一些额外的事情。

![](23.png)

Quadtree Displacement Mapping (QDM) 算法，用四叉树来存储到高度场基准平面的最小深度。

![](24.png)

四叉树结构简单，对应到硬件实现是 Mipmap 采样会更快、显存开销小。

![](25.png)

性能足以运行时生成。

![](26.png)

用 QDM 做 Ray Tracing 的时候需要从最高级 Mip 到最低级 Mip 遍历四叉树，最后用最低级 Mip 来计算交点。

![](27.png)

算法伪代码，获取当前位置投影在当前 Hierarchy_Level 中的最大 Depth，如果 Ray_Depth < Depth，就沿着 Ray 步进到最接近的交点，否则的话就降一级 Hierarchy_Level 重复上面的操作直到 当 Hierarchy_Level ≤ 0。

![](28.png)

![](29.png)

![](30.png)

![](31.png)

![](32.png)

![](33.png)

QDM 的构建，由最低级的 Mip 往最高级 Mip 逐级构建，不过不能直接用硬件生成，因为每一级 Mip 要取低级 Mip 四个 Texel 的最大值。

![](34.png)

![](35.png)

![](36.png)

![](37.png)

![](38.png)

![](39.png)

![](40.png)

![](41.png)

![](42.png)

对照上面的算法来看图就容易理解了。

![](43.png)

最后再参考 POM 做一次线性近似。

![](44.png)

QDM Ray Tracing 是代数方式在进行求交测试，遍历的是离散数据。

![](45.png)

QDM 仍然有一些优化空间。

![](46.png)

因为 QDM 的 Level 0 是点采样即离散数据，这意味着越接近 Surface，效果越越差，需要额外的提升效果的手段，通常是用线性逼近求交（上面提到的那个）。

![](47.png)

正常 QDM 的时间复杂度是 O(log(n))，这还是不够快，所以需要限制最大的迭代次数。

![](48.png)

QDM 在一定条件下会退化成 Linear Search，典型的场景就是在特征边缘，Ray 已经达到了 Level 0，由于 QDM 没办法在遍历时往更高的 Level 走，所以 Ray 再往前算法就跟 Linear Search 没区别了。解决方案就是在穿越 Cel 的时候往上走一级。

![](49.png)

QDM 不能用传统的 MipMapping（猜测是 QDM 不能直接随距离变化，就算距离拉远了，还是需要一定程度的精度？）。相应的，需要根据当前的 Mip Level 来限制 LOD Level 的最大值。然后还需要动态地调整迭代上限（根据 Normal 和 View 向量的夹角）。还有就是根据 Camera Space 的 Z 来调整 QDM Depth Fade 的比例（最远处就是只用 Normal Mapping 了）。

![](50.png)

QDM 本身其实是一个离散数据集（纹素），如果需要提高精度的话就要使用未压缩的纹理。当然如果能保证整数运算精确的话，是可以使用压缩数据的，DXT5 alpha 插值的误差就可以接受。

![](51.png)

总结下 QDM 的优点：

- 任何场景下都是准确的
- 运算快、Scalable
- 额外显存消耗小
- 预处理快
- 可以调整迭代次数来平衡性能与质量
- 涵盖四叉树的其他优点

![](52.png)

缺点：

- 每次迭代中更慢了
- 使用 text2DLod 采样时是随机访问，在现在的硬件上很慢
- Depth 跨度较小、分辨率较低时效果不够好

![](53.png)

理论的时间复杂度。

![](54.png)

实际上达到收敛状态所需要的迭代次数，可见 QDM 远远强于 POM。

![](55.png)

下一页的数据展示了 POM 和 QDM 在实际游戏场景中的性能差异。CSM 和 RCSM 因为预处理时间的原因，不太适合实际游戏？

![](56.png)

POM 与 QDM 的性能对比。

![](57.png)

![](58.png)

Depth Scale 1.0 对比。

![](59.png)

![](60.png)

Depth Scale 1.5。

![](61.png)

![](62.png)

Depth Scale 5.0。

![](63.png)

极限场景下的测试对比。

![](64.png)

HeightMap 的一个特性就是可以在 Surface 上产生自阴影。计算自阴影的办法就是 ViewRay 与 Surface 的交点 P 能否从光的位置 L 被看见，要完成这个计算，可以从 L → P 的方向开始做 Ray Tracing，如果与 HeightField 相交，就说明 P 在阴影中。

![](65.png)

对照这幅图来理解。

![](66.png)

![](67.png)

按照这种方法做 Ray Tracing 成本较高，每个采样点都要进行一次 Light Ray 的 Ray Tracing。我们可以转换下思路，通过计算水平可见性来获取自阴影（POM 那篇论文里的做法）。

![](68.png)

从 POM 原 Paper 那盗了张图，要计算硬阴影可以从 View Ray 的命中点出发，沿着 Light Ray 计算是否被遮挡，被遮挡则在阴影中。

![](69.png)

计算软阴影则可以从 View Ray 的命中点 h0 出发，沿着 Light Vector 在 Height Field 上做一系列采样，然后求出遮挡系数 hi，以最大的遮挡系数来求软阴影的值（图中的这个公式只是说明为什么这两者有关系，不是用来计算的）。

![](70.png)

再拿这张图跟上面那张图中 Blocker Height 的说明对比一下就清楚了。

![](71.png)

用 POM 计算软阴影的 Shader。

![](72.png)

![](73.png)

开关的对比。

![](74.png)

![](75.png)

QDM 版本的自阴影。沿 Light Ray 方向里 View Ray 命中点较远的采样可以用高 Mip 替换，可以进一步提高速度。

![](76.png)

跟上面的 Shader 对比一下就知道了，w1-w5 是给美术调整效果用的。

![](77.png)

保证质量的同时提速，o(n) → o(logn)。

![](78.png)

![](79.png)

开关对比。

![](80.png)

AO，简单提了下，跟 Self Shadowing 的计算类似，也可以用类似的手法处理，并不需要每一帧都计算，只需要在 Height Field 变化时计算即可，对提升大世界地形的效果尤其有效。

![](81.png)

Surface Blending，主要用在地形渲染，就是 Alpha Blending 的泛化版，对每一种材质给一个权重，最后加权混合。他这里说的使用顶点色做权重，一般更常用的是提供一张单独的 WeightMap。

![](82.png)

在 Surface Blending 中一般不会采用 Alpha Blending，现实生活中的 Surface 不会这样 Blending，实际上在游戏中还是有用的，一般是用来做一些附着材质的标记，比如湿度、积雪度等。

![](83.png)

更常用的一种混合方法是 Height Blending，也是老生常谈的混合方式了，在 Weight Blending 的基础上加上高度，从而在混合的材质间产生穿插的效果。

![](84.png)

![](85.png)

混合效果。

![](86.png)

HB 的一些特点。

![](87.png)

![](88.png)

使用 HB 的时候对 Surface 会造成一定影响（修改其高度）。

![](89.png)

比如这张图，Height Blending 中的高度参数会对 Height Field 再进行一次修改。

![](90.png)

在使用 Height Blending 的情况下，搜索交点的这个过程会使用混合的结果来替代原本需要采样的高度，这时候使用顶点色来保存 Weight 会出现 Artifacts，想要得到正确的结果需要使用纹理来保存 Weight，这个应该大部分游戏都是这么做的。

![](91.png)

示意图。

![](92.png)

依靠距离的预处理数据，比如 DF、CSM，都不能在没有预计算的情况下跟 Blend Weights 搭配使用。依靠深度的预处理数据可以跟 Weights 配合使用。

![](93.png)

整了个 CQDM 来跟 HB 配合。

![](94.png)

QDM 和 HB 搭配使用的一些好处。

![](95.png)

展示。

![](96.png)

性能测试。

![](97.png)

![](98.png)

![](99.png)

效果对比。

![](100.png)

![](101.png)

![](102.png)

![](103.png)

![](104.png)

一些总结，还有一张效果图 ...... 

---

主要有价值的内容在于 Self-Shadowing 那部分，不过这部分是 POM 论文里就已经提出来的东西，只是 QDM 的 Tracing 相较于 POM 的 Tracing 对于小于 Step 的 Surface 更友好，POM 的 Self-Shadowing 可能对于这种的就直接跳过了。
