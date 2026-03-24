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
    currentMode = mode === 'interview' ? 'interview' : 'notes';

    const notesView = document.getElementById('notes-view');
    const interviewView = document.getElementById('interview-view');
    const notesBtn = document.getElementById('mode-notes-btn');
    const interviewBtn = document.getElementById('mode-interview-btn');
    const openBtn = document.getElementById('note-open-source');

    if (notesView) notesView.classList.toggle('hidden', currentMode !== 'notes');
    if (interviewView) interviewView.classList.toggle('hidden', currentMode !== 'interview');

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

    if (openBtn) {
        if (currentMode === 'notes' && activeNoteName) openBtn.classList.remove('hidden');
        else openBtn.classList.add('hidden');
    }

    if (currentMode === 'notes') {
        const cached = activeNoteName ? noteCache.get(activeNoteName) : null;
        if (cached) setHeader(cached.title || activeNoteName, `文件：${activeNoteName}`);
        else setHeader('移动端知识总结', '');
    } else {
        setHeader('面试题', '选择题库来源开始练习');
        initInterviewUI();
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
    if (notesModeBtn) {
        notesModeBtn.addEventListener('click', () => setMode('notes'));
    }
    const interviewModeBtn = document.getElementById('mode-interview-btn');
    if (interviewModeBtn) {
        interviewModeBtn.addEventListener('click', () => setMode('interview'));
    }

    bootstrap();
});
