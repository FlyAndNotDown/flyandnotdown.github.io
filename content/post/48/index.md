---
title: "MSVC std::unique_ptr 源码解析"
description: "MSVC C++ STL 源码解析系列"
date: "2021-09-26"
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
template <class _Ty, class _Dx = default_delete<_Ty>>
class unique_ptr;
```

这里的模板参数 `_Ty` 是保存的对象类型，`_Dx` 是删除器类型，默认为 `default_delete<_Ty>`，下面是具体的定义：

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

很简单，只是一个重载了 `operator()` 的结构体而已，`operator()` 中则直接调用 `delete`。

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

这里 `element_type` 为元素类型，`deleter_type` 为删除器类型，我们主要关注 `pointer`，`pointer` 的类型由 `_Get_deleter_pointer_type` 决定，我们可以发现它有两个定义，前者是默认定义，当删除器中没有定义 `pointer` 时会 fallback 到这个定义，如果删除器定义了 `pointer`，则会使用删除器中的 `pointer` 类型。下面是一段实验代码：

```cpp
template <class Ty>
struct deleter {
    using pointer = void*;

    constexpr deleter() noexcept = default;

    template <class Ty2, std::enable_if_t<std::is_convertible_v<Ty2*, Ty*>, int> = 0>
    explicit deleter(const deleter<Ty2>&) noexcept {}

    void operator()(Ty* Ptr) const noexcept /* strengthened */ { // delete a pointer
        delete Ptr;
    }
};

struct A {};

int main(int argc, char* argv[])
{
    std::cout << typeid(std::_Get_deleter_pointer_type<A, std::remove_reference_t<std::default_delete<A>>>::type).name() << std::endl;
    std::cout << typeid(std::_Get_deleter_pointer_type<A, std::remove_reference_t<deleter<A>>>::type).name() << std::endl;
}
```

输出结果：

```
struct A * __ptr64
void * __ptr64
```

然后我们来看一下 `std::unique_ptr` 的 private block：

```cpp
private:
    template <class, class>
    friend class unique_ptr;

    _Compressed_pair<_Dx, pointer> _Mypair;
```

只是定义了一个 `_Compressed_pair` 来同时保存删除器和裸指针，这里要注意的是，pair 中保存的顺序，first 是删除器，second 是 pointer。

接下来看一下 `std::unique_ptr` 的各种构造和 `operator=`，首先是默认构造：

```cpp
template <class _Dx2 = _Dx, _Unique_ptr_enable_default_t<_Dx2> = 0>
constexpr unique_ptr() noexcept : _Mypair(_Zero_then_variadic_args_t{}) {}
```

这里的 `_Zero_then_variadic_args_t` 在上面也出现过，是一个空结构体，作用于用于标记参数数量，然后决定具体使用 `_Compressed_pair` 的哪一个构造。

接下来是 `nullptr_t` 的构造和 `operator=`：

```cpp
template <class _Dx2 = _Dx, _Unique_ptr_enable_default_t<_Dx2> = 0>
constexpr unique_ptr(nullptr_t) noexcept : _Mypair(_Zero_then_variadic_args_t{}) {}

unique_ptr& operator=(nullptr_t) noexcept {
    reset();
    return *this;
}
```

主要是针对空指针的处理，当使用空指针进行构造和赋值的时候，相当于把 `std::unique_ptr` 重置。

接下来是更常用的构造：

```cpp
template <class _Dx2>
using _Unique_ptr_enable_default_t =
    enable_if_t<conjunction_v<negation<is_pointer<_Dx2>>, is_default_constructible<_Dx2>>, int>;

template <class _Dx2 = _Dx, _Unique_ptr_enable_default_t<_Dx2> = 0>
explicit unique_ptr(pointer _Ptr) noexcept : _Mypair(_Zero_then_variadic_args_t{}, _Ptr) {}

template <class _Dx2 = _Dx, enable_if_t<is_constructible_v<_Dx2, const _Dx2&>, int> = 0>
unique_ptr(pointer _Ptr, const _Dx& _Dt) noexcept : _Mypair(_One_then_variadic_args_t{}, _Dt, _Ptr) {}

template <class _Dx2                                                                            = _Dx,
    enable_if_t<conjunction_v<negation<is_reference<_Dx2>>, is_constructible<_Dx2, _Dx2>>, int> = 0>
unique_ptr(pointer _Ptr, _Dx&& _Dt) noexcept : _Mypair(_One_then_variadic_args_t{}, _STD move(_Dt), _Ptr) {}

template <class _Dx2                                                                                      = _Dx,
    enable_if_t<conjunction_v<is_reference<_Dx2>, is_constructible<_Dx2, remove_reference_t<_Dx2>>>, int> = 0>
