// Storage Manager - Handles data persistence and favorites
export class StorageManager {
    constructor() {
        this.prefix = 'kickMonitor_';
        this.favorites = new Set();
        this.isInitialized = false;
    }

    async init() {
        try {
            // Load favorites
            this.loadFavorites();
            
            // Initialize IndexedDB for large data storage
            await this.initIndexedDB();
            
            this.isInitialized = true;
            console.log('StorageManager initialized');
        } catch (error) {
            console.error('Failed to initialize StorageManager:', error);
        }
    }

    async initIndexedDB() {
        if (!('indexedDB' in window)) {
            console.warn('IndexedDB not supported, using localStorage only');
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('KickStreamersMonitor', 1);
            
            request.onerror = () => {
                console.warn('IndexedDB failed to open, using localStorage only');
                resolve();
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('streamHistory')) {
                    const historyStore = db.createObjectStore('streamHistory', { keyPath: 'streamerName' });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('analytics')) {
                    db.createObjectStore('analytics', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // Basic storage methods
    set(key, value) {
        try {
            const fullKey = this.prefix + key;
            const serialized = JSON.stringify(value);
            localStorage.setItem(fullKey, serialized);
            return true;
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
            return false;
        }
    }

    get(key, defaultValue = null) {
        try {
            const fullKey = this.prefix + key;
            const item = localStorage.getItem(fullKey);
            
            if (item === null) {
                return defaultValue;
            }
            
            return JSON.parse(item);
        } catch (error) {
            console.error('Failed to read from localStorage:', error);
            return defaultValue;
        }
    }

    remove(key) {
        try {
            const fullKey = this.prefix + key;
            localStorage.removeItem(fullKey);
            return true;
        } catch (error) {
            console.error('Failed to remove from localStorage:', error);
            return false;
        }
    }

    clear() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (error) {
            console.error('Failed to clear localStorage:', error);
            return false;
        }
    }

    // Favorites management
    loadFavorites() {
        const saved = this.get('favorites', []);
        this.favorites = new Set(saved);
    }

    saveFavorites() {
        const favoritesArray = Array.from(this.favorites);
        this.set('favorites', favoritesArray);
    }

    addFavorite(streamerName) {
        const normalizedName = streamerName.toLowerCase().trim();
        this.favorites.add(normalizedName);
        this.saveFavorites();
        return true;
    }

    removeFavorite(streamerName) {
        const normalizedName = streamerName.toLowerCase().trim();
        const removed = this.favorites.delete(normalizedName);
        if (removed) {
            this.saveFavorites();
        }
        return removed;
    }

    toggleFavorite(streamerName) {
        const normalizedName = streamerName.toLowerCase().trim();
        
        if (this.favorites.has(normalizedName)) {
            this.removeFavorite(normalizedName);
            return false;
        } else {
            this.addFavorite(normalizedName);
            return true;
        }
    }

    isFavorite(streamerName) {
        const normalizedName = streamerName.toLowerCase().trim();
        return this.favorites.has(normalizedName);
    }

    getFavorites() {
        return Array.from(this.favorites);
    }

    getFavoritesCount() {
        return this.favorites.size;
    }

    // IndexedDB methods for large data
    async setLargeData(storeName, data) {
        if (!this.db) {
            // Fallback to localStorage
            return this.set(`large_${storeName}`, data);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => {
                console.error('Failed to save large data to IndexedDB');
                // Fallback to localStorage
                resolve(this.set(`large_${storeName}`, data));
            };
        });
    }

    async getLargeData(storeName, key) {
        if (!this.db) {
            // Fallback to localStorage
            return this.get(`large_${storeName}`, null);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            
            request.onerror = () => {
                console.error('Failed to read large data from IndexedDB');
                // Fallback to localStorage
                resolve(this.get(`large_${storeName}`, null));
            };
        });
    }

    async removeLargeData(storeName, key) {
        if (!this.db) {
            return this.remove(`large_${storeName}`);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => {
                console.error('Failed to remove large data from IndexedDB');
                resolve(this.remove(`large_${storeName}`));
            };
        });
    }

    // Settings management
    setSetting(key, value) {
        const settings = this.get('settings', {});
        settings[key] = value;
        return this.set('settings', settings);
    }

    getSetting(key, defaultValue = null) {
        const settings = this.get('settings', {});
        return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
    }

    getSettings() {
        return this.get('settings', {});
    }

    updateSettings(newSettings) {
        const currentSettings = this.getSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        return this.set('settings', updatedSettings);
    }

    resetSettings() {
        return this.remove('settings');
    }

    // Data export/import
    exportData() {
        const data = {
            version: '4.0',
            timestamp: Date.now(),
            favorites: this.getFavorites(),
            settings: this.getSettings(),
            streamHistory: this.get('streamHistory', {}),
            notificationHistory: this.get('notificationHistory', []),
            filters: this.get('filters', {}),
            theme: this.get('theme', 'dark'),
            viewMode: this.get('viewMode', 'grid'),
            refreshInterval: this.get('refreshInterval', 60)
        };

        return data;
    }

