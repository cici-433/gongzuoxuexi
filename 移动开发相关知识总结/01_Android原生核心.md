# Android 原生核心知识 + 高频面试题

---

## 一、系统原理

### 1.1 Binder IPC 机制

**原理概述：**

Binder 是 Android 专有的进程间通信（IPC）机制，基于 OpenBinder 改造。

```
Client 进程                  Kernel（Binder 驱动）             Server 进程
   │                               │                               │
   │── binder_transaction ────────>│                               │
   │                               │── 内存映射（mmap）───────────>│
   │                               │   copy_from_user（1次拷贝）   │
   │<── 返回结果 ──────────────────│<───────────────────────────── │
```

**核心设计：**
- 内存只拷贝 **1次**（传统 Socket/管道需要 2次）
- 基于 `mmap` 在内核开辟共享内存区域
- ServiceManager 充当 DNS，维护服务注册表

**为什么选 Binder 而非 Socket / 共享内存？**

| 方案 | 拷贝次数 | 安全性 | 使用复杂度 |
|------|--------|--------|----------|
| 管道/Socket | 2次 | 无身份验证 | 低 |
| 共享内存 | 0次 | 需额外同步机制 | 高 |
| **Binder** | **1次** | **携带 UID/PID，内核保证** | **中** |

> **面试答法**：Binder 在性能（1次拷贝）、安全性（内核鉴权）、易用性之间取得最优平衡，这是 Android 选择它的根本原因。

**性能：为什么 Binder 更快**
- **一次拷贝的真实含义**：发送方把 `Parcel` 数据从用户态拷贝进内核态的 Binder 缓冲区（`copy_from_user`）。接收方不是再从内核拷贝一份到用户态，而是通过 `mmap` 把这块缓冲区映射到自己的进程地址空间直接读取，所以整体体现为“1 次拷贝”。
- **避免大数据复制**：Binder 支持“携带文件描述符（FD）”的能力，实际工程里大对象常用 `ashmem/共享内存 + FD 传递`，Binder 只传元数据/句柄，进一步降低拷贝与 GC 压力。
- **调用链路更短更可控**：Binder 属于内核驱动 + ioctl 的同步 RPC 风格，线程调度、唤醒路径相对固定；相比基于网络栈的 Socket（协议栈、缓冲区、更多拷贝/上下文切换），整体开销更稳定。
- **并发模型友好**：Server 端通常使用 Binder 线程池处理并发请求，客户端还能用 `oneway`（异步）减少等待，结合主线程避免阻塞的策略更容易做性能治理。

**安全性：为什么 Binder 更安全**
- **唯一安检入口（UID/PID 校验）**：当应用 A 想访问应用 B 的服务时，Binder 驱动（内核态）会像安检员一样自动记录 A 的用户 ID（UID）和进程 ID（PID）。即便 A 试图冒充系统应用，也无法伪造这一级别的真实 UID。
- **权限托管（ServiceManager）**：所有服务都需要在 ServiceManager 中注册。如果应用没有相应权限，即使查到服务名也拿不到对应引用，从源头拦截未授权访问。
- **服务调用隔离**：每个进程都有自己的独立沙盒。Binder 在内核中完成了代理（Proxy）到实体（Stub）的转换，外部进程无法直接触碰真实的 Server 对象，只能按约定的接口进行规范化的数据交互。

**扩展性：为什么 Binder 易扩展**
- **AIDL(Android Interface Definition Language)简化开发**：开发者只需定义 `.aidl` 接口文件，工具会自动生成客户端（Proxy）和服务端（Stub）的 Java/Kotlin 代码，无需处理复杂的底层 socket 或 ioctl 调用。
- **能从“打电话”升级到“发短信/回拨/订阅”**：除了最基本的同步调用，还能做异步 `oneway`（不等结果直接返回）、回调 Listener（服务端主动通知客户端）、`linkToDeath`（服务端挂了通知你重连）。这些能力是现成的，你按需要组合，就能把交互从简单请求扩展到更复杂的业务形态。
- **接口升级不容易把老版本搞崩**：需要新能力时，可以新增方法或增加可选信息，老客户端还能继续按旧方法调用；再配合“版本号/能力判断”，就能让新旧版本在一段时间内共存，方便灰度发布和长期演进。

**知识延伸**

**用户态 vs 内核态：这段话在说什么**
- **用户态（User Space）**：普通 App/进程运行的空间，权限受限，不能直接访问硬件和关键内存区域。应用代码（Java/Kotlin/Dart/NDK）大部分都运行在用户态。
- **内核态（Kernel Space）**：操作系统内核运行的空间，拥有最高权限，负责进程调度、内存管理、驱动、文件系统等。只有内核态代码才能直接操作硬件与核心资源。
- **为什么要区分**：这是一种“隔离 + 保护”机制。用户态出错通常只影响当前进程；内核态出错可能导致系统不稳定甚至崩溃。
- **如何切换**：当应用发起系统调用（syscall）或通过驱动接口（如 ioctl）请求内核服务时，会发生从用户态到内核态的受控切换；处理完成后再返回用户态。切换本身有成本（陷入/返回、上下文切换、缓存影响）。
- **和 Binder 的关系**：Binder 把“跨进程通信”放到内核驱动里做，调用链路里一定包含用户态→内核态→用户态的切换。所谓“1 次拷贝”指的是把数据从发送方用户态拷到内核缓冲区一次；接收方再通过 `mmap` 把这块内核缓冲区映射到自己的用户态地址空间直接读，从而避免再拷贝一次。