unique_ptr(pointer, remove_reference_t<_Dx>&&) = delete;
```

单参数的构造只传入指针，当满足删除器类型不是指针而且可默认构造的情况下启用，直接把传入的裸指针存入 pair，这时候由于删除器是可默认构造的，pair 中保存的删除器会被直接默认构造。另外的三个也需要满足一定条件，这时可以从外部传入删除器，并将其保存至 pair 中。

然后是移动构造：

```cpp
template <class _Dx2 = _Dx, enable_if_t<is_move_constructible_v<_Dx2>, int> = 0>
unique_ptr(unique_ptr&& _Right) noexcept
    : _Mypair(_One_then_variadic_args_t{}, _STD forward<_Dx>(_Right.get_deleter()), _Right.release()) {}

template <class _Ty2, class _Dx2,
    enable_if_t<
        conjunction_v<negation<is_array<_Ty2>>, is_convertible<typename unique_ptr<_Ty2, _Dx2>::pointer, pointer>,
            conditional_t<is_reference_v<_Dx>, is_same<_Dx2, _Dx>, is_convertible<_Dx2, _Dx>>>,
        int> = 0>
unique_ptr(unique_ptr<_Ty2, _Dx2>&& _Right) noexcept
    : _Mypair(_One_then_variadic_args_t{}, _STD forward<_Dx2>(_Right.get_deleter()), _Right.release()) {}

#if _HAS_AUTO_PTR_ETC
template <class _Ty2,
    enable_if_t<conjunction_v<is_convertible<_Ty2*, _Ty*>, is_same<_Dx, default_delete<_Ty>>>, int> = 0>
unique_ptr(auto_ptr<_Ty2>&& _Right) noexcept : _Mypair(_Zero_then_variadic_args_t{}, _Right.release()) {}
#endif // _HAS_AUTO_PTR_ETC

template <class _Ty2, class _Dx2,
    enable_if_t<conjunction_v<negation<is_array<_Ty2>>, is_assignable<_Dx&, _Dx2>,
                    is_convertible<typename unique_ptr<_Ty2, _Dx2>::pointer, pointer>>,
        int> = 0>
unique_ptr& operator=(unique_ptr<_Ty2, _Dx2>&& _Right) noexcept {
    reset(_Right.release());
    _Mypair._Get_first() = _STD forward<_Dx2>(_Right._Mypair._Get_first());
    return *this;
}

template <class _Dx2 = _Dx, enable_if_t<is_move_assignable_v<_Dx2>, int> = 0>
unique_ptr& operator=(unique_ptr&& _Right) noexcept {
    if (this != _STD addressof(_Right)) {
        reset(_Right.release());
        _Mypair._Get_first() = _STD forward<_Dx>(_Right._Mypair._Get_first());
    }
    return *this;
}
```

条件判断比较多，不过归根到底都是直接移动删除器，然后调用原 `std::unique_ptr` 的 `release()` 释放裸指针，再将裸指针填入新的 pair 中。

最后，有关构造和赋值**比较重要的是**被删除的两个方法：

```cpp
unique_ptr(const unique_ptr&) = delete;
unique_ptr& operator=(const unique_ptr&) = delete;
```

这直接决定了 `std::unique_ptr` 没办法复制与相互赋值，这是语义上**独享内存所有权**的基石。

我们再看析构：

```cpp
~unique_ptr() noexcept {
    if (_Mypair._Myval2) {
        _Mypair._Get_first()(_Mypair._Myval2);
    }
}
```

比较简单，先判断 pair 中保存的裸指针是否为空，不为空的话则调用 pair 中保存的 deleter 来释放内存。

`std::unique_ptr` 和大部分 stl 类一样提供了 `swap()` 方法：

```cpp
void swap(unique_ptr& _Right) noexcept {
    _Swap_adl(_Mypair._Myval2, _Right._Mypair._Myval2);
    _Swap_adl(_Mypair._Get_first(), _Right._Mypair._Get_first());
}
```

有关删除器，`std::unique_ptr` 还提供了 getter 方法来获取删除器：

```cpp
_NODISCARD _Dx& get_deleter() noexcept {
    return _Mypair._Get_first();
}

_NODISCARD const _Dx& get_deleter() const noexcept {
    return _Mypair._Get_first();
}
```

接下来看与指针息息相关的几个操作符重载：

```cpp
_NODISCARD add_lvalue_reference_t<_Ty> operator*() const noexcept /* strengthened */ {
    return *_Mypair._Myval2;
}

_NODISCARD pointer operator->() const noexcept {
    return _Mypair._Myval2;
}

explicit operator bool() const noexcept {
    return static_cast<bool>(_Mypair._Myval2);
}
```

这使得我们可以像使用普通指针一样使用 `std::unique_ptr`。

最后是三个对裸指针的直接操作：

```cpp
_NODISCARD pointer get() const noexcept {
    return _Mypair._Myval2;
}

pointer release() noexcept {
    return _STD exchange(_Mypair._Myval2, nullptr);
}

