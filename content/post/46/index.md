---
title: "MSVC std::any 源码解析"
description: "MSVC C++ STL 源码解析系列"
date: "2021-08-28"
slug: "46"
categories:
    - 技术
tags:
    - CPP
    - STL
    - Source
keywords:
    - c++
    - stl
    - any
    - 源码
---

# std::any 介绍

`std::any` 是 c++17 标准新提供的类，作用是存储任意类型的一段内存，并可以重复赋值，在赋值后可以使用 `std::any_cast` 将 `std::any` 所存储的值转换成特定类型，如果 `std::any` 中存储的值的类型与目标类型不匹配，则会抛出 `std::bad_any_cast` 异常。

下面是一些简单的 Sample Code（MSVC 16 2019 64Bit 运行）：

```cpp
std::any value = 1.0;
// 1
std::cout << any_cast<double>(value) << std::endl;
// 抛出 std::bad_any_cast 异常
std::cout << any_cast<float>(value) << std::endl;
// 抛出 std::bad_any_cast 异常
std::cout << any_cast<int>(value) << std::endl;
```

指针示例：

```cpp
std::any value1 = nullptr;
// nullptr
std::cout << any_cast<nullptr_t>(value1) << std::endl;
// 抛出 std::bad_any_cast 异常
std::cout << any_cast<int*>(value1) << std::endl;

std::any value2 = (int*) (nullptr);
// 抛出 std::bad_any_cast 异常
std::cout << any_cast<nullptr_t>(value2) << std::endl;
// 0000000000000000
std::cout << any_cast<int*>(value2) << std::endl;
```

空 std::any 示例：

```cpp
std::any value;
// 抛出 std::bad_any_cast 异常
std::cout << any_cast<int>(value) << std::endl;
```

结构体：

```cpp
struct Hello {
    int a;
    int b;
};

std::any value = Hello { .a = 1, .b = 2 };
auto v = any_cast<Hello>(value);
// a: 1, b: 2
std::cout << "a: " << v.a << ", b: " << v.b << std::endl;
```

需要注意的是，这里 `any_cast` 得到的是拷贝，如果需要更高效的操作，可以获取指针或者引用：

```cpp
std::any value = Hello { .a = 1, .b = 2 };

auto* v0 = any_cast<Hello>(&value);
// a: 1, b: 2
std::cout << "a: " << v0->a << ", b: " << v0->b << std::endl;

auto& v1 = any_cast<Hello&>(value);
// a: 1, b: 2
std::cout << "a: " << v1.a << ", b: " << v1.b << std::endl;
```

获取指针时，`any_cast` 的入参也需要是指针，而获取引用则 `any_cast` 的模板参数需要为引用类型。

# 源码阅读

下面的源码解析基于 MSVC 16 2019，其他编译器可能略有不同。

## 异常

先看看 `any_cast` 失败后抛出的异常 `bad_any_cast`：

```cpp
// CLASS bad_any_cast
class bad_any_cast : public bad_cast { // thrown by failed any_cast
public:
    _NODISCARD virtual const char* __CLR_OR_THIS_CALL what() const noexcept override {
        return "Bad any_cast";
    }
};

[[noreturn]] inline void _Throw_bad_any_cast() {
    _THROW(bad_any_cast{});
}
```

## 内存类型

`std::any` 将保存内容的内存形式分为了三种：

* Small
* Trivial
* Big

定义如下：

```cpp
enum class _Any_representation : uintptr_t { _Trivial, _Big, _Small };
```

划分规则为：

```cpp
constexpr int _Small_object_num_ptrs = 6 + 16 / sizeof(void*);

inline constexpr size_t _Any_trivial_space_size = (_Small_object_num_ptrs - 1) * sizeof(void*);

template <class _Ty>
inline constexpr bool _Any_is_trivial = alignof(_Ty) <= alignof(max_align_t)
                                        && is_trivially_copyable_v<_Ty> && sizeof(_Ty) <= _Any_trivial_space_size;

inline constexpr size_t _Any_small_space_size = (_Small_object_num_ptrs - 2) * sizeof(void*);

template <class _Ty>
inline constexpr bool _Any_is_small = alignof(_Ty) <= alignof(max_align_t)
                                      && is_nothrow_move_constructible_v<_Ty> && sizeof(_Ty) <= _Any_small_space_size;
```

