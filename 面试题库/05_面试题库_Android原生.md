# 面试题库 · Android 原生

> 难度等级：⭐ 初级 · ⭐⭐ 中级 · ⭐⭐⭐ 高级 · ⭐⭐⭐⭐ 资深 · ⭐⭐⭐⭐⭐ 架构师

---

## 一、系统原理

---

### Q1：Android 为什么选择 Binder 作为 IPC 机制，而不用 Socket 或共享内存？

- **难度：** ⭐⭐⭐
- **考查点：** Binder 原理、IPC 机制横向对比、系统设计取舍

**参考答案：**

| 方案 | 内存拷贝次数 | 安全性 | 复杂度 |
|------|------------|--------|--------|
| 管道 / Socket | 2 次 | 无内核身份验证 | 低 |
| 共享内存 | 0 次 | 需额外同步，易出错 | 高 |
| **Binder** | **1 次** | **内核携带 UID/PID，天然鉴权** | **中** |

Binder 通过 `mmap` 在内核开辟一块共享区域，数据从发送方用户空间拷贝到内核后，接收方直接映射读取，只需 1 次拷贝。同时，Binder 驱动在内核层校验调用方 UID/PID，不需要应用层额外鉴权，安全性高。综合性能、安全、易用三个维度，Binder 是最优选择。

**加分点：** 提到 ServiceManager 作为"服务 DNS"角色，以及 AIDL 是 Binder 的上层封装。

---

### Q2：请详细描述 Handler / Looper / MessageQueue 的工作原理，主线程 Looper 死循环为何不会造成 ANR？

- **难度：** ⭐⭐⭐
- **考查点：** 消息机制、线程模型、epoll 机制

**参考答案：**

**工作原理：**
1. `Looper.prepare()` 为当前线程创建 `Looper` 和 `MessageQueue`
2. `Looper.loop()` 开启死循环，不断调用 `MessageQueue.next()` 取消息
3. `Handler` 持有当前线程的 `Looper` 引用，`sendMessage()` 将 `Message` 插入 `MessageQueue`（按时间排序）
4. `MessageQueue.next()` 取到消息后，回调 `Handler.dispatchMessage()` 处理

**为何不 ANR：**
`MessageQueue.next()` 底层调用 `epoll_wait`，队列为空时线程**挂起**（不占 CPU），等待事件唤醒。ANR 的本质是**某条消息的处理时间超过阈值**（Activity 5s / BroadcastReceiver 10s），而非 Looper 循环本身阻塞。

**加分点：** 提到 `IdleHandler` 在队列空闲时回调，可用于延迟初始化。

---

### Q3：完整描述一次 Android App 冷启动的全流程

- **难度：** ⭐⭐⭐⭐
- **考查点：** AMS/Zygote/Application/Activity 生命周期、启动优化入手点

**参考答案：**

```
1. 用户点击桌面图标
2. Launcher 通过 Binder 通知 AMS 启动目标 Activity
3. AMS 检查目标进程不存在 → 通过 Socket 请求 Zygote fork 新进程
4. Zygote fork → 执行 ActivityThread.main()
5. ActivityThread 通过 Binder 向 AMS 注册，AMS 回调 bindApplication
6. 执行 Application.attachBaseContext() → Application.onCreate()
7. AMS 通知启动目标 Activity
8. Activity.onCreate() → setContentView() → inflate 布局
9. onStart() → onResume()
10. ViewRootImpl 触发首帧 measure/layout/draw
11. 第一帧上屏，用户可见
```

热启动：进程和 Activity 均存活，直接回到前台。  
温启动：进程存活但 Activity 已销毁，跳过步骤 1-6，从步骤 7 开始。

**加分点：** 能说出各阶段的优化手段（Application 异步初始化、ViewStub 懒加载、windowBackground 消除白屏）。

---

### Q4：View 的 invalidate() 和 requestLayout() 有什么区别？什么场景用哪个？

- **难度：** ⭐⭐
- **考查点：** View 绘制流程三阶段理解

**参考答案：**

| 方法 | 触发阶段 | 使用场景 |
|------|---------|---------|
| `invalidate()` | 仅 draw | 视觉状态变化（颜色/文字），尺寸不变 |
| `requestLayout()` | measure + layout + draw | 尺寸或位置发生变化 |

`invalidate()` 只将当前 View 标记为脏区，下一帧重绘，不重新测量和布局，性能开销小。`requestLayout()` 会向上冒泡到 `ViewRootImpl`，触发整棵树的重新测量和布局，开销更大，应按需使用。

---

