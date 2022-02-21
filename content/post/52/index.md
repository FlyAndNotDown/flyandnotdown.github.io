---
title: "GDC 笔记 - Terrain Rendering in 'Far Cry 5'"
description: "育碧 Far Cry 5 地形渲染的 Talk。"
date: "2022-02-21"
slug: "52"
categories:
    - 技术
tags:
    - GDC
keywords:
    - ubi
    - far cry 5
    - terrain
    - rendering
---

> 原文链接：[GDC Vault - Terrain Rendering in 'Far Cry 5'](https://www.gdcvault.com/play/1025480/Terrain-Rendering-in-Far-Cry)

![](1.png)

地形 Heightfield 渲染。

![](2.png)

地图大小是 10km x 10km，分辨率 0.5m，地形按照四叉树管理，整个地形被划分成 2km x 2km 的地块，这些地块永久可见。

![](3.png)

上面说的 2km x 2km 的地块被按照四叉树划分成很多 Tile，这些 Tile 按照 LOD 以及与玩家的距离进行 Steaming，磁盘上存储的 Tiles 数量上万，但是实际上运行时加载进内存的 Tiles 数量大概在 500 左右。

![](4.png)

所有四叉树节点所需要的 Textures 会同步被 Streaming 进 Texture Atlases，节点中会记录对应 Atlases 中的位置。纹理格式：

- Heightmap: R16_UNORM, 129x129
- World space normal map: BC3, 132x132
- Baked albedo map: BC1, 132x132

![](5.png)

地形的渲染大概这么几步。

![](6.png)

首先是四叉树节点的 Streaming，首先在 LOD0 找到离玩家最近的一圈节点。

![](7.png)

切换到下一级 LOD，按更大范围找四叉树中对应的节点。

![](8.png)

以此类推，直到最后一级 LOD，前面说到了，最后一级 LOD 对应的四叉树节点是永远被加载的。这里只演示了 3 级 LOD，实际上 Far Cry 5 里有 6 级。

![](9.png)

![](10.png)

最后组合起来，就是需要 Streaming 的所有节点。

![](11.png)

![](12.png)

然后需要按照视角做剔除。

![](13.png)

接下来需要按照离相机的距离做一次 Batch，同一组的节点使用相同的 Shader，距离越远，使用的 Shader 越简单。

![](14.png)

![](15.png)

上面的渲染流程可以用 CPU 实现，也可以走 GPU-Driven 路线，区别就是下面这部分在哪做。

![](16.png)

GPU-Driven 的优势，BalaBala ......

![](17.png)

需要的 GPU 数据结构及特点。

![](18.png)

四叉树对应的 GPU 实现就是带 Mips 的纹理，Terrain Quad Tree 也是一样，是一张 160x160 的纹理，整个纹理有 6 级 Mips，每个节点对应纹理中的一个 Texel。

![](19.png)

Terrain Quad Tree 纹理的格式是 R16_UINT，存的是 16 位的 Index，用于索引保存在 Node Description Buffer 的真正的节点数据，Node Description Buffer 中的每个节点数据保存了 Min/Max Height、LOD Bias、Atlas ID 等信息，最终按位编码成 2 个 Uint。

![](20.png)

每当节点 Streaming In / Out 的时候，需要对 Node Description Buffer 里的数据进行填充 / 移除。

![](21.png)

Terrain Node List 就是一个节点 Id 的列表，表示可能被渲染的节点（剔除前）。Terrain Node List 需要每一帧遍历 Terrain Quad Tree 来生成。

![](22.png)

Terrain Node List 的生成使用 Compute Shader，分为多个 Stage，每个 Stage 处理一级 LOD，每个 Stage 中由一个线程来处理当前 LOD 的一个节点，将其划分成子节点，填充到 Terrain Node List 中。

![](23.png)

Terrain Node List 的初始状态是用 LOD 0 计算，直接根据当前 Terrain Quad Tree 的 Mip 0 计算出一组 NodeID。

![](24.png)

![](25.png)

![](26.png)

![](27.png)

进入下一个 Stage，读取上一个 Stage 的结果（Temp A），构造两个新的 Buffer，Temp B 和 Final，如果上一级 Mip 中的节点可以被细分（在这一级 Mip 中四个子节点被完全加载）就将其细分成 4 个节点，并存入 Temp B，如果不能被细分就直接放入 Final。

![](28.png)

有些节点的子节点没有被完全加载，这种也直接放入 Final。

![](29.png)

![](30.png)

![](31.png)

![](32.png)

清空 Temp A，交换一下 Temp A 和 Temp B 的角色，进入下一个 Stage。

![](33.png)

以此类推完成 Terrain Node List 的生成。每个 Pass 对应一个 Stage，每个 Pass 需要两次 Compute Shader 的 Dispatch，因为需要统计每个 LOD 中节点的数量，来 Feed 下一个 Pass。

![](34.png)

每一帧都要计算一个 160x160 的 Terrain LOD Map 纹理，格式为 R8，每个 Texel 代表一个 Sector，保存了这个 Sector 对应的 LOD。这张纹理的作用是用于处理不同 LOD 之间的接缝。这里有些部分为 0 是因为 Sector 为空，不是 LOD 0。

![](35.png)

![](36.png)

计算 Terrain LOD Group 的方法也很简单，拿着 Terrain Node List 直接照填就行了。

![](37.png)

最后是 Visible Render Patch List，由一个 Indirect Args 和一组 Patch 构成，Patch 里保存了 Draw 所需要的信息。最终下发 DrawCall 后每个 Patch 会被渲染成一个 16x16 的 Grid。Visible Render Patch List 的生成就是拿着 Terrain Node List 继续做细分与剔除，最终完成。

![](38.png)

每个节点会被细分成 8x8 个 Patch，每个 Patch 会被渲染成 16x16 的 Grid。每个 Compute Shader 线程负责处理一个 Patch，其中每个 Patch 都要做视椎体剔除、遮挡剔除、背面剔除、计算 LOD 过渡。

![](39.png)

Culling 的步骤与 SIGGRAPH 2015 的一篇文章 GPU-Driven Rendering Pipelines 里面介绍的类似。

![](40.png)

遮挡剔除用的是一个低分辨率的深度 Buffer，即 Conservative Depth，主机上和 PC 上的来源不同。

![](41.png)

生成 Mips 来适应不同大小的物体。

![](42.png)

对每一个 Patch，首先要拿到它的包围盒，然后投影到屏幕空间，在级联 Mips 中找到覆盖了这个范围的采样点，然后进行保守的剔除。

![](43.png)

背面剔除需要离线生成一张 8x8 BC3 的 Patch Cone Texture，每个节点 Build 一张这个纹理。对每一个 Patch，先对每一个三角形找到其 World Space 下的 Normal，然后对这些 Normal 在球面空间计算出一个最小的圈，从而形成一个 Cone。Cone 最终体现成中心的一根 Normal 向量和一个半角，被保存到 Patch Cone Texture 的一个 Texel 中。

![](44.png)

对每一个 Patch，按照上面的公式来计算是否要被剔除，保守起见，不光要拿相机方向做这个判断，还需要拿相机到 Patch 四个角的四个向量做计算，防止误剔除。

![](45.png)

每个 Patch Description 中包含了一个 LOD Transitions 信息，这个信息是当前 Patch 四个方向上与相邻 Patch 的 LOD 差值，由采样 LOD map 得到。

![](46.png)

上面这些步骤的计算时间。

![](47.png)

Vertex Shading。

![](48.png)

不同 LOD Mesh 之前需要额外处理接缝。

![](49.png)

![](50.png)

![](51.png)

![](52.png)

![](53.png)

前面已经说过 Patch 中保存了相邻 Patch 的 LOD 差值，可以利用这一点来进行处理。上面几张图是 LOD 差值为 1 的情况，两个顶点一组，把第二个顶点直接移动到第一个顶点的位置，从而达到过渡的目的。

![](54.png)

![](55.png)

![](56.png)

差值为 2 的情况下，一次处理四个顶点，后三个顶点全部移动到第一个顶点的位置。

![](57.png)

Far Cry 5 里有地形挖洞的需求，实现是存了 1Bit 的挖洞数据在 BC1 的 Atlas Albedo Map 里。

![](58.png)

通过在 Vertex Shader 里输出 NaN 来完成 Vertex 的 Cull，号称这样更省点。

![](59.png)

![](60.png)

干掉一个点会影响周围 8 个点，所以开洞的分辨率是地形分辨率的一半，即 1M。

![](61.png)

Shading，主要讲地表渲染。

![](62.png)

Terrain Shading 跟 2017 GDC 上的 Ghost Recon 分享类似。

![](63.png)

之前说的 Terrain Quad Tree 是带着 Texture Payload 的，他们分别是 Height、Normal、Albedo、Patch Cone Map、Color Modulation Map、Splat Map。

![](64.png)

远处的 Shading 可以直接用 Normal、Albedo 搞定，近处的用 Splat Map（就是我们常说的 IdMap）。Splat Map 保存了一个 8-Bit 的 Id，索引了 Material Buffer 中的一个单位，里面保存了地表的 Albedo、Normal、Height 等纹理在 Texture Array 中的索引，以及 Rotation、Tiling、Burning 等一些其他参数。

这里要注意的是 Splat Map 的位宽是 8，意味着最多可以有 256 种地表材质，但是这些材质的纹理是不可能全部加载进内存的，这些地表材质的纹理会动态地被拼成 32 层的 Texture Array 加载进内存，然后再按照 Material Buffer 中保存的 Id 进行索引，所以这意味着一个地形节点最多使用 32 种地表材质。

![](65.png)

经典的 IdMap 地表渲染，先拿 World Position 算 UV，然后采样 Splat Map 找到材质参数，然后采样 Texture Array 完成渲染。

![](66.png)

IdMap 算法使用的是双线性插值，所以一个点需要进行 4 次 Splat Map 的采样，然后还要采 3x4 次 Texture Array，所以最终是 16 次采样。

![](67.png)

16 次采样还是略微昂贵了点，Far Cry 5 也像 Far Cry 4 一样用了 Virtual Texture（对应 UE 里的 Runtime Virtual texture）来缓存。

![](68.png)

一些参数信息。

![](69.png)

可以把采样数降低到 4 次（不算 Physical Texture 更新）。

![](70.png)

一些 Physical Texture Page 渲染的参数，一帧计划最多更新 6 个 Page。每个 Page 大小为 256x256 Texel，还有 4 Texel 的 Border。跟主流做法一样，还会用 Compute Shader 做一次 BC 格式的异步压缩，最终算下来 GPU 开销大概是每帧 1ms。

![](71.png)

为了计算哪些 Page 需要更新，回读 PageId 到 CPU 是必不可少的，为了保持速度够快，限制了 RT 的大小。

![](72.png)

使用 VT 的一大好处就是方便多种材质混合，上图中就有 Road、Decal、Terrain 几种材质。

![](73.png)

这是一个 Overdraw 的可视化，可以看到 decal 的开销还行。

![](74.png)

崖壁的渲染。

![](75.png)

老生常谈的崖壁渲染，上面标记成红色的就是崖壁。通常地形的相关纹理都是从俯视角拍的，UV 坐标对应的都是 World Position 的 (x, y)，而崖壁这种地貌在地形的纹理上对应的 Texel Resolution 就很小，这就会导致问题。

![](76.png)

去掉 Debug Draw 后的效果，看起来就很糟糕，拉伸得很严重。

![](77.png)

处理的办法是比较经典的 Tri-Planar Mapping，即使用世界坐标 xy、xz、yz 在三个投影方向上代替 UV 进行采样，然后再使用 Normal 对这三次采样结果进行混合。图中标记成红色和蓝色的崖壁是按照 x 轴、y 轴投影的结果。

![](78.png)

这会导致采样数变成原来的三倍，这种做法是比较 Expensive 的。

![](79.png)

另外一个问题就是崖壁通常离玩家比较远，一旦离远了，纹理的 Tiling 就会变得很明显，看起来重复度会很高。

![](80.png)

去掉 DebugDraw 之后的效果，还是比较明显的。

![](81.png)

做法是调整 UV Space 使其在 Screen Space 中分配更均匀，后面说了实际上是依靠离相机的距离对 Tiling 进行调整。

![](82.png)

调整之后的效果。

![](83.png)

因为依赖距离进行调整，要对材质做一次 Blend，又导致采样翻倍了。

![](84.png)

一些 Cheaper 的崖壁替代方案以及问题。

![](85.png)

团队想到一种 Crazy 的方案，使用随机 Blending 替代 Alpha Blending，从像素级别上看，随机 Blending 效果是不对的，但是平均来看，是大致正确的。

![](86.png)

于是崖壁的 Shading 就不再每个像素都采多次 Splat Map 了，而是每个像素随机选择，然后只采一次 Splat Map，采样数直接降低到 4，但是效果不太行。

![](87.png)

Noise Function 的选择会直接决定质量，无论是 Screen Space 还是 World Space 的 Noise Function，都有优劣。

![](88.png)

最终选了 NVIDIA 的一篇论文中的算法。

![](89.png)

但是不幸的是噪点还是太多了，于是团队开始尝试将随机 Blending 和 Alpha Blending 结合起来。

![](90.png)

对于远处的崖壁，有前面说的 Tiling 的问题，所以就按之前说的，在两个材质中各随机一次，然后再做 Alpha Blending，这样采样数就变成了 8。

![](91.png)

DebugDraw 下看，其实还是有噪点的。

![](92.png)

但是关了 DebugDraw 之后，感觉可以接受。

![](93.png)

考虑到崖壁接近相机的情况，在这个距离下，其实不需要下面的材质混合，但是随机选一个方向作为最后的结果效果不太行，所以还是做了完整的 Tri-Planar 混合。

![](94.png)

这里采样数应该写反了，应该是近处 12，远处 8。

![](95.png)

实测下来没发现太大的问题，但是依然不完美。这种随机 Blending 中的任何噪点带来的变化实际上都是材质的变化（Splat Map 采的是 Material Id），拉近了看实际上是能看见材质的细微变化的。

![](96.png)

地形之外的一些东西，主要是贴花和地形相关的 Mesh。

![](97.png)

Far Cry 5 的贴花系统是基于 VT 的，团队改进了这套贴花系统，并称其 Terrain Displacement Decals。就是在传统 VT 贴花的基础上，加了贴花对地形 Mesh 的影响。

![](98.png)

放置贴花的时候，贴花 Mesh 会附着在地形上，Pixel Shader 阶段直接采地形的 VT 就可以了，因为贴花的纹理已经被画在 VT 上了。

![](99.png)

![](100.png)

Displacement Mesh 还没开的时候，其实就能看见传统 VT 贴花的效果了，只是开了之后贴花物体的形状会更加清晰（好像看不出来 ......）。

![](101.png)

优缺点，主要缺点是由于不是 Tessellation，所以需要人摆，当然也可以程序化生成。

![](102.png)

![](103.png)

崖壁会走程序化生成管线生成 Mesh，看起来会比高度图渲染的崖壁更真实。

![](104.png)

![](105.png)

另一个例子。

![](106.png)

屏幕空间 Shading。

![](107.png)

整个屏幕空间通常能看见的东西有这么几种，每一种都是不同的 Shading Flavors。因为彼此需要混合，最终有 31 种 Shader 变体。有一些 Shader 变体的开销会比其他的 Expensive 很多，为了保持 GPU 效率，需要保证对每一块地形都使用 Cheapest 的 Shader 变体。

![](108.png)

最简单的方法就是根据 Patch 选择 Shader ID，但是这种做法并不一定最优因为 Patch 的范围其实还挺大的。

![](109.png)

最终决定按屏幕空间的 Tile 来进行 Shader ID 的选择。

![](110.png)

在 Geometry  Pass 中使用 MRT 输出一张 8Bit 的 Classification RT，其中保存了 5 种 Shading Flavors 的 Bitmask。

![](111.png)

接下来是一个 Full Screen 的 Compute Pass 被称为 Terrain Classification Pass，读取前面的 Classification RT，按照 8x8 的 Tile 来合并具有相同 Shader Id 的 Tile，并输出 Indirect Args 给下一步使用。

![](112.png)

然后就是渲染 G-Buffer。

![](113.png)

整套流程的 Overview。

![](114.png)

采样 Terrain 纹理的过程是先从深度 Buffer 中取出 World Position，然后通过 Terrain Sector Data 来获取具体的纹理信息。

![](115.png)

Terrain Sector Data 是一个 160x160 的 64Bits 的 Buffer，对应 160x160 Sectors，每一个单元保存了这个 Sector 需要的 Atlas Texture Ids，拿 World Position 在 Buffer 里找就能拿到对应信息。

![](116.png)

在 Shading Pass 需要用到 Texture 导数（类似 ddx、ddy？只不过是 Texture 空间的）。因为地形相关的纹理的 UV 其实都是 World Space Position 的线性映射，所以只要求出 World Space Position 的导数，就可以求出 Texture 导数。

![](117.png)

对于屏幕空间的像素（x, y），先从深度获取 World Space Position，然后拿到 World Space Normal，用拿到的 Normal 构建一个平面，拿着相机到像素（x, y+1）的射线与平面求交，交点就是屏幕空间 World Space Position 在 y 方向上的导数，同理，拿 （x+1, y）来求 x 方向上的导数。

![](118.png)

刚刚说过崖壁等会替换成特定的 Mesh，这种情况下就不再适用了。

![](119.png)

解决方法是在 Terrain Geometry Pass 中用 MRT 输出一张 Normal 纹理。

![](120.png)

然鹅 Normal 会被插值，插值之后可能就不对了。

![](121.png)

解决方法是把三角形的 Normal 也输出到 RT 里，然后把两个 Normal 编码到 32Bit 里，每个 Normal 16 Bits。

![](122.png)

最终流程。

![](123.png)

优缺点。

![](124.png)

性能。

![](125.png)

一些基于地形的效果。

![](126.png)

回顾下前面的 Terrain Scetor Data，只要有 World Position，就可以拿到地形上任意一个点对应的纹理信息（Height、Albedo、Normal、Splat 等）。

![](127.png)

![](128.png)

其中一个作用就是在树根的 Shading 里，可以在 Vertex Shader 中采样地形的高度图来做与地表的混合。

![](129.png)

![](130.png)

碎石也用了类似的处理。

![](131.png)

最后一级 LOD 的草也用了地形高度图，比较近的草需要比较高的渲染精度，但是离远了就直接换成与地形高度、颜色匹配的 Quads。

![](132.png)

![](133.png)

这些草的生成是使用 Compute Shader 在每一帧去采样地形材质的类型、Height、Color、Normal 等，然后生成 Indirect Args，最后一次 Indirect Draw 完成绘制，可以看到开关后的对比。

![](134.png)

![](135.png)

总结。
