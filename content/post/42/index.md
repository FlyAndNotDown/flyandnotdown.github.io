---
title: "std::tuple 学习笔记"
description: "std 标准系列学习笔记"
date: "2021-06-28"
slug: "42"
categories:
    - 技术
tags:
    - CPP
keywords:
    - c++
    - std
    - tuple
---

`std::tuple` 是泛化的 `std::pair`，用于存储一组任意类型的数据，可以通过 `std::get` 来访问其元素：

```cpp
int main(int argc, char* argv[])
{
    std::tuple<int, double, std::string> tuple = std::make_tuple(1, 2.0, "hello");
    std::cout << std::get<0>(tuple) << std::endl;
    std::cout << std::get<1>(tuple) << std::endl;
    std::cout << std::get<2>(tuple) << std::endl;
}
```

也可以使用类型来查找元素：

```cpp
int main(int argc, char* argv[])
{
    std::tuple<int, double, std::string> tuple = std::make_tuple(1, 2.0, "hello");
    std::cout << std::get<int>(tuple) << std::endl;
    std::cout << std::get<double>(tuple) << std::endl;
    std::cout << std::get<std::string>(tuple) << std::endl;
}
```

如果 `std::tuple` 中具有两个以上的相同类型的元素，则不能使用该类型进行查找：

```cpp
int main(int argc, char* argv[])
{
    std::tuple<int, int, std::string> tuple = std::make_tuple(1, 2, "hello");
    // 编译期错误
    std::cout << std::get<int>(tuple) << std::endl;
    std::cout << std::get<int>(tuple) << std::endl;
    std::cout << std::get<std::string>(tuple) << std::endl;
}
```

可以使用 `std::tie` 来对 `std::tuple` 进行解包：

```cpp
int main(int argc, char* argv[])
{
    std::tuple<int, double, std::string> tuple = std::make_tuple(1, 2.0, "hello");

    int a;
    double b;
    std::string c;
    std::tie(a, b, c) = tuple;

    std::cout << a << std::endl;
    std::cout << b << std::endl;
    std::cout << c << std::endl;
}
```

可以使用 `std::tuple_cat` 来合并多个 `std::tuple`：

```cpp
int main(int argc, char* argv[])
{
    auto tuple1 = std::make_tuple(1, 2.0);
    auto tuple2 = std::make_tuple("hello");
    auto tuple = std::tuple_cat(tuple1, tuple2);

    int a;
    double b;
    std::string c;
    std::tie(a, b, c) = tuple;

    std::cout << a << std::endl;
    std::cout << b << std::endl;
    std::cout << c << std::endl;
}
```

可以使用 `std::tuple_size` 来获取某个类型的 `std::tuple` 的长度：

```cpp
int main(int argc, char* argv[])
{
    std::cout << std::tuple_size<std::tuple<int, double>>::value << std::endl;
}
```

也可以直接使用 `std::tuple_size_v` 替代：

```cpp
int main(int argc, char* argv[])
{
    std::cout << std::tuple_size_v<std::tuple<int, double>> << std::endl;
}
```

通常用于元编程中获取模板参数中 `std::tuple` 的长度：

```cpp
template <typename... Args>
size_t GetTupleSize(const std::tuple<Args...>& tuple)
{
    return std::tuple_size_v<std::tuple<Args...>>;
}

int main(int argc, char* argv[])
{
    auto tuple = std::make_tuple(1, 2.0);
    std::cout << GetTupleSize(tuple) << std::endl;
}
```

可以在元编程中使用 `std::tuple_element_t` 提取 `std::tuple` 中元素的类型，下面是一个完整的例子：

```cpp
template <uint32_t I, typename... Args>
std::tuple_element_t<I, std::tuple<Args...>> GetTupleValue(const std::tuple<Args...>& tuple)
{
    return std::get<I>(tuple);
}

int main(int argc, char* argv[])
{
    auto tuple = std::make_tuple(1, 2, "hello");
    std::cout << GetTupleValue<0>(tuple) << std::endl;
    std::cout << GetTupleValue<1>(tuple) << std::endl;
}
```

可以使用 `std::forword_tuple` 来将模板可变参转换成一个 `std::tuple`：

```cpp
template <typename... Args>
auto MakeTuple(const Args&... args)
{
    return std::forward_as_tuple(args...);
}

int main(int argc, char* argv[])
{
    auto tuple = MakeTuple(1, 2.0, "hello");

    std::cout << std::get<0>(tuple) << std::endl;
    std::cout << std::get<1>(tuple) << std::endl;
    std::cout << std::get<2>(tuple) << std::endl;
}
```