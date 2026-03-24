# Flutter 核心知识 + 高频面试题

---

## 一、Flutter 框架原理

### 1.1 三棵树架构

Flutter 渲染体系的核心是三棵树协同工作：

```
Widget Tree（配置树）
   │  createElement()
   ▼
Element Tree（实例树）← 核心，持有 Widget 引用 + 子 Element
   │  createRenderObject()
   ▼
RenderObject Tree（渲染树）← 负责 Layout / Paint
```

**各层职责：**

| 层 | 特点 | 职责 |
|----|------|------|
| Widget | 不可变（@immutable），轻量 | 描述 UI 配置 |
| Element | 可复用，持有状态 | 维护树结构，协调更新 |
| RenderObject | 复杂，有状态 | 测量、布局、绘制 |

**Q：Widget 是不可变的，那 setState 是如何更新 UI 的？**
> 调用 `setState` → 将当前 `Element` 标记为 dirty → 下一帧 `BuildOwner.buildScope()` 重新调用 `build()` 生成新 Widget → Element 对比新旧 Widget（`canUpdate` 方法）→ 若 runtimeType 和 key 相同则**复用 Element + 更新 RenderObject**，否则替换整棵子树。

**Q：Widget 重建一定会导致 RenderObject 重建吗？**
> 不会。Element 通过 `canUpdate()` 判断是否复用。key 相同、类型相同时 Element 复用，仅更新 RenderObject 的配置属性（如 size/color），避免昂贵的重建。

---

### 1.2 渲染管线

```
Flutter Engine 渲染流程（每帧）：
  vsync 信号
    → Animator::BeginFrame
    → Dart: SchedulerBinding.handleBeginFrame()
       → Build Phase:   重建 dirty Widget
       → Layout Phase:  RenderObject.performLayout()
       → Paint Phase:   RenderObject.paint() → 生成 Layer Tree
    → Compositor:       Layer Tree → GPU 合成
    → GPU 线程:         Skia/Impeller 光栅化上屏
```

**Flutter 渲染 vs Android 原生渲染：**

| | Flutter | Android 原生 |
|---|---|---|
| 渲染引擎 | Skia / Impeller（自带） | Skia（通过 HWUI） |
| 控件系统 | 自绘，不依赖平台控件 | 依赖平台原生控件 |
| 一致性 | 跨平台像素级一致 | 不同 OS 版本有差异 |

---

### 1.3 Dart 运行时 & 编译模式

| 模式 | 场景 | 特点 |
|------|------|------|
| JIT（Just-In-Time） | Debug 模式 | 支持热重载，启动慢 |
| AOT（Ahead-Of-Time） | Release 模式 | 启动快，不支持热重载 |

**Q：Flutter Hot Reload 原理？**
> Debug 模式下 Dart 跑 JIT：
> 1. 文件变更后，工具将 diff 发送给 Flutter Engine
> 2. Dart VM 重新编译变更的库
> 3. Flutter Framework 调用 `reassemble()`，强制重建 Widget 树
> 4. **不重启 App，State 得以保留**

**Q：为什么 Flutter Release 包启动比 Debug 快很多？**
> AOT 模式下 Dart 代码已编译为机器码，无需 VM 解释执行，没有 JIT 编译开销。

---

## 二、状态管理

### 2.1 状态管理方案选型

| 方案 | 复杂度 | 适用场景 | 推荐指数 |
|------|--------|---------|--------|
| setState | 低 | 局部简单状态 | ✅ 简单页面 |
| InheritedWidget | 中 | 跨组件共享，框架内部用 | 了解原理 |
| Provider | 中 | 中小型项目 | ✅ 成熟稳定 |
| Riverpod | 中高 | 现代 Flutter 项目 | ✅✅ 推荐 |
| BLoC / Cubit | 高 | 复杂业务，大型团队 | ✅✅ 企业级 |
| GetX | 低（简单上手） | 快速开发 | ⚠️ 过度封装 |