### Q5：谈谈你对 MeasureSpec 的理解，wrap_content 和 match_parent 在自定义 View 中需要特殊处理吗？

- **难度：** ⭐⭐⭐
- **考查点：** 自定义 View、测量流程

**参考答案：**

`MeasureSpec` 是一个 32 位 int，高 2 位是模式，低 30 位是尺寸值，三种模式：
- `EXACTLY`：父容器给出精确尺寸（`match_parent` 或具体 dp 值）
- `AT_MOST`：子 View 不能超过父容器给的上限（`wrap_content`）
- `UNSPECIFIED`：不限制（`ScrollView` 对子 View 测量时使用）

**需要特殊处理：** 使用 `wrap_content` 时，若 `onMeasure` 不处理 `AT_MOST` 模式，View 会撑满父容器（行为等同 `match_parent`）。正确做法：

```kotlin
override fun onMeasure(widthSpec: Int, heightSpec: Int) {
    val w = if (MeasureSpec.getMode(widthSpec) == MeasureSpec.AT_MOST)
        desiredWidth  // 使用自身计算的期望宽度
    else
        MeasureSpec.getSize(widthSpec)
    setMeasuredDimension(w, ...)
}
```

---

## 二、性能优化

---

### Q6：如何系统性地建立 App 内存治理体系？（架构师题）

- **难度：** ⭐⭐⭐⭐⭐
- **考查点：** 内存优化体系化思维、线上监控、技术治理

**参考答案：**

分四个层次建立体系：

**1. 问题发现（检测）**
- 线下：`LeakCanary` 自动检测 Activity/Fragment/ViewModel 泄漏
- 线上：监控 OOM 率、GC 频率、PSS 增长趋势，超阈值告警
- 工具：Android Studio Profiler → Heap Dump 定期分析

**2. 规范约束（预防）**
- Bitmap 必须通过 Glide/Coil 统一加载，禁止裸调 `BitmapFactory.decode`
- 静态持有 Context 禁止，`Application Context` 和 `Activity Context` 明确区分
- 集合类及时清理，`onDestroy` 中注销监听器/回调

**3. 优化手段（治理）**
- 大对象使用对象池（`Pools.SimplePool`）
- 图片按需解码（`inSampleSize` / `cacheWidth/Height`）
- 用 `SparseArray` 替代 `HashMap<Int, Object>`

**4. 持续监控（运营）**
- 每版本发布前跑内存回归测试
- 建立关键页面内存基线，版本对比告警

---

### Q7：如何排查并解决 RecyclerView 列表滑动卡顿问题？

- **难度：** ⭐⭐⭐
- **考查点：** 渲染优化、RecyclerView 机制、工具使用

**参考答案：**

**排查步骤：**
1. `Systrace` / `Perfetto` 抓取滑动期间 trace，定位主线程耗时帧
2. 检查 `onBindViewHolder` 是否有耗时操作（IO / 复杂计算）
3. 检查 item 布局层级是否过深（Hierarchy Viewer / Layout Inspector）

**常见优化手段：**

| 问题 | 解决方案 |
|------|---------|
| onBindViewHolder 有 IO | 数据提前加载，bind 时只做赋值 |
| 图片加载抖动 | Glide 异步加载 + 占位图，避免主线程解码 |
| 每次刷新全量 notifyDataSetChanged | 改用 `DiffUtil` 局部刷新 |
| item 高度不固定导致频繁 layout | 设置 `itemExtent` 或固定高度 |
| 图片尺寸不一致 | 统一图片容器尺寸，避免 layout 重算 |
| 预加载不足 | `setInitialPrefetchItemCount()` 提前预取 |

---

### Q8：APK 包体积过大，你有哪些优化手段？能做到多大效果？

- **难度：** ⭐⭐⭐
- **考查点：** 包体积优化全面性

**参考答案：**

| 优化手段 | 预期收益 |
|---------|---------|
| 开启 R8 完整混淆（shrink + optimize + obfuscate） | 代码缩减 20-40% |
| `shrinkResources true` 移除无用资源 | 资源减少 5-15% |
| 图片转 WebP（有损/无损） | 图片体积减少 25-35% |
| 移除 ABI（只保留 arm64-v8a） | native 库减少 50% |
| 使用 Android App Bundle（AAB） | 用户下载体积减少 15-50% |
| 大资源动态下发（RN bundle/图片包） | 视情况减少数十 MB |
| 审查重复依赖（不同版本同一库） | 视项目而定 |

**实际经验：** 综合使用上述手段，50MB 的 APK 通常可压缩到 30MB 左右，通过 AAB 下发用户实际下载包可进一步减少。

---

## 三、架构与 Jetpack

