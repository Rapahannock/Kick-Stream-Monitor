// Enhanced Notification Manager
export class NotificationManager {
    constructor() {
        this.eventListeners = new Map();
        this.notificationQueue = [];
        this.isProcessing = false;
        this.settings = {
            enabled: true,
            sound: true,
            desktop: true,
            favorites: true,
            viewerThreshold: 0,
            categories: [],
            quietHours: {
                enabled: false,
                start: 22,
                end: 8
            },
            customSounds: {
                live: null,
                offline: null,
                milestone: null
            }
        };
        this.soundCache = new Map();
        this.lastNotifications = new Map();
        this.notificationCooldown = 5 * 60 * 1000; // 5 minutes
    }

    // Event system
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Notification event listener error:', error);
                }
            });
        }
    }

    async init() {
        try {
            // Load settings
            this.loadSettings();
            
            // Request notification permission
            await this.requestPermission();
            
            // Initialize audio context for custom sounds
            this.initializeAudio();
            
            // Setup service worker for background notifications
            this.setupServiceWorker();
            
            console.log('NotificationManager initialized');
        } catch (error) {
            console.error('Failed to initialize NotificationManager:', error);
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('notificationSettings');
        if (saved) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            } catch (error) {
                console.error('Failed to load notification settings:', error);
            }
        }
    }

    saveSettings() {
        localStorage.setItem('notificationSettings', JSON.stringify(this.settings));
    }

    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission === 'denied') {
            console.warn('Notifications are blocked');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (error) {
            console.error('Failed to request notification permission:', error);
            return false;
        }
    }

    initializeAudio() {
        // Preload default notification sounds
        this.loadSound('live', '/sounds/live-notification.mp3');
        this.loadSound('offline', '/sounds/offline-notification.mp3');
        this.loadSound('milestone', '/sounds/milestone-notification.mp3');
    }

    loadSound(type, url) {
        if (!url) return;
        
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.volume = 0.5;
        
        audio.addEventListener('canplaythrough', () => {
            this.soundCache.set(type, audio);
        });
        
        audio.addEventListener('error', (e) => {
            console.warn(`Failed to load ${type} sound:`, e);
        });
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            // Service worker setup for background notifications
            navigator.serviceWorker.ready.then(registration => {
                console.log('Service worker ready for notifications');
            });
        }
    }

    // Main notification methods
    async sendLiveNotification(streamer) {
        if (!this.shouldNotify('live', streamer)) {
            return;
        }

        const notification = {
            type: 'live',
            streamer,
            title: `${streamer.displayName} is now live!`,
            body: streamer.title || 'Started streaming',
            icon: streamer.avatar || '/icons/live-icon.png',
            tag: `live-${streamer.name}`,
            data: {
                streamerName: streamer.name,
                url: streamer.url,
                timestamp: Date.now()
            },
            actions: [
                {
                    action: 'watch',
                    title: 'Watch Stream',
                    icon: '/icons/watch-icon.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss',
                    icon: '/icons/dismiss-icon.png'
                }
            ]
        };

        await this.sendNotification(notification);
        this.recordNotification(streamer.name, 'live');
    }

    async sendOfflineNotification(streamer) {
        if (!this.shouldNotify('offline', streamer)) {
            return;
        }

        const notification = {
            type: 'offline',
            streamer,
            title: `${streamer.displayName} went offline`,
            body: 'Stream has ended',
            icon: streamer.avatar || '/icons/offline-icon.png',
            tag: `offline-${streamer.name}`,
            data: {
                streamerName: streamer.name,
                timestamp: Date.now()
            }
        };

        await this.sendNotification(notification);
        this.recordNotification(streamer.name, 'offline');
    }

    async sendMilestoneNotification(streamer, milestone) {
        if (!this.shouldNotify('milestone', streamer)) {
            return;
        }

        const notification = {
            type: 'milestone',
            streamer,
            title: `${streamer.displayName} reached ${milestone.type}!`,
            body: milestone.message,
            icon: streamer.avatar || '/icons/milestone-icon.png',
            tag: `milestone-${streamer.name}-${milestone.type}`,
            data: {
                streamerName: streamer.name,
                milestone,
                timestamp: Date.now()
            }
        };

        await this.sendNotification(notification);
        this.recordNotification(streamer.name, 'milestone');
    }

    async sendCustomNotification(options) {
        const notification = {
            type: 'custom',
            title: options.title,
            body: options.body,
            icon: options.icon || '/icons/default-icon.png',
            tag: options.tag || `custom-${Date.now()}`,
            data: options.data || {},
            actions: options.actions || []
        };

        await this.sendNotification(notification);
    }

    async sendNotification(notification) {
        if (!this.settings.enabled) {
            return;
        }

        // Check quiet hours
        if (this.isQuietHours()) {
            console.log('Notification suppressed due to quiet hours');
            return;
        }

        // Add to queue
        this.notificationQueue.push(notification);
        
        // Process queue
        if (!this.isProcessing) {
            this.processNotificationQueue();
        }
    }

    async processNotificationQueue() {
        this.isProcessing = true;

        while (this.notificationQueue.length > 0) {
            const notification = this.notificationQueue.shift();
            
            try {
                // Send desktop notification
                if (this.settings.desktop && Notification.permission === 'granted') {
                    await this.sendDesktopNotification(notification);
                }

                // Play sound
                if (this.settings.sound) {
                    this.playNotificationSound(notification.type);
                }

                // Send to UI
                this.sendUINotification(notification);

                // Emit event
                this.emit('notificationSent', notification);

                // Small delay between notifications
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error('Failed to send notification:', error);
            }
        }

        this.isProcessing = false;
    }

    async sendDesktopNotification(notification) {
        const options = {
            body: notification.body,
            icon: notification.icon,
            tag: notification.tag,
            data: notification.data,
            requireInteraction: notification.type === 'live',
            silent: !this.settings.sound
        };

        if (notification.actions && notification.actions.length > 0) {
            options.actions = notification.actions;
        }

        const desktopNotification = new Notification(notification.title, options);

        // Handle notification clicks
        desktopNotification.onclick = (event) => {
            event.preventDefault();
            this.handleNotificationClick(notification);
            desktopNotification.close();
        };

        // Auto-close after 10 seconds for non-live notifications
        if (notification.type !== 'live') {
            setTimeout(() => {
                desktopNotification.close();
            }, 10000);
        }

        return desktopNotification;
    }

    sendUINotification(notification) {
        // Create toast notification in UI
        const toast = {
            id: `notification-${Date.now()}`,
            type: notification.type,
            title: notification.title,
            message: notification.body,
            icon: this.getNotificationIcon(notification.type),
            duration: notification.type === 'live' ? 0 : 5000, // Live notifications stay until dismissed
            actions: notification.actions
        };

        // Emit to UI manager
        this.emit('uiNotification', toast);
    }

    playNotificationSound(type) {
        if (!this.settings.sound) return;

        const sound = this.soundCache.get(type) || this.soundCache.get('live');
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(error => {
                console.warn('Failed to play notification sound:', error);
            });
        }
    }

    handleNotificationClick(notification) {
        if (notification.data && notification.data.url) {
            window.open(notification.data.url, '_blank');
        }
        
        this.emit('notificationClicked', notification);
    }

    // Notification filtering and settings
    shouldNotify(type, streamer) {
        // Check if notifications are enabled
        if (!this.settings.enabled) {
            return false;
        }

        // Check type-specific settings
        switch (type) {
            case 'live':
                if (!this.settings.favorites && !this.isFavorite(streamer.name)) {
                    return false;
                }
                if (streamer.viewers < this.settings.viewerThreshold) {
                    return false;
                }
                if (this.settings.categories.length > 0 && 
                    !this.settings.categories.includes(streamer.category)) {
                    return false;
                }
                break;
            case 'offline':
                if (!this.settings.favorites && !this.isFavorite(streamer.name)) {
                    return false;
                }
                break;
        }

        // Check cooldown
        if (this.isOnCooldown(streamer.name, type)) {
            return false;
        }

        return true;
    }

    isQuietHours() {
        if (!this.settings.quietHours.enabled) {
            return false;
        }

        const now = new Date();
        const currentHour = now.getHours();
        const start = this.settings.quietHours.start;
        const end = this.settings.quietHours.end;

        if (start < end) {
            return currentHour >= start && currentHour < end;
        } else {
            return currentHour >= start || currentHour < end;
        }
    }

    isOnCooldown(streamerName, type) {
        const key = `${streamerName}-${type}`;
        const lastNotification = this.lastNotifications.get(key);
        
        if (!lastNotification) {
            return false;
        }

        return Date.now() - lastNotification < this.notificationCooldown;
    }

    recordNotification(streamerName, type) {
        const key = `${streamerName}-${type}`;
        this.lastNotifications.set(key, Date.now());
    }

    isFavorite(streamerName) {
        // This should be connected to the storage manager
        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        return favorites.includes(streamerName);
    }

    // Settings management
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
        this.emit('settingsUpdated', this.settings);
    }

    getSettings() {
        return { ...this.settings };
    }

    resetSettings() {
        this.settings = {
            enabled: true,
            sound: true,
            desktop: true,
            favorites: true,
            viewerThreshold: 0,
            categories: [],
            quietHours: {
                enabled: false,
                start: 22,
                end: 8
            },
            customSounds: {
                live: null,
                offline: null,
                milestone: null
            }
        };
        this.saveSettings();
        this.emit('settingsUpdated', this.settings);
    }

    // Custom sound management
    async setCustomSound(type, file) {
        if (!file) return;

        try {
            const url = URL.createObjectURL(file);
            this.loadSound(type, url);
            this.settings.customSounds[type] = url;
            this.saveSettings();
        } catch (error) {
            console.error('Failed to set custom sound:', error);
            throw error;
        }
    }

    removeCustomSound(type) {
        if (this.settings.customSounds[type]) {
            URL.revokeObjectURL(this.settings.customSounds[type]);
            this.settings.customSounds[type] = null;
            this.soundCache.delete(type);
            this.saveSettings();
        }
    }

    // Notification history
    getNotificationHistory(days = 7) {
        const history = JSON.parse(localStorage.getItem('notificationHistory') || '[]');
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        
        return history.filter(notification => notification.timestamp >= cutoffTime);
    }

    saveNotificationToHistory(notification) {
        const history = this.getNotificationHistory(30); // Keep 30 days
        
        history.push({
            ...notification,
            timestamp: Date.now()
        });

        // Keep only last 1000 notifications
        if (history.length > 1000) {
            history.splice(0, history.length - 1000);
        }

        localStorage.setItem('notificationHistory', JSON.stringify(history));
    }

    clearNotificationHistory() {
        localStorage.removeItem('notificationHistory');
    }

    // Utility methods
    getNotificationIcon(type) {
        const icons = {
            live: '🔴',
            offline: '⚫',
            milestone: '🎉',
            custom: '📢'
        };
        return icons[type] || '📢';
    }

    testNotification(type = 'live') {
        const testStreamer = {
            name: 'test-streamer',
            displayName: 'Test Streamer',
            title: 'Testing notifications',
            category: 'Just Chatting',
            viewers: 100,
            avatar: '/icons/test-avatar.png',
            url: 'https://kick.com/test-streamer'
        };

        switch (type) {
            case 'live':
                this.sendLiveNotification(testStreamer);
                break;
            case 'offline':
                this.sendOfflineNotification(testStreamer);
                break;
            case 'milestone':
                this.sendMilestoneNotification(testStreamer, {
                    type: '1000 viewers',
                    message: 'Reached 1000 viewers!'
                });
                break;
        }
    }

    // Analytics
    getNotificationStats(days = 7) {
        const history = this.getNotificationHistory(days);
        
        const stats = {
            total: history.length,
            byType: {},
            byStreamer: {},
            byHour: new Array(24).fill(0),
            byDay: new Array(7).fill(0)
        };

        history.forEach(notification => {
            // By type
            stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
            
            // By streamer
            if (notification.data && notification.data.streamerName) {
                const streamer = notification.data.streamerName;
                stats.byStreamer[streamer] = (stats.byStreamer[streamer] || 0) + 1;
            }
            
            // By hour
            const hour = new Date(notification.timestamp).getHours();
            stats.byHour[hour]++;
            
            // By day
            const day = new Date(notification.timestamp).getDay();
            stats.byDay[day]++;
        });

        return stats;
    }

    // Cleanup
    cleanup() {
        // Clear notification queue
        this.notificationQueue = [];
        
        // Revoke custom sound URLs
        Object.values(this.settings.customSounds).forEach(url => {
            if (url) {
                URL.revokeObjectURL(url);
            }
        });
        
        // Clear event listeners
        this.eventListeners.clear();
        
        // Clear caches
        this.soundCache.clear();
        this.lastNotifications.clear();
    }
}

