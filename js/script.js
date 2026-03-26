const NOTES_ROOT_PATH = '/Users/chenxunlin/工作管理/移动开发相关知识总结';
const INTERVIEW_ROOT_PATH = '/Users/chenxunlin/工作管理/面试题库';

let allNotes = [];
let interviewNotes = [];
let activeNoteName = '';
let currentMode = 'notes';
const noteCache = new Map();
const interviewCache = new Map();

let interviewCards = [];
let interviewOrder = [];
let interviewIndex = 0;
let interviewShowAnswer = false;
let interviewKnown = new Set();
let interviewDocName = '';
let tasks = [];
let taskFilterStatus = 'all';
let taskFilterPriority = 'all';
let taskSortMode = 'updated_desc';
// 子任务功能已移除，统一通过计划中的多级清单进行管理

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderInline(text) {
    let s = escapeHtml(text);
    s = s.replaceAll(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-gray-100 text-gray-800 text-[0.95em]">$1</code>');
    s = s.replaceAll(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replaceAll(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        const safeUrl = escapeHtml(url);
        const safeLabel = escapeHtml(label);
        return `<a href="${safeUrl}" class="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">${safeLabel}</a>`;
    });
    return s;
}

function markdownToHtml(markdown) {
    const lines = String(markdown || '').replaceAll('\r\n', '\n').split('\n');
    const out = [];

    let inCode = false;
    let codeLang = '';
    let codeLines = [];
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
        if (inUl) {
            out.push('</ul>');
            inUl = false;
        }
        if (inOl) {
            out.push('</ol>');
            inOl = false;
        }
    };

    const flushCode = () => {
        const code = escapeHtml(codeLines.join('\n'));
        const langClass = codeLang ? `language-${escapeHtml(codeLang)}` : '';
        out.push(`<pre class="my-4 p-4 overflow-auto rounded-lg bg-gray-900 text-gray-100 text-sm"><code class="${langClass}">${code}</code></pre>`);
        codeLines = [];
        codeLang = '';
    };

    for (const rawLine of lines) {
        const line = rawLine ?? '';

        if (line.trimStart().startsWith('```')) {
            if (!inCode) {
                closeLists();
                inCode = true;
                codeLang = line.trim().slice(3).trim();
                continue;
            }
            inCode = false;
            flushCode();
            continue;
        }

        if (inCode) {
            codeLines.push(line);
            continue;
        }

        const trimmed = line.trim();

        if (!trimmed) {
            closeLists();
            out.push('<div class="h-3"></div>');
            continue;
        }

        const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (h) {
            closeLists();
            const level = h[1].length;
            const text = renderInline(h[2]);
            const sizeByLevel = {
                1: 'text-3xl',
                2: 'text-2xl',
                3: 'text-xl',
                4: 'text-lg',
                5: 'text-base',
                6: 'text-sm'
            };
            const cls = `${sizeByLevel[level] || 'text-base'} font-bold text-gray-900 mt-6 mb-3`;
            out.push(`<h${level} class="${cls}">${text}</h${level}>`);
            continue;
        }

        const ul = trimmed.match(/^- (.*)$/);
        if (ul) {
            if (inOl) {
                out.push('</ol>');
                inOl = false;
            }
            if (!inUl) {
                out.push('<ul class="list-disc pl-6 space-y-1 my-3">');
                inUl = true;
            }
            out.push(`<li class="text-sm text-gray-800 leading-6">${renderInline(ul[1])}</li>`);
            continue;
        }

        const ol = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (ol) {
            if (inUl) {
                out.push('</ul>');
                inUl = false;
            }
            if (!inOl) {
                out.push('<ol class="list-decimal pl-6 space-y-1 my-3">');
                inOl = true;
            }
            out.push(`<li class="text-sm text-gray-800 leading-6">${renderInline(ol[2])}</li>`);
            continue;
        }

        closeLists();
        out.push(`<p class="text-sm text-gray-800 leading-7 my-3">${renderInline(trimmed)}</p>`);
    }

    if (inCode) {
        flushCode();
    }
    closeLists();

    return out.join('\n');
}

let mdInstance = null;

function getMarkdownIt() {
    if (mdInstance) return mdInstance;
    if (typeof window === 'undefined') return null;
    if (typeof window.markdownit === 'undefined') return null;

    const md = window.markdownit({
        html: false,
        linkify: true,
        typographer: true,
        highlight: (str, lang) => {
            if (typeof window.hljs === 'undefined') {
                const code = escapeHtml(str);
                return `<pre><code>${code}</code></pre>`;
            }

            if (lang && window.hljs.getLanguage(lang)) {
                const highlighted = window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
                return `<pre class="hljs"><code>${highlighted}</code></pre>`;
            }

            const highlighted = window.hljs.highlightAuto(str).value;
            return `<pre class="hljs"><code>${highlighted}</code></pre>`;
        }
    });

    const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const setAttr = (name, value) => {
            const i = token.attrIndex(name);
            if (i < 0) token.attrPush([name, value]);
            else token.attrs[i][1] = value;
        };
        setAttr('target', '_blank');
        setAttr('rel', 'noreferrer');
        return defaultLinkOpen(tokens, idx, options, env, self);
    };

    mdInstance = md;
    return mdInstance;
}

function renderMarkdown(markdown) {
    const md = getMarkdownIt();
    if (md) return md.render(markdown || '');
    return markdownToHtml(markdown);
}