简单来说，满足 `_Any_is_trivial` 则为 Trivial 类型内存，满足 `_Any_is_small` 则为 Small 类型内存，其余的则为 Big 类型内存。

在 64 位系统下，划分规则可以解释为：

* `_Any_is_small`：类型长度小于等于 48 字节，内存对齐长度小于等于 8 字节，拥有具备 nothrow 声明的移动构造
* `_Any_is_trivial`：类型长度小于等于 56 字节，内存对齐长度小于等于 8 字节，可平凡拷贝（基本数据类型、可平凡拷贝的聚合类型、以上类型的数组等）

下面是一些 `_Any_is_small` 和 `_Any_is_trivial` 判断的实测值：

```cpp
struct Test1 {
    char a[48];
};

struct Test2 {
    char a[56];
};

struct Test3 {
    Test3(Test3&& other)
    {
        memcpy(a, other.a, sizeof(Test3));
    }

    char a[48] {};
};

struct Test4 {
    int& a;
};

struct Test5 {
    virtual void a() = 0;
};

// 1
std::cout << std::_Any_is_small<char> << std::endl;
// 1
std::cout << std::_Any_is_small<int> << std::endl;
// 1
std::cout << std::_Any_is_small<double> << std::endl;
// 1
std::cout << std::_Any_is_small<Test1> << std::endl;
// 0, sizeof(Test2) > _Any_trivial_space_size
std::cout << std::_Any_is_small<Test2> << std::endl;
// 0, is_nothrow_move_constructible_v<_Ty> == false
std::cout << std::_Any_is_small<Test3> << std::endl;
// 1
std::cout << std::_Any_is_small<Test4> << std::endl;
// 0, is_nothrow_move_constructible_v<_Ty> == false
std::cout << std::_Any_is_small<Test5> << std::endl;

// 1
std::cout << std::_Any_is_trivial<char> << std::endl;
// 1
std::cout << std::_Any_is_trivial<int> << std::endl;
// 1
std::cout << std::_Any_is_trivial<double> << std::endl;
// 1
std::cout << std::_Any_is_trivial<Test1> << std::endl;
// 1
std::cout << std::_Any_is_trivial<Test2> << std::endl;
// 0, is_trivially_copyable_v == false
std::cout << std::_Any_is_trivial<Test3> << std::endl;
// 1
std::cout << std::_Any_is_trivial<Test4> << std::endl;
// 0, is_trivially_copyable_v == false
std::cout << std::_Any_is_trivial<Test5> << std::endl;
```

## RTTI

Trivial 类型的内存是直接对拷的，对于这种内存无需再添加额外的生命周期指针。按照 Small 内存的定义，对于 Small 内存要添加 in_place 的销毁、拷贝、移动函数指针，而 Big 则需要保存堆内存的拷贝与销毁函数指针。源码中定义了 `_Any_small_RTTI` 和 `_Any_big_RTTI` 结构体，来存储这些指针：

