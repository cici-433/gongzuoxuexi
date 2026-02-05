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
const STORAGE_KEY_PROMPT_TEMPLATES = 'nexus_prompt_templates';

// Initialize Data
let dailyLogs = JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || '[]');

// Clean up legacy test data if present
const testDataSignatures = [
    "【开发】完成了用户登录鉴权模块 (Login/Auth)",
    "【设计】完成了数据库 Schema 设计 (User/Project tables)",
    "【环境】配置了本地开发环境和 CI/CD 流水线"
];
const initialLength = dailyLogs.length;
dailyLogs = dailyLogs.filter(log => !testDataSignatures.includes(log.done));

if (dailyLogs.length !== initialLength) {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(dailyLogs));
}

let tasks = JSON.parse(localStorage.getItem(STORAGE_KEY_TASKS) || '[]');
if (tasks.length === 0) {
    // Empty tasks initially
    tasks = [];
}

// Load Drafts on Page Load
document.addEventListener('DOMContentLoaded', () => {
    // Try to restore from disk (server-side persistence)
    loadFromDisk();

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

    initPromptTemplates();
    renderPromptTemplatesSidebar();
    attachPromptTemplatesStorageListener();
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
        'dashboard', 'reports', 'smart', 'time-energy', 'review', 'ai-boost',
        'project-quality',
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

    // 特殊逻辑：渲染 App 质量指标
    if (sectionId === 'project-quality') {
        renderAppQualityMetrics();
    }

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

        if (task.completed) {
            addToDailyDraft(task.content);
        }

        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
        renderTasks();
        updateDashboardStats();
    }
}

// Add task content to Daily Report Draft
function addToDailyDraft(content) {
    let draft = JSON.parse(localStorage.getItem(STORAGE_KEY_DRAFT) || '{}');
    let doneText = draft.done || '';

    // Check if content is already in the draft to avoid duplicates
    if (doneText.indexOf(content) !== -1) return;

    if (doneText.length > 0) {
        doneText += '\n';
    }
    doneText += `- [Task] ${content}`;

    draft.done = doneText;
    localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(draft));

    // Update input if element exists
    const doneInput = document.getElementById('daily-done');
    if (doneInput) {
        doneInput.value = doneText;
    }

    // Optional: Visual Feedback (Toast)
    showToast(`任务已同步至日报：${content}`);
}

// Sync all completed tasks from today to draft
function syncTodayTasksToDraft() {
    // Get today's start timestamp
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Filter completed tasks created or completed today? 
    // For simplicity, we check if they are completed and in the list (assuming list is active tasks)
    // Or we should check a 'completedAt' field? Currently we don't have completedAt.
    // We'll just take all completed tasks currently in the list.
    const completedTasks = tasks.filter(t => t.completed);

    if (completedTasks.length === 0) {
        alert("没有找到已完成的任务");
        return;
    }

    let draft = JSON.parse(localStorage.getItem(STORAGE_KEY_DRAFT) || '{}');
    let doneText = draft.done || '';
    let addedCount = 0;

    completedTasks.forEach(task => {
        if (doneText.indexOf(task.content) === -1) {
            if (doneText.length > 0) doneText += '\n';
            doneText += `- [Task] ${task.content}`;
            addedCount++;
        }
    });

    if (addedCount > 0) {
        draft.done = doneText;
        localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(draft));

        const doneInput = document.getElementById('daily-done');
        if (doneInput) doneInput.value = doneText;

        showToast(`已同步 ${addedCount} 个任务到日报`);
    } else {
        showToast("所有已完成任务都已在日报中");
    }
}

function copyWeeklyReport() {
    const content = document.getElementById('weekly-report-content');
    if (!content || !content.value) {
        alert("请先生成周报");
        return;
    }

    content.select();
    document.execCommand('copy'); // Fallback for older browsers
    // Navigator Clipboard API
    if (navigator.clipboard) {
        navigator.clipboard.writeText(content.value).then(() => {
            showToast("周报已复制到剪贴板");
        });
    } else {
        showToast("周报已复制");
    }
}