function normalizePlanMarkdown(markdown) {
    const lines = String(markdown || '').replaceAll('\r\n', '\n').split('\n');
    const stdChecklistRe = /^(\s*)(?:[-*]|\d+\.)\s+\[( |x|X)\]\s+(.*)$/;
    const bracketTokenRe = /\[\s*(?:x|X)?\s*\]/;
    const tokenRe = /\[\s*([xX]?)\s*\]/g;
    const out = [];

    for (const rawLine of lines) {
        const line = String(rawLine || '').replace(/\t/g, '    ');

        const m = line.match(stdChecklistRe);
        if (m) {
            const indent = m[1] || '';
            const checked = /[xX]/.test(m[2] || '');
            const text = String(m[3] || '').trim();
            out.push(`${indent}- [${checked ? 'x' : ' '}] ${text}`);
            continue;
        }

        if (bracketTokenRe.test(line)) {
            const indent = (line.match(/^(\s*)/) || [])[1] || '';
            const rest = line.slice(indent.length);
            const tasksInLine = [];
            let match = null;
            tokenRe.lastIndex = 0;
            while ((match = tokenRe.exec(rest)) !== null) {
                const tokenEnd = tokenRe.lastIndex;
                const nextMatch = tokenRe.exec(rest);
                const sliceEnd = nextMatch ? nextMatch.index : rest.length;
                const content = rest.slice(tokenEnd, sliceEnd).trim();
                const checked = /[xX]/.test(match[1] || '');
                if (content) tasksInLine.push({ content, checked });
                if (!nextMatch) break;
                tokenRe.lastIndex = nextMatch.index;
            }
            if (tasksInLine.length) {
                tasksInLine.forEach(t => out.push(`${indent}- [${t.checked ? 'x' : ' '}] ${t.content}`));
                continue;
            }
        }

        out.push(line);
    }

    return out.join('\n');
}

function planTodoStats(markdown) {
    const normalized = normalizePlanMarkdown(markdown);
    const lines = String(normalized || '').split('\n');
    const re = /^(\s*)(?:[-*]|\d+\.)\s+\[( |x|X)\]\s+(.*)$/;
    let total = 0;
    let done = 0;
    for (const line of lines) {
        const m = String(line || '').match(re);
        if (!m) continue;
        total += 1;
        if (/[xX]/.test(m[2] || '')) done += 1;
    }
    return { total, done };
}

function buildPlanMarkdownWithMarkers(markdown) {
    const normalized = normalizePlanMarkdown(markdown);
    const lines = String(normalized || '').split('\n');
    const re = /^(\s*)([-*]|\d+\.)\s+\[( |x|X)\]\s+(.*)$/;
    const marked = lines.map((line, idx) => {
        const m = String(line || '').match(re);
        if (!m) return line;
        const indent = m[1] || '';
        const bullet = m[2] || '-';
        const flag = m[3] || ' ';
        const text = String(m[4] || '');
        return `${indent}${bullet} [${flag}] [[[t:${idx}]]] ${text}`;
    }).join('\n');
    return { lines, markedMarkdown: marked };
}

function applyPlanTodoToggle(lines, lineIndex, checked) {
    const idx = Number(lineIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= lines.length) return lines;
    const re = /^(\s*)([-*]|\d+\.)\s+\[( |x|X)\]\s+(.*)$/;
    const m = String(lines[idx] || '').match(re);
    if (!m) return lines;
    const indent = m[1] || '';
    const bullet = m[2] || '-';
    const text = String(m[4] || '');
    const flag = checked ? 'x' : ' ';
    const next = [...lines];
    next[idx] = `${indent}${bullet} [${flag}] ${text}`;
    return next;
}

function enhancePlanTodoCheckboxes(container, taskId, lines) {
    if (!container) return;
    const tokenRe = /^\s*\[( |x|X)\]\s+\[\[\[t:(\d+)\]\]\]\s*/;
    container.querySelectorAll('li').forEach(li => {
        const target = (li.firstElementChild && li.firstElementChild.tagName === 'P') ? li.firstElementChild : li;
        const first = target.firstChild;
        if (!first || first.nodeType !== Node.TEXT_NODE) return;
        const text = String(first.textContent || '');
        const m = text.match(tokenRe);
        if (!m) return;
        const checked = /[xX]/.test(m[1] || '');
        const lineIndex = Number(m[2]);
        first.textContent = text.replace(tokenRe, '');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.className = 'mr-2 align-middle plan-todo-toggle';
        cb.setAttribute('data-line', String(lineIndex));
        cb.setAttribute('data-task-id', String(taskId || ''));
        target.insertBefore(cb, target.firstChild);
    });

    container.querySelectorAll('input.plan-todo-toggle').forEach(cb => {
        if (cb.dataset.bound) return;
        cb.dataset.bound = '1';
        cb.addEventListener('change', async () => {
            const taskIdStr = String(cb.getAttribute('data-task-id') || '');
            const lineIndex = Number(cb.getAttribute('data-line'));
            const idx = tasks.findIndex(x => String(x.id) === taskIdStr);
            if (idx < 0) return;
            const nextLines = applyPlanTodoToggle(lines, lineIndex, cb.checked);
            const nextPlan = nextLines.join('\n');
            const stats = planTodoStats(nextPlan);
            const nextProgress = stats.total ? Math.round(stats.done * 100 / stats.total) : 0;
            const updated = { ...tasks[idx] };
            updated.plan = nextPlan;
            updated.progress = nextProgress;
            updated.updatedAt = new Date().toISOString();
            try {
                await putTaskRemote(updated);
                tasks[idx] = updated;
                renderTasksList();
                if (String(activeDetailTaskId) === String(taskIdStr)) {
                    renderTaskDetail(false);
                }
            } catch {
                showToast('保存失败');
                renderTaskDetail(false);
            }
        });
    });
}

function setLoading(text) {
    const contentEl = document.getElementById('note-content');
    if (!contentEl) return;
    contentEl.innerHTML = `<div class="text-sm text-gray-500">${escapeHtml(text)}</div>`;
}

function setInterviewLoading(text) {
    const qEl = document.getElementById('interview-question');
    const aEl = document.getElementById('interview-answer');
    const pEl = document.getElementById('interview-progress');
    if (qEl) qEl.textContent = text;
    if (aEl) {
        aEl.innerHTML = '';
        aEl.classList.add('hidden');
    }
    if (pEl) pEl.textContent = '';
}