```cpp
struct _Any_big_RTTI { // Hand-rolled vtable for types that must be heap allocated in an any
    using _Destroy_fn = void __CLRCALL_PURE_OR_CDECL(void*) _NOEXCEPT_FNPTR;
    using _Copy_fn    = void* __CLRCALL_PURE_OR_CDECL(const void*);

    template <class _Ty>
    static void __CLRCALL_PURE_OR_CDECL _Destroy_impl(void* const _Target) noexcept {
        ::delete static_cast<_Ty*>(_Target);
    }

    template <class _Ty>
    _NODISCARD static void* __CLRCALL_PURE_OR_CDECL _Copy_impl(const void* const _Source) {
        return ::new _Ty(*static_cast<const _Ty*>(_Source));
    }

    _Destroy_fn* _Destroy;
    _Copy_fn* _Copy;
};

struct _Any_small_RTTI { // Hand-rolled vtable for nontrivial types that can be stored internally in an any
    using _Destroy_fn = void __CLRCALL_PURE_OR_CDECL(void*) _NOEXCEPT_FNPTR;
    using _Copy_fn    = void __CLRCALL_PURE_OR_CDECL(void*, const void*);
    using _Move_fn    = void __CLRCALL_PURE_OR_CDECL(void*, void*) _NOEXCEPT_FNPTR;

    template <class _Ty>
    static void __CLRCALL_PURE_OR_CDECL _Destroy_impl(void* const _Target) noexcept {
        _Destroy_in_place(*static_cast<_Ty*>(_Target));
    }

    template <class _Ty>
    static void __CLRCALL_PURE_OR_CDECL _Copy_impl(void* const _Target, const void* const _Source) {
        _Construct_in_place(*static_cast<_Ty*>(_Target), *static_cast<const _Ty*>(_Source));
    }

    template <class _Ty>
    static void __CLRCALL_PURE_OR_CDECL _Move_impl(void* const _Target, void* const _Source) noexcept {
        _Construct_in_place(*static_cast<_Ty*>(_Target), _STD move(*static_cast<_Ty*>(_Source)));
    }

    _Destroy_fn* _Destroy;
    _Copy_fn* _Copy;
    _Move_fn* _Move;
};
```

结构体中首先有对应的函数指针，另外，还提供了带模板的静态实现方法，实际用法是定义模板变量来保存 RTTI 结构体实例，实例中保存对应模板静态方法的指针，来为不同的类型提供 RTTI 功能：

```cpp
template <class _Ty>
inline constexpr _Any_big_RTTI _Any_big_RTTI_obj = {
    &_Any_big_RTTI::_Destroy_impl<_Ty>, &_Any_big_RTTI::_Copy_impl<_Ty>};

template <class _Ty>
inline constexpr _Any_small_RTTI _Any_small_RTTI_obj = {
    &_Any_small_RTTI::_Destroy_impl<_Ty>, &_Any_small_RTTI::_Copy_impl<_Ty>, &_Any_small_RTTI::_Move_impl<_Ty>};
```

## any

分段来看 `std::any` 的源码，首先是构造：

```cpp
constexpr any() noexcept {}

any(const any& _That) {
    _Storage._TypeData = _That._Storage._TypeData;
    switch (_Rep()) {
    case _Any_representation::_Small:
        _Storage._SmallStorage._RTTI = _That._Storage._SmallStorage._RTTI;
        _Storage._SmallStorage._RTTI->_Copy(&_Storage._SmallStorage._Data, &_That._Storage._SmallStorage._Data);
        break;
    case _Any_representation::_Big:
        _Storage._BigStorage._RTTI = _That._Storage._BigStorage._RTTI;
        _Storage._BigStorage._Ptr  = _Storage._BigStorage._RTTI->_Copy(_That._Storage._BigStorage._Ptr);
        break;
    case _Any_representation::_Trivial:
    default:
        _CSTD memcpy(_Storage._TrivialData, _That._Storage._TrivialData, sizeof(_Storage._TrivialData));
        break;
    }
}

any(any&& _That) noexcept {
    _Move_from(_That);
}

template <class _ValueType, enable_if_t<conjunction_v<negation<is_same<decay_t<_ValueType>, any>>,
                                            negation<_Is_specialization<decay_t<_ValueType>, in_place_type_t>>,
                                            is_copy_constructible<decay_t<_ValueType>>>,
                                int> = 0>
any(_ValueType&& _Value) { // initialize with _Value
    _Emplace<decay_t<_ValueType>>(_STD forward<_ValueType>(_Value));
}

template <class _ValueType, class... _Types,
    enable_if_t<
        conjunction_v<is_constructible<decay_t<_ValueType>, _Types...>, is_copy_constructible<decay_t<_ValueType>>>,
        int> = 0>
explicit any(in_place_type_t<_ValueType>, _Types&&... _Args) {
    // in-place initialize a value of type decay_t<_ValueType> with _Args...
    _Emplace<decay_t<_ValueType>>(_STD forward<_Types>(_Args)...);
}

template <class _ValueType, class _Elem, class... _Types,
    enable_if_t<conjunction_v<is_constructible<decay_t<_ValueType>, initializer_list<_Elem>&, _Types...>,
                    is_copy_constructible<decay_t<_ValueType>>>,
        int> = 0>
explicit any(in_place_type_t<_ValueType>, initializer_list<_Elem> _Ilist, _Types&&... _Args) {
    // in-place initialize a value of type decay_t<_ValueType> with _Ilist and _Args...
    _Emplace<decay_t<_ValueType>>(_Ilist, _STD forward<_Types>(_Args)...);
}
```

