---
title: "MSVC std::unique_ptr 源码解析"
description: "MSVC C++ STL 源码解析系列"
date: "2021-09-25"
slug: "48"
categories:
    - 技术
tags:
    - CPP
    - STL
    - Source
keywords:
    - c++
    - stl
    - unique_ptr
    - 源码
---

# 介绍

`std::unique_ptr` 是 c++ 11 添加的智能指针之一，是裸指针的封装，我们可以直接使用裸指针来构造 `std::unique_ptr`：

```cpp
struct TestStruct {
    int a;
    int b;
};

class TestClass {
public:
    TestClass() = default;
    TestClass(int a, int b) : a(a), b(b) {}

private:
    int a;
    int b;
};

std::unique_ptr<int> p0 = std::unique_ptr<int>(new int { 1 });
std::unique_ptr<TestStruct> p1 = std::unique_ptr<TestStruct>(new TestStruct { 1, 2 });
std::unique_ptr<TestClass> p2 = std::unique_ptr<TestClass>(new TestClass(1, 2));
```

在 c++ 14 及以上，可以使用 `std::make_unique` 来更方便地构造 `std::unique_ptr`，参数列表需匹配创建对象的构造函数：

```cpp
std::unique_ptr<int> p0 = std::make_unique<int>(1);
std::unique_ptr<TestStruct> p1 = std::make_unique<TestStruct>(TestStruct { 1, 2 });
std::unique_ptr<TestClass> p2 = std::make_unique<TestClass>(1, 2);
```

除了保存普通对象，`std::unique_ptr` 还能保存数组，这时 `std::make_unique` 的参数表示数组的长度：

```cpp
std::unique_ptr<int[]> p0 = std::make_unique<int[]>(1);
std::unique_ptr<TestStruct[]> p1 = std::make_unique<TestStruct[]>(2);
std::unique_ptr<TestClass[]> p2 = std::make_unique<TestClass[]>(3);
```

`std::unique_ptr` 重载了 `operator->`，你可以像使用普通指针一样使用它：

```cpp
std::unique_ptr<TestStruct> p = std::make_unique<TestStruct>(TestStruct { 1, 2 });
std::cout << "a: " << p->a << ", b: " << p->b << std::endl;

// 输出：
// a: 1, b: 2
```

当然，直接使用 `nullptr` 对其赋值，或者拿 `std::unique_ptr` 与 `nullptr` 进行比较，都是可以的：

```cpp
std::unique_ptr<TestClass> p = nullptr;
std::cout << (p == nullptr) << std::endl;
p = std::make_unique<TestClass>();
std::cout << (p == nullptr) << std::endl;

// 输出：
// 1
// 0
```

`std::unique_ptr` 在离开其作用域时，所保存的对象会自动销毁：

```cpp
std::cout << "block begin" << std::endl;
{
    auto p = std::make_unique<LifeCycleTestClass>();
    p->PrintHello();
}
std::cout << "block end" << std::endl;

// 输出
// block begin
// constructor
// hello
// destructor
// block end
```

比较重要的一点是 `std::unique_ptr` 删除了拷贝构造，所有它对对象的所有权是**独享的**，你没有办法直接将 `std::unique_ptr` 相互拷贝，而只能通过 `std::move` 来转移所有权：

```cpp
auto p1 = std::make_unique<TestClass>();
// 编译错误：Call to deleted constructor of 'std::unique_ptr<TestClass>'
auto p2 = p1;
```

正确的做法是：

```cpp
auto p1 = std::make_unique<TestClass>();
auto p2 = std::move(p1);
```

因为触发了移动语义，转移所有权期间，对象不会重新构造。

除了上面这些特性，`std::unique_ptr` 还提供了一些与裸指针相关的成员函数，你可以使用 `get()` 来直接获取裸指针：

```cpp
auto p = std::make_unique<TestClass>();
TestClass* rawP = p.get();
```

也可以使用 `release()` 来释放裸指针，在释放后，原来的 `std::unique_ptr` 会变成 `nullptr`：

```cpp
auto p = std::make_unique<TestClass>();
TestClass* rawP = p.release();
```

要注意的是，`get()` 和 `release()` 都不会销毁原有对象，只是单纯对裸指针进行操作而已。

在实际编程实践中，`std::unique_ptr` 要比 `std::shared_ptr` 更实用，因为 `std::unique_ptr` 对对象的所有权是明确的，销毁时机也是明确的，可以很好地避免使用 `new`。

# 源码解析

下面的源码解析基于 MSVC 16 2019 (64-Bit)，其他编译器可能有所不同。

## _Compressed_pair

`_Compressed_pair` 是 `std::unique_ptr` 内部用于存储 `deleter` 和裸指针的工具，从字面意思来看，它实现的功能和 `std::pair` 是类似的，但是有所差异的一点是在某些场景下，`_Compressed_pair` 相比 `std::pair` 做了额外的压缩，我们先来看看源码：