**Binder 共享缓冲区：为什么常说“1M-8K”**
- **先记一句话**：同一个进程里，所有 Binder 调用共用一块“收发包裹的缓冲区”（可以把它想成“快递暂存柜”），这块柜子是有容量上限的。
- **缓冲区是怎么来的**：进程第一次用 Binder 时，会 `mmap` 映射一块内核管理的事务缓冲区。之后这个进程里不管调用哪个 Binder 服务、并发多少次，事务数据最终都要占用这块缓冲区的空间。
- **“1M-8K”是什么意思**：常见实现里这块缓冲区大约 1MB，但要留出一部分做管理/对齐（面试常说预留约 8KB），所以有效可用大小常被描述为“1MB - 8KB”。不同版本/厂商可能略有差异，但结论一致：容量有限。
- **你会遇到什么问题**：如果你把大对象塞进 Intent/Bundle/AIDL（例如大 List、大 Bitmap、大字符串），可能直接报 `TransactionTooLargeException` / `FAILED_TRANSACTION`；或者在并发高峰期因为“暂存柜满了”，出现偶发失败/卡顿。
- **怎么规避**：大数据不要走 Binder 事务体，改走“文件/共享内存 + 传句柄（FD/URI/路径）”；Binder 里只传小对象、id、参数，让数据通过专用通道拉取。

**Binder 的应用：不止调用系统服务**
- **系统服务调用（最常见）**：`ActivityManager`、`PackageManager`、`WindowManager`、`LocationManager`、`NotificationManager` 等，本质都是 App 通过 Binder 去请求 system_server 的能力。
- **App 自己的跨进程服务**：在 `Service` 上声明 `android:process=":remote"`，通过 AIDL/Messenger 对外暴露接口，让同 App 的其它进程或其它 App 调用（典型：下载进程、音视频播放进程、Web/渲染进程）。
- **ContentProvider 的跨进程访问**：Provider 的查询/插入/更新/删除等跨进程调用，底层也是基于 Binder 的 IPC（你看到的是 `ContentResolver` API，背后是 Binder 事务）。
- **Messenger/IBinder 回调**：`Messenger` 是对 Binder 的封装（基于 Message 的 IPC），适合简单命令与回调；AIDL 也支持 callback（Listener）实现双向通信。
- **系统/厂商的 Native 服务与 HAL**：Android 生态里大量“用户态系统组件”之间也用 Binder 通信（例如媒体、相机、图形相关的服务链路）；在新架构里很多 HAL 也会通过 AIDL/HIDL（基于 Binder）把能力提供给 Framework。

**Binder 线程池：到底在“池”什么**
- **角色定位**：Binder 更像“内核驱动实现的 RPC”。一次跨进程调用 = 客户端线程发起事务 → 进入内核 Binder 驱动 → 服务端进程里的某个线程被唤醒执行 `onTransact()`（或 AIDL Stub 方法）→ 返回结果。
- **线程从哪来**：服务端进程会向 Binder 驱动注册自己可以接单的线程。典型情况下：
  - **系统服务**（system_server）会启动/管理自己的 Binder 线程池，用来承接来自各 App 的并发请求。
  - **普通 App 的 Binder 服务**（例如你在某个进程里实现 AIDL Service）也会通过 Framework/Native 层机制把若干线程加入“可接单集合”，避免所有请求都压在主线程。
- **调度原则（可理解版本）**：当某个服务端对象收到事务时，驱动会从“可接单线程”里挑一个可运行线程把事务投递给它；如果没有空闲线程且还没到上限，可能促使进程创建/唤醒更多线程来处理堆积的请求。
- **为什么不直接用主线程**：Binder 调用如果阻塞（IO/锁/耗时计算），把它放主线程会直接拖慢 UI；线程池让耗时事务在后台并发处理，把主线程留给渲染与输入响应。
- **线程池不是万能**：线程池解决的是“承载并发”的问题，但事务处理内部如果拿全局锁、做大 IO 或者级联调用其它系统服务，仍然会产生排队与“优先级倒置/锁竞争”等问题，最终表现为卡顿或 ANR。

**工程实践：如何写出线程池友好的 Binder 服务**
- **避免在 Binder 线程里做重 IO**：文件/DB/网络尽量异步或转交专用线程池；否则 Binder 线程被占满，会拖慢其它调用方。
- **控制事务粒度**：把大任务拆成“发起请求→异步处理→回调/轮询获取结果”，或使用 `oneway` 做异步通知，降低同步等待时间。
- **防止级联死锁**：A 调用 B 的同时又等待 B 回调 A（或相互调用）很容易出现死锁/阻塞链；跨进程回调要么异步，要么定义明确的超时与线程模型。
- **善用身份校验与限流**：服务端按 UID 做权限校验、并对高频接口限流/熔断，避免单个调用方把线程池打满影响全局。

---

### 1.2 Handler / Looper / MessageQueue

**四大核心类：**
- `Message`：消息载体（what/arg/obj/target）
- `MessageQueue`：基于链表的优先队列（按时间排序）
- `Looper`：持有 MQ，`loop()` 死循环取消息
- `Handler`：发送 + 处理消息，持有 Looper 引用

**消息循环流程：**
```
Thread.main()
  └── Looper.prepareMainLooper()
        └── Looper.loop()
              └── MessageQueue.next()
                    └── Handler.dispatchMessage()
```