拷贝构造对应三种内存形态有着不同的拷贝方式，对于 Trivial 内存，直接 `memcpy` 对拷，对于 Small 和 Big 内存，则拷贝 RTTI 并调用 RTTI 结构体中对应的拷贝函数来做拷贝操作。移动构造和其他构造最终会调用到内部方法 `_Move_from` 和 `_Emplace`，下面是定义：

```cpp
void _Move_from(any& _That) noexcept {
    _Storage._TypeData = _That._Storage._TypeData;
    switch (_Rep()) {
    case _Any_representation::_Small:
        _Storage._SmallStorage._RTTI = _That._Storage._SmallStorage._RTTI;
        _Storage._SmallStorage._RTTI->_Move(&_Storage._SmallStorage._Data, &_That._Storage._SmallStorage._Data);
        break;
    case _Any_representation::_Big:
        _Storage._BigStorage._RTTI = _That._Storage._BigStorage._RTTI;
        _Storage._BigStorage._Ptr  = _That._Storage._BigStorage._Ptr;
        _That._Storage._TypeData   = 0;
        break;
    case _Any_representation::_Trivial:
    default:
        _CSTD memcpy(_Storage._TrivialData, _That._Storage._TrivialData, sizeof(_Storage._TrivialData));
        break;
    }
}

template <class _Decayed, class... _Types>
_Decayed& _Emplace(_Types&&... _Args) { // emplace construct _Decayed
    if constexpr (_Any_is_trivial<_Decayed>) {
        // using the _Trivial representation
        auto& _Obj = reinterpret_cast<_Decayed&>(_Storage._TrivialData);
        _Construct_in_place(_Obj, _STD forward<_Types>(_Args)...);
        _Storage._TypeData =
            reinterpret_cast<uintptr_t>(&typeid(_Decayed)) | static_cast<uintptr_t>(_Any_representation::_Trivial);
        return _Obj;
    } else if constexpr (_Any_is_small<_Decayed>) {
        // using the _Small representation
        auto& _Obj = reinterpret_cast<_Decayed&>(_Storage._SmallStorage._Data);
        _Construct_in_place(_Obj, _STD forward<_Types>(_Args)...);
        _Storage._SmallStorage._RTTI = &_Any_small_RTTI_obj<_Decayed>;
        _Storage._TypeData =
            reinterpret_cast<uintptr_t>(&typeid(_Decayed)) | static_cast<uintptr_t>(_Any_representation::_Small);
        return _Obj;
    } else {
        // using the _Big representation
        _Decayed* const _Ptr       = ::new _Decayed(_STD forward<_Types>(_Args)...);
        _Storage._BigStorage._Ptr  = _Ptr;
        _Storage._BigStorage._RTTI = &_Any_big_RTTI_obj<_Decayed>;
        _Storage._TypeData =
            reinterpret_cast<uintptr_t>(&typeid(_Decayed)) | static_cast<uintptr_t>(_Any_representation::_Big);
        return *_Ptr;
    }
}
```

