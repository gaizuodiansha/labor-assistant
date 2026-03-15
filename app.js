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
    // 转换为本地时间格式 YYYY-MM-DDTHH:mm (datetime-local 输入框需要的格式)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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
    lastUndoAction: null,
    // 图表状态
    chartTimeRange: 30, // 分钟
    chartTimeOffset: 0, // 毫秒，从当前时间往前的偏移
    chartIsDragging: false,
    chartLastX: 0
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
        chartContainer: document.getElementById('chartContainer'),
        chartLabels: document.getElementById('chartLabels'),
        chartRangeLabel: document.getElementById('chartRangeLabel'),
        zoomSlider: document.getElementById('zoomSlider'),
        zoomValue: document.getElementById('zoomValue'),
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
    
    // 图表缩放滑块
    elements.zoomSlider.addEventListener('input', handleZoomChange);
    
    // 图表拖拽事件
    initChartDragEvents();
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

// ==================== 图表缩放和拖拽 ====================

function handleZoomChange(e) {
    const oldTimeRange = appState.chartTimeRange;
    const newTimeRange = parseInt(e.target.value);
    appState.chartTimeRange = newTimeRange;
    elements.zoomValue.textContent = formatZoomLabel(appState.chartTimeRange);
    elements.chartRangeLabel.textContent = formatZoomLabel(appState.chartTimeRange);
    
    // 缩放时保持右边界对齐到最新数据（偏移量设为0）
    // 这样可以确保最新宫缩始终显示在右侧
    appState.chartTimeOffset = 0;
    
    renderChart();
}

function formatZoomLabel(minutes) {
    if (minutes >= 60) {
        const hours = minutes / 60;
        return hours === Math.floor(hours) ? `${hours}小时` : `${(minutes / 60).toFixed(1)}小时`;
    }
    return `${minutes}分钟`;
}

function initChartDragEvents() {
    const container = elements.chartContainer;
    const canvas = elements.chart;
    
    // 鼠标事件
    canvas.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);
    
    // 触摸事件
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', endDrag);
    
    // 双击重置
    canvas.addEventListener('dblclick', resetChartView);
}

function startDrag(e) {
    appState.chartIsDragging = true;
    appState.chartLastX = e.clientX;
    elements.chartContainer.style.cursor = 'grabbing';
}

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        appState.chartIsDragging = true;
        appState.chartLastX = e.touches[0].clientX;
    }
}

function doDrag(e) {
    if (!appState.chartIsDragging) return;
    e.preventDefault();
    
    const deltaX = e.clientX - appState.chartLastX;
    appState.chartLastX = e.clientX;
    
    // 根据拖拽距离计算时间偏移
    // 向右滑动(deltaX>0) -> 想看更早的时间 -> timeOffset 增加
    // 向左滑动(deltaX<0) -> 想看更新的时间 -> timeOffset 减少
    const canvasWidth = elements.chart.clientWidth;
    const timeRangeMs = appState.chartTimeRange * 60 * 1000;
    const timeDelta = (deltaX / canvasWidth) * timeRangeMs;
    
    appState.chartTimeOffset += timeDelta;
    
    // 限制偏移范围（不能看到未来，不能早于产程开始）
    constrainChartOffset();
    
    renderChart();
}

function handleTouchMove(e) {
    if (!appState.chartIsDragging || e.touches.length !== 1) return;
    e.preventDefault();
    
    const deltaX = e.touches[0].clientX - appState.chartLastX;
    appState.chartLastX = e.touches[0].clientX;
    
    const canvasWidth = elements.chart.clientWidth;
    const timeRangeMs = appState.chartTimeRange * 60 * 1000;
    const timeDelta = (deltaX / canvasWidth) * timeRangeMs;
    
    appState.chartTimeOffset += timeDelta;
    constrainChartOffset();
    renderChart();
}

function endDrag() {
    appState.chartIsDragging = false;
    if (elements.chartContainer) {
        elements.chartContainer.style.cursor = 'grab';
    }
}

