// Tailwind 配置
tailwind.config = {
    theme: {
        extend: {
            colors: {
                primary: '#4F46E5', // Indigo 600
                secondary: '#10B981', // Emerald 500
                danger: '#EF4444', // Red 500
                warning: '#F59E0B', // Amber 500
                dark: '#1F2937', // Gray 800
                light: '#F3F4F6', // Gray 100
            }
        }
    }
}

// Storage Keys
const STORAGE_KEY_LOGS = 'nexus_daily_logs';
const STORAGE_KEY_DRAFT = 'nexus_daily_draft';

// Initialize Data
let dailyLogs = JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || '[]');
// If empty, add some mock data for demo
if (dailyLogs.length === 0) {
    dailyLogs = [
        { date: new Date(Date.now() - 86400000).toISOString(), done: "【开发】完成了用户登录鉴权模块 (Login/Auth)", blockers: "", plan: "继续开发" },
        { date: new Date(Date.now() - 172800000).toISOString(), done: "【设计】完成了数据库 Schema 设计 (User/Project tables)", blockers: "", plan: "" },
        { date: new Date(Date.now() - 259200000).toISOString(), done: "【环境】配置了本地开发环境和 CI/CD 流水线", blockers: "", plan: "" }
    ];
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(dailyLogs));
}

// Load Drafts on Page Load
document.addEventListener('DOMContentLoaded', () => {
    // Restore Drafts
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY_DRAFT) || '{}');
    if (draft.done) document.getElementById('daily-done').value = draft.done;
    if (draft.blockers) document.getElementById('daily-blockers').value = draft.blockers;
    if (draft.plan) document.getElementById('daily-plan').value = draft.plan;

    // Add input listeners for auto-save draft
    ['daily-done', 'daily-blockers', 'daily-plan'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', saveDraft);
        }
    });

    renderDailyLogs();
});

// Save Draft
function saveDraft() {
    const draft = {
        done: document.getElementById('daily-done').value,
        blockers: document.getElementById('daily-blockers').value,
        plan: document.getElementById('daily-plan').value
    };
    localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(draft));
}

// Submit Daily Log
function submitDailyLog() {
    const done = document.getElementById('daily-done').value;
    const blockers = document.getElementById('daily-blockers').value;
    const plan = document.getElementById('daily-plan').value;

    if (!done && !blockers && !plan) {
        alert("请填写至少一项内容");
        return;
    }

    const newLog = {
        date: new Date().toISOString(),
        done,
        blockers,
        plan
    };

    dailyLogs.unshift(newLog); // Add to beginning
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(dailyLogs));

    // Clear Draft
    document.getElementById('daily-done').value = "";
    document.getElementById('daily-blockers').value = "";
    document.getElementById('daily-plan').value = "";
    localStorage.removeItem(STORAGE_KEY_DRAFT);

    renderDailyLogs();
    // alert("日报提交成功！"); // Optional feedback
}

// Render Daily Logs
function renderDailyLogs() {
    const container = document.getElementById('daily-logs-container');
    if (!container) return;
    container.innerHTML = '';

    dailyLogs.forEach(log => {
        const dateObj = new Date(log.date);
        const dateStr = dateObj.toLocaleDateString() + ' (' + ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dateObj.getDay()] + ')';

        const html = `
            <div class="relative">
                <div class="absolute -left-5 top-1 h-3 w-3 rounded-full bg-gray-300 border-2 border-white"></div>
                <p class="text-xs text-gray-500 mb-1">${dateStr}</p>
                <p class="text-sm text-gray-800 whitespace-pre-line">${log.done || '无产出'}</p>
                ${log.blockers ? `<p class="text-xs text-red-500 mt-1">🚧 ${log.blockers}</p>` : ''}
            </div>
        `;
        container.innerHTML += html;
    });
}