`_Move_from` 与拷贝构造中做的事情类似，只是操作改成了 `_Move`，另外，对于 Big 内存，直接拷贝指针，这个也很好理解。`_Emplace` 中则是针对不同内存创建 `_Storage`，这里要注意的是 `_TypeData` 的处理手法，是取类型对应的 `std::type_info` 指针并与 `enum` 定义指针相或，从而取得每个类型独一无二的一个 id。

下面来看 `_Storage` 的定义：

```cpp
struct _Small_storage_t {
        unsigned char _Data[_Any_small_space_size];
        const _Any_small_RTTI* _RTTI;
    };
    static_assert(sizeof(_Small_storage_t) == _Any_trivial_space_size);

    struct _Big_storage_t {
        // Pad so that _Ptr and _RTTI might share _TypeData's cache line
        unsigned char _Padding[_Any_small_space_size - sizeof(void*)];
        void* _Ptr;
        const _Any_big_RTTI* _RTTI;
    };
    static_assert(sizeof(_Big_storage_t) == _Any_trivial_space_size);

    struct _Storage_t {
        union {
            unsigned char _TrivialData[_Any_trivial_space_size];
            _Small_storage_t _SmallStorage;
            _Big_storage_t _BigStorage;
        };
        uintptr_t _TypeData;
    };
    static_assert(sizeof(_Storage_t) == _Any_trivial_space_size + sizeof(void*));
    static_assert(is_standard_layout_v<_Storage_t>);

    union {
        _Storage_t _Storage{};
        max_align_t _Dummy;
    };
```

跟上面说的一样，Small 内存和 Big 内存还需要额外保存一个 RTTI 结构体指针，用于管理生命周期，`_Storage_t` 本身则是一个 `union`，由 `_SmallStorage`、`_BigStorage`、`_TrivialData` 组成，此外，还保存了一个 `_TypeData`，即一个唯一的类型 id，之后会用于 `std::any_cast` 的类型校验。

再看其余部分就很简单了，首先是析构和 `operator=`：

```cpp
~any() noexcept {
    reset();
}

// Assignment [any.assign]
any& operator=(const any& _That) {
    *this = any{_That};
    return *this;
}

any& operator=(any&& _That) noexcept {
    reset();
    _Move_from(_That);
    return *this;
}

template <class _ValueType, enable_if_t<conjunction_v<negation<is_same<decay_t<_ValueType>, any>>,
                                            is_copy_constructible<decay_t<_ValueType>>>,
                                int> = 0>
any& operator=(_ValueType&& _Value) {
    // replace contained value with an object of type decay_t<_ValueType> initialized from _Value
    *this = any{_STD forward<_ValueType>(_Value)};
    return *this;
}
```

然后是一些 `std::any` 提供的接口：

