/**
 * 产程助手 - 主应用逻辑
 */

// ==================== 工具函数 ====================

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTimeWithSeconds(timestamp) {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m${secs}s`;
    return `${secs}s`;
}

function formatDurationLong(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h${String(mins).padStart(2, '0')}m`;
    return `${mins}m${String(seconds % 60).padStart(2, '0')}s`;
}

function formatDateTimeLocal(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().slice(0, 16);
}

function vibrate(pattern = 50) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==================== 应用状态 ====================

const appState = {
    currentLabor: null,
    historyLabors: [],
    isContracting: false,
    currentContractionStart: null,
    selectedPainLevel: null,
    organizeMode: false,
    selectedContractions: [],
    editingContractionId: null,
    editingPainLevel: null,
    pendingMerge: null,
    lastUndoAction: null
};

// ==================== DOM 元素引用 ====================

let elements = {};

function initElements() {
    elements = {
        disclaimerModal: document.getElementById('disclaimerModal'),
        unfinishedModal: document.getElementById('unfinishedModal'),
        mergeToast: document.getElementById('mergeToast'),
        undoToast: document.getElementById('undoToast'),
        laborStartTime: document.getElementById('laborStartTime'),
        laborDuration: document.getElementById('laborDuration'),
        contractionCount: document.getElementById('contractionCount'),
        avgInterval: document.getElementById('avgInterval'),
        avgDuration: document.getElementById('avgDuration'),
        avgPain: document.getElementById('avgPain'),
        chart: document.getElementById('contractionChart'),
        statusText: document.getElementById('statusText'),
        mainBtn: document.getElementById('mainBtn'),
        timerDisplay: document.getElementById('timerDisplay'),
        painRatingSection: document.getElementById('painRatingSection'),
        painValue: document.getElementById('painValue'),
        eventsTimeline: document.getElementById('eventsTimeline'),
        eventsList: document.getElementById('eventsList'),
        contractionList: document.getElementById('contractionList'),
        organizeBtn: document.getElementById('organizeBtn'),
        organizeBar: document.getElementById('organizeBar'),
        organizeCount: document.getElementById('organizeCount'),
        cancelOrganizeBtn: document.getElementById('cancelOrganizeBtn'),
        confirmMergeBtn: document.getElementById('confirmMergeBtn'),
        mainView: document.getElementById('mainView'),
        historyView: document.getElementById('historyView'),
        historyDetailView: document.getElementById('historyDetailView'),
        editView: document.getElementById('editView'),
        settingsView: document.getElementById('settingsView'),
        historyList: document.getElementById('historyList'),
        historyDetailContent: document.getElementById('historyDetailContent'),
        editStartTime: document.getElementById('editStartTime'),
        editEndTime: document.getElementById('editEndTime'),
        importFile: document.getElementById('importFile')
    };
}

// ==================== 初始化 ====================

async function init() {
    initElements();
    await db.init();
    
    const disclaimerAccepted = await db.getSetting('disclaimerAccepted');
    if (!disclaimerAccepted) {
        elements.disclaimerModal.classList.remove('hidden');
    }
    
    await loadData();
    checkUnfinishedContraction();
    bindEvents();
    render();
    setInterval(updateTimer, 1000);
}

async function loadData() {
    appState.currentLabor = await db.getCurrentLabor();
    appState.historyLabors = await db.getHistoryLabors();
    
    if (!appState.currentLabor) {
        appState.currentLabor = {
            startTime: Date.now(),
            contractions: [],
            events: []
        };
        await db.saveCurrentLabor(appState.currentLabor);
    }
}

function checkUnfinishedContraction() {
    const lastContraction = appState.currentLabor.contractions[appState.currentLabor.contractions.length - 1];
    if (lastContraction && !lastContraction.end) {
        elements.unfinishedModal.classList.remove('hidden');
        appState.currentContractionStart = lastContraction.start;
    }
}

// ==================== 事件绑定 ====================