### 2.2 BLoC 模式

```
UI (Widget)
  │ dispatch Event
  ▼
BLoC / Cubit
  │ emit State
  ▼
UI rebuild (BlocBuilder)
```

**Cubit（BLoC 简化版）示例：**
```dart
// State
class CounterState {
  final int count;
  const CounterState(this.count);
}

// Cubit
class CounterCubit extends Cubit<CounterState> {
  CounterCubit() : super(const CounterState(0));
  
  void increment() => emit(CounterState(state.count + 1));
}

// UI
BlocBuilder<CounterCubit, CounterState>(
  builder: (context, state) => Text('${state.count}'),
)
```

**Q：BLoC 和 MVVM 的本质区别？**
> BLoC 是**严格单向数据流**（Event → BLoC → State），状态不可变，每次变更产生新 State 对象，天然支持时间旅行调试。MVVM 允许双向绑定，状态可变。BLoC 更适合复杂交互的可测试性要求，MVVM 更灵活。

### 2.3 Riverpod（现代推荐）

```dart
// 声明 Provider
final userProvider = FutureProvider<User>((ref) async {
  return ref.watch(repositoryProvider).getUser();
});

// 使用
class UserWidget extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    return user.when(
      data: (u) => Text(u.name),
      loading: () => CircularProgressIndicator(),
      error: (e, _) => Text('Error'),
    );
  }
}
```

**Riverpod 优势：** 编译时安全、支持依赖追踪、天然支持 async、不需要 BuildContext。

---

## 三、性能优化

### 3.1 Widget 重建优化

**原则：减少不必要的 Widget 重建范围**

```dart
// ❌ 不好：整个页面被 setState 触发重建
class BadPage extends StatefulWidget {
  @override
  State<BadPage> createState() => _BadPageState();
}

// ✅ 好：将变化的部分抽离为独立 Widget
class GoodPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const StaticHeader(),      // const = 不会重建
      CounterWidget(),           // 只有它会重建
    ]);
  }
}
```

**核心优化手段：**

| 手段 | 效果 | 说明 |
|------|------|------|
| `const` 构造函数 | 避免重建 | Widget 实例复用 |
| `RepaintBoundary` | 限制重绘范围 | 隔离频繁更新的区域 |
| `ListView.builder` | 按需构建 | 只构建可视区域 item |
| 抽离 StatefulWidget | 缩小重建范围 | 状态下沉到子组件 |

### 3.2 图片与内存优化

```dart
// 指定图片缓存尺寸，避免解码超大图
Image.network(
  url,
  cacheWidth: 200,   // 按需解码分辨率
  cacheHeight: 200,
)

// 自定义 ImageCache 大小
PaintingBinding.instance.imageCache.maximumSizeBytes = 100 << 20; // 100MB
```

### 3.3 列表优化

```dart
ListView.builder(
  // 指定 item 高度，避免 layout 重算
  itemExtent: 60.0,
  // 或使用 SliverFixedExtentList 性能更好
  itemBuilder: (ctx, i) => ItemWidget(data: list[i]),
  itemCount: list.length,
)
```

**Q：如何检测 Flutter 应用的卡顿？**
> 1. `flutter run --profile` 模式下用 **DevTools → Performance** 分析帧耗时
> 2. 关注 **UI Thread（Dart）** 和 **Raster Thread（GPU）** 是否超过 16ms
> 3. 线上方案：`SchedulerBinding.instance.addTimingsCallback` 收集帧耗时上报
> 4. `WidgetsBinding.instance.addObserver` 监测 FPS 变化

---

## 四、平台能力 & 通信

### 4.1 Platform Channel 三种类型

| 类型 | 用途 | 方向 |
|------|------|------|
| `MethodChannel` | 一次性方法调用 | 双向 |
| `EventChannel` | 持续事件流（传感器/蓝牙） | 原生 → Flutter |
| `BasicMessageChannel` | 低层消息传递 | 双向 |