---

### Q9：ViewModel 是如何在 Activity 旋转时保存数据的？和 onSaveInstanceState 有什么区别？

- **难度：** ⭐⭐⭐
- **考查点：** ViewModel 原理、配置变更机制

**参考答案：**

**ViewModel 保存原理：**
ViewModel 存储在 `ViewModelStore` 中，而 `ViewModelStore` 通过 `Activity.onRetainNonConfigurationInstance()` 在配置变更时保存到 `NonConfigurationInstances` 对象，该对象不随 Activity 销毁，新 Activity 实例通过 `getLastNonConfigurationInstance()` 恢复，因此 ViewModel 实例得以存活。

**对比：**

| | ViewModel | onSaveInstanceState |
|---|---|---|
| 存储位置 | 内存 | Bundle（序列化磁盘） |
| 数据大小 | 无限制 | 建议 < 50KB |
| 进程被杀后 | 数据丢失 | 数据保留 |
| 适合场景 | 网络数据、大量 UI 状态 | 少量需跨进程恢复的状态 |

**加分点：** 两者配合使用，ViewModel 存数据，`SavedStateHandle` 存需要跨进程恢复的少量关键参数。

---

### Q10：LiveData 和 StateFlow 各自的特点是什么？现在新项目你会选哪个？

- **难度：** ⭐⭐⭐
- **考查点：** 响应式编程、协程体系

**参考答案：**

| 特性 | LiveData | StateFlow |
|------|---------|-----------|
| 生命周期感知 | 自动（内置） | 需 `repeatOnLifecycle` |
| 初始值 | 可为 null | 必须设置初始值 |
| 线程切换 | `postValue` 切主线程 | 需 `flowOn` 或在协程中 collect |
| 背压处理 | 无（自动合并） | SharedFlow 可配置缓冲 |
| 与 Compose 集成 | 需转换 | 原生支持 |
| 可测试性 | 需 `InstantTaskExecutorRule` | 协程 `TestScope` 直接测 |

**新项目推荐 StateFlow：** 配合 Kotlin 协程体系，一致性更好，Compose 原生支持，可测试性更强。但需注意正确使用 `repeatOnLifecycle(STARTED)` 而非 `lifecycleScope.launch`，避免后台状态泄漏。

---

### Q11：请介绍大型项目的模块化分层方案，模块间如何避免循环依赖？

- **难度：** ⭐⭐⭐⭐⭐
- **考查点：** 模块化架构、依赖管理、工程治理

**参考答案：**

**分层结构：**
```
app（壳工程）
├── feature_xxx（功能模块，横向平级，不互相依赖）
├── core_ui（通用 UI 组件）
├── core_network（网络基础设施）
├── core_database（本地存储）
└── core_common（工具类/常量/扩展）
```

**避免循环依赖的核心原则：**
1. **依赖方向单向**：feature 依赖 core，core 之间谨慎依赖，禁止 feature 互相依赖
2. **接口下沉**：若 feature_A 需要 feature_B 的能力，将接口定义下沉到 core 层，各自实现
3. **依赖注入解耦**：通过 Hilt 在 app 壳中绑定具体实现，feature 只依赖接口
4. **事件总线**：跨模块通知使用 SharedFlow，不产生直接依赖

**检测循环依赖：** Gradle 自带检测，构建时报 `Circular dependency` 错误；也可用 `dependency-analysis-gradle-plugin` 分析模块依赖图。

---

### Q12：Kotlin 协程和 Java 线程池的区别是什么？什么场景下协程更有优势？

- **难度：** ⭐⭐⭐
- **考查点：** 协程原理、并发模型

**参考答案：**

| 维度 | 协程 | 线程池 |
|------|------|--------|
| 创建开销 | 极低（用户态切换） | 较高（内核态线程） |
| 阻塞处理 | 挂起不占线程 | 阻塞占用线程 |
| 异常传播 | 结构化并发，父协程自动感知子协程异常 | 需手动处理 |
| 代码可读性 | 同步写法写异步，可读性高 | 回调嵌套，可读性差 |
| 取消机制 | `cancel()` 协作式取消，自动传播 | 需手动检查 interrupted |

**协程更有优势的场景：**
- **IO 密集型**：大量并发网络请求，挂起等待不占线程，比线程池资源利用率高得多
- **串行异步**：多步异步操作顺序执行，用 `async/await` 替代回调地狱
- **生命周期绑定**：`viewModelScope` / `lifecycleScope` 自动取消，无需手动管理

**线程池仍有优势：** CPU 密集型计算、Java 互操作、需要精细控制线程优先级的场景。