function bindEvents() {
    document.getElementById('acceptDisclaimer').addEventListener('click', async () => {
        await db.saveSetting('disclaimerAccepted', true);
        elements.disclaimerModal.classList.add('hidden');
    });
    
    document.getElementById('endNowBtn').addEventListener('click', async () => {
        const lastContraction = appState.currentLabor.contractions[appState.currentLabor.contractions.length - 1];
        if (lastContraction) {
            lastContraction.end = Date.now();
            await db.saveCurrentLabor(appState.currentLabor);
        }
        elements.unfinishedModal.classList.add('hidden');
        render();
    });
    
    document.getElementById('discardBtn').addEventListener('click', async () => {
        appState.currentLabor.contractions.pop();
        await db.saveCurrentLabor(appState.currentLabor);
        elements.unfinishedModal.classList.add('hidden');
        appState.isContracting = false;
        render();
    });
    
    let debounceTimer = null;
    elements.mainBtn.addEventListener('click', () => {
        if (debounceTimer) return;
        debounceTimer = setTimeout(() => { debounceTimer = null; }, 300);
        handleMainButtonClick();
    });
    
    document.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            appState.selectedPainLevel = value;
            updateStarDisplay(value);
            elements.painValue.textContent = `${value}/5 ${'★'.repeat(value)}`;
        });
    });
    
    document.querySelectorAll('.event-btn').forEach(btn => {
        btn.addEventListener('click', () => addEvent(btn.dataset.event));
    });
    
    document.getElementById('historyBtn').addEventListener('click', showHistoryView);
    document.getElementById('settingsBtn').addEventListener('click', showSettingsView);
    document.getElementById('backFromHistory').addEventListener('click', showMainView);
    document.getElementById('backFromDetail').addEventListener('click', showHistoryView);
    document.getElementById('backFromEdit').addEventListener('click', showMainView);
    document.getElementById('backFromSettings').addEventListener('click', showMainView);
    
    document.getElementById('newLaborBtn').addEventListener('click', startNewLabor);
    document.getElementById('allHistoryBtn').addEventListener('click', showHistoryView);
    
    elements.organizeBtn.addEventListener('click', enterOrganizeMode);
    elements.cancelOrganizeBtn.addEventListener('click', exitOrganizeMode);
    elements.confirmMergeBtn.addEventListener('click', manualMerge);
    
    document.getElementById('mergeBtn').addEventListener('click', autoMerge);
    document.getElementById('ignoreMergeBtn').addEventListener('click', () => {
        elements.mergeToast.classList.add('hidden');
    });
    
    document.getElementById('undoBtn').addEventListener('click', undoLastAction);
    
    document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
    document.getElementById('deleteContractionBtn').addEventListener('click', deleteCurrentContraction);
    
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', importData);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
    
    document.querySelectorAll('.edit-star').forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            updateEditStarDisplay(value);
        });
    });
}

// ==================== 核心功能 ====================

async function handleMainButtonClick() {
    vibrate(50);
    
    if (!appState.isContracting) {
        appState.isContracting = true;
        appState.currentContractionStart = Date.now();
        
        const contraction = {
            id: generateId(),
            start: appState.currentContractionStart,
            end: null,
            painLevel: null
        };
        
        appState.currentLabor.contractions.push(contraction);
        await db.saveCurrentLabor(appState.currentLabor);
        render();
    } else {
        const lastContraction = appState.currentLabor.contractions[appState.currentLabor.contractions.length - 1];
        if (lastContraction) {
            lastContraction.end = Date.now();
            lastContraction.painLevel = appState.selectedPainLevel;
            await db.saveCurrentLabor(appState.currentLabor);
            
            showPainRating();
            checkAutoMerge();
            
            appState.isContracting = false;
            appState.currentContractionStart = null;
            appState.selectedPainLevel = null;
            render();
        }
    }
}

function showPainRating() {
    elements.painRatingSection.classList.remove('hidden');
    updateStarDisplay(0);
    elements.painValue.textContent = '点击星星评分（可选）';
    setTimeout(() => elements.painRatingSection.classList.add('hidden'), 5000);
}

function updateStarDisplay(value) {
    document.querySelectorAll('.star').forEach((star, index) => {
        star.classList.toggle('active', index < value);
        star.textContent = index < value ? '★' : '☆';
    });
}