function sendWeeklyReport() {
    const content = document.getElementById('weekly-report-content');
    if (!content || !content.value) {
        alert("请先生成周报");
        return;
    }

    // Simulate sending email
    const subject = `周报 - ${new Date().toLocaleDateString()}`;
    const body = encodeURIComponent(content.value);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

// Simple Toast Notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50 transform transition-all duration-300 translate-y-10 opacity-0';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    // Animate out
    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
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
const TOTAL_TIME = 25 * 60; // 25 minutes in seconds
let timeLeft = TOTAL_TIME;
let isTimerRunning = false;
const CIRCUMFERENCE = 2 * Math.PI * 45; // r=45

function toggleTimer() {
    // Request notification permission if needed
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    const btn = document.getElementById('timer-btn');
    const status = document.getElementById('timer-status');
    // const circle = document.getElementById('timer-circle'); // No longer used for pulse

    if (isTimerRunning) {
        // Pause
        clearInterval(timerInterval);
        isTimerRunning = false;
        btn.textContent = "继续专注";
        status.textContent = "Paused";
    } else {
        // Start
        isTimerRunning = true;
        btn.textContent = "暂停";
        status.textContent = "Focusing...";

        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                timeLeft = 0;
                btn.textContent = "开始专注";
                status.textContent = "Completed!";

                // Show Notifications
                showTimerNotification();
            }
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timeLeft = TOTAL_TIME;
    updateTimerDisplay();

    const btn = document.getElementById('timer-btn');
    const status = document.getElementById('timer-status');

    if (btn) btn.textContent = "开始专注";
    if (status) status.textContent = "Ready";
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const el = document.getElementById('timer-display');
    if (el) el.textContent = display;

    // Update Progress Circle
    const progressCircle = document.getElementById('timer-progress');
    if (progressCircle) {
        // Calculate offset: 0 is full, CIRCUMFERENCE is empty
        // We want to go from Full to Empty as time decreases
        // At start: timeLeft = TOTAL_TIME -> offset = 0
        // At end: timeLeft = 0 -> offset = CIRCUMFERENCE
        const offset = CIRCUMFERENCE - (timeLeft / TOTAL_TIME) * CIRCUMFERENCE;
        progressCircle.style.strokeDashoffset = offset;
    }
}

function showTimerNotification() {
    // 1. Browser Notification
    if (Notification.permission === "granted") {
        new Notification("专注时间结束！", {
            body: "你已经完成了本次专注任务，休息一下吧。",
            icon: "https://cdn-icons-png.flaticon.com/512/2098/2098542.png" // Optional icon
        });
    }

    // 2. Custom Modal
    const modal = document.getElementById('notification-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeNotificationModal() {
    const modal = document.getElementById('notification-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // Auto reset timer after closing modal
    resetTimer();
}

// --- Goal Management (SMART) ---

const STORAGE_KEY_GOALS = 'nexus_goals';
let goals = JSON.parse(localStorage.getItem(STORAGE_KEY_GOALS) || '[]');

function renderGoals() {
    const container = document.querySelector('#smart-section .grid');
    if (!container) return;

    container.innerHTML = '';

    if (goals.length === 0) {
        container.innerHTML = `
            <div class="col-span-1 lg:col-span-2 text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                <div class="text-gray-400 mb-4"><i class="fas fa-bullseye text-4xl opacity-20"></i></div>
                <p class="text-gray-500">暂无目标，点击右上角“新增目标”开始规划</p>
            </div>
        `;
        return;
    }

    goals.forEach(goal => {
        const priorityColors = {
            high: 'bg-red-100 text-red-800',
            medium: 'bg-yellow-100 text-yellow-800',
            low: 'bg-green-100 text-green-800'
        };

        const priorityLabels = {
            high: 'P0',
            medium: 'P1',
            low: 'P2'
        };

        const progressColor = goal.progress >= 100 ? 'bg-green-500' : 'bg-primary';

        const html = `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 relative group hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">${goal.title}</h3>
                        <p class="text-sm text-gray-500 mt-1">截止日期: ${goal.deadline || '未设置'}</p>
                    </div>
                    <div class="flex items-center space-x-2">
                         <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[goal.priority]}">
                            ${priorityLabels[goal.priority]}
                        </span>
                        <button onclick="deleteGoal('${goal.id}')" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
                
                <div class="mb-4">
                    <p class="text-sm text-gray-600 whitespace-pre-line">${goal.result || '暂无关键结果'}</p>
                </div>

                <div class="flex items-center justify-between text-sm text-gray-500 mb-1">
                    <span>进度</span>
                    <span class="font-medium text-gray-900">${goal.progress}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div class="${progressColor} h-2 rounded-full transition-all duration-500" style="width: ${goal.progress}%"></div>
                </div>
                
                <div class="flex justify-between items-center pt-4 border-t border-gray-50">
                     <span class="text-xs text-gray-400">状态: ${goal.status === 'completed' ? '已完成' : (goal.status === 'in_progress' ? '进行中' : '未开始')}</span>
                     <button onclick="openGoalModal('${goal.id}')" class="text-primary hover:text-indigo-700 text-sm font-medium">编辑</button>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

function openGoalModal(id = null) {
    const modal = document.getElementById('goal-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const titleEl = document.getElementById('goal-modal-title');
    const idInput = document.getElementById('goal-id');
    const titleInput = document.getElementById('goal-title');
    const resultInput = document.getElementById('goal-result');
    const deadlineInput = document.getElementById('goal-deadline');
    const priorityInput = document.getElementById('goal-priority');
    const progressInput = document.getElementById('goal-progress');
    const progressVal = document.getElementById('goal-progress-val');
    const statusInput = document.getElementById('goal-status');

    if (id) {
        // Edit Mode
        const goal = goals.find(g => g.id === id);
        if (goal) {
            titleEl.textContent = '编辑目标';
            idInput.value = goal.id;
            titleInput.value = goal.title;
            resultInput.value = goal.result || '';
            deadlineInput.value = goal.deadline || '';
            priorityInput.value = goal.priority;
            progressInput.value = goal.progress;
            progressVal.textContent = goal.progress + '%';
            statusInput.value = goal.status;
        }
    } else {
        // Add Mode
        titleEl.textContent = '新增目标 (SMART)';
        idInput.value = '';
        titleInput.value = '';
        resultInput.value = '';
        deadlineInput.value = '';
        priorityInput.value = 'high';
        progressInput.value = 0;
        progressVal.textContent = '0%';
        statusInput.value = 'pending';
    }
}

function closeGoalModal() {
    const modal = document.getElementById('goal-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function saveGoal() {
    const id = document.getElementById('goal-id').value;
    const title = document.getElementById('goal-title').value;
    const result = document.getElementById('goal-result').value;
    const deadline = document.getElementById('goal-deadline').value;
    const priority = document.getElementById('goal-priority').value;
    const progress = document.getElementById('goal-progress').value;
    const status = document.getElementById('goal-status').value;

    if (!title) {
        alert('请输入目标名称');
        return;
    }

    if (id) {
        // Update
        const index = goals.findIndex(g => g.id === id);
        if (index !== -1) {
            goals[index] = { ...goals[index], title, result, deadline, priority, progress, status };
        }
    } else {
        // Create
        const newGoal = {
            id: Date.now().toString(),
            title,
            result,
            deadline,
            priority,
            progress,
            status,
            createdAt: new Date().toISOString()
        };
        goals.push(newGoal);
    }

    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    renderGoals();
    closeGoalModal();
    showToast('目标已保存');
}

function deleteGoal(id) {
    if (!confirm('确定要删除这个目标吗？')) return;
    goals = goals.filter(g => g.id !== id);
    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    renderGoals();
    showToast('目标已删除');
}

// Initialize Goals
document.addEventListener('DOMContentLoaded', () => {
    renderGoals();
    renderTimeLogs();
    renderReviews();
});

// --- Time & Energy Management ---

const STORAGE_KEY_TIME_LOGS = 'nexus_time_logs';
let timeLogs = JSON.parse(localStorage.getItem(STORAGE_KEY_TIME_LOGS) || '[]');

function renderTimeLogs() {
    renderEnergyChart();
    const container = document.getElementById('time-log-list');
    const totalEl = document.getElementById('time-log-total');
    if (!container || !totalEl) return;

    container.innerHTML = '';

    // Filter for today's logs (optional, but "Today's Time Expenditure" implies daily reset or filtering)
    // For simplicity, we'll show all logs but let's assume the user manually clears or we just show everything for now.
    // Or better, filter by date.
    const today = new Date().toDateString();
    const todaysLogs = timeLogs.filter(log => new Date(log.createdAt).toDateString() === today);

    if (todaysLogs.length === 0) {
        container.innerHTML = `
            <li class="text-center text-gray-400 text-sm py-4">
                暂无记录
            </li>
        `;
        totalEl.textContent = '0h 0m';
        return;
    }

    let totalMinutes = 0;

    todaysLogs.forEach(log => {
        totalMinutes += parseInt(log.duration || 0);

        const categoryColors = {
            dev: 'bg-primary',
            meeting: 'bg-yellow-400',
            other: 'bg-gray-400'
        };

        const categoryLabels = {
            dev: '项目开发',
            meeting: '会议沟通',
            other: '碎片干扰'
        };

        const html = `
            <li class="flex items-center justify-between group">
                <div class="flex items-center overflow-hidden">
                    <div class="w-2 h-2 rounded-full ${categoryColors[log.category] || 'bg-gray-400'} mr-2 flex-shrink-0"></div>
                    <div class="flex flex-col min-w-0">
                        <span class="text-sm text-gray-700 truncate font-medium" title="${log.task}">${log.task}</span>
                        <span class="text-xs text-gray-400">${categoryLabels[log.category] || '其他'}</span>
                    </div>
                </div>
                <div class="flex items-center ml-2 flex-shrink-0">
                    <span class="text-sm font-bold text-gray-900 mr-3">${formatDuration(log.duration)}</span>
                    <button onclick="deleteTimeLog('${log.id}')" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </li>
        `;
        container.innerHTML += html;
    });

    totalEl.textContent = formatDuration(totalMinutes);
}

function addTimeLog() {
    const taskInput = document.getElementById('time-log-task');
    const durationInput = document.getElementById('time-log-duration');
    const categoryInput = document.getElementById('time-log-category');

    const task = taskInput.value.trim();
    const duration = parseInt(durationInput.value);
    const category = categoryInput.value;

    if (!task) {
        alert('请输入任务内容');
        return;
    }

    if (!duration || duration <= 0) {
        alert('请输入有效的耗时（分钟）');
        return;
    }

    const newLog = {
        id: Date.now().toString(),
        task,
        duration,
        category,
        createdAt: new Date().toISOString()
    };

    timeLogs.unshift(newLog); // Add to top
    localStorage.setItem(STORAGE_KEY_TIME_LOGS, JSON.stringify(timeLogs));

    renderTimeLogs();

    // Reset inputs
    taskInput.value = '';
    durationInput.value = '';
    showToast('时间日志已添加');
}

function deleteTimeLog(id) {
    if (!confirm('确定要删除这条记录吗？')) return;
    timeLogs = timeLogs.filter(log => log.id !== id);
    localStorage.setItem(STORAGE_KEY_TIME_LOGS, JSON.stringify(timeLogs));
    renderTimeLogs();
}

function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) {
        return `${h}h ${m}m`;
    }
    return `${m}m`;
}

// --- Energy Chart Visualization ---
const STORAGE_KEY_ENERGY_CONFIG = 'nexus_energy_config';
let energyChart = null;
let energyConfig = JSON.parse(localStorage.getItem(STORAGE_KEY_ENERGY_CONFIG) || JSON.stringify({
    peakStart: '09:00',
    peakEnd: '11:00',
    dipStart: '13:00',
    dipEnd: '14:00'
}));

function renderEnergyChart() {
    const ctx = document.getElementById('energy-chart');
    if (!ctx) return;

    // Helper to convert time string "HH:MM" to decimal hour
    const toDecimal = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h + m / 60;
    };

    const peakStart = toDecimal(energyConfig.peakStart);
    const peakEnd = toDecimal(energyConfig.peakEnd);
    const dipStart = toDecimal(energyConfig.dipStart);
    const dipEnd = toDecimal(energyConfig.dipEnd);

    // 1. Prepare Baseline Data (Smooth Curve)
    // 08:00 - 20:00
    const baselinePoints = [];
    for (let h = 8; h <= 20; h += 0.5) { // Step by 0.5 hour for smoother curve
        let val = 50; // Default Medium

        if (h >= peakStart && h <= peakEnd) {
            val = 90; // High
        } else if (h >= dipStart && h <= dipEnd) {
            val = 40; // Low
        } else if (h > peakEnd && h < dipStart) {
            val = 60; // Transition (Morning to Lunch)
        } else if (h > dipEnd && h < 18) {
            val = 70; // Afternoon Recovery
        } else if (h >= 18) {
            val = 30; // Evening Drop
        }

        baselinePoints.push({ x: h, y: val });
    }

    // Update Text in UI
    const peakText = document.getElementById('energy-peak-text');
    const dipText = document.getElementById('energy-dip-text');
    if (peakText) peakText.textContent = `黄金时间 (${energyConfig.peakStart} - ${energyConfig.peakEnd})`;
    if (dipText) dipText.textContent = `行政时间 (${energyConfig.dipStart} - ${energyConfig.dipEnd})`;

    // 2. Prepare User Data from Time Logs
    // Filter for today
    const today = new Date().toDateString();
    const todaysLogs = timeLogs.filter(log => new Date(log.createdAt).toDateString() === today);

    const userPoints = todaysLogs.map(log => {
        const d = new Date(log.createdAt);
        const hour = d.getHours() + d.getMinutes() / 60;

        let energy = 50;
        if (log.category === 'dev') energy = 85;
        else if (log.category === 'meeting') energy = 60;
        else energy = 30;

        return {
            x: hour,
            y: energy,
            task: log.task,
            duration: log.duration
        };
    });

    if (energyChart) {
        energyChart.destroy();
    }

    energyChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: '基准精力 (Baseline)',
                    data: baselinePoints,
                    borderColor: '#E5E7EB', // Gray-200
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.4, // Smooth curve
                    fill: true,
                    backgroundColor: 'rgba(243, 244, 246, 0.4)' // Gray-100
                },
                {
                    label: '实际工作 (Work Log)',
                    data: userPoints,
                    type: 'scatter',
                    backgroundColor: (context) => {
                        const val = context.raw?.y;
                        if (val >= 80) return '#10B981'; // Green
                        if (val >= 50) return '#F59E0B'; // Yellow
                        return '#9CA3AF'; // Gray
                    },
                    pointRadius: (context) => {
                        const duration = context.raw?.duration || 30;
                        // Scale radius by duration: min 6, max 15
                        return Math.min(Math.max(duration / 5, 6), 15);
                    },
                    pointHoverRadius: 10
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 8,
                    max: 20,
                    ticks: {
                        stepSize: 1,
                        callback: function (value) {
                            return value + ':00';
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        stepSize: 50,
                        callback: function (value) {
                            if (value === 100) return 'High';
                            if (value === 50) return 'Med';
                            if (value === 0) return 'Low';
                            return '';
                        }
                    },
                    grid: {
                        borderDash: [2, 2]
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (context.dataset.type === 'scatter') {
                                const p = context.raw;
                                return `${p.task} (${p.duration}m)`;
                            }
                            return null;
                        }
                    }
                },
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 10,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

function openEnergyConfigModal() {
    const modal = document.getElementById('energy-config-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('config-peak-start').value = energyConfig.peakStart;
    document.getElementById('config-peak-end').value = energyConfig.peakEnd;
    document.getElementById('config-dip-start').value = energyConfig.dipStart;
    document.getElementById('config-dip-end').value = energyConfig.dipEnd;
}

function closeEnergyConfigModal() {
    const modal = document.getElementById('energy-config-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function saveEnergyConfig() {
    const peakStart = document.getElementById('config-peak-start').value;
    const peakEnd = document.getElementById('config-peak-end').value;
    const dipStart = document.getElementById('config-dip-start').value;
    const dipEnd = document.getElementById('config-dip-end').value;

    if (!peakStart || !peakEnd || !dipStart || !dipEnd) {
        alert('请填写完整的时间段配置');
        return;
    }

    if (peakStart >= peakEnd || dipStart >= dipEnd) {
        alert('开始时间必须早于结束时间');
        return;
    }

    energyConfig = {
        peakStart,
        peakEnd,
        dipStart,
        dipEnd
    };

    localStorage.setItem(STORAGE_KEY_ENERGY_CONFIG, JSON.stringify(energyConfig));
    renderEnergyChart();
    closeEnergyConfigModal();
    showToast('精力配置已更新');
}

// --- Review & Process Management ---

const STORAGE_KEY_REVIEWS = 'nexus_reviews';
let reviews = JSON.parse(localStorage.getItem(STORAGE_KEY_REVIEWS) || '[]');

function renderReviews() {
    const container = document.getElementById('review-list');
    if (!container) return;

    container.innerHTML = '';

    if (reviews.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                <div class="text-gray-400 mb-4"><i class="fas fa-clipboard-check text-4xl opacity-20"></i></div>
                <p class="text-gray-500">暂无复盘记录，点击右上角开始你的第一次复盘吧！</p>
            </div>
        `;
        return;
    }

    // Sort by week (descending)
    reviews.sort((a, b) => b.week.localeCompare(a.week));

    reviews.forEach(review => {
        const html = `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 relative group hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">${review.week} 复盘</h3>
                        <p class="text-xs text-gray-500">创建于 ${new Date(review.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div class="flex items-center">
                        <span class="text-yellow-500 font-bold mr-1">${review.rating}</span>
                        <i class="fas fa-star text-yellow-400 text-sm"></i>
                        <button onclick="deleteReview('${review.id}')" class="ml-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-4">
                        <div>
                            <h4 class="text-xs font-bold text-green-600 uppercase tracking-wide mb-1">Achievements</h4>
                            <p class="text-sm text-gray-700 whitespace-pre-line bg-green-50 p-3 rounded-lg border border-green-100">${review.achievements || '无'}</p>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Challenges</h4>
                            <p class="text-sm text-gray-700 whitespace-pre-line bg-red-50 p-3 rounded-lg border border-red-100">${review.challenges || '无'}</p>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <h4 class="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Learnings</h4>
                            <p class="text-sm text-gray-700 whitespace-pre-line bg-blue-50 p-3 rounded-lg border border-blue-100">${review.learnings || '无'}</p>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-purple-600 uppercase tracking-wide mb-1">Next Week</h4>
                            <p class="text-sm text-gray-700 whitespace-pre-line bg-purple-50 p-3 rounded-lg border border-purple-100">${review.nextFocus || '无'}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

function openReviewModal() {
    const modal = document.getElementById('review-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Auto-fill current week if new
        const weekInput = document.getElementById('review-week');
        if (weekInput && !weekInput.value) {
            const now = new Date();
            // Simple week calculation for default value
            const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            weekInput.value = `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
        }
    }
}

function closeReviewModal() {
    const modal = document.getElementById('review-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');

        // Clear form
        document.getElementById('review-id').value = '';
        document.getElementById('review-week').value = '';
        document.getElementById('review-rating').value = 3;
        document.getElementById('review-rating-val').textContent = '3 分';
        document.getElementById('review-achievements').value = '';
        document.getElementById('review-challenges').value = '';
        document.getElementById('review-learnings').value = '';
        document.getElementById('review-next-focus').value = '';
    }
}

function saveReview() {
    const id = document.getElementById('review-id').value;
    const week = document.getElementById('review-week').value;
    const rating = document.getElementById('review-rating').value;
    const achievements = document.getElementById('review-achievements').value;
    const challenges = document.getElementById('review-challenges').value;
    const learnings = document.getElementById('review-learnings').value;
    const nextFocus = document.getElementById('review-next-focus').value;

    if (!week) {
        alert('请选择复盘周期');
        return;
    }

    const newReview = {
        id: id || Date.now().toString(),
        week,
        rating,
        achievements,
        challenges,
        learnings,
        nextFocus,
        createdAt: new Date().toISOString()
    };

    if (id) {
        // Update existing
        const index = reviews.findIndex(r => r.id === id);
        if (index !== -1) {
            reviews[index] = newReview;
        }
    } else {
        // Create new
        reviews.unshift(newReview);
    }

    localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(reviews));
    renderReviews();
    closeReviewModal();
    showToast('复盘记录已保存');
}

function deleteReview(id) {
    if (!confirm('确定要删除这条复盘记录吗？')) return;
    reviews = reviews.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_REVIEWS, JSON.stringify(reviews));
    renderReviews();
    showToast('记录已删除');
}

// ==========================================
// Mobile App Quality Metrics Management
// ==========================================

const appQualityMetrics = [
    {
        category: "性能体验 (Performance)",
        icon: "fas fa-tachometer-alt",
        colorClass: "purple",
        items: [
            {
                name: "冷启动耗时 (Cold Start)",
                target: "< 2s (优秀), < 5s (达标)",
                scheme: "Process Start -> Activity Displayed.",
                android_impl: "1. **测量工具**: `adb shell am start -W package/activity` (TotalTime)。\n2. **代码打点**: 在 `Application.attachBaseContext` 开始记录，在首个 Activity `onWindowFocusChanged` 结束。\n3. **优化**: 懒加载初始化任务，避免主线程 I/O。",
                flutter_impl: "1. **测量工具**: `flutter run --trace-startup --profile`。\n2. **指标**: `Time to First Frame`。\n3. **优化**: 减少 `main()` 中的同步操作，使用 `Deferred Components`。"
            },
            {
                name: "热启动耗时 (Warm Start)",
                target: "< 500ms",
                scheme: "Activity.onResume -> View 绘制完成。",
                android_impl: "1. **测量**: 记录 `onStart` 到 `onResume` 耗时。\n2. **优化**: 减少 `onResume` 中的繁重工作，保持视图层级扁平。",
                flutter_impl: "1. **测量**: 路由跳转时间。\n2. **优化**: 保持 `build` 方法轻量，避免不必要的 `setState`。"
            },
            {
                name: "页面流畅度 (FPS/Freeze)",
                target: "稳定 60 FPS, 冻帧率 < 0.1%",
                scheme: "监控掉帧与卡顿。",
                android_impl: "1. **工具**: `Choreographer.FrameCallback` 监控帧间隔。\n2. **冻帧**: 主线程卡顿 > 700ms (连续掉帧 42+)。\n3. **BlockCanary**: 监控主线程消息处理耗时。",
                flutter_impl: "1. **工具**: `SchedulerBinding.instance.addTimingsCallback`。\n2. **指标**: `buildDuration` (构建耗时) 和 `rasterDuration` (光栅化耗时)。\n3. **DevTools**: 使用 Performance Overlay 查看。"
            },
            {
                name: "页面秒开率",
                target: "> 90% (1s 内加载完成)",
                scheme: "路由跳转 -> 首屏内容可见。",
                android_impl: "1. **打点**: 路由开始 -> 视图绘制完成 (`ViewTreeObserver.OnGlobalLayoutListener`)。\n2. **优化**: 数据预加载，骨架屏，异步 Inflate。",
                flutter_impl: "1. **打点**: `Navigator.push` -> `addPostFrameCallback`。\n2. **优化**: 预缓存图片/数据，分帧渲染。"
            }
        ]
    },
    {
        category: "稳定性 (Stability)",
        icon: "fas fa-shield-alt",
        colorClass: "red",
        items: [
            {
                name: "崩溃率 (Crash Rate)",
                target: "< 0.1% (UV)",
                scheme: "全局异常捕获。",
                android_impl: "1. **Java**: `Thread.setDefaultUncaughtExceptionHandler`。\n2. **Native**: 监听信号量 (SIGSEGV 等)，使用 Breakpad/Crasher。\n3. **平台**: Firebase Crashlytics, Bugly。",
                flutter_impl: "1. **Dart**: `FlutterError.onError` (框架层) + `PlatformDispatcher.instance.onError` (异步层)。\n2. **Native**: 仍需 Android/iOS 原生捕获兜底。"
            },
            {
                name: "ANR 率 (卡死)",
                target: "< 0.1%",
                scheme: "主线程超时监控。",
                android_impl: "1. **原理**: 监控主线程 `Looper` 消息处理时间 > 5s。\n2. **实现**: Watchdog 线程定时向主线程 Handler 发送消息并检测回调。\n3. **解决**: 严禁主线程 I/O、数据库操作。",
                flutter_impl: "1. **原理**: Dart 单线程模型，监控 Isolate 事件循环延迟。\n2. **检测**: 计算两个 Timer 之间的实际间隔差。\n3. **解决**: 耗时计算放入 `compute` (Isolate)。"
            },
            {
                name: "OOM 率 (内存溢出)",
                target: "< 0.05%",
                scheme: "内存峰值监控。",
                android_impl: "1. **监控**: `ComponentCallbacks2.onTrimMemory` 监听系统低内存警告。\n2. **治理**: LeakCanary 检测泄漏，大图压缩，及时释放引用。",
                flutter_impl: "1. **监控**: 观察 `ImageCache` 大小。\n2. **治理**: 使用 `cached_network_image` 并限制缓存大小，及时 `dispose` 控制器。"
            },
            {
                name: "网络请求成功率",
                target: "> 99.5%",
                scheme: "业务接口请求成功 / 总请求数。",
                android_impl: "1. **拦截器**: OkHttp Interceptor 统一统计。\n2. **策略**: 失败自动重试 (Exponential Backoff)，多域名 IP 直连 (HTTPDNS)。",
                flutter_impl: "1. **拦截器**: Dio Interceptor。\n2. **策略**: 离线缓存 (Hive/Sqlite)，弱网优化。"
            }
        ]
    },
    {
        category: "资源消耗 (Resource)",
        icon: "fas fa-battery-half",
        colorClass: "yellow",
        items: [
            {
                name: "安装包体积 (APK Size)",
                target: "< 50MB",
                scheme: "减小包体大小。",
                android_impl: "1. **R8/ProGuard**: 开启代码混淆与资源压缩 (`shrinkResources`)。\n2. **资源**: 图片转 WebP，使用 VectorDrawable。\n3. **架构**: App Bundle (.aab) 动态分发，So 库动态加载。",
                flutter_impl: "1. **命令**: `flutter build apk --split-per-abi` (分架构打包)。\n2. **混淆**: `--obfuscate --split-debug-info`。\n3. **资源**: 移除未使用的字体与图标。"
            },
            {
                name: "内存占用 (PSS)",
                target: "< 300MB",
                scheme: "应用运行时内存。",
                android_impl: "1. **指标**: PSS (Proportional Set Size)。\n2. **工具**: Android Profiler, `adb shell dumpsys meminfo`。\n3. **策略**: 避免内存抖动 (Memory Churn)，复用对象池。",
                flutter_impl: "1. **工具**: Dart DevTools Memory 视图。\n2. **泄漏**: 检查未释放的 StreamSubscription 和 AnimationController。"
            },
            {
                name: "耗电量",
                target: "后台 < 2% / 小时",
                scheme: "后台耗电监控。",
                android_impl: "1. **工具**: Battery Historian。\n2. **策略**: 避免频繁 WakeLock，使用 WorkManager 批处理任务，减少后台定位频率。",
                flutter_impl: "1. **策略**: 避免在后台运行高频 Timer 或 Animation。\n2. **Native**: 同样需遵循 Android 后台限制规范。"
            }
        ]
    },
    {
        category: "业务质量 (Business)",
        icon: "fas fa-briefcase",
        colorClass: "blue",
        items: [
            {
                name: "核心路径转化率",
                target: "> 85%",
                scheme: "全链路埋点 (PV/UV)。",
                android_impl: "1. **埋点**: 自研埋点 SDK 或神策/Umeng。\n2. **分析**: 构建漏斗模型，分析每一步流失率。",
                flutter_impl: "1. **埋点**: 封装统一的 Analytics Service。\n2. **Context**: 携带页面来源参数。"
            },
            {
                name: "图片/资源加载成功率",
                target: "> 99.9%",
                scheme: "CDN 可用性监控。",
                android_impl: "1. **库**: Glide/Fresco Listener 监控加载结果。\n2. **降级**: 主 CDN 失败自动切换备用 CDN 域名。",
                flutter_impl: "1. **组件**: `CachedNetworkImage` 的 `errorWidget` 回调。\n2. **监控**: 上报加载失败异常。"
            }
        ]
    }
];

function renderAppQualityMetrics() {
    const container = document.getElementById('app-quality-metrics-container');
    if (!container) return;

    container.innerHTML = '';

    appQualityMetrics.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = `bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden`;

        const header = `
            <div class="px-6 py-4 bg-${group.colorClass}-50 border-b border-${group.colorClass}-100 flex items-center">
                <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-${group.colorClass}-500 shadow-sm mr-4">
                    <i class="${group.icon}"></i>
                </div>
                <h3 class="text-lg font-bold text-gray-800">${group.category}</h3>
            </div>
        `;
        groupEl.innerHTML = header;

        const table = document.createElement('table');
        table.className = 'w-full text-left border-collapse';
        table.innerHTML = `
            <thead>
                <tr class="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                    <th class="px-6 py-3 w-1/4">指标名称</th>
                    <th class="px-6 py-3 w-1/4">目标值</th>
                    <th class="px-6 py-3 w-1/2">采集/实现方案</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                ${group.items.map((item, itemIndex) => `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="py-3 px-6 font-medium text-gray-900">${item.name}</td>
                        <td class="py-3 px-6">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ${item.target}
                            </span>
                        </td>
                        <td class="py-3 px-4 text-gray-600 font-mono text-xs leading-relaxed">
                            <div class="flex justify-between items-center">
                                <span>${item.scheme}</span>
                                <button onclick="openMetricDetailModal(${appQualityMetrics.indexOf(group)}, ${itemIndex})" 
                                    class="ml-2 text-primary hover:text-indigo-800 text-xs font-bold focus:outline-none flex-shrink-0">
                                    <i class="fas fa-code mr-1"></i>实现方案
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        groupEl.appendChild(table);

        container.appendChild(groupEl);
    });
}

