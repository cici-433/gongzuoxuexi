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
const STORAGE_KEY_TASKS = 'nexus_tasks'; // New for dashboard tasks

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

let tasks = JSON.parse(localStorage.getItem(STORAGE_KEY_TASKS) || '[]');
if (tasks.length === 0) {
    tasks = [
        { id: '1', content: '修复线上支付接口 502 错误', quadrant: 1, completed: false, createdAt: new Date().toISOString() },
        { id: '2', content: '个人网站架构重构设计', quadrant: 2, completed: false, createdAt: new Date().toISOString() },
        { id: '3', content: '回复供应商询价邮件', quadrant: 3, completed: false, createdAt: new Date().toISOString() },
        { id: '4', content: '整理旧文档文件夹', quadrant: 4, completed: true, createdAt: new Date().toISOString() }
    ];
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
}

// Load Drafts on Page Load
document.addEventListener('DOMContentLoaded', () => {
    // Restore Drafts
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY_DRAFT) || '{}');
    if (document.getElementById('daily-done')) {
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
    }

    renderDailyLogs();
    renderTasks();
    updateDashboardStats();
    updateTimerDisplay(); // Init timer display
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

    const doneText = processList(allDone) || '本周暂无产出';
    const blockersText = processBlockers(allBlockers) || '无';
    const planText = processList(allPlans) || '待定';

    // 4. 生成最终文本
    const reportText = `### 本周工作产出
${doneText}

### 遇到的问题与解决方案
${blockersText}

### 下周计划
${planText}`;

    reportBox.value = reportText;
}

// --- Dashboard Logic (Eisenhower Matrix & Stats) ---

function addTaskFromInput() {
    const input = document.getElementById('new-task-input');
    const quadrantSelect = document.getElementById('new-task-quadrant');

    if (!input || !quadrantSelect) return;

    const content = input.value.trim();
    if (!content) return;

    const newTask = {
        id: Date.now().toString(),
        content: content,
        quadrant: parseInt(quadrantSelect.value),
        completed: false,
        createdAt: new Date().toISOString()
    };

    tasks.push(newTask);
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));

    input.value = '';
    renderTasks();
    updateDashboardStats();
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
        renderTasks();
        updateDashboardStats();
    }
}

function deleteTask(id) {
    if (!confirm("确定删除此任务吗？")) return;
    tasks = tasks.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    renderTasks();
    updateDashboardStats();
}

function renderTasks() {
    // Clear all quadrants
    [1, 2, 3, 4].forEach(q => {
        const list = document.getElementById(`quadrant-${q}-list`);
        if (list) list.innerHTML = '';
    });

    // Define colors for quadrants
    const colors = {
        1: { text: 'text-red-600', ring: 'focus:ring-red-500' },
        2: { text: 'text-blue-600', ring: 'focus:ring-blue-500' },
        3: { text: 'text-yellow-600', ring: 'focus:ring-yellow-500' },
        4: { text: 'text-gray-600', ring: 'focus:ring-gray-500' }
    };

    tasks.forEach(task => {
        const list = document.getElementById(`quadrant-${task.quadrant}-list`);
        if (!list) return;

        const li = document.createElement('li');
        li.className = 'flex items-start group justify-between';

        const checked = task.completed ? 'checked' : '';
        const lineThrough = task.completed ? 'line-through text-gray-400' : 'text-gray-700';
        const colorClass = colors[task.quadrant];

        li.innerHTML = `
            <div class="flex items-start flex-1">
                <input type="checkbox" onchange="toggleTask('${task.id}')" ${checked}
                    class="mt-1 mr-2 ${colorClass.text} ${colorClass.ring} rounded border-gray-300">
                <span class="text-sm ${lineThrough} break-all cursor-pointer" onclick="toggleTask('${task.id}')">${task.content}</span>
            </div>
            <button onclick="deleteTask('${task.id}')" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <i class="fas fa-trash-alt text-xs"></i>
            </button>
        `;
        list.appendChild(li);
    });
}

function updateDashboardStats() {
    // 1. Today's Focus: Count of incomplete tasks in Q1 (Do Now)
    const focusCount = tasks.filter(t => t.quadrant === 1 && !t.completed).length;
    const focusEl = document.getElementById('dashboard-focus-count');
    if (focusEl) focusEl.textContent = focusCount;

    // 2. Completion Rate: (Completed Tasks / Total Tasks) * 100
    // Or maybe just based on all tasks in the dashboard for now?
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const rate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    const rateText = document.getElementById('dashboard-completion-rate');
    const rateBar = document.getElementById('dashboard-completion-bar');

    if (rateText) rateText.textContent = rate + '%';
    if (rateBar) rateBar.style.width = rate + '%';
}


// --- Pomodoro Timer Logic ---
let timerInterval;
let timeLeft = 25 * 60; // 25 minutes in seconds
let isTimerRunning = false;

function toggleTimer() {
    const btn = document.getElementById('timer-btn');
    const status = document.getElementById('timer-status');
    const circle = document.getElementById('timer-circle');

    if (isTimerRunning) {
        // Pause
        clearInterval(timerInterval);
        isTimerRunning = false;
        btn.textContent = "继续专注";
        status.textContent = "Paused";
        circle.classList.remove('animate-pulse'); // Remove pulse effect
    } else {
        // Start
        isTimerRunning = true;
        btn.textContent = "暂停";
        status.textContent = "Focusing...";
        circle.classList.add('animate-pulse'); // Add pulse effect

        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                timeLeft = 0;
                btn.textContent = "开始专注";
                status.textContent = "Completed!";
                circle.classList.remove('animate-pulse');
                alert("专注时间结束！休息一下吧。");
            }
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timeLeft = 25 * 60;
    updateTimerDisplay();

    const btn = document.getElementById('timer-btn');
    const status = document.getElementById('timer-status');
    const circle = document.getElementById('timer-circle');

    if (btn) btn.textContent = "开始专注";
    if (status) status.textContent = "Ready";
    if (circle) circle.classList.remove('animate-pulse');
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const el = document.getElementById('timer-display');
    if (el) el.textContent = display;
}