function showToast(text) {
    const el = document.createElement('div');
    el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 1800);
}

async function fetchNotesList() {
    const res = await fetch('/api/notes/list', { method: 'GET' });
    if (!res.ok) {
        throw new Error(`failed_to_load_list:${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data?.files) ? data.files : [];
}

async function fetchInterviewList() {
    const res = await fetch('/api/interview/list', { method: 'GET' });
    if (!res.ok) {
        throw new Error(`failed_to_load_interview_list:${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data?.files) ? data.files : [];
}

async function fetchNoteFile(name) {
    if (noteCache.has(name)) return noteCache.get(name);
    const res = await fetch(`/api/notes/file?name=${encodeURIComponent(name)}`, { method: 'GET' });
    if (!res.ok) {
        throw new Error(`failed_to_load_file:${res.status}`);
    }
    const data = await res.json();
    noteCache.set(name, data);
    return data;
}

async function fetchInterviewFile(name) {
    if (interviewCache.has(name)) return interviewCache.get(name);
    const res = await fetch(`/api/interview/file?name=${encodeURIComponent(name)}`, { method: 'GET' });
    if (!res.ok) {
        throw new Error(`failed_to_load_interview_file:${res.status}`);
    }
    const data = await res.json();
    interviewCache.set(name, data);
    return data;
}

function renderNotesList(notes, keyword) {
    const listEl = document.getElementById('notes-list');
    if (!listEl) return;

    const q = String(keyword || '').trim().toLowerCase();
    const filtered = q
        ? notes.filter(n => String(n?.title || '').toLowerCase().includes(q) || String(n?.name || '').toLowerCase().includes(q))
        : notes;

    if (!filtered.length) {
        listEl.innerHTML = '<li class="px-3 py-2 text-sm text-gray-400">未找到匹配文档</li>';
        return;
    }

    listEl.innerHTML = filtered.map(n => {
        const isActive = n.name === activeNoteName;
        const base = 'w-full text-left px-3 py-2 rounded-lg transition flex items-start gap-2';
        const active = isActive ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 text-gray-100';
        const subtitle = escapeHtml(n.name);
        const title = escapeHtml(n.title || n.name);
        return `
            <li>
                <button class="${base} ${active}" data-note-name="${escapeHtml(n.name)}">
                    <i class="fas fa-file-lines mt-0.5 ${isActive ? 'text-white' : 'text-indigo-400'}"></i>
                    <span class="min-w-0">
                        <span class="block text-sm font-medium truncate">${title}</span>
                        <span class="block text-xs ${isActive ? 'text-indigo-100' : 'text-gray-400'} truncate">${subtitle}</span>
                    </span>
                </button>
            </li>
        `;
    }).join('\n');

    listEl.querySelectorAll('button[data-note-name]').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-note-name') || '';
            if (name && name !== activeNoteName) {
                openNote(name);
            }
        });
    });
}

function setHeader(title, subtitle) {
    const titleEl = document.getElementById('note-title');
    const subtitleEl = document.getElementById('note-subtitle');
    if (titleEl) titleEl.textContent = title || '移动端知识总结';
    if (subtitleEl) subtitleEl.textContent = subtitle || '';
}

function setMode(mode) {
    currentMode = mode === 'interview' ? 'interview' : (mode === 'tasks' ? 'tasks' : 'notes');

    const notesView = document.getElementById('notes-view');
    const interviewView = document.getElementById('interview-view');
    const tasksView = document.getElementById('tasks-view');
    const notesBtn = document.getElementById('mode-notes-btn');
    const interviewBtn = document.getElementById('mode-interview-btn');
    const tasksBtn = document.getElementById('mode-tasks-btn');
    const openBtn = document.getElementById('note-open-source');
    const sidebarTitle = document.getElementById('sidebar-title');
    const notesSidebar = document.getElementById('notes-sidebar');
    const notesSidebarList = document.getElementById('notes-sidebar-list');
    const tasksSidebar = document.getElementById('tasks-sidebar');
    const navNotes = document.getElementById('nav-item-notes');
    const navTasks = document.getElementById('nav-item-tasks');

    if (notesView) notesView.classList.toggle('hidden', currentMode !== 'notes');
    if (interviewView) interviewView.classList.toggle('hidden', currentMode !== 'interview');
    if (tasksView) tasksView.classList.toggle('hidden', currentMode !== 'tasks');
    if (notesSidebar) notesSidebar.classList.toggle('hidden', currentMode !== 'notes');
    if (notesSidebarList) notesSidebarList.classList.toggle('hidden', currentMode !== 'notes');
    if (tasksSidebar) tasksSidebar.classList.toggle('hidden', currentMode !== 'tasks');
    if (sidebarTitle) sidebarTitle.textContent = '个人工作管理';
    if (navNotes) {
        navNotes.classList.toggle('bg-gray-800', currentMode === 'notes');
        navNotes.classList.toggle('text-white', currentMode === 'notes');
        navNotes.classList.toggle('text-gray-300', currentMode !== 'notes');
    }
    if (navTasks) {
        navTasks.classList.toggle('bg-gray-800', currentMode === 'tasks');
        navTasks.classList.toggle('text-white', currentMode === 'tasks');
        navTasks.classList.toggle('text-gray-300', currentMode !== 'tasks');
    }

    if (notesBtn) {
        notesBtn.classList.toggle('bg-white', currentMode === 'notes');
        notesBtn.classList.toggle('text-gray-900', currentMode === 'notes');
        notesBtn.classList.toggle('shadow-sm', currentMode === 'notes');
        notesBtn.classList.toggle('text-gray-600', currentMode !== 'notes');
    }
    if (interviewBtn) {
        interviewBtn.classList.toggle('bg-white', currentMode === 'interview');
        interviewBtn.classList.toggle('text-gray-900', currentMode === 'interview');
        interviewBtn.classList.toggle('shadow-sm', currentMode === 'interview');
        interviewBtn.classList.toggle('text-gray-600', currentMode !== 'interview');
    }
    if (tasksBtn) {
        tasksBtn.classList.toggle('bg-white', currentMode === 'tasks');
        tasksBtn.classList.toggle('text-gray-900', currentMode === 'tasks');
        tasksBtn.classList.toggle('shadow-sm', currentMode === 'tasks');
        tasksBtn.classList.toggle('text-gray-600', currentMode !== 'tasks');
    }

    if (openBtn) {
        if (currentMode === 'notes' && activeNoteName) openBtn.classList.remove('hidden');
        else openBtn.classList.add('hidden');
    }

    if (currentMode === 'notes') {
        const cached = activeNoteName ? noteCache.get(activeNoteName) : null;
        if (cached) setHeader(cached.title || activeNoteName, `文件：${activeNoteName}`);
        else setHeader('移动端知识总结', '');
    } else {
        if (currentMode === 'interview') {
            setHeader('面试题', '选择题库来源开始练习');
            initInterviewUI();
        } else if (currentMode === 'tasks') {
            setHeader('任务管理', '新建任务、规划并跟踪进度');
            initTasksUI();
        }
    }
}