function updateEditStarDisplay(value) {
    document.querySelectorAll('.edit-star').forEach((star, index) => {
        star.classList.toggle('active', index < value);
        star.textContent = index < value ? '★' : '☆';
    });
    appState.editingPainLevel = value;
}

async function addEvent(type) {
    vibrate(30);
    const eventNames = { water: '破水', blood: '见红', push: '想用力' };
    appState.currentLabor.events.push({ type, name: eventNames[type], timestamp: Date.now() });
    await db.saveCurrentLabor(appState.currentLabor);
    renderEvents();
}

function checkAutoMerge() {
    const contractions = appState.currentLabor.contractions.filter(c => c.end);
    if (contractions.length < 2) return;
    
    const last = contractions[contractions.length - 1];
    const prev = contractions[contractions.length - 2];
    const interval = last.start - prev.end;
    const duration1 = prev.end - prev.start;
    const duration2 = last.end - last.start;
    
    if (interval <= 60000 && (duration1 <= 30000 || duration2 <= 30000)) {
        elements.mergeToast.classList.remove('hidden');
        appState.pendingMerge = { last, prev };
    }
}

async function autoMerge() {
    if (!appState.pendingMerge) return;
    
    const { last, prev } = appState.pendingMerge;
    prev.end = last.end;
    if (last.painLevel) prev.painLevel = last.painLevel;
    
    const index = appState.currentLabor.contractions.indexOf(last);
    if (index > -1) appState.currentLabor.contractions.splice(index, 1);
    
    await db.saveCurrentLabor(appState.currentLabor);
    elements.mergeToast.classList.add('hidden');
    appState.pendingMerge = null;
    render();
}

// ==================== 渲染 ====================

function render() {
    renderStats();
    renderChart();
    renderContractionList();
    renderEvents();
    updateMainButton();
}

function renderStats() {
    const labor = appState.currentLabor;
    elements.laborStartTime.textContent = formatTime(labor.startTime);
    elements.laborDuration.textContent = formatDurationLong(Math.floor((Date.now() - labor.startTime) / 1000));
    
    const completedContractions = labor.contractions.filter(c => c.end);
    elements.contractionCount.textContent = completedContractions.length;
    
    if (completedContractions.length > 0) {
        const recent = completedContractions.slice(-5);
        let totalInterval = 0, intervalCount = 0;
        for (let i = 1; i < recent.length; i++) {
            const interval = (recent[i].start - recent[i-1].end) / 1000;
            if (interval > 0) { totalInterval += interval; intervalCount++; }
        }
        elements.avgInterval.textContent = intervalCount > 0 ? formatDuration(Math.floor(totalInterval / intervalCount)) : '--';
        
        const totalDuration = recent.reduce((sum, c) => sum + (c.end - c.start) / 1000, 0);
        elements.avgDuration.textContent = `${Math.floor(totalDuration / recent.length)}s`;
        
        const painLevels = recent.filter(c => c.painLevel).map(c => c.painLevel);
        elements.avgPain.textContent = painLevels.length > 0 ? '★'.repeat(Math.round(painLevels.reduce((a, b) => a + b, 0) / painLevels.length)) : '-';
    } else {
        elements.avgInterval.textContent = '--:--';
        elements.avgDuration.textContent = '--s';
        elements.avgPain.textContent = '-';
    }
    
    if (appState.isContracting) {
        const duration = Math.floor((Date.now() - appState.currentContractionStart) / 1000);
        elements.statusText.textContent = `疼痛中，本次已持续 ${formatDuration(duration)}`;
    } else if (completedContractions.length > 0) {
        const lastInterval = Math.floor((Date.now() - completedContractions[completedContractions.length - 1].end) / 1000);
        elements.statusText.textContent = `休息中，上次间隔 ${formatDuration(lastInterval)}`;
    } else {
        elements.statusText.textContent = '等待开始...';
    }
}

