---
title: "Ubuntu18 搭建 GTK 开发环境"
description: "GTK 是在 Linux 下使用 C 语言构建图形界面的一个库，它与 GNOME 有着不可分割的关系。本文将介绍 GTK 在 Ubuntu18 下的开发环境搭建方法。"
date: "2018-05-18"
slug: "9"
categories:
    - 技术
tags:
    - Linux
    - Ubuntu
    - GTK
keywords:
    - ubuntu
    - gtk
---

# 📦 Ubuntu18 下 Gtk 开发环境搭建
`GTK` 是在 `Linux` 下使用 `c` 语言构建图形界面的一个库，它构建的图形界面是基于 `GNOME` 运行的。

`Ubuntu18` 已经回归到了主流 `Linux` 桌面 `GNOME` 上，所以我们搭建 `GTK` 开发环境的时候，不需要再额外安装 `GNOME` 了。

至于 `GTK` 的安装，你首先需要安装编译工具：

```
sudo apt-get install build-essential
```

`GTK` 现在有两种版本，`2` 和 `3`，可以使用如下指令同时安装两个版本:

```
sudo apt-get install gnome-core-devel
```

接下来还要安装 `pkg-config` 用于自动查找 `GTK` 的头文件位置：

```
sudo apt-get install pkg-config
```

完成之后你可以使用官方给出的示例来测试是否能够运行，[Getting Started With GTK+](https://developer.gnome.org/gtk3/stable/gtk-getting-started.html)

编译指令如下：

```
gcc main.c -o main `pkg-config --cflags --libs gtk+-3.0`
```

完成之后即可打开可执行文件运行查看效果