function fillInterviewDocSelect() {
    const selectEl = document.getElementById('interview-doc-select');
    if (!selectEl) return;

    const options = interviewNotes.map(n => {
        const name = n.name;
        const title = n.title || n.name;
        return `<option value="${escapeHtml(name)}">${escapeHtml(title)}</option>`;
    }).join('');

    selectEl.innerHTML = options;
    if (interviewNotes.length && !selectEl.value) {
        selectEl.value = interviewNotes[0].name;
    }
}

function buildInterviewCards(markdown, docName) {
    const text = String(markdown || '').replaceAll('\r\n', '\n');
    const lines = text.split('\n');
    const cards = [];

    const headingRe = /^(#{2,6})\s+(.*)$/;
    const headings = [];
    for (let i = 0; i < lines.length; i += 1) {
        const m = lines[i].match(headingRe);
        if (m) {
            headings.push({ idx: i, level: m[1].length, title: m[2].trim() });
        }
    }

    const isQuestionTitle = (title) => {
        const t = String(title || '').trim();
        return /^Q\s*\d+\s*[：:]/i.test(t);
    };

    const extractQuestion = (title) => {
        const t = String(title || '').trim();
        const m = t.match(/^Q\s*(\d+)\s*[：:]\s*(.*)$/i);
        const core = (m?.[2] || '').trim();
        return core || t || '未命名问题';
    };

    for (let h = 0; h < headings.length; h += 1) {
        const cur = headings[h];
        if (!isQuestionTitle(cur.title)) continue;
        let end = lines.length;
        for (let j = h + 1; j < headings.length; j += 1) {
            if (headings[j].level <= cur.level) {
                end = headings[j].idx;
                break;
            }
        }
        const answer = lines.slice(cur.idx + 1, end).join('\n').trim();
        if (!answer) continue;
        const id = `${docName}:${cur.idx}`;
        cards.push({
            id,
            question: extractQuestion(cur.title),
            answer
        });
    }

    if (cards.length) return cards;

    const qLineRe = /^(?:[-*]\s*)?Q\s*(\d+)\s*[：:]\s*(.*)$/i;
    let cur = null;
    for (let i = 0; i < lines.length; i += 1) {
        const trimmed = String(lines[i] || '').trim();
        const m = trimmed.match(qLineRe);
        if (m) {
            if (cur) {
                const answer = cur.answerLines.join('\n').trim();
                if (answer) {
                    cards.push({
                        id: `${docName}:${cur.idx}`,
                        question: cur.question,
                        answer
                    });
                }
            }
            cur = {
                idx: i,
                question: String(m[2] || '').trim() || `Q${m[1]}`,
                answerLines: []
            };
            continue;
        }
        if (cur) cur.answerLines.push(lines[i]);
    }
    if (cur) {
        const answer = cur.answerLines.join('\n').trim();
        if (answer) {
            cards.push({
                id: `${docName}:${cur.idx}`,
                question: cur.question,
                answer
            });
        }
    }

    return cards;
}

function getInterviewProgressKey(docName) {
    return `nexus_interview_progress_${docName}`;
}

function loadInterviewProgress(docName) {
    const raw = localStorage.getItem(getInterviewProgressKey(docName));
    if (!raw) return new Set();
    try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed?.known) ? parsed.known : [];
        return new Set(arr);
    } catch {
        return new Set();
    }
}

function saveInterviewProgress() {
    if (!interviewDocName) return;
    const payload = { known: Array.from(interviewKnown) };
    localStorage.setItem(getInterviewProgressKey(interviewDocName), JSON.stringify(payload));
}

function updateInterviewProgressText() {
    const pEl = document.getElementById('interview-progress');
    if (!pEl) return;
    const total = interviewCards.length;
    const known = interviewKnown.size;
    const idx = total ? `${interviewIndex + 1}/${total}` : '0/0';
    pEl.textContent = `进度：${idx}｜已掌握：${known}｜未掌握：${Math.max(total - known, 0)}`;
}

function renderInterviewCard() {
    const qEl = document.getElementById('interview-question');
    const aEl = document.getElementById('interview-answer');
    const tEl = document.getElementById('interview-toggle-answer');
    const knowBtn = document.getElementById('interview-know');
    const dontBtn = document.getElementById('interview-dont-know');

    if (!interviewCards.length) {
        if (qEl) qEl.textContent = '未生成题目，请更换文档或检查内容。';
        if (aEl) aEl.classList.add('hidden');
        if (tEl) tEl.textContent = '显示答案';
        updateInterviewProgressText();
        return;
    }

    const card = interviewCards[interviewOrder[interviewIndex]];
    if (qEl) qEl.textContent = card.question;

    if (aEl) {
        aEl.innerHTML = renderMarkdown(card.answer);
        aEl.classList.toggle('hidden', !interviewShowAnswer);
    }
    if (tEl) tEl.textContent = interviewShowAnswer ? '隐藏答案' : '显示答案';

    const isKnown = interviewKnown.has(card.id);
    if (knowBtn) knowBtn.classList.toggle('opacity-60', isKnown);
    if (dontBtn) dontBtn.classList.toggle('opacity-60', !isKnown);

    updateInterviewProgressText();
}