    async importData(data) {
        try {
            if (!data || !data.version) {
                throw new Error('Invalid data format');
            }

            // Import favorites
            if (data.favorites && Array.isArray(data.favorites)) {
                this.favorites = new Set(data.favorites);
                this.saveFavorites();
            }

            // Import settings
            if (data.settings) {
                this.set('settings', data.settings);
            }

            // Import other data
            const dataKeys = [
                'streamHistory',
                'notificationHistory', 
                'filters',
                'theme',
                'viewMode',
                'refreshInterval'
            ];

            dataKeys.forEach(key => {
                if (data[key] !== undefined) {
                    this.set(key, data[key]);
                }
            });

            return true;
        } catch (error) {
            console.error('Failed to import data:', error);
            throw error;
        }
    }

    // Cache management
    setCache(key, value, ttl = 3600000) { // Default 1 hour TTL
        const cacheData = {
            value,
            timestamp: Date.now(),
            ttl
        };
        
        return this.set(`cache_${key}`, cacheData);
    }

    getCache(key) {
        const cacheData = this.get(`cache_${key}`, null);
        
        if (!cacheData) {
            return null;
        }

        // Check if cache has expired
        if (Date.now() - cacheData.timestamp > cacheData.ttl) {
            this.remove(`cache_${key}`);
            return null;
        }

        return cacheData.value;
    }

    clearCache() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.prefix + 'cache_')) {
                localStorage.removeItem(key);
            }
        });
    }

    // Storage statistics
    getStorageStats() {
        let totalSize = 0;
        let itemCount = 0;
        const breakdown = {};

        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.prefix)) {
                const value = localStorage.getItem(key);
                const size = new Blob([value]).size;
                totalSize += size;
                itemCount++;

                const category = key.replace(this.prefix, '').split('_')[0];
                if (!breakdown[category]) {
                    breakdown[category] = { count: 0, size: 0 };
                }
                breakdown[category].count++;
                breakdown[category].size += size;
            }
        });

        return {
            totalSize,
            itemCount,
            breakdown,
            quota: this.getStorageQuota(),
            usage: this.getStorageUsage()
        };
    }

    getStorageQuota() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            return navigator.storage.estimate().then(estimate => ({
                quota: estimate.quota,
                usage: estimate.usage,
                available: estimate.quota - estimate.usage
            }));
        }
        return null;
    }

    getStorageUsage() {
        let usage = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                usage += localStorage[key].length + key.length;
            }
        }
        return usage;
    }

    // Cleanup methods
    cleanupExpiredCache() {
        const keys = Object.keys(localStorage);
        let cleaned = 0;

        keys.forEach(key => {
            if (key.startsWith(this.prefix + 'cache_')) {
                const cacheData = this.get(key.replace(this.prefix, ''), null);
                if (cacheData && Date.now() - cacheData.timestamp > cacheData.ttl) {
                    localStorage.removeItem(key);
                    cleaned++;
                }
            }
        });

        return cleaned;
    }

    cleanupOldData(days = 30) {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        let cleaned = 0;

        // Clean notification history
        const notificationHistory = this.get('notificationHistory', []);
        const filteredHistory = notificationHistory.filter(n => n.timestamp >= cutoffTime);
        if (filteredHistory.length !== notificationHistory.length) {
            this.set('notificationHistory', filteredHistory);
            cleaned += notificationHistory.length - filteredHistory.length;
        }

        return cleaned;
    }

    // Backup and restore
    createBackup() {
        const backup = {
            version: '4.0',
            timestamp: Date.now(),
            data: this.exportData()
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { 
            type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kick-streamers-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        return backup;
    }

    async restoreBackup(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const backup = JSON.parse(e.target.result);
                    
                    if (!backup.data) {
                        throw new Error('Invalid backup format');
                    }

                    await this.importData(backup.data);
                    resolve(backup);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read backup file'));
            reader.readAsText(file);
        });
    }

    // Migration methods
    migrateFromOldVersion() {
        // Check for old version data and migrate
        const oldFavorites = localStorage.getItem('favorites');
        if (oldFavorites && !this.get('favorites')) {
            try {
                const parsed = JSON.parse(oldFavorites);
                this.set('favorites', parsed);
                localStorage.removeItem('favorites');
            } catch (error) {
                console.error('Failed to migrate old favorites:', error);
            }
        }

        // Migrate other old keys
        const oldKeys = [
            'theme',
            'refreshInterval',
            'streamerFilter',
            'viewMode'
        ];

        oldKeys.forEach(key => {
            const oldValue = localStorage.getItem(key);
            if (oldValue && !this.get(key)) {
                try {
                    this.set(key, JSON.parse(oldValue));
                    localStorage.removeItem(key);
                } catch (error) {
                    // If it's not JSON, store as string
                    this.set(key, oldValue);
                    localStorage.removeItem(key);
                }
            }
        });
    }

    // Utility methods
    isStorageAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }

    getAvailableSpace() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            return navigator.storage.estimate();
        }
        return null;
    }

    // Cleanup on destroy
    destroy() {
        if (this.db) {
            this.db.close();
        }
    }
}