```cpp
template <class _ValueType, class... _Types,
    enable_if_t<
        conjunction_v<is_constructible<decay_t<_ValueType>, _Types...>, is_copy_constructible<decay_t<_ValueType>>>,
        int> = 0>
decay_t<_ValueType>& emplace(_Types&&... _Args) {
    // replace contained value with an object of type decay_t<_ValueType> initialized from _Args...
    reset();
    return _Emplace<decay_t<_ValueType>>(_STD forward<_Types>(_Args)...);
}
template <class _ValueType, class _Elem, class... _Types,
    enable_if_t<conjunction_v<is_constructible<decay_t<_ValueType>, initializer_list<_Elem>&, _Types...>,
                    is_copy_constructible<decay_t<_ValueType>>>,
        int> = 0>
decay_t<_ValueType>& emplace(initializer_list<_Elem> _Ilist, _Types&&... _Args) {
    // replace contained value with an object of type decay_t<_ValueType> initialized from _Ilist and _Args...
    reset();
    return _Emplace<decay_t<_ValueType>>(_Ilist, _STD forward<_Types>(_Args)...);
}

void reset() noexcept { // transition to the empty state
    switch (_Rep()) {
    case _Any_representation::_Small:
        _Storage._SmallStorage._RTTI->_Destroy(&_Storage._SmallStorage._Data);
        break;
    case _Any_representation::_Big:
        _Storage._BigStorage._RTTI->_Destroy(_Storage._BigStorage._Ptr);
        break;
    case _Any_representation::_Trivial:
    default:
        break;
    }
    _Storage._TypeData = 0;
}

void swap(any& _That) noexcept {
    _That = _STD exchange(*this, _STD move(_That));
}

// Observers [any.observers]
_NODISCARD bool has_value() const noexcept {
    return _Storage._TypeData != 0;
}

_NODISCARD const type_info& type() const noexcept {
    // if *this contains a value of type T, return typeid(T); otherwise typeid(void)
    const type_info* const _Info = _TypeInfo();
    if (_Info) {
        return *_Info;
    }

    return typeid(void);
}

template <class _Decayed>
_NODISCARD const _Decayed* _Cast() const noexcept {
    // if *this contains a value of type _Decayed, return a pointer to it
    const type_info* const _Info = _TypeInfo();
    if (!_Info || *_Info != typeid(_Decayed)) {
        return nullptr;
    }

    if constexpr (_Any_is_trivial<_Decayed>) {
        // get a pointer to the contained _Trivial value of type _Decayed
        return reinterpret_cast<const _Decayed*>(&_Storage._TrivialData);
    } else if constexpr (_Any_is_small<_Decayed>) {
        // get a pointer to the contained _Small value of type _Decayed
        return reinterpret_cast<const _Decayed*>(&_Storage._SmallStorage._Data);
    } else {
        // get a pointer to the contained _Big value of type _Decayed
        return static_cast<const _Decayed*>(_Storage._BigStorage._Ptr);
    }
}

template <class _Decayed>
_NODISCARD _Decayed* _Cast() noexcept { // if *this contains a value of type _Decayed, return a pointer to it
    return const_cast<_Decayed*>(static_cast<const any*>(this)->_Cast<_Decayed>());
}

static constexpr uintptr_t _Rep_mask = 3;

_NODISCARD _Any_representation _Rep() const noexcept { // extract the representation format from _TypeData
    return static_cast<_Any_representation>(_Storage._TypeData & _Rep_mask);
}
_NODISCARD const type_info* _TypeInfo() const noexcept { // extract the type_info from _TypeData
    return reinterpret_cast<const type_info*>(_Storage._TypeData & ~_Rep_mask);
}
```

也都不复杂， 就不再多说了。

## make_any / any_cast

先看平时用的不多的 `std::make_any`：

```cpp
template <class _ValueType, class... _Types>
_NODISCARD any make_any(_Types&&... _Args) { // construct an any containing a _ValueType initialized with _Args...
    return any{in_place_type<_ValueType>, _STD forward<_Types>(_Args)...};
}
template <class _ValueType, class _Elem, class... _Types>
_NODISCARD any make_any(initializer_list<_Elem> _Ilist, _Types&&... _Args) {
    // construct an any containing a _ValueType initialized with _Ilist and _Args...
    return any{in_place_type<_ValueType>, _Ilist, _STD forward<_Types>(_Args)...};
}
```

就是将参数透传到 `std::any` 的初始化列表构造并执行。

然后是 `std::any_cast`：

