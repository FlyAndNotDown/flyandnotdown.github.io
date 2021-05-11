---
title: "用 Visual Studio Code 打造优雅的 Markdown 编辑环境"
description: "使用 Visual Studio Code + Markdown Preview Enhanced 可以创造一套优雅的 Markdown 编辑环境，用这套环境写出好看的文档吧！"
date: "2019-10-12"
slug: "19"
categories:
    - 技术
tags:
    - VSCode
    - Markdown
---

# 🍜 预备知识

`Visual Studio Code (VSCode)` 是微软推出的一款开源编辑器，使用 `Electron` 打造，与 `Atom` 齐名，不过随着 `Atom` 社区的渐渐缩小，`VSCode` 的影响力开始越来越大了。`VSCode` 内置了 `Markdown` 语言及预览的支持，很适合用于编辑 `Markdown` 文档。

`Markdown` 是一种标记语言，可以在写文档的同时，通过添加一些特殊标记，快速完成文档的排版，很多程序员都喜欢使用 `Markdown` 来写文档，另外，`github` 也使用 `Markdown` 作为仓库 `README` 的标准语言，可以说是写技术文档的首选方案。关于 `Markdown` 的语法，可以在这里学习：[菜鸟教程 - Markdown 教程](https://www.runoob.com/markdown/md-tutorial.html)

# 🍨 搭建环境

首先当然是下载安装 `VSCode` 啦，官网在 [Visual Studio Code](https://code.visualstudio.com/)，一路安装即可，完成安装之后，打开 `VSCode` 界面如下:

![VSCode UI](12.png)

为了更好的编辑体验，我们可以先安装配色 `One Dark Pro`，这款配色沿袭自 `Atom`，是公认的比较舒服的几套配色之一，在侧边栏中的插件栏中搜索 `One Dark Pro` 并下载:

![Plugins](13.png)

完成安装之后，在顶部工具栏中依次点击 `File -> Preference -> Color Theme`，选择 `One Dark Pro`，即可看到效果：

![One Dark Pro](14.png)

之后我们需要配置一款舒适的字体，这里推荐 `Fira Code`，下载地址如下：[Fira Code](https://github.com/tonsky/FiraCode)，下载 `TTF` 字体并安装即可，之后在 `File -> Preference -> Settings` 中依次更改这几项：

* `Font Size`: `14`
* `Font Family`：`'Fira Code', Consolas, 'Courier New', monospace, 微软雅黑`
* `Font Ligatures`：`true`

完成这几步之后，即可安装我们的核心插件 `Markdown Preview Enhanced`，参考之前的步骤：

![Markdown Preview Enhanced](15.png)

这样就完成了 `Markdown` 写作环境的搭建。

# 🍳 写作示例

如果要开始写作，首先要创建一个文件夹作为工作区，在想要的位置创建一个项目文件夹，这里我建的项目名叫 `MarkdownProject`：

![Markdown Project](16.png)

右键 `MarkdownProject` 并点击 `Open With Code`，这样可以直接用 `VSCode` 打开项目文件夹。

点击如下两个按钮可以创建文件和文件夹：

![Create File & Folder](17.png)

我们在项目根目录下创建一个目录叫做 `img`，接着在根目录下创建一个文件 `xx.md`，`img` 目录的作用是在本地存放图片，而 `.md` 文件则是文档的源文件，完成创建之后，即可在其中使用 `Markdown` 语法进行写作了：

![Project](18.png)

如果需要添加图片，推荐的做法是将图片存放到 `img` 路径下，并在 `.md` 文档中使用相对路径的形式引用：

```markdown
![xx picture](./img/xx.png)
```

编辑的同时可以点击：

![Example](19.png)

注意不要点击另外一个类似的按钮，红框中的按钮是 `Markdown Preview Enhanced` 插件提供的优化版预览，而另一个是 `VSCode` 原生提供的预览，效果不敢恭维，点击预览之后，即可在书写文档的同时看到效果。

最后如果需要导出文档，则只需要在预览栏中点击右键：

![Export](20.png)

这里有很多种支持的格式，其中推荐使用 `eBook` 中的 `HTML` 格式，这样导出的文档不需要将图片打包一起带走，而是直接将图片使用内置编码放在文档中。另外，如果导出成 `PDF` 的话可能会出现分页问题，由于 `Markdown` 本身的原理就是转换成 `HTML` 渲染，再加上 `Markdown` 也是流式文档，`HTML` 将会是最好的导出格式。导出的文档可以在 `.md` 的同路径下找到。

# 😎 最后说几句

写得多才能写得好，多写文档，养成良好的习惯，文档写的越漂亮，才越会想写 🤣。希望各位能越写越好 👏