// 简单的路由切换逻辑
function showSection(sectionId) {
    // 隐藏所有 section
    const sections = [
        'dashboard', 'reports', 'smart', 'time-energy', 'review',
        'project-scope', 'project-quality', 'project-risk',
        'team-okr', 'team-raci', 'team-sync', 'team-growth'
    ];
    sections.forEach(id => {
        const el = document.getElementById(id + '-section');
        if (el) el.classList.add('hidden-section');
    });

    // 移除所有 nav-link 的 active 状态
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.classList.remove('bg-gray-700');
        if (!link.classList.contains('hover:bg-gray-700')) {
            link.classList.add('hover:bg-gray-700');
        }
    });

    // 显示目标 section
    const targetEl = document.getElementById(sectionId + '-section');
    if (targetEl) targetEl.classList.remove('hidden-section');

    // 高亮当前 nav
    const activeLink = document.querySelector(`.nav-link[data-target="${sectionId}"]`);
    if (activeLink) {
        activeLink.classList.remove('hover:bg-gray-700');
        activeLink.classList.add('bg-gray-700');
    }
}

// 自动生成周报 (基于真实数据)
function generateWeeklyReport() {
    const reportBox = document.getElementById('weekly-report-content');

    // 1. 获取最近一周的日志
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentLogs = dailyLogs.filter(log => new Date(log.date) >= oneWeekAgo);

    // 2. 聚合内容
    let allDone = [];
    let allBlockers = [];
    let allPlans = [];

    // 包含当前正在输入的内容 (Draft)
    const currentDone = document.getElementById('daily-done').value;
    if (currentDone) allDone.push(currentDone);

    const currentBlockers = document.getElementById('daily-blockers').value;
    if (currentBlockers) allBlockers.push(currentBlockers);

    const currentPlan = document.getElementById('daily-plan').value;
    if (currentPlan) allPlans.push(currentPlan);

    // 包含历史记录
    recentLogs.forEach(log => {
        if (log.done) allDone.push(log.done);
        if (log.blockers) allBlockers.push(log.blockers);
        if (log.plan) allPlans.push(log.plan);
    });

    // 3. 格式化列表 (处理换行符，去重)
    const processList = (list) => {
        // Flatten array if items contain newlines
        const flatList = list.join('\n').split('\n')
            .map(item => item.trim())
            .filter(item => item.length > 0 && item !== '-'); // Filter empty

        // Add numbering
        if (flatList.length === 0) return null;
        return flatList.map((item, index) => `${index + 1}. ${item.replace(/^- /, '')}`).join('\n');
    };

    const processBlockers = (list) => {
        const flatList = list.join('\n').split('\n')
            .map(item => item.trim())
            .filter(item => item.length > 0 && item !== '-');

        if (flatList.length === 0) return null;
        return flatList.map(item => `- ${item.replace(/^- /, '')}`).join('\n');
    }

    const doneText = processList(allDone) || "1. 暂无记录";
    const blockersText = processBlockers(allBlockers) || "- 暂无阻塞";
    const planText = processList(allPlans) || "1. 制定下周计划";

    const reportText = `
# 周报 (Weekly Report) - ${new Date().toLocaleDateString()}
汇报人：Chen Xunlin

## 🟢 本周进展 (Progress)
${doneText}

## 🔴 风险与问题 (Risks & Blockers)
${blockersText}

## 🔵 下周计划 (Next Week)
${planText}

## 💡 思考与总结 (Summary)
本周共提交了 ${recentLogs.length} 篇日报。
    `.trim();

    // 模拟打字机效果
    reportBox.value = "";
    let i = 0;
    // Clear any existing interval to prevent overlapping
    if (window.typeWriterInterval) clearInterval(window.typeWriterInterval);

    window.typeWriterInterval = setInterval(() => {
        if (i < reportText.length) {
            reportBox.value += reportText.charAt(i);
            i++;
            reportBox.scrollTop = reportBox.scrollHeight;
        } else {
            clearInterval(window.typeWriterInterval);
        }
    }, 5);
}