```cpp
template <class _ValueType>
_NODISCARD const _ValueType* any_cast(const any* const _Any) noexcept {
    // retrieve a pointer to the _ValueType contained in _Any, or null
    static_assert(!is_void_v<_ValueType>, "std::any cannot contain void.");

    if constexpr (is_function_v<_ValueType> || is_array_v<_ValueType>) {
        return nullptr;
    } else {
        if (!_Any) {
            return nullptr;
        }

        return _Any->_Cast<_Remove_cvref_t<_ValueType>>();
    }
}
template <class _ValueType>
_NODISCARD _ValueType* any_cast(any* const _Any) noexcept {
    // retrieve a pointer to the _ValueType contained in _Any, or null
    static_assert(!is_void_v<_ValueType>, "std::any cannot contain void.");

    if constexpr (is_function_v<_ValueType> || is_array_v<_ValueType>) {
        return nullptr;
    } else {
        if (!_Any) {
            return nullptr;
        }

        return _Any->_Cast<_Remove_cvref_t<_ValueType>>();
    }
}

template <class _Ty>
_NODISCARD remove_cv_t<_Ty> any_cast(const any& _Any) {
    static_assert(is_constructible_v<remove_cv_t<_Ty>, const _Remove_cvref_t<_Ty>&>,
        "any_cast<T>(const any&) requires remove_cv_t<T> to be constructible from "
        "const remove_cv_t<remove_reference_t<T>>&");

    const auto _Ptr = _STD any_cast<_Remove_cvref_t<_Ty>>(&_Any);
    if (!_Ptr) {
        _Throw_bad_any_cast();
    }

    return static_cast<remove_cv_t<_Ty>>(*_Ptr);
}
template <class _Ty>
_NODISCARD remove_cv_t<_Ty> any_cast(any& _Any) {
    static_assert(is_constructible_v<remove_cv_t<_Ty>, _Remove_cvref_t<_Ty>&>,
        "any_cast<T>(any&) requires remove_cv_t<T> to be constructible from remove_cv_t<remove_reference_t<T>>&");

    const auto _Ptr = _STD any_cast<_Remove_cvref_t<_Ty>>(&_Any);
    if (!_Ptr) {
        _Throw_bad_any_cast();
    }

    return static_cast<remove_cv_t<_Ty>>(*_Ptr);
}
template <class _Ty>
_NODISCARD remove_cv_t<_Ty> any_cast(any&& _Any) {
    static_assert(is_constructible_v<remove_cv_t<_Ty>, _Remove_cvref_t<_Ty>>,
        "any_cast<T>(any&&) requires remove_cv_t<T> to be constructible from remove_cv_t<remove_reference_t<T>>");

    const auto _Ptr = _STD any_cast<_Remove_cvref_t<_Ty>>(&_Any);
    if (!_Ptr) {
        _Throw_bad_any_cast();
    }

    return static_cast<remove_cv_t<_Ty>>(_STD move(*_Ptr));
}
```

所有 `std::any_cast` 最终都会先取保存的 `std::type_info` 然后与目标类型相比较，失败则抛出 `std::bad_any_cast`，否则则返回 value。这里要注意的是返回的类型会根据 `std::any_cast` 的入参产生变化：

* `const any* const` -> `const _ValueType*`
* `any* const _Any` -> `_ValueType*`
* `const any& _Any` -> `remove_cv_t<_Ty>`
* `any& _Any` -> `remove_cv_t<_Ty>`
* `any&& _Any` -> `remove_cv_t<_Ty>`

总结起来就是入参的 `std::any` 为指针时，返回指针，否则返回 `remove_cv_t<_Ty>`，所以使用时如果对应的是结构体 / 类，应该尽量获取指针或者引用来保持高效，避免内存拷贝降低性能（例子可以看文首的介绍）。

# 总结

* `std::any` 可以用于保存任意内存
* `std::any` 内部将内存分为 Trivial、Small、Big 三种，Trivial 内存直接对拷，Small 内存需要保存额外的拷贝、移动、销毁指针，具体操作是 in_place 的，Big 内存需要保存额外的拷贝、销毁指针，具体操作是堆内存的 new、delete
* `std::any` 内部保存了 `std::type_info` 的指针，用于 `std::any_cast` 校验类型
* `std::any_cast` 会依据 `std::type_info` 做类型校验
* `std::any_cast` 的返回值会根据入参类型发生变化，入参为指针则返回指针，否则返回 `remove_cv_t<_Ty>`