function nextInterviewCard() {
    if (!interviewCards.length) return;
    interviewIndex = (interviewIndex + 1) % interviewCards.length;
    interviewShowAnswer = false;
    renderInterviewCard();
}

function toggleInterviewAnswer() {
    if (!interviewCards.length) return;
    interviewShowAnswer = !interviewShowAnswer;
    renderInterviewCard();
}

function markInterviewKnown(known) {
    if (!interviewCards.length) return;
    const card = interviewCards[interviewOrder[interviewIndex]];
    if (known) interviewKnown.add(card.id);
    else interviewKnown.delete(card.id);
    saveInterviewProgress();
    renderInterviewCard();
}

async function startInterview() {
    const selectEl = document.getElementById('interview-doc-select');
    if (!selectEl) return;

    const docName = selectEl.value;
    if (!docName) return;

    interviewDocName = docName;
    interviewKnown = loadInterviewProgress(docName);

    setInterviewLoading('正在生成题目...');

    try {
        const data = await fetchInterviewFile(docName);
        const cards = buildInterviewCards(data?.content || '', docName);
        interviewCards = cards;
        const shuffle = Boolean(document.getElementById('interview-shuffle')?.checked);
        interviewOrder = cards.map((_, idx) => idx);
        if (shuffle) {
            for (let i = interviewOrder.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = interviewOrder[i];
                interviewOrder[i] = interviewOrder[j];
                interviewOrder[j] = tmp;
            }
        }
        interviewIndex = 0;
        interviewShowAnswer = false;
        renderInterviewCard();
    } catch {
        setInterviewLoading('生成失败，请稍后重试。');
    }
}

function resetInterviewProgress() {
    if (!interviewDocName) return;
    interviewKnown = new Set();
    localStorage.removeItem(getInterviewProgressKey(interviewDocName));
    renderInterviewCard();
    showToast('已清空进度');
}

function initInterviewUI() {
    fillInterviewDocSelect();

    const startBtn = document.getElementById('interview-start');
    const nextBtn = document.getElementById('interview-next');
    const toggleBtn = document.getElementById('interview-toggle-answer');
    const knowBtn = document.getElementById('interview-know');
    const dontBtn = document.getElementById('interview-dont-know');
    const resetBtn = document.getElementById('interview-reset');

    if (startBtn && !startBtn.dataset.bound) {
        startBtn.dataset.bound = '1';
        startBtn.addEventListener('click', () => startInterview());
    }
    if (nextBtn && !nextBtn.dataset.bound) {
        nextBtn.dataset.bound = '1';
        nextBtn.addEventListener('click', () => nextInterviewCard());
    }
    if (toggleBtn && !toggleBtn.dataset.bound) {
        toggleBtn.dataset.bound = '1';
        toggleBtn.addEventListener('click', () => toggleInterviewAnswer());
    }
    if (knowBtn && !knowBtn.dataset.bound) {
        knowBtn.dataset.bound = '1';
        knowBtn.addEventListener('click', () => markInterviewKnown(true));
    }
    if (dontBtn && !dontBtn.dataset.bound) {
        dontBtn.dataset.bound = '1';
        dontBtn.addEventListener('click', () => markInterviewKnown(false));
    }
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', () => resetInterviewProgress());
    }

    if (!document.body.dataset.interviewKeyBound) {
        document.body.dataset.interviewKeyBound = '1';
        window.addEventListener('keydown', (e) => {
            if (currentMode !== 'interview') return;
            if (e.key === ' ') {
                e.preventDefault();
                toggleInterviewAnswer();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextInterviewCard();
            }
        });
    }

    if (!interviewNotes.length) {
        setInterviewLoading(`题库目录为空：${INTERVIEW_ROOT_PATH}`);
    } else {
        setInterviewLoading('选择题库来源，然后点击“开始练习”。');
    }
    updateInterviewProgressText();
}

async function openNote(name) {
    activeNoteName = name;
    const searchEl = document.getElementById('notes-search');
    renderNotesList(allNotes, searchEl?.value || '');
    setLoading('正在加载文档...');

    let data;
    try {
        data = await fetchNoteFile(name);
    } catch {
        setHeader('加载失败', name);
        setLoading('加载失败');
        return;
    }
    const title = data?.title || name;
    setHeader(title, `文件：${name}`);

    const contentEl = document.getElementById('note-content');
    if (contentEl) {
        contentEl.innerHTML = renderMarkdown(data?.content || '');
    }

    const openBtn = document.getElementById('note-open-source');
    if (openBtn) {
        if (currentMode === 'notes') openBtn.classList.remove('hidden');
        else openBtn.classList.add('hidden');
        openBtn.onclick = async () => {
            const absPath = `${NOTES_ROOT_PATH}/${name}`;
            try {
                await navigator.clipboard.writeText(absPath);
                showToast('已复制文件路径');
            } catch {
                showToast(absPath);
            }
        };
    }
}

function pickDefaultNote(files) {
    const exact = files.find(f => f?.name === '00_知识体系总览.md');
    if (exact) return exact.name;
    const first = files[0]?.name || '';
    return first;
}

