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
1.  **本地预览**:
    如果你安装了 Python，可以直接在根目录运行：
    ```bash
    python3 -m http.server 8081
    ```
    然后访问: `http://localhost:8081`

2.  **自定义**:
    *   修改 `js/script.js` 中的 `generateWeeklyReport` 函数来自定义周报模板。
    *   在 `index.html` 中调整 HTML 结构以增减模块。

## 部署
本项目是纯静态网站，可以部署到任何静态托管服务：
*   GitHub Pages
*   Vercel
*   Netlify
*   Nginx/Apache 服务器

## 待办功能 (Roadmap)
- [ ] 接入 Tapd API 实现数据自动同步
- [ ] 添加 LocalStorage 本地持久化存储
- [ ] 增加暗黑模式支持