**从“发送”到“执行”：按步骤理解**
- **1）决定发到哪里**：`Handler` 绑定一个 `Looper`（也就绑定了一个线程）。你用这个 `Handler` 发消息，最终一定在这个 `Looper` 所在线程执行。
- **2）把任务包装成 Message**：`sendMessage()` / `post(Runnable)` 本质都会变成一个 `Message`，并且把 `target` 指向当前 `Handler`（表示“将来由谁处理它”）。
- **3）把 Message 放进队列**：`MessageQueue.enqueueMessage()` 会按执行时间 `when` 把消息插入链表（最早执行的排在前面）。
- **4）如果 Looper 正在睡，就叫醒它**：当队列头发生变化或来了更早的消息，队列会唤醒阻塞中的 `next()`，避免它一直睡到更晚的时间点。
- **5）Looper.loop 反复取消息**：`loop()` 在 while 循环里不断调用 `queue.next()` 拿到“当前应该执行的那条 Message”。
- **6）next 的阻塞点**：如果队列空，或下一条消息还没到执行时间，`next()` 会在 native 层等待（底层是 epoll 机制），线程挂起但不占用 CPU。
- **7）把消息交给 target**：取到消息后，`msg.target.dispatchMessage(msg)` 把它交给当初设置的 `Handler`。
- **8）dispatchMessage 的三段式**：先执行 `post(Runnable)` 的 Runnable，其次执行创建 Handler 时传入的 `Handler.Callback`，最后才进入 `handleMessage()`。
- **9）收尾复用对象**：消息处理完会被回收复用（减少频繁 GC），所以 `Message` 不能长期持有引用当成业务对象使用。

**dispatchMessage 到底会走哪条分支**
- `post { ... }`：走 `Message.callback`（最优先）
- `Handler(Looper, callback)`：走 `Handler.Callback`（其次）
- `override fun handleMessage(msg: Message)`：走 `handleMessage`（兜底）

**你会在系统里见到的两个“队列机制”**
- **IdleHandler**：队列暂时没到期消息要处理时回调，常用于“等主线程空一点再做”的初始化工作。
- **同步屏障 / 异步消息**：同步屏障会让“普通消息”暂时停在队列里，让标记为异步的消息优先通过。系统用它来保证某些高优先级事件（如与 UI 帧相关的调度）不会被大量普通消息淹没。

**关键问题：**

**Q：主线程 Looper 死循环为什么不会 ANR？**  
A：`MessageQueue.next()` 内部用 `epoll_wait` 阻塞，线程挂起不耗 CPU。ANR 是消息处理超时，而非 loop 本身阻塞。

**Q：子线程使用 Handler 的步骤？**
- 要点是：子线程必须先有 `Looper`，`Handler` 才能把消息投递到这个线程
```kotlin
class WorkThread : Thread() {
    lateinit var handler: Handler
    override fun run() {
        Looper.prepare()
        handler = Handler(Looper.myLooper()!!) { msg -> true }
        Looper.loop()
    }
}
// 现代做法：直接用 HandlerThread
val ht = HandlerThread("worker").also { it.start() }
val handler = Handler(ht.looper)
```

**Q：IdleHandler 的应用场景？**  
A：当队列里“当前应该执行的消息”暂时没有时（队列为空，或下一条消息还没到时间），会触发 `IdleHandler` 回调。适合把“非关键、可拖后”的初始化与整理工作放到这里做。

**IdleHandler 详解**
- **触发时机**：队列处于“空闲”态——没有到期消息需要立刻处理。下一条消息的执行时间在未来，或队列完全为空。
- **如何添加**：`Looper.myQueue().addIdleHandler { /* 任务 */ false }`
- **返回值语义**：
  - 返回 `true`：保留该 IdleHandler，下一次空闲还会再调用（适合周期性清理）
  - 返回 `false`：调用一次后移除（常用，避免反复触发）
- **适合做的事情**：
  - 延迟初始化不影响首屏的对象（如大字典加载、三级缓存预热）
  - 清理过期任务、合并批量操作、轻量统计上报
  - 将“非必须的 UI 更新”推迟到队列空闲再处理
- **不适合做的事情**：
  - 会阻塞主线程的重 IO、复杂计算、网络请求
  - 需要严格时序保证的任务（Idle 不是精准调度器）
- **和 `postDelayed` 的区别**：
  - `postDelayed` 以时间为准，到了就执行
  - `IdleHandler` 以队列状态为准，空闲才执行（更像“等忙完再说”，不可精确预期）
- **常见坑**：
  - 返回 `true` 占着队列，导致每次空闲都触发，若逻辑里耗时会制造抖动
  - 在 Idle 里访问还未准备好的 UI/资源（空闲不等于初始化完成）



```kotlin
class SafeHandler(act: Activity) : Handler(Looper.getMainLooper()) {
    private val ref = java.lang.ref.WeakReference(act)
    override fun handleMessage(msg: Message) {
        val a = ref.get() ?: return
        // 处理逻辑
    }
}

// 清理
override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
}
```

**知识延伸（Handler）**
- **什么是 Handler**：它是“消息处理的入口”。发送消息后先进入 `MessageQueue`，等待 `Looper` 取出，再交给 `Handler` 处理；同时支持延时消息与定时任务。应用启动时，`ActivityThread.main()` 会初始化主线程的 `Looper`，UI 相关代码都跑在这个主线程的 Looper/Handler 驱动下。
- **一个线程一个 Looper**：使用前要 `prepare()`；`Looper` 通过 `ThreadLocal` 与线程绑定。`Handler` 绑定到某个 `Looper`，你用这个 `Handler` 发出去的消息就会在对应线程执行，实现跨线程通信的“投递到指定线程”。
- **延时消息怎么等待**：`enqueueMessage()` 会按 `when` 排序；`Looper.next()` 在 native 层通过 `nativePollOnce(timeout)` 阻塞等待。若是延时消息，会传入“到期时间差”让线程睡到点；`timeout=-1` 表示一直睡，直到有其他消息入队用 `nativeWake()` 唤醒。
- **死循环不等于 ANR**：`Looper.loop()` 虽然是 while 死循环，但队列空或尚未到期时会挂起等待，不耗 CPU；ANR 是“消息处理本身耗时过长”导致，而不是 loop 的阻塞导致。
- **常见内存泄漏**：把 `Handler` 写成 Activity 的非静态内部类会隐式持有 Activity；当队列里还有未处理消息时 Activity 无法回收。解决：用静态内部类 + `WeakReference`，并在生命周期结束时清理未处理消息。
- **为什么“触摸/刷新 UI”也会走到 Handler**：Android 的主线程本质就是一个事件循环：触摸、按键、窗口变化、绘制、动画，最终都要回到主线程串行执行，避免并发改 UI 的线程安全问题。所以系统会把这些工作“排队”，交给主线程 Looper 逐个处理。
- **触摸事件怎么进队列**：触摸来自底层输入系统，Framework 会把输入事件投递到应用进程的主线程事件循环里，再由 `ViewRootImpl` 分发到 `dispatchTouchEvent()` 等回调。直观理解就是：外部来了一次触摸，主线程队列里就多了一条“处理触摸”的任务。
- **UI 刷新为什么要排队**：`invalidate()`/`requestLayout()` 并不会立刻同步绘制，而是“标记需要刷新”，然后通过帧调度把一次 measure/layout/draw 安排到主线程队列里，在合适的时机统一执行，避免频繁无效重绘。
- **优先级怎么保证（不会被普通消息淹没）**：
  - **按时间排序**：队列里的任务按到期时间（`when`）排序，到点的先执行。
  - **帧调度优先通道**：和 UI 帧相关的调度依赖 `Choreographer`，会把帧回调以更高优先的方式插入队列，保证动画/绘制按 vsync 节奏推进。
  - **同步屏障 + 异步消息**：系统在某些阶段会插入同步屏障，让“普通同步消息”暂时停住，让标记为异步的消息（常见是输入、帧回调相关）优先通过，从而保证手势和刷新更及时。