function constrainChartOffset() {
    const now = Date.now();
    const timeRangeMs = appState.chartTimeRange * 60 * 1000;
    
    // 不能看到未来（偏移不能超过0）
    if (appState.chartTimeOffset < 0) {
        appState.chartTimeOffset = 0;
    }
    
    // 计算最早可显示时间（产程开始前1小时）
    const earliestTime = appState.currentLabor.startTime - 60 * 60 * 1000;
    
    // 计算最大偏移量：确保 startTime 不会早于 earliestTime
    // startTime = endTime - timeRangeMs = (now - offset) - timeRangeMs
    // 要求: startTime >= earliestTime
    // 即: (now - offset) - timeRangeMs >= earliestTime
    // 即: offset <= now - timeRangeMs - earliestTime
    const maxOffset = now - earliestTime - timeRangeMs;
    
    if (maxOffset > 0) {
        // 有足够的历史数据可以滚动
        if (appState.chartTimeOffset > maxOffset) {
            appState.chartTimeOffset = maxOffset;
        }
    } else {
        // 时间范围太大，无法滚动（显示所有数据）
        appState.chartTimeOffset = 0;
    }
}

function resetChartView() {
    appState.chartTimeOffset = 0;
    renderChart();
}

function renderChart() {
    const canvas = elements.chart;
    const ctx = canvas.getContext('2d');
    
    // 固定逻辑尺寸 (CSS像素)
    const logicalWidth = 375;
    const logicalHeight = 80;
    
    // 初始化高DPI支持 (只执行一次)
    if (!canvas.dataset.initialized) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = logicalWidth * dpr;
        canvas.height = logicalHeight * dpr;
        canvas.style.width = logicalWidth + 'px';
        canvas.style.height = logicalHeight + 'px';
        ctx.scale(dpr, dpr);
        canvas.dataset.initialized = 'true';
    }
    
    const width = logicalWidth;
    const height = logicalHeight;
    
    ctx.clearRect(0, 0, width, height);
    
    const now = Date.now();
    const timeRangeMs = appState.chartTimeRange * 60 * 1000;
    // "现在"对齐到图表右侧 90% 位置，留出 10% 空间显示正在进行的宫缩
    // 这样无论时间范围多大，最新数据始终显示在右侧附近
    const futureBufferRatio = 0.1; // 10% 的未来缓冲区
    const futureBufferMs = timeRangeMs * futureBufferRatio;
    const endTime = now - appState.chartTimeOffset + futureBufferMs;
    const startTime = endTime - timeRangeMs;
    
    // 绘制网格线
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
        const x = (i / gridCount) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // 绘制宫缩
    ctx.fillStyle = '#E57373';
    appState.currentLabor.contractions.forEach(contraction => {
        // 只绘制在时间范围内的宫缩
        if (contraction.end && contraction.end < startTime) return;
        if (contraction.start > endTime) return;
        
        const contractionStart = Math.max(contraction.start, startTime);
        const contractionEnd = contraction.end ? Math.min(contraction.end, endTime) : endTime;
        
        const startX = ((contractionStart - startTime) / timeRangeMs) * width;
        const duration = contractionEnd - contractionStart;
        const widthPx = Math.max(2, (duration / timeRangeMs) * width);
        
        // 根据疼痛程度调整颜色深浅
        if (contraction.painLevel) {
            const opacity = 0.5 + (contraction.painLevel / 10);
            ctx.fillStyle = `rgba(229, 115, 115, ${opacity})`;
        } else {
            ctx.fillStyle = '#E57373';
        }
        
        ctx.fillRect(startX, height * 0.15, widthPx, height * 0.7);
    });
    
    // 更新标签
    updateChartLabels(startTime, endTime);
}

function updateChartLabels(startTime, endTime) {
    const now = Date.now();
    const timeRangeMs = endTime - startTime;
    const labels = [];
    const count = 4;
    
    for (let i = 0; i < count; i++) {
        const ratio = i / (count - 1);
        const time = startTime + ratio * timeRangeMs;
        
        // 如果这个时间点接近现在（10分钟内），显示"现在"
        if (Math.abs(time - now) < 10 * 60 * 1000) {
            labels.push('现在');
        } else {
            labels.push(formatTime(time));
        }
    }
    
    elements.chartLabels.innerHTML = labels.map(t => `<span>${t}</span>`).join('');
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
    
    // 重置图表视图
    resetChartView();
    
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