void reset(pointer _Ptr = nullptr) noexcept {
    pointer _Old = _STD exchange(_Mypair._Myval2, _Ptr);
    if (_Old) {
        _Mypair._Get_first()(_Old);
    }
}
```

从代码上可以看出来，`get()` 和 `release()` 并不会触发内存销毁，而 `reset()` 的内存销毁也是有条件的，只有 `reset()` 为空指针时才会触发销毁。

整体上来看 `std::unique_ptr` 的代码并不算复杂，只是裸指针的一层封装而已。

## unique_ptr<_Ty[], _Dx>

`std::unique_ptr` 还有另外一个定义，即：

```cpp
template <class _Ty, class _Dx>
class unique_ptr<_Ty[], _Dx>;
```

这个定义是针对数组的。大部分代码其实都跟前面相同，我们主要关注不一样的地方，首先是 `default_delete` 的特化：

```cpp
template <class _Ty>
struct default_delete<_Ty[]> { // default deleter for unique_ptr to array of unknown size
    constexpr default_delete() noexcept = default;

    template <class _Uty, enable_if_t<is_convertible_v<_Uty (*)[], _Ty (*)[]>, int> = 0>
    default_delete(const default_delete<_Uty[]>&) noexcept {}

    template <class _Uty, enable_if_t<is_convertible_v<_Uty (*)[], _Ty (*)[]>, int> = 0>
    void operator()(_Uty* _Ptr) const noexcept /* strengthened */ { // delete a pointer
        static_assert(0 < sizeof(_Uty), "can't delete an incomplete type");
        delete[] _Ptr;
    }
};
```

针对数组，这里的 `operator()` 的实现由 `delete` 改成了 `delete[]`。

然后是一些操作符重载上的不同：

```cpp
_NODISCARD _Ty& operator[](size_t _Idx) const noexcept /* strengthened */ {
    return _Mypair._Myval2[_Idx];
}

explicit operator bool() const noexcept {
    return static_cast<bool>(_Mypair._Myval2);
}
```

与普通的 `std::unique_ptr` 不同的是，它不再提供 `operator*` 和 `operator->`，取而代之的是 `operator[]`，这也与普通数组的操作一致。

其他的一些代码，主要是构造、析构、`operator=`，基本都与普通的定义一致，就不再赘述了。

## make_unique / make_unique_for_overwrite

`std::make_unique` 的用法在前面也说过了，主要是用于更优雅地构造 `std::unique_ptr` 的，代码其实也很简单，只是一层简单的透传：

```cpp
// FUNCTION TEMPLATE make_unique
template <class _Ty, class... _Types, enable_if_t<!is_array_v<_Ty>, int> = 0>
_NODISCARD unique_ptr<_Ty> make_unique(_Types&&... _Args) { // make a unique_ptr
    return unique_ptr<_Ty>(new _Ty(_STD forward<_Types>(_Args)...));
}

template <class _Ty, enable_if_t<is_array_v<_Ty> && extent_v<_Ty> == 0, int> = 0>
_NODISCARD unique_ptr<_Ty> make_unique(const size_t _Size) { // make a unique_ptr
    using _Elem = remove_extent_t<_Ty>;
    return unique_ptr<_Ty>(new _Elem[_Size]());
}

template <class _Ty, class... _Types, enable_if_t<extent_v<_Ty> != 0, int> = 0>
void make_unique(_Types&&...) = delete;
```

在 C++ 20 之后，标准库还提供了 `std::make_unique_for_overwrite` 来构造 `std::unique_ptr`，与 `std::make_unique` 的区别在于，它不需要传递额外参数，直接使用目标类型的默认构造，下面是源码：

```cpp
#if _HAS_CXX20
// FUNCTION TEMPLATE make_unique_for_overwrite
template <class _Ty, enable_if_t<!is_array_v<_Ty>, int> = 0>
_NODISCARD unique_ptr<_Ty> make_unique_for_overwrite() { // make a unique_ptr with default initialization
    return unique_ptr<_Ty>(new _Ty);
}

template <class _Ty, enable_if_t<is_unbounded_array_v<_Ty>, int> = 0>
_NODISCARD unique_ptr<_Ty> make_unique_for_overwrite(
    const size_t _Size) { // make a unique_ptr with default initialization
    using _Elem = remove_extent_t<_Ty>;
    return unique_ptr<_Ty>(new _Elem[_Size]);
}

template <class _Ty, class... _Types, enable_if_t<is_bounded_array_v<_Ty>, int> = 0>
void make_unique_for_overwrite(_Types&&...) = delete;
#endif // _HAS_CXX20
```

也很简单，透传而已。

# 总结

* `std::unique_ptr` 有两个定义，分别针对普通类型和数组类型
* `std::unique_ptr` 第二个模板参数是删除器，不传递的情况下使用的是 `default_delete`
* `std::unique_ptr` 重载了指针、数组相关的操作符，实现与裸指针类似的操作
* `std::unique_ptr` 不允许拷贝，语义上表示一段内存的所有权，转移所有权需要使用 `std::move` 产生移动语义
* `std::unique_ptr` 提供了 `get()` 和 `release()` 来直接对裸指针进行操作
* `std::unqiue_ptr` 可以直接与 `nullptr` 比较，也可以使用 `nullptr` 赋值
* 可以使用 `std::make_unique` 和 `std::make_unique_for_overwrite` 来更方便地构造 `std::unique_ptr`
