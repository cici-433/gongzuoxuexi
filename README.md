# NexusOS (个人效能管理平台)

## 简介
NexusOS 是一个基于 Web 的轻量级个人管理仪表盘，旨在融合**个人任务**、**项目进度**与**团队协作**。它采用“四象限法则”管理任务，并集成了番茄钟与周报生成功能。

## 技术栈
*   **HTML5**
*   **Tailwind CSS** (通过 CDN 引入，无需构建)
*   **Vanilla JavaScript** (原生 JS，无框架依赖)
*   **Chart.js** (用于数据可视化)

## 目录结构
```
.
├── index.html       # 入口文件
├── css/
│   └── styles.css   # 自定义样式
├── js/
│   └── script.js    # 业务逻辑（Tab切换、周报生成）
└── assets/          # 静态资源（图片等）
```

## 快速开始
1.  **启动服务 (推荐)**:
    为了支持数据持久化保存到本地文件，请使用提供的 Python 服务器脚本：
    ```bash
    python3 server.py
    ```
    然后访问: `http://localhost:8081`

    *注意：如果仅使用 `python3 -m http.server`，数据将无法保存到 `nexus_data.json` 文件中，仅保留在浏览器缓存中。*

2.  **自定义**:
    *   修改 `js/script.js` 中的 `generateWeeklyReport` 函数来自定义周报模板。
    *   在 `index.html` 中调整 HTML 结构以增减模块。

## 部署
本项目包含后端数据存储功能 (`server.py`)。
*   **完整模式**: 部署在支持 Python 的服务器上，运行 `server.py` 可实现数据持久化。
*   **静态模式**: 也可以作为纯静态网站部署 (GitHub Pages 等)，但数据仅保存在浏览器 LocalStorage 中，清理缓存后会丢失。

## 待办功能 (Roadmap)
- [ ] 接入 Tapd API 实现数据自动同步
- [ ] 添加 LocalStorage 本地持久化存储
- [ ] 增加暗黑模式支持