async function bootstrap() {
    try {
        setLoading('正在加载文档列表...');
        allNotes = await fetchNotesList();
        interviewNotes = await fetchInterviewList();

        const searchEl = document.getElementById('notes-search');
        renderNotesList(allNotes, searchEl?.value || '');

        if (currentMode === 'interview') {
            initInterviewUI();
        }

        if (!allNotes.length) {
            setHeader('暂无文档', '');
            setLoading(`目录为空：${NOTES_ROOT_PATH}`);
            return;
        }

        if (!activeNoteName) {
            activeNoteName = pickDefaultNote(allNotes);
        }
        await openNote(activeNoteName);
    } catch (e) {
        setHeader('加载失败', '');
        setLoading('无法读取文档列表，请确认服务已启动。');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('notes-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            activeNoteName = '';
            await bootstrap();
            showToast('已刷新');
        });
    }

    const searchEl = document.getElementById('notes-search');
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            renderNotesList(allNotes, searchEl.value);
        });
    }

    const notesModeBtn = document.getElementById('mode-notes-btn');
    if (notesModeBtn) notesModeBtn.addEventListener('click', () => setMode('notes'));
    const tasksModeBtn = document.getElementById('mode-tasks-btn');
    if (tasksModeBtn) tasksModeBtn.addEventListener('click', () => setMode('tasks'));
    const navNotes = document.getElementById('nav-item-notes');
    if (navNotes && !navNotes.dataset.bound) {
        navNotes.dataset.bound = '1';
        navNotes.addEventListener('click', () => setMode('notes'));
    }
    const navTasks = document.getElementById('nav-item-tasks');
    if (navTasks && !navTasks.dataset.bound) {
        navTasks.dataset.bound = '1';
        navTasks.addEventListener('click', () => setMode('tasks'));
    }
    const modal = document.getElementById('task-modal');
    const modalOpen = document.getElementById('task-modal-open');
    const modalClose = document.getElementById('task-modal-close');
    const modalCancel = document.getElementById('task-modal-cancel');
    const modalOverlay = document.getElementById('task-modal-overlay');
    const openModal = () => { if (modal) modal.classList.remove('hidden'); };
    const closeModal = () => { if (modal) modal.classList.add('hidden'); };
    if (modalOpen && !modalOpen.dataset.bound) {
        modalOpen.dataset.bound = '1';
        modalOpen.addEventListener('click', () => openModal());
    }
    [modalClose, modalCancel, modalOverlay].forEach(btn => {
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => closeModal());
        }
    });

    const detailOverlay = document.getElementById('task-detail-overlay');
    const detailClose = document.getElementById('task-detail-close');
    const detailEditBtn = document.getElementById('task-detail-edit-btn');
    const detailCancelEdit = document.getElementById('task-detail-cancel-edit');
    const detailSaveEdit = document.getElementById('task-detail-save-edit');
    const closeDetail = () => closeTaskDetail();
    [detailOverlay, detailClose].forEach(btn => {
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => closeDetail());
        }
    });
    if (detailEditBtn && !detailEditBtn.dataset.bound) {
        detailEditBtn.dataset.bound = '1';
        detailEditBtn.addEventListener('click', () => renderTaskDetail(true));
    }
    if (detailCancelEdit && !detailCancelEdit.dataset.bound) {
        detailCancelEdit.dataset.bound = '1';
        detailCancelEdit.addEventListener('click', () => renderTaskDetail(false));
    }
    if (detailSaveEdit && !detailSaveEdit.dataset.bound) {
        detailSaveEdit.dataset.bound = '1';
        detailSaveEdit.addEventListener('click', async () => {
            const idx = tasks.findIndex(x => String(x.id) === activeDetailTaskId);
            if (idx < 0) return;
            const titleInput = document.getElementById('task-detail-title-input');
            const priSel = document.getElementById('task-detail-priority');
            const dueInput = document.getElementById('task-detail-due');
            const tagsInput = document.getElementById('task-detail-tags');
            const planInput = document.getElementById('task-detail-plan');
            tasks[idx].title = String(titleInput?.value || '').trim() || '未命名任务';
            tasks[idx].priority = String(priSel?.value || 'P2');
            tasks[idx].dueDate = String(dueInput?.value || '');
            tasks[idx].tags = String(tagsInput?.value || '').split(',').map(s => s.trim()).filter(Boolean);
            tasks[idx].plan = String(planInput?.value || '');
            const s = planTodoStats(tasks[idx].plan);
            if (s.total) {
                tasks[idx].progress = Math.round(s.done * 100 / s.total);
            }
            tasks[idx].updatedAt = new Date().toISOString();
            try {
                await putTaskRemote(tasks[idx]);
                renderTasksList();
                renderTaskDetail(false);
                showToast('已保存修改');
            } catch {
                showToast('保存失败');
            }
        });
    }

    bootstrap();
});

async function fetchTasksList() {
    const res = await fetch('/api/tasks/list', { method: 'GET' });
    if (!res.ok) throw new Error('tasks_list_failed');
    const data = await res.json();
    return Array.isArray(data?.tasks) ? data.tasks : [];
}

async function putTaskRemote(task) {
    const res = await fetch('/api/tasks/put', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task || {})
    });
    if (!res.ok) throw new Error('task_put_failed');
    return await res.json();
}

async function deleteTaskRemote(id) {
    const res = await fetch('/api/tasks/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    if (!res.ok) throw new Error('task_delete_failed');
    return await res.json();
}

function getFilteredTasks() {
    const statusSel = document.getElementById('tasks-filter-status');
    const priSel = document.getElementById('tasks-filter-priority');
    const sortSel = document.getElementById('tasks-sort');
    taskFilterStatus = statusSel ? (statusSel.value || 'all') : taskFilterStatus;
    taskFilterPriority = priSel ? (priSel.value || 'all') : taskFilterPriority;
    taskSortMode = sortSel ? (sortSel.value || 'updated_desc') : taskSortMode;
    const filtered = tasks.filter(t => {
        const okStatus = taskFilterStatus === 'all' || String(t.status || 'todo') === taskFilterStatus;
        const okPri = taskFilterPriority === 'all' || String(t.priority || 'P2') === taskFilterPriority;
        return okStatus && okPri;
    });
    if (taskSortMode === 'due_asc') {
        filtered.sort((a, b) => String(a?.dueDate || '').localeCompare(String(b?.dueDate || '')));
    } else if (taskSortMode === 'priority') {
        const rank = v => v === 'P1' ? 1 : v === 'P2' ? 2 : 3;
        filtered.sort((a, b) => rank(String(a?.priority || 'P2')) - rank(String(b?.priority || 'P2')));
    } else {
        filtered.sort((a, b) => String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || '')));
    }
    return filtered;
}