- **真正的风险点**：如果你自己在主线程处理消息/回调里做了重 IO 或大计算，就算系统有优先级机制，主线程仍会被占住，触摸和刷新都只能排队等待，最终表现为掉帧/卡顿/ANR。

---

### 1.3 App 启动流程

**面试表达：Activity 启动流程（建议用“发起端 → 系统端 → 应用端”三段式）**
- **一句话总览**：`startActivity` 发起 → Binder 进入 system_server 做解析与调度 → 回调到目标进程主线程创建 Activity 并首帧绘制。
- **30 秒版本（主干）**：
  - **发起端**：`startActivity(intent)` 最终进入 `Instrumentation.execStartActivity()` 作为统一入口
  - **系统端**：通过 Binder 调用 `startActivity`（9.0+ 多在 ATMS，早期在 AMS），完成 `resolve`、权限校验、启动模式/任务栈决策，并判断目标进程是否存在
  - **应用端**：进程不存在就 Zygote `fork`；随后 system_server 通过 Binder `scheduleLaunchActivity`，应用主线程 `handleLaunchActivity` 执行 `onCreate/onStart/onResume`，最后首帧绘制可见
- **1–2 分钟版本（带关键方法名）**：
  1. **Launcher/调用方**：`startActivity(intent)`
  2. **Instrumentation 入口**：`ContextImpl.startActivity()` → `Instrumentation.execStartActivity()`
  3. **Binder 到 system_server**：
     - 9.0 之前：`IActivityManager.startActivity(...)`（AMS）
     - 9.0 之后：`IActivityTaskManager.startActivity(...)`（ATMS）
  4. **AMS/ATMS 决策与校验**：解析/resolve、权限、启动模式与任务栈（ActivityStarter/相关控制器）
  5. **目标进程判断**：
     - **不存在**：system_server 通过 socket 通知 Zygote `fork` 创建目标进程
     - **已存在**：直接调度启动
  6. **进程启动与绑定**：目标进程 `ActivityThread.main()` 建立主线程 Looper，并通过 `attachApplication` 把 `ApplicationThread` 注册给 system_server
  7. **调度启动 Activity**：system_server 触发 `realStartActivity...` 类流程 → Binder 调用 `scheduleLaunchActivity`
  8. **回到应用主线程执行**：`ActivityThread.handleLaunchActivity` → 冷启动会触发 `Application.onCreate` → Activity `onCreate/onStart/onResume`
  9. **首帧绘制完成**：DecorView 首次绘制完成，用户看到画面并可交互
- **常见追问（加分点）**：
  - **冷/温/热启动区别**：冷启动含进程创建与 `Application.onCreate`；温启动进程在但 Activity 重建；热启动 Activity 在栈中快速回前台
  - **为什么有 Instrumentation**：作为 `startActivity` 统一入口，便于系统与测试框架做拦截与监控
  - **为什么必须走 Binder/system_server**：启动决策在系统服务侧，应用进程只负责执行与渲染

**热启动**：进程存在，Activity 在栈中 → 直接回到前台，无需走 Application  
**温启动**：进程存在，Activity 被销毁 → 重建 Activity，走 onCreate
**启动优化设计：**

**1、指定量化指标（先定口径，再谈优化）**
- **核心指标（启动耗时三件套）**：TTFD（首帧可见）、TTI/TTBF（业务首屏可交互）、TTCD（关键内容完全绘制）。
- **为什么要定义这三个（作用）**：
  - **覆盖“看见 → 能用 → 完整”三个体验阶段**：只看首帧容易“首帧很快但内容空/不可用”，只看业务首屏又可能“可点了但首屏还在补图/抖动”。
  - **把优化从“感觉”变成“可量化拆解”**：TTFD 对应系统拉起+首帧渲染，TTI/TTBF 对应业务数据与交互 readiness，TTCD 对应首屏完整度与稳定性；不同指标变差对应的排查方向不同。
  - **做长期基线与回归**：上线后用 P90/P95 监控，TTFD/TTI/TTCD 能分别兜住“首帧退化/业务退化/渲染补齐退化”，避免只靠单一指标漏掉体验劣化。
