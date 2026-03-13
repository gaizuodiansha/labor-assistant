/**
 * 产程助手 - IndexedDB 数据层
 */

const DB_NAME = 'LaborAssistantDB';
const DB_VERSION = 1;

class LaborDB {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 当前产程存储
                if (!db.objectStoreNames.contains('currentLabor')) {
                    db.createObjectStore('currentLabor', { keyPath: 'id' });
                }

                // 历史产程存储
                if (!db.objectStoreNames.contains('historyLabors')) {
                    const historyStore = db.createObjectStore('historyLabors', { keyPath: 'id', autoIncrement: true });
                    historyStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // 设置存储
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // 获取当前产程
    async getCurrentLabor() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['currentLabor'], 'readonly');
            const store = transaction.objectStore('currentLabor');
            const request = store.get('current');

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    // 保存当前产程
    async saveCurrentLabor(labor) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['currentLabor'], 'readwrite');
            const store = transaction.objectStore('currentLabor');
            const request = store.put({ ...labor, id: 'current' });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 清除当前产程
    async clearCurrentLabor() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['currentLabor'], 'readwrite');
            const store = transaction.objectStore('currentLabor');
            const request = store.delete('current');

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 添加历史产程
    async addHistoryLabor(labor) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['historyLabors'], 'readwrite');
            const store = transaction.objectStore('historyLabors');
            const data = { ...labor, endTime: Date.now() };
            delete data.id;
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 获取所有历史产程
    async getHistoryLabors() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['historyLabors'], 'readonly');
            const store = transaction.objectStore('historyLabors');
            const request = store.getAll();

            request.onsuccess = () => {
                const labors = request.result || [];
                labors.sort((a, b) => b.startTime - a.startTime);
                resolve(labors);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // 获取单个历史产程
    async getHistoryLabor(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['historyLabors'], 'readonly');
            const store = transaction.objectStore('historyLabors');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 删除历史产程
    async deleteHistoryLabor(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['historyLabors'], 'readwrite');
            const store = transaction.objectStore('historyLabors');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 获取设置
    async getSetting(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }

    // 保存设置
    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 导出所有数据
    async exportAllData() {
        const [current, history, disclaimerAccepted] = await Promise.all([
            this.getCurrentLabor(),
            this.getHistoryLabors(),
            this.getSetting('disclaimerAccepted')
        ]);

        return {
            version: '1.0',
            exportTime: Date.now(),
            disclaimerAccepted,
            currentLabor: current,
            historyLabors: history
        };
    }

    // 导入数据
    async importAllData(data) {
        // 清除现有数据
        await this.clearCurrentLabor();

        const historyTransaction = this.db.transaction(['historyLabors'], 'readwrite');
        const historyStore = historyTransaction.objectStore('historyLabors');
        historyStore.clear();

        // 导入当前产程
        if (data.currentLabor) {
            await this.saveCurrentLabor(data.currentLabor);
        }

        // 导入历史产程
        if (data.historyLabors && Array.isArray(data.historyLabors)) {
            for (const labor of data.historyLabors) {
                delete labor.id;
                await new Promise((resolve, reject) => {
                    const request = historyStore.add(labor);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
        }

        // 导入设置
        if (data.disclaimerAccepted) {
            await this.saveSetting('disclaimerAccepted', data.disclaimerAccepted);
        }
    }

    // 清除所有数据
    async clearAllData() {
        await this.clearCurrentLabor();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['historyLabors'], 'readwrite');
            const store = transaction.objectStore('historyLabors');
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// 创建全局实例
const db = new LaborDB();