function updateTasksSidebarStats() {
    const el = document.getElementById('tasks-sidebar-stats');
    if (!el) return;
    const total = tasks.length;
    const tTodo = tasks.filter(t => String(t.status || 'todo') === 'todo').length;
    const tDoing = tasks.filter(t => String(t.status || 'todo') === 'doing').length;
    const tDone = tasks.filter(t => String(t.status || 'todo') === 'done').length;
    el.textContent = `任务统计：共 ${total}｜待办 ${tTodo}｜进行中 ${tDoing}｜已完成 ${tDone}`;
}

function renderTasksList() {
    const listEl = document.getElementById('tasks-list');
    if (!listEl) return;
    const display = getFilteredTasks();
    if (!display.length) {
        listEl.innerHTML = '<div class="px-4 py-6 text-sm text-gray-500">暂无任务，先在上方创建一个。</div>';
        updateTasksSidebarStats();
        return;
    }
    const rows = display.map(t => {
        const id = String(t.id || '');
        const title = escapeHtml(t.title || '未命名任务');
        const pri = escapeHtml(t.priority || 'P2');
        const tags = Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' ? t.tags.split(',').map(s => s.trim()).filter(Boolean) : []);
        return `
        <div class="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3" data-id="${id}">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <div class="text-sm font-semibold text-gray-900 truncate">${title}</div>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${pri === 'P1' ? 'bg-rose-100 text-rose-700' : (pri === 'P2' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700')}">${pri}</span>
                    ${tags.map(tag => `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-gray-100 text-gray-700">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div class="text-xs text-gray-500">截止</div>
                <input type="date" class="border-gray-300 rounded-lg text-sm px-2 py-1 task-due">
            </div>
            <div class="flex items-center gap-2">
                <select class="border-gray-300 rounded-lg text-sm task-status">
                    <option value="todo">待办</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                </select>
            </div>
            <div class="flex items-center gap-2 w-48">
                <input type="range" min="0" max="100" class="w-full task-progress">
                <span class="text-xs w-10 text-right task-progress-text"></span>
            </div>
            <div class="flex items-center gap-2">
                <button class="px-3 py-1.5 rounded-md text-sm bg-white border border-gray-200 hover:bg-gray-50 task-details">详情</button>
                <button class="px-3 py-1.5 rounded-md text-sm bg-rose-600 text-white hover:bg-rose-700 task-del">删除</button>
            </div>
        </div>
        `;
    }).join('\n');
    listEl.innerHTML = rows;
    listEl.querySelectorAll('[data-id]').forEach(row => {
        const id = row.getAttribute('data-id') || '';
        const t = tasks.find(x => String(x.id) === id) || {};
        const dueEl = row.querySelector('.task-due');
        const statusEl = row.querySelector('.task-status');
        const progEl = row.querySelector('.task-progress');
        const progText = row.querySelector('.task-progress-text');
        const detailsBtn = row.querySelector('.task-details');
        const delBtn = row.querySelector('.task-del');
        const planStats = planTodoStats(t.plan || '');
        if (dueEl) dueEl.value = String(t.dueDate || '').slice(0, 10);
        if (statusEl) statusEl.value = String(t.status || 'todo');
        if (progEl) progEl.value = String(Math.max(0, Math.min(100, +t.progress || 0)));
        if (progText) progText.textContent = `${Math.max(0, Math.min(100, +t.progress || 0))}%`;
        if (progEl) {
            const disable = planStats.total > 0;
            progEl.disabled = disable;
            progEl.classList.toggle('opacity-50', disable);
            progEl.classList.toggle('cursor-not-allowed', disable);
        }
        let saveTimer = null;
        const saveInline = async () => {
            const idx = tasks.findIndex(x => String(x.id) === id);
            if (idx < 0) return;
            const updated = { ...tasks[idx] };
            updated.dueDate = dueEl?.value || '';
            updated.status = statusEl?.value || 'todo';
            if (!progEl?.disabled) {
                updated.progress = Number(progEl?.value || 0);
            }
            updated.updatedAt = new Date().toISOString();
            try {
                await putTaskRemote(updated);
                tasks[idx] = updated;
            } catch {
                showToast('保存失败');
            }
        };
        if (dueEl) dueEl.addEventListener('change', () => saveInline());
        if (statusEl) statusEl.addEventListener('change', () => saveInline());
        if (progEl && !progEl.disabled) {
            progEl.addEventListener('input', () => {
                if (progText) progText.textContent = `${progEl.value}%`;
            });
            progEl.addEventListener('change', () => {
                if (saveTimer) window.clearTimeout(saveTimer);
                saveTimer = window.setTimeout(() => saveInline(), 150);
            });
        }
        if (detailsBtn) detailsBtn.addEventListener('click', () => openTaskDetail(id));
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                try {
                    await deleteTaskRemote(id);
                    tasks = tasks.filter(x => String(x.id) !== id);
                    renderTasksList();
                    showToast('已删除');
                    updateTasksSidebarStats();
                } catch {
                    showToast('删除失败');
                }
            });
        }
    });
    updateTasksSidebarStats();
}

let activeDetailTaskId = '';

function openTaskDetail(taskId) {
    activeDetailTaskId = String(taskId || '');
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;
    renderTaskDetail(false);
    modal.classList.remove('hidden');
}

function closeTaskDetail() {
    const modal = document.getElementById('task-detail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    activeDetailTaskId = '';
}

function renderTaskDetail(editMode) {
    const idx = tasks.findIndex(x => String(x.id) === activeDetailTaskId);
    if (idx < 0) return;
    const t = tasks[idx];
    const titleEl = document.getElementById('task-detail-title');
    const metaEl = document.getElementById('task-detail-meta');
    const viewEl = document.getElementById('task-detail-view');
    const editEl = document.getElementById('task-detail-edit');
    const editBtn = document.getElementById('task-detail-edit-btn');
    const cancelBtn = document.getElementById('task-detail-cancel-edit');
    const saveBtn = document.getElementById('task-detail-save-edit');
    const planPreview = document.getElementById('task-detail-plan-preview');
    if (titleEl) titleEl.textContent = t.title || '未命名任务';
    if (metaEl) metaEl.textContent = `截止：${String(t.dueDate || '').slice(0, 10) || '无'}｜优先级：${t.priority || 'P2'}｜状态：${t.status || 'todo'}｜进度：${Math.max(0, Math.min(100, +t.progress || 0))}%`;
    if (viewEl) viewEl.classList.toggle('hidden', editMode);
    if (editEl) editEl.classList.toggle('hidden', !editMode);
    if (editBtn) editBtn.classList.toggle('hidden', editMode);
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !editMode);
    if (saveBtn) saveBtn.classList.toggle('hidden', !editMode);
    if (!editMode) {
        if (planPreview) {
            const built = buildPlanMarkdownWithMarkers(String(t.plan || ''));
            const html = renderMarkdown(built.markedMarkdown);
            planPreview.innerHTML = html;
            enhancePlanTodoCheckboxes(planPreview, activeDetailTaskId, built.lines);
        }
        return;
    }
    const titleInput = document.getElementById('task-detail-title-input');
    const priSel = document.getElementById('task-detail-priority');
    const dueInput = document.getElementById('task-detail-due');
    const tagsInput = document.getElementById('task-detail-tags');
    const planInput = document.getElementById('task-detail-plan');
    if (titleInput) titleInput.value = t.title || '';
    if (priSel) priSel.value = t.priority || 'P2';
    if (dueInput) dueInput.value = String(t.dueDate || '').slice(0, 10);
    const tags = Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' ? t.tags.split(',').map(s => s.trim()).filter(Boolean) : []);
    if (tagsInput) tagsInput.value = tags.join(', ');
    if (planInput) planInput.value = String(t.plan || '');
}

function initTasksUI() {
    const addBtn = document.getElementById('task-add');
    const titleEl = document.getElementById('task-title');
    const planEl = document.getElementById('task-plan');
    const priEl = document.getElementById('task-priority');
    const dueEl = document.getElementById('task-due');
    const tagsEl = document.getElementById('task-tags');
    const modal = document.getElementById('task-modal');
    const modalOpen = document.getElementById('task-modal-open');
    const modalClose = document.getElementById('task-modal-close');
    const modalCancel = document.getElementById('task-modal-cancel');
    const modalOverlay = document.getElementById('task-modal-overlay');
    const openModal = () => { if (modal) modal.classList.remove('hidden'); };
    const closeModal = () => { if (modal) modal.classList.add('hidden'); };
    if (modalOpen && !modalOpen.dataset.bound) {
        modalOpen.dataset.bound = '1';
        modalOpen.addEventListener('click', () => {
            if (titleEl) titleEl.value = '';
            if (tagsEl) tagsEl.value = '';
            if (planEl) planEl.value = '';
            if (priEl) priEl.value = 'P2';
            if (dueEl) dueEl.value = '';
            openModal();
        });
    }
    [modalClose, modalCancel, modalOverlay].forEach(btn => {
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => closeModal());
        }
    });
    if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = '1';
        addBtn.addEventListener('click', async () => {
            const title = String(titleEl?.value || '').trim();
            if (!title) {
                showToast('请输入标题');
                return;
            }
            const now = new Date().toISOString();
            const tags = String(tagsEl?.value || '').split(',').map(s => s.trim()).filter(Boolean);
            const plan = String(planEl?.value || '');
            const s = planTodoStats(plan);
            const task = {
                id: Date.now().toString(),
                title,
                plan,
                priority: priEl?.value || 'P2',
                dueDate: dueEl?.value || '',
                status: 'todo',
                progress: s.total ? Math.round(s.done * 100 / s.total) : 0,
                tags,
                createdAt: now,
                updatedAt: now
            };
            try {
                await putTaskRemote(task);
                tasks.unshift(task);
                renderTasksList();
                if (titleEl) titleEl.value = '';
                if (planEl) planEl.value = '';
                if (dueEl) dueEl.value = '';
                if (priEl) priEl.value = 'P2';
                if (tagsEl) tagsEl.value = '';
                closeModal();
                showToast('已新建任务');
                updateTasksSidebarStats();
            } catch {
                showToast('新建失败');
            }
        });
    }
    const statusSel = document.getElementById('tasks-filter-status');
    const priSel = document.getElementById('tasks-filter-priority');
    const refreshBtn = document.getElementById('tasks-sidebar-refresh');
    const sortSel = document.getElementById('tasks-sort');
    if (statusSel && !statusSel.dataset.bound) {
        statusSel.dataset.bound = '1';
        statusSel.addEventListener('change', () => renderTasksList());
    }
    if (priSel && !priSel.dataset.bound) {
        priSel.dataset.bound = '1';
        priSel.addEventListener('change', () => renderTasksList());
    }
    if (sortSel && !sortSel.dataset.bound) {
        sortSel.dataset.bound = '1';
        sortSel.addEventListener('change', () => renderTasksList());
    }
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', async () => {
            await loadTasks();
            showToast('已刷新任务');
        });
    }
    loadTasks();
}

async function loadTasks() {
    try {
        tasks = await fetchTasksList();
        tasks.sort((a, b) => String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || '')));
    } catch {
        tasks = [];
    }
    renderTasksList();
    updateTasksSidebarStats();
}
