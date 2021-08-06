---
title: "C++ 模板黑魔法 —— 编译期序列与 std::tuple 遍历"
description: "不定期更新的 C++ 模板黑魔法系列"
date: "2021-08-06"
slug: "45"
categories:
    - 技术
tags:
    - C++
keywords:
    - c++
    - 模板
    - tuple
---

# 编译期序列

最近看到一个很有意思的模板写法：

```cpp
template <size_t... S>
struct IndexSequence {};

template <size_t N, size_t... S>
struct IndexSequenceMaker : public IndexSequenceMaker<N - 1, N - 1, S...> {};

template <size_t... S>
struct IndexSequenceMaker<0, S...> {
    using Type = IndexSequence<S...>;
};

template <size_t N>
using MakeIndexSequence = typename IndexSequenceMaker<N>::Type;
```

乍一看啥玩意儿，仔细看会发现它的作用是生成一个编译期序列，如：

```cpp
// IndexSequence<0, 1, 2, 3, 4>
MakeIndexSequence<5>
```

它的实现非常巧妙，我们以上面这个例子为切入点，按照它的思路去展开模板：

```cpp
template <>
struct IndexSequenceMaker<0, 0, 1, 2, 3, 4> {
    using Type = IndexSequence<0, 1, 2, 3, 4>;
}

template <>
struct IndexSequenceMaker<1, 1, 2, 3, 4> : public IndexSequenceMaker<0, 0, 1, 2, 3, 4> {}

template <>
struct IndexSequenceMaker<2, 2, 3, 4> : public IndexSequenceMaker<1, 1, 2, 3, 4>;

template <>
struct IndexSequenceMaker<3, 3, 4> : public IndexSequenceMaker<2, 2, 3, 4>;

template <>
struct IndexSequenceMaker<4, 4> : public IndexSequenceMaker<3, 3, 4>;

template <>
struct IndexSequenceMaker<5> : public IndexSequenceMaker<4, 4> {}

template <>
using MakeIndexSequence<5> = typename IndexSequenceMaker<5>::Type;
```

秒懂了，利用继承关系来传递不断生成的序列可变参，最后以 `N = 0` 的特化来终止生成。

# 使用编译期序列来做 std::tuple 遍历

编译期序列最大的作用就是用于 std::tuple 的遍历，下面是一段 c++ 11 的代码：

```cpp
template <size_t... S>
struct IndexSequence {};

template <size_t N, size_t... S>
struct IndexSequenceMaker : public IndexSequenceMaker<N - 1, N - 1, S...> {};

template <size_t... S>
struct IndexSequenceMaker<0, S...> {
    using Type = IndexSequence<S...>;
};

template <size_t N>
using MakeIndexSequence = typename IndexSequenceMaker<N>::Type;

template <typename T, typename F>
void ForEachTuple(T&& tuple, F&& consumer)
{
    ForEachTupleInternal(std::forward<T>(tuple), std::forward<F>(consumer), MakeIndexSequence<std::tuple_size<T>::value> {});
}

template <typename T, typename F, size_t... S>
void ForEachTupleInternal(T&& tuple, F&& consumer, IndexSequence<S...>)
{
    std::initializer_list<int> { (consumer(std::get<S>(tuple)), 0)... };
}

struct Consumer {
    template <typename T>
    void operator()(T&& value)
    {
        std::cout << value << std::endl;
    }
};

int main(int argc, char* argv[])
{
    ForEachTuple(std::make_tuple(1, 2.1, "Hello"), Consumer {});
    return 0;
}
```

代码很简单，这里要注意的就是 `std::get<>()` 和 `...` 的配合来不断消费 `std::tuple` 的元素，最后用 `std::initializer_list<int>` 来接收可变参防止编译错误。

值得一提的是，c++ 14 已经内置了编译期序列，如果项目能支持到 c++ 14，则可以直接这么写：

```cpp
template <typename T, typename F>
void ForEachTuple(T&& tuple, F&& consumer)
{
    // c++ 14 的 make_index_sequence
    ForEachTupleInternal(std::forward<T>(tuple), std::forward<F>(consumer), std::make_index_sequence<std::tuple_size<T>::value> {});
}

template <typename T, typename F, size_t... S>
void ForEachTupleInternal(T&& tuple, F&& consumer, std::index_sequence<S...>)
{
    std::initializer_list<int> { (consumer(std::get<S>(tuple)), 0)... };
}

int main(int argc, char* argv[])
{
    // c++ 14 的 lambda 中 auto 作为参数
    ForEachTuple(std::make_tuple(1, 2.1, "Hello"), [](const auto& value) -> void { std::cout << value << std::endl; });
    return 0;
}
```