**MethodChannel 示例：**
```dart
// Dart 端
const channel = MethodChannel('com.example/battery');
final level = await channel.invokeMethod<int>('getBatteryLevel');
```
```kotlin
// Android 端
MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.example/battery")
  .setMethodCallHandler { call, result ->
    if (call.method == "getBatteryLevel") {
      result.success(getBatteryLevel())
    } else {
      result.notImplemented()
    }
  }
```

### 4.2 Isolate 并发模型

**Dart 是单线程模型**，通过 Isolate 实现并行：
- Isolate 之间**不共享内存**，通过 Port 传递消息（序列化）
- 主 Isolate 负责 UI，耗时任务放子 Isolate

```dart
// 简单用法：compute（底层是 Isolate）
final result = await compute(parseJson, jsonString);

// 完整 Isolate 用法（复杂任务）
final receivePort = ReceivePort();
await Isolate.spawn(heavyTask, receivePort.sendPort);
final result = await receivePort.first;
```

**Q：Flutter 的 Isolate 和 Android 的 Thread 有什么区别？**
> Android Thread 通过共享内存通信，需要锁机制防竞态。Dart Isolate 完全隔离内存，通过消息传递，没有竞态问题，但消息需序列化，大数据传递有开销（`TransferableTypedData` 可零拷贝传递 ByteData）。

---

## 五、Flutter 工程化

### 5.1 项目架构分层（推荐）

```
lib/
├── app/                  # App 入口、路由、主题
├── features/             # 功能模块（特性导向）
│   ├── auth/
│   │   ├── data/         # Repository + DataSource
│   │   ├── domain/       # Entity + UseCase
│   │   └── presentation/ # Page + ViewModel/BLoC
│   └── home/
├── core/                 # 共享基础能力
│   ├── network/
│   ├── storage/
│   └── ui/               # 通用组件
└── generated/            # 代码生成文件
```

### 5.2 多环境配置（Flavors）

```dart
// main_dev.dart
void main() {
  AppConfig.setup(env: Env.dev, baseUrl: 'https://dev-api.example.com');
  runApp(const MyApp());
}

// main_prod.dart  
void main() {
  AppConfig.setup(env: Env.prod, baseUrl: 'https://api.example.com');
  runApp(const MyApp());
}
```

### 5.3 自动化测试策略

```
单元测试（Unit Test）：  测试 UseCase / Repository / BLoC
Widget 测试：           测试单个 Widget 渲染与交互
集成测试：             模拟完整用户流程（integration_test）
```

**Q：Flutter 测试与 Android 测试体系对比？**

| | Flutter | Android |
|---|---|---|
| 单元测试 | `flutter_test` | JUnit / Mockito |
| UI 测试 | `WidgetTester` | Espresso / Compose Testing |
| 集成测试 | `integration_test` | UI Automator |
| Mock | `mockito` / `mocktail` | Mockito |

---

## 六、Dart 语言特性（面试高频）

**空安全（Null Safety）：**
```dart
String name = 'Alice';     // 非空
String? nickname = null;   // 可空
String result = nickname ?? 'default';  // 空合并
String length = nickname!.length;       // 强制断言（慎用）
```

**异步模型：**
```dart
// Future - 单次异步
Future<User> getUser() async {
  final json = await http.get(url);
  return User.fromJson(json);
}

// Stream - 多次异步
Stream<int> counter() async* {
  for (int i = 0; i < 10; i++) {
    await Future.delayed(Duration(seconds: 1));
    yield i;
  }
}
```

**Q：Dart 的 async/await 和 Kotlin 协程的本质区别？**
> Dart async/await 是**单线程事件循环**，本质是语法糖，底层是 Future/Microtask 队列，不涉及线程切换。Kotlin 协程是**协作式多线程**，可通过 Dispatcher 调度到不同线程（IO/Main/Default），适合 CPU 密集型任务。两者都实现了"用同步写法写异步代码"的目标，但执行模型不同。