function renderChart() {
    const canvas = elements.chart;
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    const timeRange = 30 * 60 * 1000;
    
    const recentContractions = appState.currentLabor.contractions.filter(c => 
        c.start >= thirtyMinutesAgo || (c.end && c.end >= thirtyMinutesAgo)
    );
    
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo((i / 3) * width, 0);
        ctx.lineTo((i / 3) * width, height);
        ctx.stroke();
    }
    
    ctx.fillStyle = '#E57373';
    recentContractions.forEach(contraction => {
        const startX = ((contraction.start - thirtyMinutesAgo) / timeRange) * width;
        const endTime = contraction.end || now;
        const duration = endTime - contraction.start;
        const widthPx = Math.min((duration / timeRange) * width, 60);
        
        if (startX + widthPx > 0) {
            const x = Math.max(0, startX);
            const w = Math.min(widthPx, width - x);
            ctx.fillRect(x, height * 0.2, w, height * 0.6);
        }
    });
}

function renderContractionList() {
    const contractions = appState.currentLabor.contractions.filter(c => c.end);
    
    if (contractions.length === 0) {
        elements.contractionList.innerHTML = '<div class="empty-state">暂无宫缩记录</div>';
        return;
    }
    
    let html = '';
    [...contractions].reverse().forEach((contraction, index) => {
        const num = contractions.length - index;
        const originalIndex = contractions.length - 1 - index;
        
        let interval = '--';
        if (originalIndex > 0) {
            interval = formatDuration(Math.floor((contraction.start - contractions[originalIndex - 1].end) / 1000));
        }
        
        const selectedClass = appState.selectedContractions.includes(contraction.id) ? 'selected' : '';
        html += `
            <div class="contraction-item ${selectedClass}" data-id="${contraction.id}">
                <span class="contraction-num">${num}</span>
                <span class="contraction-time">${formatTimeWithSeconds(contraction.start)}</span>
                <span class="contraction-duration">${Math.floor((contraction.end - contraction.start) / 1000)}s</span>
                <span class="contraction-interval">${interval}</span>
                <span class="contraction-pain">${contraction.painLevel ? '★'.repeat(contraction.painLevel) : '-'}</span>
            </div>
        `;
    });
    
    elements.contractionList.innerHTML = html;
    
    document.querySelectorAll('.contraction-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            if (appState.organizeMode) toggleContractionSelection(id);
            else openEditView(id);
        });
    });
}

function renderEvents() {
    const events = appState.currentLabor.events;
    if (events.length === 0) {
        elements.eventsTimeline.classList.add('hidden');
        return;
    }
    
    elements.eventsTimeline.classList.remove('hidden');
    const eventIcons = { water: '💧', blood: '🩸', push: '💪' };
    
    elements.eventsList.innerHTML = events.map(event => `
        <div class="event-tag">
            <span>${eventIcons[event.type]}</span>
            <span>${event.name} ${formatTime(event.timestamp)}</span>
        </div>
    `).join('');
}

function updateMainButton() {
    const btn = elements.mainBtn;
    if (appState.isContracting) {
        btn.dataset.state = 'contracting';
        btn.querySelector('.btn-icon').textContent = '😌';
        btn.querySelector('.btn-text').textContent = '不疼';
        btn.querySelector('.btn-hint').textContent = '疼痛结束时按下';
        elements.timerDisplay.classList.remove('hidden');
    } else {
        btn.dataset.state = 'idle';
        btn.querySelector('.btn-icon').textContent = '😣';
        btn.querySelector('.btn-text').textContent = '疼';
        btn.querySelector('.btn-hint').textContent = '感到疼痛时按下';
        elements.timerDisplay.classList.add('hidden');
    }
}

function updateTimer() {
    if (appState.isContracting) {
        const duration = Math.floor((Date.now() - appState.currentContractionStart) / 1000);
        elements.timerDisplay.textContent = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
    }
    renderStats();
    renderChart();
}

// ==================== 视图切换 ====================

function showView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewName).classList.add('active');
}

function showMainView() {
    showView('mainView');
    render();
}

