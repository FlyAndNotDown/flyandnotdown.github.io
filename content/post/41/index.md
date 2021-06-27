---
title: "Conventional Commits 介绍"
description: "Conventional Commits 是一套 git commit message 的规范，目前来看这套标准已经被越来越多的人接纳了，这里给大家介绍一下，同时也作为之后自己按照标准写提交信息的一个备忘。"
date: "2021-06-27"
slug: "41"
categories:
    - 技术
tags:
    - git
keywords:
    - git
    - conventional
    - commits
---

# 介绍

![Conventional Commits](1.png)

Conventional Commits (下称 CC) 是一套 git commit message 的规范，旨在让 commit message 能同时被人类和机器所接纳，也就是说满足可读性的同时增强规范性，它的官网在这里: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)。

目前来看 CC 标准已经被越来越多的人所接受，很多开源项目也积极采纳并推广这套标准（比如 [Ant-Design](https://github.com/ant-design/ant-design/commits/master)、[NaiveUI](https://github.com/TuSimple/naive-ui/commits/main)）。

实话说我之前经常看到过这种 commit message 的写法，但是我还真不知道这种写法有一套专门的标准，偶然间逛 GitHub 发现了这个，决定好好学习一下，这样能帮助自己更好地融入开源社区。

# 规范详解

CC 规范最重要的莫过于 git commit message 的格式：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

按照这种写法的优点在于 git 历史记录会相当规范，这很适合一些自动化工具去解析、生成这些提交信息，同时又不失可读性。

其中 `type` 字段用于传达本笔提交大致的内容：

* `fix` 表示提交用于修复 bug
* `feat` 表示提交用于添加新功能
* `build` 表示提交修改了构建系统或者外部依赖
* `ci` 表示提交修改了持续构建、持续部署配置或脚本
* `docs` 表示提交修改了文档
* `perf` 表示提交进行了性能优化
* `refactor` 表示提交进行了重构
* `style` 表示提交修改了代码格式问题
* `test` 表示提交添加或修改了测试用例
* `BREAKING CHANGE` 表示提交进行了不兼容修改，需要在脚注中使用

`type` 字段后面还可以跟上 `scope` 以表示更精确的行为，如 `feat(parser): add ability to parse arrays`。

`description` 字段是本次提交的概述，`optional body` 和 `optional footer(s)` 字段是可选的具体描述和脚注。

另外，还可以使用 `!` 来取代 `BREAKING CHANGE` 来表示不兼容修改。

# 示例

最简单的例子：

```
docs: correct spelling of CHANGELOG
```

带 `scope` 的例子：

```
feat(lang): add polish language
```

`!` 表示不兼容修改：

```
refactor!: drop support for Node 6
```

`BREAKING CHANGE` 表示不兼容修改：

```
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

`!` 和 `BREAKING CHANGE` 同时使用：

```
refactor!: drop support for Node 6

BREAKING CHANGE: refactor to use JavaScript features not available in Node 6.
```

一个完整的例子：

```
fix: correct minor typos in code

see the issue for details

on typos fixed.

Reviewed-by: Z
Refs #133
```

# 更多规范

CC 规范还有一些明文条例，具体参考 [Specification](https://www.conventionalcommits.org/en/v1.0.0/#specification)