// ==========================================
// Data Management (Import/Export)
// ==========================================

function openDataModal() {
    const modal = document.getElementById('data-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDataModal() {
    const modal = document.getElementById('data-modal');
    if (modal) modal.classList.add('hidden');
}

function exportData() {
    const data = {};
    // Iterate over all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Only backup keys related to our app (nexus_ prefix)
        if (key.startsWith('nexus_')) {
            data[key] = localStorage.getItem(key);
        }
    }

    if (Object.keys(data).length === 0) {
        alert("没有可导出的数据 (No data found to export).");
        return;
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `nexus_backup_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('数据导出成功');
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            let importCount = 0;

            Object.keys(data).forEach(key => {
                if (key.startsWith('nexus_')) {
                    localStorage.setItem(key, data[key]);
                    importCount++;
                }
            });

            if (importCount > 0) {
                alert(`成功导入 ${importCount} 项数据！页面将刷新。`);
                location.reload();
            } else {
                alert("文件中未找到有效数据 (No valid 'nexus_' keys found).");
            }
        } catch (error) {
            console.error(error);
            alert("文件解析失败，请确保是有效的 JSON 备份文件。");
        }
    };
    reader.readAsText(file);
    // Reset input to allow re-importing same file if needed
    input.value = '';
}

// ==========================================
// Disk Sync (Server-Side Persistence)
// ==========================================

let syncTimeout = null;
const SYNC_DELAY = 1000; // 1 second debounce

// Auto-save wrapper
function autoSave() {
    // Show "Saving..." status if we had a UI element for it
    const btn = document.querySelector('button[onclick="syncToDisk()"] span');
    if (btn) btn.textContent = "保存中... (Saving)";

    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        syncToDisk(true);
    }, SYNC_DELAY);
}

async function syncToDisk(silent = false) {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('nexus_')) {
            data[key] = localStorage.getItem(key);
        }
    }

    if (Object.keys(data).length === 0) return;

    try {
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            if (!silent) showToast('数据已成功同步到本地磁盘！');
            // Update UI to show saved
            const btn = document.querySelector('button[onclick="syncToDisk()"] span');
            if (btn) btn.textContent = "已自动保存 (Saved)";
            setTimeout(() => {
                if (btn) btn.textContent = "保存到本地 (Sync)";
            }, 3000);
        } else {
            console.error('Save failed');
        }
    } catch (error) {
        console.error('Sync error:', error);
        if (!silent) alert('自动保存失败：请确保 python server.py 正在运行。');
    }
}

// Override localStorage.setItem to trigger auto-save
const originalSetItem = localStorage.setItem;
localStorage.setItem = function (key, value) {
    originalSetItem.apply(this, arguments);
    if (key.startsWith('nexus_')) {
        autoSave();
    }
};

// Try to load data from disk on startup if localStorage is empty or user requests it
async function loadFromDisk() {
    try {
        const response = await fetch('/api/data');
        if (response.ok) {
            const data = await response.json();
            if (Object.keys(data).length > 0) {
                let hasNewData = false;
                Object.keys(data).forEach(key => {
                    // Only restore if localStorage is missing this key (prevent overwrite)
                    // This allows "Recover" on a fresh browser/port
                    if (!localStorage.getItem(key)) {
                        localStorage.setItem(key, data[key]);
                        hasNewData = true;
                    }
                });

                if (hasNewData) {
                    showToast('已自动恢复服务器备份数据');
                    setTimeout(() => location.reload(), 1000);
                }
            }
        }
    } catch (e) {
        console.log('No backend server detected or no data file.');
    }
}

// ==========================================
// Metric Detail Modal Logic
// ==========================================

function openMetricDetailModal(groupIndex, itemIndex) {
    const item = appQualityMetrics[groupIndex].items[itemIndex];
    document.getElementById('metric-detail-title').textContent = item.name + ' - 实现详情';

    // Default fallback if no specific impl provided
    const defaultAndroid = "暂无特定 Android 实现说明，请参考通用方案。";
    const defaultFlutter = "暂无特定 Flutter 实现说明，请参考通用方案。";

    document.getElementById('metric-android-impl').textContent = item.android_impl || defaultAndroid;
    document.getElementById('metric-flutter-impl').textContent = item.flutter_impl || defaultFlutter;

    const modal = document.getElementById('metric-detail-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeMetricDetailModal() {
    const modal = document.getElementById('metric-detail-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

let promptTemplates = [];
let promptTemplatesStorageListenerAttached = false;

function attachPromptTemplatesStorageListener() {
    if (promptTemplatesStorageListenerAttached) return;
    promptTemplatesStorageListenerAttached = true;

    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY_PROMPT_TEMPLATES) return;
        promptTemplates = readPromptTemplatesFromStorage().templates;
        renderPromptTemplatesSidebar();
        renderPromptTemplatesDrawerList();
    });
}

function getDefaultPromptTemplates() {
    const now = new Date().toISOString();
    return [
        {
            id: `pt_${Date.now().toString()}_1`,
            title: '需求澄清',
            description: '一句话总结 + 用户价值 + 待补充问题清单',
            content: '你现在是[角色]，帮我审查这个需求，输出：1) 一句话总结；2) 关键用户价值；3) 需要补充的问题列表。',
            createdAt: now,
            updatedAt: now
        },
        {
            id: `pt_${Date.now().toString()}_2`,
            title: '代码辅助',
            description: '从可读性、边界处理、性能三个维度给建议',
            content: '下面是一个[语言]函数的实现，请按「可读性、边界处理、性能」三个维度给出改进建议，并给出改进后的版本。\n\n[在此粘贴代码]',
            createdAt: now,
            updatedAt: now
        },
        {
            id: `pt_${Date.now().toString()}_3`,
            title: '周报生成',
            description: '按固定结构生成：成果/指标/风险/计划',
            content: '根据这段原始素材，帮我生成本周周报，结构为：1) 本周重点成果；2) 指标变化；3) 风险与阻碍；4) 下周计划。\n\n[在此粘贴素材]',
            createdAt: now,
            updatedAt: now
        }
    ];
}

function readPromptTemplatesFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY_PROMPT_TEMPLATES);
    if (raw === null) {
        return { exists: false, templates: [] };
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return { exists: true, templates: [] };
        return { exists: true, templates: sanitizePromptTemplates(parsed) };
    } catch (e) {
        return { exists: true, templates: [] };
    }
}

function sanitizePromptTemplates(templates) {
    if (!Array.isArray(templates)) return [];
    const now = new Date().toISOString();

    return templates
        .map(t => {
            const id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `pt_${Date.now().toString()}_${Math.random().toString(16).slice(2)}`;
            const title = typeof t.title === 'string' ? t.title.trim() : '';
            const description = typeof t.description === 'string' ? t.description.trim() : '';
            const content = typeof t.content === 'string' ? t.content : '';
            const createdAt = typeof t.createdAt === 'string' && t.createdAt ? t.createdAt : now;
            const updatedAt = typeof t.updatedAt === 'string' && t.updatedAt ? t.updatedAt : createdAt;
            return { id, title, description, content, createdAt, updatedAt };
        })
        .filter(t => t.title && t.content);
}

function initPromptTemplates() {
    const { exists, templates } = readPromptTemplatesFromStorage();
    if (!exists) {
        promptTemplates = getDefaultPromptTemplates();
        localStorage.setItem(STORAGE_KEY_PROMPT_TEMPLATES, JSON.stringify(promptTemplates));
        return;
    }

    promptTemplates = templates;
    localStorage.setItem(STORAGE_KEY_PROMPT_TEMPLATES, JSON.stringify(promptTemplates));
}

function sortPromptTemplatesInPlace() {
    promptTemplates.sort((a, b) => {
        const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bt - at;
    });
}

function clearElementChildren(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
}

async function copyTextToClipboard(text) {
    const value = (text || '').toString();
    if (!value) return false;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (e) {
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch (e) {
        document.body.removeChild(textarea);
        return false;
    }
}

function renderPromptTemplatesSidebar() {
    const list = document.getElementById('prompt-templates-sidebar-list');
    const empty = document.getElementById('prompt-templates-sidebar-empty');
    if (!list || !empty) return;

    sortPromptTemplatesInPlace();
    clearElementChildren(list);

    if (promptTemplates.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');

    promptTemplates.forEach(tpl => {
        const item = document.createElement('div');
        item.className = 'bg-white/70 border border-purple-100 rounded-lg p-2';

        const row = document.createElement('div');
        row.className = 'flex items-start justify-between gap-2';

        const meta = document.createElement('div');
        meta.className = 'min-w-0';

        const title = document.createElement('div');
        title.className = 'text-xs font-bold text-purple-900 truncate';
        title.textContent = tpl.title;

        const desc = document.createElement('div');
        desc.className = 'text-[11px] text-purple-900/80 mt-0.5 line-clamp-2';
        desc.textContent = tpl.description || '（无描述）';

        meta.appendChild(title);
        meta.appendChild(desc);

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-1 shrink-0';

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'px-2 py-1 rounded text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition';
        btnEdit.textContent = '查看/编辑';
        btnEdit.addEventListener('click', () => {
            openPromptTemplatesDrawer();
            openPromptTemplateEditor(tpl.id);
        });

        const btnCopy = document.createElement('button');
        btnCopy.type = 'button';
        btnCopy.className = 'px-2 py-1 rounded text-[11px] font-semibold bg-white border border-purple-200 text-purple-800 hover:bg-purple-50 transition';
        btnCopy.textContent = '复制';
        btnCopy.addEventListener('click', async () => {
            const ok = await copyTextToClipboard(tpl.content);
            if (ok) showToast('已复制到剪贴板');
            else alert('复制失败：请检查浏览器权限或使用手动复制');
        });

        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'px-2 py-1 rounded text-[11px] font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50 transition';
        btnDelete.textContent = '删除';
        btnDelete.addEventListener('click', () => deletePromptTemplate(tpl.id));

        actions.appendChild(btnEdit);
        actions.appendChild(btnCopy);
        actions.appendChild(btnDelete);

        row.appendChild(meta);
        row.appendChild(actions);

        item.appendChild(row);
        list.appendChild(item);
    });
}

function openPromptTemplatesDrawer() {
    const drawer = document.getElementById('prompt-templates-drawer');
    if (!drawer) return;
    drawer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderPromptTemplatesDrawerList();
}

function openPromptTemplatesDrawerForCreate() {
    openPromptTemplatesDrawer();
    openPromptTemplateEditor();
}

function closePromptTemplatesDrawer() {
    const drawer = document.getElementById('prompt-templates-drawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
    document.body.style.overflow = '';
    closePromptTemplateEditor();
}

function renderPromptTemplatesDrawerList() {
    const list = document.getElementById('prompt-templates-drawer-list');
    const empty = document.getElementById('prompt-templates-drawer-empty');
    if (!list || !empty) return;

    sortPromptTemplatesInPlace();
    clearElementChildren(list);

    if (promptTemplates.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    promptTemplates.forEach(tpl => {
        const item = document.createElement('div');
        item.className = 'bg-white border border-gray-200 rounded-lg p-3';

        const head = document.createElement('div');
        head.className = 'flex items-start justify-between gap-3';

        const meta = document.createElement('div');
        meta.className = 'min-w-0';

        const title = document.createElement('div');
        title.className = 'text-sm font-bold text-gray-900';
        title.textContent = tpl.title;

        const desc = document.createElement('div');
        desc.className = 'text-xs text-gray-600 mt-0.5 line-clamp-2';
        desc.textContent = tpl.description || '（无描述）';

        meta.appendChild(title);
        meta.appendChild(desc);

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-2 shrink-0';

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-indigo-700 transition';
        btnEdit.textContent = '编辑';
        btnEdit.addEventListener('click', () => openPromptTemplateEditor(tpl.id));

        const btnCopy = document.createElement('button');
        btnCopy.type = 'button';
        btnCopy.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition';
        btnCopy.textContent = '复制';
        btnCopy.addEventListener('click', async () => {
            const ok = await copyTextToClipboard(tpl.content);
            if (ok) showToast('已复制到剪贴板');
            else alert('复制失败：请检查浏览器权限或使用手动复制');
        });

        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50 transition';
        btnDelete.textContent = '删除';
        btnDelete.addEventListener('click', () => deletePromptTemplate(tpl.id));

        actions.appendChild(btnEdit);
        actions.appendChild(btnCopy);
        actions.appendChild(btnDelete);

        head.appendChild(meta);
        head.appendChild(actions);
        item.appendChild(head);
        list.appendChild(item);
    });
}

function openPromptTemplateEditor(id = null) {
    const panel = document.getElementById('prompt-template-editor');
    if (!panel) return;

    panel.classList.remove('hidden');

    const idInput = document.getElementById('prompt-template-id');
    const titleInput = document.getElementById('prompt-template-title');
    const descInput = document.getElementById('prompt-template-description');
    const contentInput = document.getElementById('prompt-template-content');

    if (!idInput || !titleInput || !descInput || !contentInput) return;

    if (id) {
        const tpl = promptTemplates.find(t => t.id === id);
        if (!tpl) return;
        idInput.value = tpl.id;
        titleInput.value = tpl.title;
        descInput.value = tpl.description || '';
        contentInput.value = tpl.content || '';
    } else {
        idInput.value = '';
        titleInput.value = '';
        descInput.value = '';
        contentInput.value = '';
    }

    titleInput.focus();
}

function closePromptTemplateEditor() {
    const panel = document.getElementById('prompt-template-editor');
    if (!panel) return;
    panel.classList.add('hidden');

    const idInput = document.getElementById('prompt-template-id');
    const titleInput = document.getElementById('prompt-template-title');
    const descInput = document.getElementById('prompt-template-description');
    const contentInput = document.getElementById('prompt-template-content');

    if (idInput) idInput.value = '';
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (contentInput) contentInput.value = '';
}

function validatePromptTemplateFields({ title, description, content }) {
    const errors = [];

    const cleanTitle = (title || '').trim();
    const cleanDesc = (description || '').trim();
    const cleanContent = (content || '');

    if (!cleanTitle) errors.push('请输入名称');
    if (cleanTitle.length > 50) errors.push('名称不能超过 50 字');
    if (cleanDesc.length > 120) errors.push('描述不能超过 120 字');
    if (!cleanContent.trim()) errors.push('请输入内容');

    return { ok: errors.length === 0, errors, cleanTitle, cleanDesc, cleanContent };
}

function savePromptTemplate() {
    const idInput = document.getElementById('prompt-template-id');
    const titleInput = document.getElementById('prompt-template-title');
    const descInput = document.getElementById('prompt-template-description');
    const contentInput = document.getElementById('prompt-template-content');

    if (!idInput || !titleInput || !descInput || !contentInput) return;

    const { ok, errors, cleanTitle, cleanDesc, cleanContent } = validatePromptTemplateFields({
        title: titleInput.value,
        description: descInput.value,
        content: contentInput.value
    });

    if (!ok) {
        alert(errors.join('\n'));
        return;
    }

    const now = new Date().toISOString();
    const id = (idInput.value || '').trim();

    if (id) {
        const index = promptTemplates.findIndex(t => t.id === id);
        if (index !== -1) {
            promptTemplates[index] = {
                ...promptTemplates[index],
                title: cleanTitle,
                description: cleanDesc,
                content: cleanContent,
                updatedAt: now
            };
        }
    } else {
        const newId = `pt_${Date.now().toString()}_${Math.random().toString(16).slice(2)}`;
        const tpl = {
            id: newId,
            title: cleanTitle,
            description: cleanDesc,
            content: cleanContent,
            createdAt: now,
            updatedAt: now
        };
        promptTemplates.push(tpl);
        idInput.value = newId;
    }

    localStorage.setItem(STORAGE_KEY_PROMPT_TEMPLATES, JSON.stringify(promptTemplates));
    renderPromptTemplatesSidebar();
    renderPromptTemplatesDrawerList();
    showToast('模板已保存');
}

function deletePromptTemplate(id) {
    const tpl = promptTemplates.find(t => t.id === id);
    if (!tpl) return;
    if (!confirm(`确定要删除模板「${tpl.title}」吗？`)) return;

    promptTemplates = promptTemplates.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY_PROMPT_TEMPLATES, JSON.stringify(promptTemplates));

    const editingId = (document.getElementById('prompt-template-id') || {}).value;
    if (editingId === id) closePromptTemplateEditor();

    renderPromptTemplatesSidebar();
    renderPromptTemplatesDrawerList();
    showToast('模板已删除');
}

async function copyEditingPromptTemplateContent() {
    const contentInput = document.getElementById('prompt-template-content');
    if (!contentInput) return;
    const ok = await copyTextToClipboard(contentInput.value);
    if (ok) showToast('已复制到剪贴板');
    else alert('复制失败：请检查浏览器权限或使用手动复制');
}