async function showHistoryView() {
    appState.historyLabors = await db.getHistoryLabors();
    
    if (appState.historyLabors.length === 0) {
        elements.historyList.innerHTML = '<div class="empty-state">暂无历史产程</div>';
    } else {
        elements.historyList.innerHTML = appState.historyLabors.map(labor => {
            const completedContractions = labor.contractions.filter(c => c.end);
            const duration = labor.endTime ? Math.floor((labor.endTime - labor.startTime) / 60000) : 0;
            return `
                <div class="history-card" data-id="${labor.id}">
                    <div class="history-card-header">
                        <span class="history-card-title">产程 ${new Date(labor.startTime).toLocaleDateString()}</span>
                        <span class="history-card-date">${formatTime(labor.startTime)}</span>
                    </div>
                    <div class="history-card-stats">
                        <span>宫缩 ${completedContractions.length} 次</span>
                        <span>持续 ${duration} 分钟</span>
                    </div>
                    <button class="history-delete" data-id="${labor.id}">删除</button>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.history-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('history-delete')) showHistoryDetail(card.dataset.id);
            });
        });
        
        document.querySelectorAll('.history-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这条历史记录吗？')) {
                    await db.deleteHistoryLabor(parseInt(btn.dataset.id));
                    showHistoryView();
                }
            });
        });
    }
    
    showView('historyView');
}

async function showHistoryDetail(id) {
    const labor = await db.getHistoryLabor(parseInt(id));
    if (!labor) return;
    
    const completedContractions = labor.contractions.filter(c => c.end);
    const duration = labor.endTime ? Math.floor((labor.endTime - labor.startTime) / 60000) : 0;
    
    elements.historyDetailContent.innerHTML = `
        <div class="stats-bar">
            <div class="stat-row">
                <span class="stat-label">开始</span>
                <span class="stat-value">${formatTime(labor.startTime)}</span>
                <span class="stat-separator">·</span>
                <span class="stat-label">持续</span>
                <span class="stat-value">${duration}分钟</span>
                <span class="stat-separator">·</span>
                <span class="stat-label">宫缩</span>
                <span class="stat-value">${completedContractions.length}</span><span class="stat-unit">次</span>
            </div>
        </div>
        <div class="history-detail-chart">
            <span class="chart-title">宫缩记录</span>
            <div class="contraction-list" style="margin-top: 12px;">
                ${completedContractions.length === 0 ? '<div class="empty-state">无宫缩记录</div>' : 
                    completedContractions.map((c, i) => {
                        let interval = '--';
                        if (i > 0) interval = formatDuration(Math.floor((c.start - completedContractions[i-1].end) / 1000));
                        return `
                            <div class="contraction-item">
                                <span class="contraction-num">${i + 1}</span>
                                <span class="contraction-time">${formatTimeWithSeconds(c.start)}</span>
                                <span class="contraction-duration">${Math.floor((c.end - c.start) / 1000)}s</span>
                                <span class="contraction-interval">${interval}</span>
                                <span class="contraction-pain">${c.painLevel ? '★'.repeat(c.painLevel) : '-'}</span>
                            </div>
                        `;
                    }).join('')
                }
            </div>
        </div>
        ${labor.events && labor.events.length > 0 ? `
            <div class="events-timeline" style="display: block;">
                <div class="timeline-title">事件记录</div>
                <div class="events-list">
                    ${labor.events.map(e => `
                        <div class="event-tag">
                            <span>${{water: '💧', blood: '🩸', push: '💪'}[e.type]}</span>
                            <span>${e.name} ${formatTime(e.timestamp)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
    
    showView('historyDetailView');
}

function showSettingsView() {
    showView('settingsView');
}

// ==================== 产程管理 ====================

async function startNewLabor() {
    if (appState.currentLabor.contractions.length > 0) {
        if (!confirm('确定要结束当前产程并新建吗？当前数据将被保存到历史。')) return;
        await db.addHistoryLabor(appState.currentLabor);
    }
    
    appState.currentLabor = {
        startTime: Date.now(),
        contractions: [],
        events: []
    };
    appState.isContracting = false;
    appState.currentContractionStart = null;
    
    await db.saveCurrentLabor(appState.currentLabor);
    render();
}

// ==================== 整理模式 ====================

function enterOrganizeMode() {
    appState.organizeMode = true;
    appState.selectedContractions = [];
    elements.organizeBar.classList.remove('hidden');
    elements.organizeCount.textContent = '已选择 0 条';
    elements.confirmMergeBtn.disabled = true;
    renderContractionList();
}

function exitOrganizeMode() {
    appState.organizeMode = false;
    appState.selectedContractions = [];
    elements.organizeBar.classList.add('hidden');
    renderContractionList();
}

function toggleContractionSelection(id) {
    const index = appState.selectedContractions.indexOf(id);
    if (index > -1) appState.selectedContractions.splice(index, 1);
    else appState.selectedContractions.push(id);
    
    elements.organizeCount.textContent = `已选择 ${appState.selectedContractions.length} 条`;
    elements.confirmMergeBtn.disabled = appState.selectedContractions.length < 2;
    renderContractionList();
}

async function manualMerge() {
    if (appState.selectedContractions.length < 2) return;
    
    const selectedIds = appState.selectedContractions;
    const contractions = appState.currentLabor.contractions;
    
    const selectedContractions = selectedIds.map(id => contractions.find(c => c.id === id)).filter(Boolean);
    selectedContractions.sort((a, b) => a.start - b.start);
    
    if (selectedContractions.length < 2) return;
    
    const merged = {
        id: generateId(),
        start: selectedContractions[0].start,
        end: selectedContractions[selectedContractions.length - 1].end,
        painLevel: selectedContractions.find(c => c.painLevel)?.painLevel || null
    };
    
    appState.currentLabor.contractions = contractions.filter(c => !selectedIds.includes(c.id));
    appState.currentLabor.contractions.push(merged);
    appState.currentLabor.contractions.sort((a, b) => a.start - b.start);
    
    await db.saveCurrentLabor(appState.currentLabor);
    exitOrganizeMode();
    render();
}

// ==================== 编辑功能 ====================

function openEditView(id) {
    const contraction = appState.currentLabor.contractions.find(c => c.id === id);
    if (!contraction || !contraction.end) return;
    
    appState.editingContractionId = id;
    elements.editStartTime.value = formatDateTimeLocal(contraction.start);
    elements.editEndTime.value = formatDateTimeLocal(contraction.end);
    updateEditStarDisplay(contraction.painLevel || 0);
    
    showView('editView');
}

async function saveEdit() {
    const contraction = appState.currentLabor.contractions.find(c => c.id === appState.editingContractionId);
    if (!contraction) return;
    
    contraction.start = new Date(elements.editStartTime.value).getTime();
    contraction.end = new Date(elements.editEndTime.value).getTime();
    contraction.painLevel = appState.editingPainLevel || null;
    
    await db.saveCurrentLabor(appState.currentLabor);
    showMainView();
}

async function deleteCurrentContraction() {
    if (!confirm('确定要删除这条宫缩记录吗？')) return;
    
    const index = appState.currentLabor.contractions.findIndex(c => c.id === appState.editingContractionId);
    if (index === -1) return;
    
    appState.currentLabor.contractions.splice(index, 1);
    await db.saveCurrentLabor(appState.currentLabor);
    showMainView();
}

// ==================== 撤销功能 ====================

function showUndo(message, undoFn) {
    appState.lastUndoAction = undoFn;
    document.getElementById('undoMessage').textContent = message;
    elements.undoToast.classList.remove('hidden');
    setTimeout(() => {
        elements.undoToast.classList.add('hidden');
        appState.lastUndoAction = null;
    }, 5000);
}

async function undoLastAction() {
    if (appState.lastUndoAction) {
        await appState.lastUndoAction();
        appState.lastUndoAction = null;
    }
    elements.undoToast.classList.add('hidden');
}

// ==================== 数据导入导出 ====================

async function exportData() {
    const data = await db.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `labor-assistant-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!confirm('导入数据将覆盖现有数据，确定继续吗？')) return;
        
        await db.importAllData(data);
        await loadData();
        render();
        alert('数据导入成功！');
    } catch (err) {
        alert('导入失败：' + err.message);
    }
    
    e.target.value = '';
}

async function clearAllData() {
    if (!confirm('确定要清除所有数据吗？此操作不可恢复！')) return;
    if (!confirm('再次确认：所有产程记录将被永久删除！')) return;
    
    await db.clearAllData();
    appState.currentLabor = {
        startTime: Date.now(),
        contractions: [],
        events: []
    };
    appState.historyLabors = [];
    render();
    alert('所有数据已清除');
}

// ==================== 启动应用 ====================

document.addEventListener('DOMContentLoaded', init);