- **它们的区别（怎么区分口径）**：
  - **TTFD（首帧可见）**：结束点是“首个 Activity 第一帧真正绘制出来”，可能只是启动主题/骨架/占位，重点衡量“尽快有画面”。
  - **TTI/TTBF（业务首屏可交互）**：结束点是“关键内容已出现且可交互”，允许非关键资源（如图片、次要模块）继续补齐，重点衡量“用户能用起来”。
  - **TTCD（关键内容完全绘制）**：结束点是“首屏定义范围内的关键内容都画完且稳定”，通常晚于 TTI/TTBF，重点衡量“首屏完整度与稳定性”；可选用 `reportFullyDrawn()` 做线下对照，线上仍以业务埋点为准。
- **统一标准**：同一指标必须做到“同一开始点 + 同一结束点 + 同一时间源”，否则版本对比没有意义。
- **时间源**：`SystemClock.elapsedRealtime()`（或 nanos），避免 `currentTimeMillis()` 受系统时间改动影响。
- **开始点（建议统一）**：冷启动开始建议取“App 最早可打点位置”（`ContentProvider.onCreate()` / `Application.attachBaseContext()`）记录 `startupStart`，用于所有指标统一对齐；温/热启动则以回到前台的时刻单独打点（避免混桶）。
- **结束点（务必可验证）**：TTFD 结束是“首个 Activity 首帧真正绘制”；TTI/TTBF 结束是“关键内容就绪且已绘制”；TTCD 结束是“关键内容全部绘制完成”（可选用 `reportFullyDrawn()` 做线下对照，线上以业务埋点为准）。
- **分桶维度（必须有）**：appVersion、启动类型（冷/温/热）、系统版本、机型/CPU 档位、网络类型；否则阈值会被混合数据稀释。
- **统计口径**：以 P50/P90/P95 为主；同时关注 P99（定位极端长尾问题）与失败率（启动崩溃/ANR）。

**2、监控（线上 + 线下闭环）**
- **线上监控（持续）**：在“首屏完成触发点”上报耗时与关键分桶；发布后对比基线漂移，按“绝对阈值 + 相对涨幅阈值”告警（阈值建议见下方量化体系小节）。
- **线上辅助信号**：首屏期间主线程阻塞/卡顿（掉帧、长帧、ANR）、启动崩溃率、首屏关键接口耗时与失败率；用于把“慢”拆成“卡/崩/接口慢/渲染慢”。
- **线下监控（诊断）**：Perfetto/Systrace 抓启动全链路；重点看主线程是否被 IO/反序列化/布局 inflate/图片解码/同步等待占住，以及 Binder 等待、GC、类加载/验证等耗时块。
- **线下对齐手段**：关键阶段加 trace 区间（Application.onCreate、首 Activity.onCreate、首屏数据请求、inflate、首帧绘制）；必要时用 `reportFullyDrawn()` 作为“完全绘制”对照点验证业务埋点是否偏早。

**3、问题排查及优化（流程 + 常见问题清单）**
- **排查流程**：先确认指标口径与分桶一致；定位异常桶（机型/系统/版本/冷温热）；抓典型样本做线下 trace；把耗时拆到阶段（初始化/渲染/网络/IO/等待）；归因到具体函数或模块；优化后回归对比 P90/P95 是否下降并观察长尾。
- **常见启动慢问题（高频）**：Application 同步初始化过多、主线程磁盘 IO（prefs/db/file）、首屏接口同步等待、首屏布局层级深导致 inflate/measure/layout 过慢、图片解码/大对象创建集中在首帧前、首屏频繁 requestLayout/invalidate 造成重复布局绘制、启动主题过重或启动图解码成本高、主线程被锁竞争/跨进程等待（Binder wait）卡住、首屏触发频繁 GC（对象抖动）。
- **优化原则（最有效）**：把“首屏必须”路径做短做轻；其余延后/按需/异步；让首帧尽快稳定展示（骨架/占位），再增量补齐内容。

**启动优化核心思路：**

| 阶段 | 问题 | 优化手段 |
|------|------|--------|
| Application.onCreate | 三方库同步初始化太多 | 异步初始化 / 懒加载 / App Startup |
| Activity.onCreate | setContentView 耗时 | 预加载 / ViewStub / 减少层级 |
| 首帧渲染 | IO / 网络阻塞主线程 | 子线程预请求 / 骨架屏 |
| 视觉感知 | 白屏 / 黑屏 | windowBackground 设置启动图 |

**详细展开（可落地）**
- **Application.onCreate：三方库同步初始化太多**
  - **问题本质**：主线程启动阶段做了太多“非首屏必须”的工作（SDK init、反射、读文件、解压、DB 初始化、网络预热），导致首 Activity 创建/首帧被延后。
  - **优先原则**：首屏必须的留下；其余全部“延后/异步/按需”。
  - **落地手段**：
    - **分级初始化清单**：把三方库按“首屏必须 / 首次进入某功能才需要 / 后台可做”分 3 档，首屏只保留必须项。
    - **懒加载**：把 init 从 Application 挪到真正使用处（例如第一次进支付页再 init 支付 SDK）。
    - **异步初始化**：把可并行的 init 丢到后台线程（注意不要在后台线程触摸 UI，也不要影响主线程关键依赖）。
    - **App Startup（或自研调度）**：用依赖图管理初始化顺序，把“必须先做”的串起来，其余并行；不要把所有 initializer 都标成 eager。
  - **常见坑**：异步 init 的结果被首屏同步依赖（导致“异步反而阻塞”等待）；隐形磁盘 IO（读 prefs/asset/so）在主线程发生。

