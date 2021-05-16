---
title: "醒醒吧，静态多态根本没有这么香"
description: "在尝试过使用 CRTP 实现静态多态之后的一点感悟。"
date: "2021-05-16"
slug: "39"
categories:
    - 技术
tags:
    - CPP
---

# CRTP

CRTP 全称 Curiously Recurring Template Pattern，即**奇异递归模板模式**，是一种经典的 C++ 设计模式，听起来很反人类，我们先来看一段代码：

```cpp
#include <iostream>

template <class T>
class Base {
public:
    void Foo()
    {
        static_cast<T*>(this)->FooImpl();
    }
};

class Child1 : public Base<Child1> {
public:
    void FooImpl()
    {
        std::cout << "hello1" << std::endl;
    }
};

class Child2 : public Base<Child2> {
public:
    void FooImpl()
    {
        std::cout << "hello2" << std::endl;
    }
};

template <class T>
void Print(Base<T>& base)
{
    base.Foo();
}

int main(int argc, char* argv[])
{
    Child1 child1;
    Child2 child2;
    Print(child1);
    Print(child2);
}
```

这是一个 CRTP 的典型使用场景 —— 静态多态，其实很容易理解，如果需要在编译期让父类的某个方法调用子类的方法，那必然需要让父类能够感知到子类的类型信息，因为你需要将 this 指针转换成子类指针才能调用对应方法。

看起来相当美好，因为**让编译器打工可以省去运行时的开销**，这里很明显就是使用构建时间去换取虚函数表的开销。但我想说的是，静态多态是个伪命题。

# 模板的传染性

我之所以说静态多态是伪命题，是因为从本质上来看，静态多态其实不能算作真正的多态，其实从某种意义上来说，只是让编译期帮你 Hard Code 而已~

注意上面我写的那段代码：

```cpp
template <class T>
void Print(Base<T>& base)
{
    base.Foo();
}
```

我为什么需要使用一个模板方法来做 `Base::Foo()` 的调用？很明显是因为虽然 `Child1` 和 `Child2` 同源自 `Bsae<T>`，但实际上他俩的基类完全是不同类型！

```cpp
class Child1 : public Base<Child1> {}

class Child2 : public Base<Child2> {}
```

既然是不同类型，那么我就无法将内存从父类和子类之间自由转换，也就无法完成传统意义上的多态。

解决办法是什么呢，很简单，就是再加一个方法，把它的入参也变成模板，然后在入参处加上限定符，完成类似 Concept 的概念，这就是我说的模板的传染性，**一旦你采用模板来构建你的代码，那么你就要做好从头到尾都使用模板的准备**。

其实这一特点单单影响方法还好，模板方法不嫌多，但是如果我想要使用静态多态实现的类有多层继承关系呢？看看下面这段代码：

```cpp
#include <iostream>

template <class T>
class Base {
public:
    void Foo()
    {
        static_cast<T*>(this)->FooImpl1();
    }
};

template <class T>
class Middle : public Base<Middle<T>> {
public:
    void FooImpl1()
    {
        static_cast<T*>(this)->FooImpl2();
    }
};

class Child1 : public Middle<Child1> {
public:
    void FooImpl2()
    {
        std::cout << "hello1" << std::endl;
    }
};

class Child2 : public Middle<Child2> {
public:
    void FooImpl2()
    {
        std::cout << "hello2" << std::endl;
    }
};

template <class T>
void Print(Base<Middle<T>>& obj)
{
    obj.Foo();
}

int main(int argc, char* argv[])
{
    Child1 child1;
    Child2 child2;
    Print(child1);
    Print(child2);
}
```

我 TM 打个 hello 都嵌套两层模板了 ...... 我为什么不用虚函数表呢？

# 总结

模板很好，是 C++ 元编程的基石，在写基础库的时候非常实用，而且让编译期打工能大大减少运行时开销，但是模板的传染性是一个大问题，类型的缺失会不断传染，在设计时需要提前考虑，在合适的场景使用合适的设计。
