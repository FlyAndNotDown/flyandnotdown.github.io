---
title: "如何以酷炫的姿势造一个 C++ 动态反射轮子"
description: "总结一下 Explosion 项目中跟反射斗智斗勇的过程。"
date: "2023-11-25"
slug: "58"
categories:
    - 技术
tags:
    - C++
    - Explosion
    - Reflection
keywords:
    - 反射
    - C++
---

# 背景

写游戏引擎当然绕不开反射，反射在编辑器开发、序列化这块有着举足轻重的作用。

简单扫了一遍市面上的动态反射库，[rttr](https://github.com/rttrorg/rttr) 感觉已经不更新了，实际上用 CMake 集成到项目里感觉也不太好用，[meta](https://github.com/skypjack/meta) 其实还不错，思路很好，用模板做类型注册，但是比较整蛊的是查类型信息的使用用的不是 `std::string`，而是一个 hash 值，其实就是编译期字符串 hash，不够灵活，另外还缺一套自动注册的流程。`UE` 的反射库也比较完善，主要基于地址注册，而且有自动注册流程，但是缺点就是太依赖 `UObject` 系统了，而且年代久远所以相当笨重，独立项目不可能去引用的。

于是我打算自己造一套轮子，整体框架参考 [meta](https://github.com/skypjack/meta)，类型注册使用模板，引入 `libclang` 来做头文件的自动分析与类型自动注册，另外也支持已注册类型的对象自动序列化。

我给这套反射框架取名叫 `Mirror`，镜子反射很6，简单粗暴没毛病，你可以在 [Explosion/Mirror](https://github.com/ExplosionEngine/Explosion/tree/master/Engine/Source/Mirror) 和 [Explosion/MirrorTool](https://github.com/ExplosionEngine/Explosion/tree/master/Tool/MirrorTool) 找到所有的相关代码和测试用例，让我们开始吧。

# TypeInfo

首先我们需要为我们的类型构筑一个基本信息，直接给一个结构体，描述某一个类型的基本信息，这个信息后面会在很多地方用到，比如判断类型是否相等啦，Any Cast 的校验啦、派生关系的校验啦之类的。

```cpp
using TypeId = size_t;

struct TypeInfo {
    std::string name;
    TypeId id;
    const bool isConst;
    const bool isLValueReference;
    const bool isRValueReference;
    const bool isPointer;
    const bool isClass;
    TypeId removePointerType;
};
```

其实就是类型名、id、然后一些基本的 type traits，和一个 removePointerType，这些信息基本已经足够了，如果还需要别的可以在此基础上添加定制。

接下来我们需要一个模板函数，支持对一个类型求 `TypeInfo`：

```cpp
template <typename T>
TypeInfo* GetTypeInfo()
{
    static TypeInfo typeInfo = {
        typeid(T).name(),
        typeid(T).hash_code(),
        std::is_const_v<T>,
        std::is_lvalue_reference_v<T>,
        std::is_rvalue_reference_v<T>,
        std::is_pointer_v<T>,
        std::is_class_v<T>,
        typeid(std::remove_pointer_t<T>).hash_code()
    };
    return &typeInfo;
}
```

这里我们用到了 `typeid` 操作符，当然这是现代 C++ 才支持的特性，如果更早起的编译器可能要用一些 function signature 的编译器扩展来求这些东西。

# Any

下面我们需要一个容器来做类型擦除，就是可以容纳任何种类的值，原装的 `std::any` 有两个问题，一个是不能灵活支持引用的存储、另外一个问题是不支持多态 Cast，所以我们需要自己封装一个：

```cpp
class MIRROR_API Any {
public:
    Any() = default;
    ~Any();
    Any(const Any& inAny);
    Any(Any&& inAny) noexcept;

    template <typename T>
    Any(T&& value); // NOLINT

    template <typename T>
    Any(const std::reference_wrapper<T>& ref); // NOLINT

    template <typename T>
    Any(std::reference_wrapper<T>&& ref); // NOLINT

    Any& operator=(const Any& inAny);
    Any& operator=(Any&& inAny) noexcept;

    template <typename T>
    Any& operator=(T&& value);

    template <typename T>
    Any& operator=(const std::reference_wrapper<T>& ref);

    template <typename T>
    Any& operator=(std::reference_wrapper<T>&& ref);

    template <typename T>
    [[nodiscard]] bool Convertible() const;

    template <typename T>
    T As() const;

    template <typename T>
    T ForceAs() const;

    template <typename T>
    T* TryAs() const;

    [[nodiscard]] bool Convertible(const TypeInfo* dstType) const;
    [[nodiscard]] size_t Size() const;
    [[nodiscard]] const void* Data() const;
    [[nodiscard]] const Mirror::TypeInfo* TypeInfo() const;
    void Reset();
    bool operator==(const Any& rhs) const;

private:
    template <typename T>
    void ConstructValue(T&& value);

    template <typename T>
    void ConstructRef(const std::reference_wrapper<T>& ref);

    const Mirror::TypeInfo* typeInfo = nullptr;
    const Internal::AnyRtti* rtti;
    std::vector<uint8_t> data;
};
```

先看头文件里，`Any` 容器实现其实就是一个简单的动态数组，把传进来的对象进行类型擦除存入动态数组，然后记录类型信息，要注意的就是对于值传递和 `std::ref()` 包裹的引用传递的处理是不一样的，值传递是直接移动或拷贝，引用传递则是转换成指针传递。

```cpp
template <typename T>
void Any::ConstructValue(T&& value)
{
    using RemoveCVRefType = std::remove_cvref_t<T>;
    using RemoveRefType = std::remove_reference_t<T>;

    typeInfo = GetTypeInfo<RemoveRefType>();
    rtti = &Internal::anyRttiImpl<RemoveCVRefType>;

    data.resize(sizeof(RemoveCVRefType));
    new(data.data()) RemoveCVRefType(std::forward<T>(value));
}

template <typename T>
void Any::ConstructRef(const std::reference_wrapper<T>& ref)
{
    using RefWrapperType = std::reference_wrapper<T>;
    using RefType = T&;

    typeInfo = GetTypeInfo<RefType>();
    rtti = &Internal::anyRttiImpl<RefWrapperType>;

    data.resize(sizeof(RefWrapperType));
    new(data.data()) RefWrapperType(ref);
}
```

另外因为进行了类型擦除，在 `Any` 容器进行移动、拷贝之类的操作的时候，我们还需要用模板 + 函数指针的形式存一个 rtti，来协助操作：

```cpp
struct AnyRtti {
    using DetorFunc = void(void*) noexcept;
    using CopyFunc = void(void*, const void*);
    using MoveFunc = void(void*, void*) noexcept;
    using EqualFunc = bool(const void*, const void*);

    template <typename T>
    static void DetorImpl(void* const object) noexcept;

    template <typename T>
    static void CopyImpl(void* const object, const void* const other);

    template <typename T>
    static void MoveImpl(void* const object, void* const other) noexcept;

    template <typename T>
    static bool EqualImpl(const void* const object, const void* const other);

    DetorFunc* detor;
    CopyFunc* copy;
    MoveFunc* move;
    EqualFunc* equal;
};

template <typename T>
void AnyRtti::DetorImpl(void* const object) noexcept
{
    reinterpret_cast<T*>(object)->~T();
}

template <typename T>
void AnyRtti::CopyImpl(void* const object, const void* const other)
{
    new(object) T(*reinterpret_cast<const T*>(other));
}

template <typename T>
void AnyRtti::MoveImpl(void* const object, void* const other) noexcept
{
    new(object) T(std::move(*reinterpret_cast<const T*>(other)));
}

template <typename T>
bool AnyRtti::EqualImpl(const void* const object, const void* const other)
{
    if constexpr (std::equality_comparable<T>) {
        return *reinterpret_cast<const T*>(object) == *reinterpret_cast<const T*>(other);
    } else {
        AssertWithReason(false, "type is not comparable");
        return false;
    }
}

template <class T>
inline constexpr AnyRtti anyRttiImpl = {
    &AnyRtti::DetorImpl<T>,
    &AnyRtti::CopyImpl<T>,
    &AnyRtti::MoveImpl<T>,
    &AnyRtti::EqualImpl<T>
};
```

然后 `Any` 容器还需要支持 Cast 到一个指定类型，即 `As<T>`、`TryAs<T>` 和 `ForceAs<T>`，三中 Cast 分别是校验类型的 Cast、尝试 Cast 和强制 Cast，重点看下 `Convertible()` 就知道里面类型校验是怎么做的了，里面涉及到多态的部分我们先暂且不看：

```cpp
template <typename T>
bool Any::Convertible() const
{
    return Convertible(GetTypeInfo<T>());
}

template <typename T>
T Any::As() const
{
    Assert(Convertible<T>());
    return ForceAs<T>();
}

template <typename T>
T Any::ForceAs() const
{
    if (typeInfo->isLValueReference) {
        return reinterpret_cast<std::add_const_t<std::reference_wrapper<std::remove_reference_t<T>>>*>(data.data())->get();
    } else {
        void* dataPtr = const_cast<uint8_t*>(data.data());
        return *reinterpret_cast<std::remove_reference_t<T>*>(dataPtr);
    }
}

template <typename T>
T* Any::TryAs() const
{
    Assert(!typeInfo->isLValueReference);
    if (Convertible<T>()) {
        void* dataPtr = const_cast<uint8_t*>(data.data());
        return reinterpret_cast<std::remove_reference_t<T>*>(dataPtr);
    } else {
        return nullptr;
    }
}

bool Any::Convertible(const Mirror::TypeInfo* dstType) const
{
    if (typeInfo->id == dstType->id) {
        return true;
    }

    const Mirror::Class* srcClass;
    const Mirror::Class* dstClass;
    if (typeInfo->isPointer && dstType->isPointer) {
        srcClass = Mirror::Class::Find(typeInfo->removePointerType);
        dstClass = Mirror::Class::Find(dstType->removePointerType);
    } else {
        srcClass = Mirror::Class::Find(typeInfo->id);
        dstClass = Mirror::Class::Find(dstType->id);
    }
    return srcClass != nullptr && dstClass != nullptr && srcClass->IsDerivedFrom(dstClass);
}
```

这样我们就拥有了一个方便好用的类型擦除容器了，下面是一些 Samples：

```cpp
TEST(AnyTest, ValueAssignTest)
{
    Mirror::Any a0 = 1;
    ASSERT_EQ(a0.As<int>(), 1);

    const int v1 = 2;
    Mirror::Any a1 = v1;
    ASSERT_EQ(a1.As<const int&>(), 2);

    AnyTestStruct0 v2 = { 1, 2.0f };
    Mirror::Any a2 = v2;
    auto& r2 = a2.As<AnyTestStruct0&>();
    ASSERT_EQ(r2.intValue, 1);
    ASSERT_EQ(r2.floatValue, 2.0f);

    r2.intValue = 3;
    ASSERT_EQ(v2.intValue, 1);

    AnyTestStruct1 v3({ 1, 2 });
    Mirror::Any a3 = std::move(v3);
    const auto& r3 = a3.As<const AnyTestStruct1&>();
    ASSERT_EQ(r3.values[0], 1);
    ASSERT_EQ(r3.values[1], 2);
}

TEST(AnyTest, ValueConstructTest)
{
    Mirror::Any a0(1);
    ASSERT_EQ(a0.As<int>(), 1);

    const int v1 = 2;
    Mirror::Any a1(v1);
    ASSERT_EQ(a1.As<const int>(), 2);
}

TEST(AnyTest, ConvertibleTest)
{
    Mirror::Any a0 = 1;
    ASSERT_EQ(a0.Convertible<int>(), true);
    ASSERT_EQ(a0.Convertible<const int>(), true);
    ASSERT_EQ(a0.Convertible<int&>(), true);
    ASSERT_EQ(a0.Convertible<const int&>(), true);

    const int v0 = 2;
    a0 = v0;
    ASSERT_EQ(a0.Convertible<int>(), true);
    ASSERT_EQ(a0.Convertible<const int>(), true);
    ASSERT_EQ(a0.Convertible<int&>(), true);
    ASSERT_EQ(a0.Convertible<const int&>(), true);

    int v1 = 3;
    a0 = std::ref(v1);
    ASSERT_EQ(a0.Convertible<int>(), true);
    ASSERT_EQ(a0.Convertible<const int>(), true);
    ASSERT_EQ(a0.Convertible<int&>(), true);
    ASSERT_EQ(a0.Convertible<const int&>(), true);

    const int v2 = 4;
    a0 = std::ref(v2);
    ASSERT_EQ(a0.Convertible<int>(), true);
    ASSERT_EQ(a0.Convertible<const int>(), true);
    ASSERT_EQ(a0.Convertible<int&>(), true);
    ASSERT_EQ(a0.Convertible<const int&>(), true);
}
```

# Type

下面我们需要抽象一下所有的类型，并给他们一个数据结构，概括一下反射会用到的就这么几种：

* 变量
* 函数
* 构造函数
* 析构函数
* 成员变量
* 成员函数
* 类
* 枚举

因为所有类型都需要保存名字和 Meta-Data，所以给一个基类 `Type` 来保存这些信息：

```cpp
class MIRROR_API Type {
public:
    virtual ~Type();

    [[nodiscard]] const std::string& GetName() const;
    [[nodiscard]] const std::string& GetMeta(const std::string& key) const;
    [[nodiscard]] std::string GetAllMeta() const;
    bool HasMeta(const std::string& key) const;

protected:
    explicit Type(std::string inName);

private:
    template <typename Derived> friend class MetaDataRegistry;

    std::string name;
    std::unordered_map<std::string, std::string> metas;
};
```

对于其他的每一种具体的类型，其实都是保存了多个 lambda，对于 `Any` 容器里的数据来做类型恢复，并执行类型特有的一些操作，以成员变量举例，成员变量其实需要支持的就是一个 `Getter` 和一个 `Setter`：

```cpp
class MIRROR_API MemberVariable : public Type {
public:
    ~MemberVariable() override;

    template <typename C, typename T>
    void Set(C&& object, T value) const;

    uint32_t SizeOf() const;
    const TypeInfo* GetTypeInfo() const;
    void Set(Any* object, Any* value) const;
    Any Get(Any* object) const;
    void Serialize(Common::SerializeStream& stream, Any* object) const;
    void Deserialize(Common::DeserializeStream& stream, Any* object) const;

private:
    template <typename C> friend class ClassRegistry;

    using Setter = std::function<void(Any*, Any*)>;
    using Getter = std::function<Any(Any*)>;
    using MemberVariableSerializer = std::function<void(Common::SerializeStream&, const MemberVariable&, Any*)>;
    using MemberVariableDeserializer = std::function<void(Common::DeserializeStream&, const MemberVariable&, Any*)>;

    struct ConstructParams {
        std::string name;
        uint32_t memorySize;
        const TypeInfo* typeInfo;
        Setter setter;
        Getter getter;
        MemberVariableSerializer serializer;
        MemberVariableDeserializer deserializer;
    };

    explicit MemberVariable(ConstructParams&& params);

    uint32_t memorySize;
    const TypeInfo* typeInfo;
    Setter setter;
    Getter getter;
    MemberVariableSerializer serializer;
    MemberVariableDeserializer deserializer;
};
```

序列化相关的暂且不管，最关键的 `Setter` 和 `Getter` 将会在后面类型注册的时候被填入这个结构，后面我们只需要拿到 `MemberVariable`，就可以对对应的成员变量执行取值和设置值的操作，像这样：

```cpp
const Mirror::Class& clazz = Mirror::Class::Get("ClassA");
const Mirror::MemberVariable& memberVariableA = clazz.GetMemberVariable("a");

Mirror::Any objectRef = std::ref(object);
Mirror::Any valueA = memberVariableA.Get(objectRef);
std::cout << valueA.As<int>() << std::endl;
```

因为代码量很多，别的一些类型就不展开说了，函数类的其实就是提供 `Invoker` 来做类型恢复，都大差不差，可以去仓库看具体的代码。

# Registry

有了存类型的数据结构，下面我们需要有个地方去做类型注册，这一步会把类型护肤所需要的 lambda 填入类型结构，所以来两个类，一个用来做全局变量函数的注册，一个用来做类的注册：

```cpp
template <typename C>
class ClassRegistry : public MetaDataRegistry<ClassRegistry<C>> {
public:
    ~ClassRegistry() override;

    template <typename... Args>
    ClassRegistry& Constructor(const std::string& inName);

    template <auto Ptr>
    ClassRegistry& StaticVariable(const std::string& inName);

    template <auto Ptr>
    ClassRegistry& StaticFunction(const std::string& inName);

    template <auto Ptr>
    ClassRegistry& MemberVariable(const std::string& inName);

    template <auto Ptr>
    ClassRegistry& MemberFunction(const std::string& inName);

private:
    friend class Registry;

    explicit ClassRegistry(Class& inClass);

    Class& clazz;
};

class MIRROR_API GlobalRegistry : public MetaDataRegistry<GlobalRegistry> {
public:
    ~GlobalRegistry() override;

    template <auto Ptr>
    GlobalRegistry& Variable(const std::string& inName);

    template <auto Ptr>
    GlobalRegistry& Function(const std::string& inName);

private:
    friend class Registry;

    explicit GlobalRegistry(GlobalScope& inGlobalScope);

    GlobalScope& globalScope;
};
```

因为注册的时候需要填入变量或函数的指针，我们可以用 type traits 的技巧获取我们所需要的所有类型：

```cpp
template <typename T>
struct VariableTraits {};

template <typename T>
struct FunctionTraits {};

template <typename T>
struct MemberVariableTraits {};

template <typename T>
struct MemberFunctionTraits {};

template <typename T>
struct VariableTraits<T*> {
    using ValueType = T;
};

template <typename Ret, typename... Args>
struct FunctionTraits<Ret(*)(Args...)> {
    using RetType = Ret;
    using ArgsTupleType = std::tuple<Args...>;
};

template <typename Class, typename T>
struct MemberVariableTraits<T Class::*> {
    using ClassType = Class;
    using ValueType = T;
};

template <typename Class, typename T>
struct MemberVariableTraits<T Class::* const> {
    using ClassType = const Class;
    using ValueType = T;
};

template <typename Class, typename Ret, typename... Args>
struct MemberFunctionTraits<Ret(Class::*)(Args...)> {
    using ClassType = Class;
    using RetType = Ret;
    using ArgsTupleType = std::tuple<Args...>;
};

template <typename Class, typename Ret, typename... Args>
struct MemberFunctionTraits<Ret(Class::*)(Args...) const> {
    using ClassType = const Class;
    using RetType = Ret;
    using ArgsTupleType = std::tuple<Args...>;
};
```

通过这些类型，我们就可以在 lambda 里面去做类型恢复，还是以成员变量为例，在 `Registry` 里面的注册如下：

```cpp
template <typename C>
template <auto Ptr>
ClassRegistry<C>& ClassRegistry<C>::MemberVariable(const std::string& inName)
{
    using ClassType = typename Internal::MemberVariableTraits<decltype(Ptr)>::ClassType;
    using ValueType = typename Internal::MemberVariableTraits<decltype(Ptr)>::ValueType;

    auto iter = clazz.memberVariables.find(inName);
    Assert(iter == clazz.memberVariables.end());

    Mirror::MemberVariable::ConstructParams params;
    params.name = inName;
    params.memorySize = sizeof(ValueType);
    params.typeInfo = GetTypeInfo<ValueType>();
    params.setter = [](Any* object, Any* value) -> void {
        object->As<ClassType&>().*Ptr = value->As<ValueType>();
    };
    params.getter = [](Any* object) -> Any {
        return std::ref(object->As<ClassType&>().*Ptr);
    };
    params.serializer = [](Common::SerializeStream& stream, const Mirror::MemberVariable& variable, Any* object) -> void {
        if constexpr (Common::Serializer<ValueType>::serializable) {
            ValueType& value = variable.Get(object).As<ValueType&>();
            Common::Serializer<ValueType>::Serialize(stream, value);
        } else {
            Unimplement();
        }
    };
    params.deserializer = [](Common::DeserializeStream& stream, const Mirror::MemberVariable& variable, Any* object) -> void {
        if constexpr (Common::Serializer<ValueType>::serializable) {
            ValueType value;
            Common::Serializer<ValueType>::Deserialize(stream, value);
            Any valueRef = std::ref(value);
            variable.Set(object, &valueRef);
        } else {
            Unimplement();
        }
    };

    clazz.memberVariables.emplace(std::make_pair(inName, Mirror::MemberVariable(std::move(params))));
    return MetaDataRegistry<ClassRegistry<C>>::SetContext(&clazz.memberVariables.at(inName));
}
```

这里一看就明白了，最后执行类型 `Set` 和 `Get` 的时候会转调到 `MemberVariable` 的 `setter` 和 `getter` 两个 lambda，而他们其实就是把输入的对象和值用模板来做类型恢复，转换成真正的类型再做操作，因为我们之前已经在 `Any` 容器里面做了转换校验，所以如果传递进来的 `Any` 与我们期望的类型不符则会直接报错。

别的类型也大差不差，其实就是大量注册 lambda 来做类型恢复。

# Serialization

全局变量和成员变量、类还需要支持自动序列化，这块也可以用模板实现，否则我们要去手动遍历可序列化类型然后判断类型做序列化，UE 就是这样，实际上很不方便。

为了支持自动序列化，我们需要先定义输入输出流的接口，来表示不同的序列化目标：

```cpp
class SerializeStream {
public:
    NonCopyable(SerializeStream)
    virtual ~SerializeStream();

    virtual void Write(const void* data, size_t size) = 0;

protected:
    SerializeStream();
};

class DeserializeStream {
public:
    NonCopyable(DeserializeStream);
    virtual ~DeserializeStream();

    virtual void Read(void* data, size_t size) = 0;

protected:
    DeserializeStream();
};
```

这些流可以是文件、字节流、网络流等，具体实现不用再展开。下面我们需要定义序列化和反序列化器：

```cpp
template <typename T>
struct Serializer {
    static constexpr bool serializable = false;

    static void Serialize(SerializeStream& stream, const T& value)
    {
        Unimplement();
    }

    static bool Deserialize(DeserializeStream& stream, T& value)
    {
        Unimplement();
        return false;
    }
};

template <typename T>
requires Serializer<T>::serializable
struct TypeIdSerializer {
    static void Serialize(SerializeStream& stream)
    {
        uint32_t typeId = Serializer<T>::typeId;
        stream.Write(&typeId, sizeof(uint32_t));
    }

    static bool Deserialize(DeserializeStream& stream)
    {
        uint32_t typeId;
        stream.Read(&typeId, sizeof(uint32_t));
        return typeId == Serializer<T>::typeId;
    }
};
```

对于常用的所有类型，我们都需要做特化，来支持传入一个支持的 T，可以自动对其序列化和反序列化：

```cpp
#define IMPL_BASIC_TYPE_SERIALIZER(typeName) \
    template <> \
    struct Serializer<typeName> { \
        static constexpr bool serializable = true; \
        static constexpr uint32_t typeId = Common::HashUtils::StrCrc32(#typeName); \
        \
        static void Serialize(SerializeStream& stream, const typeName& value) \
        { \
            TypeIdSerializer<typeName>::Serialize(stream); \
            stream.Write(&value, sizeof(typeName)); \
        } \
        \
        static bool Deserialize(DeserializeStream& stream, typeName& value) \
        { \
            if (!TypeIdSerializer<typeName>::Deserialize(stream)) { \
                return false;\
            } \
            stream.Read(&value, sizeof(typeName)); \
            return true; \
        } \
    }; \

IMPL_BASIC_TYPE_SERIALIZER(bool)
IMPL_BASIC_TYPE_SERIALIZER(int8_t)
IMPL_BASIC_TYPE_SERIALIZER(uint8_t)
IMPL_BASIC_TYPE_SERIALIZER(int16_t)
IMPL_BASIC_TYPE_SERIALIZER(uint16_t)
IMPL_BASIC_TYPE_SERIALIZER(int32_t)
IMPL_BASIC_TYPE_SERIALIZER(uint32_t)
IMPL_BASIC_TYPE_SERIALIZER(int64_t)
IMPL_BASIC_TYPE_SERIALIZER(uint64_t)
IMPL_BASIC_TYPE_SERIALIZER(float)
IMPL_BASIC_TYPE_SERIALIZER(double)

template <>
struct Serializer<std::string> {
    static constexpr bool serializable = true;
    static constexpr uint32_t typeId = Common::HashUtils::StrCrc32("string");

    static void Serialize(SerializeStream& stream, const std::string& value)
    {
        TypeIdSerializer<std::string>::Serialize(stream);

        uint64_t size = value.size();
        Serializer<uint64_t>::Serialize(stream, size);
        stream.Write(value.data(), value.size());
    }

    static bool Deserialize(DeserializeStream& stream, std::string& value)
    {
        if (!TypeIdSerializer<std::string>::Deserialize(stream)) {
            return false;
        }

        uint64_t size;
        Serializer<uint64_t>::Deserialize(stream, size);
        value.resize(size);
        stream.Read(value.data(), size);
        return true;
    }
};
```

这里要注意的是，做序列化和反序列化的时候，还会使用到一个编译期的字符串 hash 来做类型校验，防止序列化结构发生变化导致反序列化的数据出错。

当然引擎里面常用的类和 std 容器都需要做支持，这里以 `std::vector` 为例看看实现：

```cpp
template <typename T>
requires Serializer<T>::serializable
struct Serializer<std::vector<T>> {
    static constexpr bool serializable = true;
    static constexpr uint32_t typeId
        = Common::HashUtils::StrCrc32("std::vector")
        + Serializer<T>::typeId;

    static void Serialize(SerializeStream& stream, const std::vector<T>& value)
    {
        TypeIdSerializer<std::vector<T>>::Serialize(stream);

        uint64_t size = value.size();
        Serializer<uint64_t>::Serialize(stream, size);

        for (auto i = 0; i < size; i++) {
            Serializer<T>::Serialize(stream, value[i]);
        }
    }

    static bool Deserialize(DeserializeStream& stream, std::vector<T>& value)
    {
        if (!TypeIdSerializer<std::vector<T>>::Deserialize(stream)) {
            return false;
        }

        value.clear();

        uint64_t size;
        Serializer<uint64_t>::Deserialize(stream, size);

        value.reserve(size);
        for (auto i = 0; i < size; i++) {
            T element;
            Serializer<T>::Deserialize(stream, element);
            value.emplace_back(std::move(element));
        }
        return true;
    }
};
```

别的就不再具体展开了，基本常用的类型都做了序列化支持。这时候可以倒回去看上面 `MemberVariable` 里面的 `serialize` 和 `deserialize` 两个 lambda，就明白 `Serializer<T>` 的用途了。

# MirrorTool

在做完上面那些之后，我们还是需要手动注册类型，需要在 static block 去做一堆注册工作：

```cpp
Mirror::Registry::Get()
    .Global()
        .MetaData("TestKey", "Global")
        .Variable<&v0>("v0")
            .MetaData("TestKey", "v0")
        .Function<&F0>("F0")
        .Function<&F1>("F1")
        .Function<&F2>("F2");

Mirror::Registry::Get()
    .Class<C0>("C0")
        .MetaData("TestKey", "C0")
        .StaticVariable<&C0::v0>("v0")
            .MetaData("TestKey", "v0")
        .StaticFunction<&C0::F0>("F0")
            .MetaData("TestKey", "F0");
```

其实这些都可以通过分析头文件来解决，我们先定义一些宏来标记哪些东西需要注册到反射系统中：

```cpp
#if __clang__
#define EProperty(...) __attribute__((annotate("property;" #__VA_ARGS__)))
#define EFunc(...) __attribute__((annotate("func;" #__VA_ARGS__)))
#define EClass(...) __attribute__((annotate("class;" #__VA_ARGS__)))
#define EEnum(...) __attribute__((annotate("enum;" #__VA_ARGS__)))
#define ECtor(...) __attribute__((annotate("constructor;" #__VA_ARGS__)))
#else
#define EProperty(...)
#define EFunc(...)
#define EClass(...)
#define EEnum(...)
#define ECtor(...)
#endif

#define EClassBody(className) \
private: \
    static int _mirrorRegistry; \
public: \
    static const Mirror::Class& GetClass(); \
```

比如我的某个类需要自动注册，那我可以写：

```cpp
class EClass() Foo {
    EClassBody(Foo)

    EProperty()
    int a;

    EFunc()
    void A();
};
```

熟悉 UE 的朋友应该对这个写法都不陌生，那么问题是我们需要怎么去解析头文件，这里我们利用了 `__attribute__((annotate()))` 的特性，这可以让编译器做处理的时候获得一些额外的 attribute，我们利用 `libclang` 来做头文件解析，解析的时候遍历词法节点，如果发现有我们自己添加的这些 attribute，就生成我们所需的自动类型注册代码即可。

代码比较多，可以直接去仓库里看，原理其实不是很复杂。

# 展望

目前来说 Mirror 的功能已经比较完善了，但是目前还是作为 Explosion 的子模块在发光发热，后面可能考虑单独开源出来，给大伙用起来。