```cpp
struct _Zero_then_variadic_args_t {
    explicit _Zero_then_variadic_args_t() = default;
}; // tag type for value-initializing first, constructing second from remaining args

struct _One_then_variadic_args_t {
    explicit _One_then_variadic_args_t() = default;
}; // tag type for constructing first from one arg, constructing second from remaining args

template <class _Ty1, class _Ty2, bool = is_empty_v<_Ty1> && !is_final_v<_Ty1>>
class _Compressed_pair final : private _Ty1 { // store a pair of values, deriving from empty first
public:
    _Ty2 _Myval2;

    using _Mybase = _Ty1; // for visualization

    template <class... _Other2>
    constexpr explicit _Compressed_pair(_Zero_then_variadic_args_t, _Other2&&... _Val2) noexcept(
        conjunction_v<is_nothrow_default_constructible<_Ty1>, is_nothrow_constructible<_Ty2, _Other2...>>)
        : _Ty1(), _Myval2(_STD forward<_Other2>(_Val2)...) {}

    template <class _Other1, class... _Other2>
    constexpr _Compressed_pair(_One_then_variadic_args_t, _Other1&& _Val1, _Other2&&... _Val2) noexcept(
        conjunction_v<is_nothrow_constructible<_Ty1, _Other1>, is_nothrow_constructible<_Ty2, _Other2...>>)
        : _Ty1(_STD forward<_Other1>(_Val1)), _Myval2(_STD forward<_Other2>(_Val2)...) {}

    constexpr _Ty1& _Get_first() noexcept {
        return *this;
    }

    constexpr const _Ty1& _Get_first() const noexcept {
        return *this;
    }
};

template <class _Ty1, class _Ty2>
class _Compressed_pair<_Ty1, _Ty2, false> final { // store a pair of values, not deriving from first
public:
    _Ty1 _Myval1;
    _Ty2 _Myval2;

    template <class... _Other2>
    constexpr explicit _Compressed_pair(_Zero_then_variadic_args_t, _Other2&&... _Val2) noexcept(
        conjunction_v<is_nothrow_default_constructible<_Ty1>, is_nothrow_constructible<_Ty2, _Other2...>>)
        : _Myval1(), _Myval2(_STD forward<_Other2>(_Val2)...) {}

    template <class _Other1, class... _Other2>
    constexpr _Compressed_pair(_One_then_variadic_args_t, _Other1&& _Val1, _Other2&&... _Val2) noexcept(
        conjunction_v<is_nothrow_constructible<_Ty1, _Other1>, is_nothrow_constructible<_Ty2, _Other2...>>)
        : _Myval1(_STD forward<_Other1>(_Val1)), _Myval2(_STD forward<_Other2>(_Val2)...) {}

    constexpr _Ty1& _Get_first() noexcept {
        return _Myval1;
    }

    constexpr const _Ty1& _Get_first() const noexcept {
        return _Myval1;
    }
};
```

可以看到，`_Compressed_pair` 在满足条件 `is_empty_v<_Ty1> && !is_final_v<_Ty1>` 时，会走上面的定义，使用 [Empty base optimization](https://en.cppreference.com/w/cpp/language/ebo) 即**空基类优化**，不满足时，则走下面的特化，退化成普通的 `pair`，我们来通过一段示例代码看一下压缩效果：

```cpp
std::cout << sizeof(std::pair<A, int>) << std::endl;
std::cout << sizeof(std::_Compressed_pair<A, int>) << std::endl;

// 输出
// 8
// 4
```

当 A 为空类时，由于 c++ 的机制，会为其保留 1 字节的空间，A 和 int 联合存放在 `std::pair` 里时，因为需要进行对齐，就变成了 4 + 4 字节，而 `_Compressed_pair` 则通过空基类优化避免了这个问题。

## unique_ptr

先来看看保存普通对象的 `std::unique_ptr` 的定义：

```cpp
template <class _Ty, class _Dx /* = default_delete<_Ty> */>
class unique_ptr;
```

这里的模板参数 `_Ty` 是保存的对象类型，`_Dx` 是 deleter 类型，默认为 `default_delete<_Ty>`，下面是具体的定义：

```cpp
template <class _Ty>
struct default_delete { // default deleter for unique_ptr
    constexpr default_delete() noexcept = default;

    template <class _Ty2, enable_if_t<is_convertible_v<_Ty2*, _Ty*>, int> = 0>
    default_delete(const default_delete<_Ty2>&) noexcept {}

    void operator()(_Ty* _Ptr) const noexcept /* strengthened */ { // delete a pointer
        static_assert(0 < sizeof(_Ty), "can't delete an incomplete type");
        delete _Ptr;
    }
};
```

很简单，只是一个重载了 `operator()` 的结构体而已，`operator()` 中则直接调用 `delete`，当然，你也可以自己实现删除器，在 `std::unique_ptr` 的模板参数中传递即可。

`std::unique_ptr` 中定义了几个 `using`：

```cpp
template <class _Ty, class _Dx_noref, class = void>
struct _Get_deleter_pointer_type { // provide fallback
    using type = _Ty*;
};

template <class _Ty, class _Dx_noref>
struct _Get_deleter_pointer_type<_Ty, _Dx_noref, void_t<typename _Dx_noref::pointer>> { // get _Dx_noref::pointer
    using type = typename _Dx_noref::pointer;
};

using pointer      = typename _Get_deleter_pointer_type<_Ty, remove_reference_t<_Dx>>::type;
using element_type = _Ty;
using deleter_type = _Dx;
```

主要关注 `pointer`