- **Activity.onCreate：setContentView / inflate 耗时**
  - **问题本质**：布局层级深、measure/layout 次数多、首屏一次性 inflate 了太多不一定马上可见的 View，或 `onCreate` 里做了大量同步逻辑。
  - **落地手段**：
    - **减少层级**：能扁平就扁平，减少嵌套 LinearLayout/RelativeLayout；合并重复容器；避免过度约束导致多次 measure。
    - **拆分首屏与非首屏**：首屏只 inflate 必要区域；次要区域用 `ViewStub` 或延迟 inflate（滑到再加载/异步加载）。
    - **降低首帧绑定开销**：Adapter 初次绑定控制数量（例如先渲染首屏可见项），图片/富文本延后。
    - **避免 onCreate 重活**：把“计算/IO/网络/DB”移走；`onCreate` 只做 View 初始化 + 轻量绑定。
  - **验证方式**：线下用 Perfetto 看主线程 `Choreographer#doFrame` 前的耗时块；看 inflate、measure/layout、bitmap decode 是否集中在首帧之前。

- **首帧渲染：IO / 网络阻塞主线程**
  - **问题本质**：首屏关键路径里出现了主线程磁盘 IO、同步网络、数据库查询、图片解码/压缩等，导致 `doFrame` 来不及，掉帧甚至 ANR。
  - **落地手段**：
    - **子线程预请求**：网络请求放后台线程；首屏先展示结构（骨架/占位），数据回来再增量刷新。
    - **骨架屏策略**：首帧先把“稳定结构”画出来（标题栏、列表骨架、占位卡片），避免白屏；数据回来替换内容。
    - **图片与大对象延后**：首屏避免大图解码与复杂动效；图片使用占位图 + 异步加载，首屏只加载可见范围。
    - **避免同步等待**：不要在主线程 `get()` 等待后台结果；用回调/Flow/协程切回主线程更新。
  - **判断标准**：首帧阶段主线程应以“构建 UI + 轻量渲染”为主，任何明显的 IO/网络/重计算都是可疑项。

- **视觉感知：白屏 / 黑屏**
  - **问题本质**：进程和 Activity 已经在启动，但用户在首帧出来前看不到稳定内容（默认黑屏/白屏），体验很差。
  - **落地手段**：
    - **windowBackground 启动图**：给启动 Activity 配置合适的 `windowBackground`（静态图/纯色/品牌图），确保启动瞬间就有内容。
    - **启动主题与首屏主题切换**：用启动主题覆盖首帧前的背景，首帧后切到正常主题（避免启动图闪烁）。
    - **避免过重启动图**：启动背景不要用复杂 layer-list/大图解码，避免启动图本身变成性能瓶颈。

> **架构师追问**：如何建立启动优化的量化体系？  
> 答：先把“首屏完成”的定义定清楚，再用 `reportFullyDrawn()` 做统一打点口径；线下用 Perfetto/Systrace 切分耗时阶段，线上用分位数监控做基线与告警。
>
> **怎么落地（可直接照做）**
> - **1）先定义 3 个时间口径（给出标准起止点）**：
>   - **冷启动耗时（TTFD：Time To First Display）**
>     - **标准定义**：从“进程因冷启动被创建”到“首个 Activity 的第一帧真正绘制出来”
>     - **开始时间（Start）**：进程启动时刻（严格口径）；工程上常用“App 代码能最早执行的时刻”近似（如 `ContentProvider.onCreate()` / `Application.attachBaseContext()` 内记录 `elapsedRealtime`）
>     - **结束时间（End）**：首个 Activity 的 DecorView 第一次绘制/预绘制通过（例如首次 `OnPreDraw` / 首帧 `FrameMetrics`），代表用户至少看到首帧画面
>     - **用途**：衡量“系统拉起 + 基础初始化 + 首帧渲染”整体效率
>   - **业务首屏耗时（TTI/TTBF：Time To Interactive / Time To Business First Screen）**
>     - **标准定义**：从“冷启动开始”到“首屏关键内容可交互且已展示”
>     - **开始时间（Start）**：建议与冷启动一致（同一 `startupStart`），便于横向对比；也可额外记录首 Activity `onCreate` 作为业务阶段起点做拆分
>     - **结束时间（End）**：业务自定义触发点 + 确认已绘制：例如“首屏接口返回 → Adapter/Compose 状态已赋值 → 下一次 PreDraw 通过”，确保不是只到 onResume/数据返回
>     - **用途**：衡量“用户能操作并看见关键内容”的体验口径
>   - **完全绘制耗时（Fully Drawn / TTCD：Time To Content Drawn）**
>     - **标准定义**：从“冷启动开始”到“首屏关键内容全部绘制完成”
>     - **开始时间（Start）**：同冷启动开始（同一 `startupStart`）
>     - **结束时间（End）**：在你定义的“首屏关键内容真正画出来了”的时刻调用一次 `reportFullyDrawn()`，以它作为统一结束点
>     - **用途**：比业务首屏更严格，适合做长期基线与版本回归（口径要稳定）
>   - **时间源（必须统一）**：使用 `SystemClock.elapsedRealtime()`（或 nanos），不要用 `System.currentTimeMillis()`
> - **2）把“首屏完成”变成一个确定的触发点**：例如“列表首批数据渲染完成 / 首页骨架屏消失 / 首屏关键模块全部展示”，不要用 onResume 这种容易误差的生命周期当口径。
> - **3）在触发点调用 `reportFullyDrawn()`（只调用一次）**：推荐在“数据就绪 + 首次绘制完成”之后调用，确保真的是画出来。
> - **4）线下怎么分析（Perfetto/Systrace）**：
>   - 给关键阶段加 trace 区间（例如 Application.onCreate、首 Activity.onCreate、首屏数据请求、inflate、首帧绘制），抓 Perfetto 后按区间看耗时分布
>   - 把一次启动拆成“IO/反序列化/布局 inflate/图片解码/主线程阻塞”等可行动的原因分类
> - **5）线上怎么做基线与告警**：
>   - 在“首屏完成触发点”上报耗时到监控（可以同时调用 `reportFullyDrawn()` 做线下对照，但线上主口径建议以业务埋点为准；建议按 appVersion/机型/系统版本/启动类型冷温热分桶）
>   - 以 **P50/P90/P95** 做基线，发布后对比基线漂移；告警建议用“绝对阈值 + 相对涨幅”双条件（避免不同机型桶差异导致误报）
>   - **参考绝对阈值（通用保守值，可先落地再按业务收紧，单位 ms）**：
>     - 冷启动 TTFD（首帧可见）：P90 > 2000 或 P95 > 2500
>     - 业务首屏 TTI/TTBF（可交互+关键内容展示）：P90 > 2500 或 P95 > 3500
>     - 完全绘制 TTCD（关键内容都画完）：P90 > 3500 或 P95 > 5000
>   - **参考相对涨幅阈值（相对基线版本）**：
>     - P90：超过基线 +15% 或 +300ms（取更严格者）
>     - P95：超过基线 +20% 或 +500ms（取更严格者）
>   - **告警保护（建议）**：单桶最小样本量（如 N≥200）+ 连续多周期满足条件再触发
>   - 结合线上 trace/卡顿指标（掉帧、ANR、主线程阻塞）做归因闭环：指标异常 → 抓样本 → 定位阶段 → 回归验证

**知识延伸（启动链路）：从 Launcher 发送 Intent 到 AMS/ATMS**
- **先纠正一个直觉**：Launcher 本身也是一个 App（一个 Activity）。你点击图标，本质就是 Launcher 在自己的进程里调用 `startActivity(intent)`。
- **为什么会提到 Instrumentation**：`startActivity()` 最终会走到 `Instrumentation.execStartActivity()`，它像一个“统一入口/拦截点”，系统用它做一些统一处理（例如参数整理、调用链记录；测试框架也会利用它做注入/监控）。
- **典型调用链（会因 Android 版本有差异）**：
```
Launcher(Activity).startActivity()
  → ContextImpl.startActivity()
    → Instrumentation.execStartActivity()
      → IActivityTaskManager / IActivityManager.startActivity(...)  // Binder
        → system_server 里的 ATMS/AMS
          → ActivityStarter/ActivityStartController 解析 Intent
            → 校验权限/启动模式/任务栈、resolveActivity
            → 目标进程不存在？→ 请求 Zygote fork → 创建目标进程
            → 目标进程存在？→ 直接调度到目标进程主线程
```
- **AMS/ATMS 在这里做什么**：
  - **解析与决策**：Intent 解析、组件解析（resolve）、启动模式（standard/singleTop...）、任务栈（Task/ActivityRecord）安排
  - **权限与可见性校验**：导出组件、权限声明、跨用户/多窗口等约束
  - **进程管理**：目标进程不在时通过 `Process.start` → Zygote fork 拉起；在时直接走调度
- **目标进程被拉起后，Activity 怎么回到你的 App 执行**：
  - 目标进程启动后会执行 `ActivityThread.main()`，并通过 `attach` 把自己的 `ApplicationThread`（Binder 端）注册给 system_server
  - system_server 再通过 Binder 回调，把“启动 Activity”的事务派发到目标进程主线程
  - 最终落到 `ActivityThread` 里执行 `handleLaunchActivity`，完成 `Application/Activity` 的创建与生命周期分发

---

### 1.4 View 绘制流程

**三大流程：**
```
ViewRootImpl.performTraversals()
  ├── performMeasure()  → View.measure() → onMeasure()
  ├── performLayout()   → View.layout()  → onLayout()
  └── performDraw()     → View.draw()    → onDraw()
```

**MeasureSpec 三种模式：**
- `EXACTLY`：精确值（match_parent / 具体 dp）
- `AT_MOST`：最大不超过（wrap_content）
- `UNSPECIFIED`：不限制（ScrollView 内部）

**自定义 View 关键点：**
```kotlin
class CustomView(ctx: Context, attrs: AttributeSet) : View(ctx, attrs) {
    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        // wrap_content 时需手动计算 desiredSize
        val w = resolveSize(desiredWidth, widthSpec)
        val h = resolveSize(desiredHeight, heightSpec)
        setMeasuredDimension(w, h)
    }
}
```

**Q：invalidate() vs requestLayout() 区别？**
- `invalidate()`：只触发 draw，不重新 measure/layout
- `requestLayout()`：触发 measure + layout + draw
- 仅视觉状态变化（颜色）→ invalidate；尺寸/位置变化 → requestLayout

---

## 二、性能优化体系

### 2.1 内存优化

**常见内存问题：**

| 问题类型 | 典型场景 | 解决方案 |
|---------|---------|---------|
| 内存泄漏 | 静态持有 Activity | WeakReference / 及时注销 |
| 内存抖动 | 循环内创建对象 | 对象池 / 减少临时对象 |
| Bitmap OOM | 大图加载 | 采样压缩 / BitmapPool |
| 内存碎片 | 频繁 GC | 对象复用 |

**泄漏检测方案：**
```
线下：LeakCanary（自动检测 Activity/Fragment/ViewModel 泄漏）
线上：监控 GC 频率 + Java Heap 增长趋势
工具：Android Studio Profiler → Memory → Heap Dump
```

**Q：架构师如何建立内存治理体系？**
> 1. **基线建立**：录制典型用户路径，采集各页面内存基准值
> 2. **监控告警**：线上 OOM 率 + PSS 增长率超阈值告警
> 3. **规范约束**：Bitmap 统一走 Glide/Coil，禁止裸 BitmapFactory.decode
> 4. **定期 Review**：每个版本发布前跑内存回归测试

---

### 2.2 渲染优化

**卡顿根因：** 主线程耗时 > 16ms（60fps）或 > 8.3ms（120fps）

**检测工具：**
- `Perfetto / Systrace`：分析主线程各 frame 耗时
- `FrameMetricsAggregator`：线上采集卡顿帧率
- `Choreographer.FrameCallback`：自研 FPS 监控

**常见优化手段：**
```
布局优化：
  - 减少嵌套层级（ConstraintLayout 替代多层 LinearLayout）
  - ViewStub 懒加载非首屏视图
  - merge 标签消除冗余 ViewGroup

过度绘制：
  - 移除不必要的背景
  - Canvas.clipRect() 裁剪不可见区域

列表优化：
  - RecyclerView 预取（setInitialPrefetchItemCount）
  - DiffUtil 局部刷新
  - 异步图片加载 / 预加载
```

---

### 2.3 包体积优化

**分析工具：** Android Studio → Build → Analyze APK

| 优化手段 | 效果 |
|---------|------|
| 开启 R8/ProGuard 混淆 | 代码压缩 20-40% |
| `shrinkResources true` | 移除无用资源 |
| WebP 替代 PNG/JPG | 图片体积减少 25-34% |
| 动态下发资源（AAB + PAD） | 按需下载语言/密度资源 |
| 移除无用依赖 | 视情况而定 |

---

## 三、架构模式

### 3.1 MVC / MVP / MVVM / MVI 对比

| 架构 | 特点 | 适用场景 | 缺点 |
|------|------|---------|------|
| MVC | View 直接操作 Model | 简单页面 | Activity 臃肿 |
| MVP | Presenter 解耦 V/M | 中型项目 | 接口类膨胀 |
| MVVM | 数据绑定，ViewModel 持有 LiveData | 主流 Android | 调试复杂 |
| MVI | 单向数据流，不可变 State | 复杂交互页面 | 学习成本高 |

**MVVM 标准实现（Jetpack）：**
```
UI Layer:    Activity/Fragment/Compose
    ↕ observe
ViewModel:   持有 UiState (StateFlow/LiveData)
    ↕ 调用
Domain Layer: UseCase（可选）
    ↕ 调用
Data Layer:  Repository → (Remote DataSource + Local DataSource)
```

### 3.2 Clean Architecture

```
表现层 (Presentation)
    ↓ 依赖
领域层 (Domain)     ← 纯 Kotlin/Java，无 Android 依赖
    ↑ 依赖（依赖倒置）
数据层 (Data)
```

**核心原则：** 依赖方向单向向内，Domain 层不依赖任何框架，可独立单元测试。

---

## 四、Jetpack 核心组件

### 4.1 ViewModel

**核心作用：** 持有 UI 数据，屏幕旋转/配置变更后数据不丢失

**原理：** ViewModel 存储在 `ViewModelStore` 中，`ViewModelStore` 在 Activity 重建时通过 `NonConfigurationInstances` 保存传递，不随 Activity 销毁。

**Q：ViewModel 和 onSaveInstanceState 的区别？**

| | ViewModel | onSaveInstanceState |
|---|---|---|
| 存储位置 | 内存 | Bundle（序列化） |
| 数据大小 | 无限制 | < 50KB |
| 进程被杀 | 丢失 | 保留 |
| 适合存储 | 大量 UI 数据 | 少量恢复状态 |

### 4.2 StateFlow vs LiveData

| | LiveData | StateFlow |
|---|---|---|
| 线程安全 | 需 postValue | 需切换协程上下文 |
| 初始值 | 可为 null | 必须有初始值 |
| 生命周期感知 | 自动 | 需 `repeatOnLifecycle` |
| 推荐场景 | 传统 View | Compose / 协程体系 |

**现代写法（推荐）：**
```kotlin
class MyViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun loadData() = viewModelScope.launch {
        _uiState.update { it.copy(loading = true) }
        val result = repository.getData()
        _uiState.update { it.copy(loading = false, data = result) }
    }
}

// Fragment 中观察（安全）
viewLifecycleOwner.lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.uiState.collect { render(it) }
    }
}
```

---

## 五、模块化 / 组件化

### 5.1 模块化分层

```
app（壳工程）
├── feature_home（功能模块）
├── feature_order（功能模块）
├── feature_user（功能模块）
├── core_network（基础设施）
├── core_database（基础设施）
├── core_ui（通用 UI 组件）
└── core_common（工具类/常量）
```

### 5.2 模块间通信方案

| 方案 | 适用 | 缺点 |
|------|------|------|
| 接口下沉到 core | 简单依赖 | 接口耦合 |
| ARouter / 自研路由 | 页面跳转 | 运行时注解处理 |
| 事件总线（Flow/EventBus） | 跨模块事件 | 过度使用难维护 |
| 依赖注入（Hilt） | 服务提供 | 编译时代码生成 |

**Q：组件化方案如何选型？**
> 答：对于大型 App，推荐**分层 + 接口隔离 + Hilt 依赖注入**的组合：
> 1. feature 层模块只依赖 core 层接口，不相互依赖
> 2. 通过 Hilt `@InstallIn` 在 app 壳中绑定具体实现
> 3. 页面路由用 Navigation Component 统一管理，通过 Deep Link 跨模块跳转
> 4. 保证每个 feature 模块可以独立运行（单模块 App 调试）

---

## 六、插件化 / 热修复（了解原理）

### 热修复原理对比

| 方案 | 原理 | 代表框架 |
|------|------|---------|
| 类替换 | 修改 ClassLoader dexElements 顺序 | Tinker |
| 方法 Hook | ART 替换 ArtMethod 指针 | AndFix |
| Sophix 混合 | 两者结合 + 资源修复 | Sophix |

**Q：热修复在架构上需要注意什么？**
> 1. 需要做**补丁包签名验证**，防止恶意注入
> 2. 补丁生效策略：立即生效 vs 重启生效（稳定性与时效的取舍）
> 3. 建立**灰度验证**机制，补丁先推 1% → 5% → 全量
> 4. 接入 APM 监控修复前后崩溃率变化
