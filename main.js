// Kick Streamers Monitor Pro v4.0 - Main Application
import { FilterManager } from './filterManager.js';
import { StreamerManager } from './streamerManager.js';
import { HistoryManager } from './historyManager.js';
import { NotificationManager } from './notificationManager.js';
import { StorageManager } from './storageManager.js';
import { UIManager } from './uiManager.js';

class KickStreamersApp {
    constructor() {
        this.version = '4.0';
        this.isInitialized = false;
        this.refreshInterval = null;
        this.refreshIntervalTime = 60000; // 1 minute default
        
        // Initialize services
        this.storage = new StorageManager();
        this.ui = new UIManager();
        this.filter = new FilterManager();
        this.streamer = new StreamerManager(this.storage);
        this.history = new HistoryManager(this.storage);
        this.notification = new NotificationManager();
        
        // State
        this.streamers = [];
        this.filteredStreamers = [];
        this.currentView = 'grid';
        this.isLoading = false;
        
        // DOM elements
        this.elements = {};
    }

    async init() {
        try {
            console.log('Initializing Kick Streamers Monitor v' + this.version + '...');
            
            // Initialize services
            await this.storage.init();
            await this.notification.init();
            await this.history.init();
            this.ui.init();
            
            // Setup DOM elements
            this.setupDOMElements();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadInitialData();
            
            // Setup auto-refresh
            this.setupAutoRefresh();
            
            // Apply saved settings
            this.applySavedSettings();
            
            this.isInitialized = true;
            console.log('Application initialized successfully');
            
            this.ui.showToast('Application loaded successfully!', 'success');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.ui.showToast('Failed to initialize application: ' + error.message, 'error');
        }
    }

    setupDOMElements() {
        // Cache DOM elements
        this.elements = {
            // Header elements
            connectionStatus: document.getElementById('connection-status'),
            connectionText: document.getElementById('connection-text'),
            lastUpdatedTime: document.getElementById('last-updated-time'),
            analyticsBtn: document.getElementById('analytics-btn'),
            themeToggle: document.getElementById('theme-toggle'),
            settingsBtn: document.getElementById('settings-btn'),
            
            // Search elements
            searchInput: document.getElementById('search-input'),
            searchClear: document.getElementById('search-clear'),
            addStreamerInput: document.getElementById('add-streamer-input'),
            addStreamerBtn: document.getElementById('add-streamer-btn'),
            
            // Filter elements
            statusFilter: document.getElementById('status-filter'),
            viewersFilter: document.getElementById('viewers-filter'),
            categoryFilter: document.getElementById('category-filter'),
            sortFilter: document.getElementById('sort-filter'),
            sortDirection: document.getElementById('sort-direction'),
            
            // Control elements
            gridView: document.getElementById('grid-view'),
            listView: document.getElementById('list-view'),
            refreshBtn: document.getElementById('refresh-btn'),
            refreshInterval: document.getElementById('refresh-interval'),
            
            // Stats elements
            totalCount: document.getElementById('total-count'),
            liveCount: document.getElementById('live-count'),
            favoritesCount: document.getElementById('favorites-count'),
            totalViewers: document.getElementById('total-viewers'),
            
            // Main content
            streamersContainer: document.getElementById('streamers-container'),
            loadingState: document.getElementById('loading-state')
        };
    }

    setupEventListeners() {
        // Search functionality
        this.elements.searchInput.addEventListener('input', this.debounce((e) => {
            this.filter.setFilter('search', e.target.value);
        }, 300));
        
        this.elements.searchClear.addEventListener('click', () => {
            this.elements.searchInput.value = '';
            this.filter.setFilter('search', '');
        });
        
        // Add streamer functionality
        this.elements.addStreamerBtn.addEventListener('click', () => {
            this.addStreamer();
        });
        
        this.elements.addStreamerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addStreamer();
            }
        });
        
        // Filter event listeners
        this.elements.statusFilter.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                this.setActiveFilterButton(this.elements.statusFilter, e.target);
                this.filter.setFilter('status', e.target.dataset.value);
            }
        });
        
        this.elements.viewersFilter.addEventListener('change', (e) => {
            this.filter.setFilter('viewers', e.target.value);
        });
        
        this.elements.categoryFilter.addEventListener('change', (e) => {
            this.filter.setFilter('category', e.target.value);
        });
        
        this.elements.sortFilter.addEventListener('change', (e) => {
            this.filter.setSortBy(e.target.value);
        });
        
        this.elements.sortDirection.addEventListener('click', () => {
            this.filter.toggleSortDirection();
            this.updateSortDirectionButton();
        });
        
        // View controls
        this.elements.gridView.addEventListener('click', () => {
            this.setView('grid');
        });
        
        this.elements.listView.addEventListener('click', () => {
            this.setView('list');
        });
        
        // Refresh controls
        this.elements.refreshBtn.addEventListener('click', () => {
            this.refreshStreamers();
        });
        
        this.elements.refreshInterval.addEventListener('change', (e) => {
            this.setRefreshInterval(parseInt(e.target.value));
        });
        
        // Header controls
        this.elements.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });
        
        this.elements.settingsBtn.addEventListener('click', () => {
            this.showSettings();
        });
        
        this.elements.analyticsBtn.addEventListener('click', () => {
            this.showAnalytics();
        });
        
        // Filter manager events
        this.filter.on('filtersChanged', () => {
            this.applyFilters();
        });
        
        // Streamer manager events
        this.streamer.on('streamersLoaded', (streamers) => {
            this.handleStreamersLoaded(streamers);
        });
        
        this.streamer.on('streamerUpdated', (streamer) => {
            this.handleStreamerUpdated(streamer);
        });
        
        this.streamer.on('error', (error) => {
            this.handleStreamerError(error);
        });
        
        // Notification manager events
        this.notification.on('uiNotification', (toast) => {
            this.ui.showToast(toast.message, toast.type, {
                title: toast.title,
                duration: toast.duration,
                actions: toast.actions
            });
        });
        
        // History manager events
        this.history.on('historyUpdated', (data) => {
            console.log('History updated for:', data.streamerName);
        });
    }

    async loadInitialData() {
        this.setLoading(true);
        this.updateConnectionStatus('connecting', 'Loading...');
        
        try {
            // Load streamers
            this.streamers = await this.streamer.loadStreamers();
            
            // Update UI
            this.applyFilters();
            this.updateStats();
            this.updateLastUpdated();
            this.updateConnectionStatus('connected', 'Connected');
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.updateConnectionStatus('error', 'Connection failed');
            this.ui.showToast('Failed to load streamers: ' + error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async refreshStreamers() {
        if (this.isLoading) return;
        
        this.setLoading(true);
        this.updateConnectionStatus('connecting', 'Refreshing...');
        
        try {
            this.streamers = await this.streamer.refreshStreamers();
            
            // Update history for all streamers
            this.streamers.forEach(streamer => {
                this.history.recordStreamerUpdate(streamer);
            });
            
            this.applyFilters();
            this.updateStats();
            this.updateLastUpdated();
            this.updateConnectionStatus('connected', 'Connected');
            
        } catch (error) {
            console.error('Failed to refresh streamers:', error);
            this.updateConnectionStatus('error', 'Refresh failed');
            this.ui.showToast('Failed to refresh streamers: ' + error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async addStreamer() {
        const streamerName = this.elements.addStreamerInput.value.trim();
        if (!streamerName) {
            this.ui.showToast('Please enter a streamer name', 'warning');
            return;
        }
        
        try {
            const streamer = await this.streamer.addStreamer(streamerName);
            this.elements.addStreamerInput.value = '';
            this.ui.showToast(`Added ${streamer.displayName} successfully!`, 'success');
            
        } catch (error) {
            console.error('Failed to add streamer:', error);
            this.ui.showToast('Failed to add streamer: ' + error.message, 'error');
        }
    }

    applyFilters() {
        this.filteredStreamers = this.filter.applyFilters(this.streamers);
        this.renderStreamers();
        this.updateStats();
    }

    renderStreamers() {
        const container = this.elements.streamersContainer;
        
        if (this.filteredStreamers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <div class="empty-title">No streamers found</div>
                    <div class="empty-message">Try adjusting your filters or add some streamers</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        container.className = `streamers-container ${this.currentView}-view`;
        
        this.filteredStreamers.forEach(streamer => {
            const card = this.createStreamerCard(streamer);
            container.appendChild(card);
        });
    }

    createStreamerCard(streamer) {
        const card = document.createElement('div');
        card.className = `streamer-card ${streamer.live ? 'live' : 'offline'}`;
        card.dataset.streamerName = streamer.name;
        
        const duration = streamer.live && streamer.streamStartTime ? 
            this.formatDuration(Date.now() - streamer.streamStartTime) : '';
        
        const lastSeen = !streamer.live && streamer.lastSeen ? 
            this.formatTimeAgo(streamer.lastSeen) : '';
        
        card.innerHTML = `
            <div class="streamer-header">
                <div class="streamer-avatar">
                    <img src="${streamer.avatar || this.getPlaceholderAvatar()}" 
                         alt="${streamer.displayName}" 
                         loading="lazy"
                         onerror="this.src='${this.getPlaceholderAvatar()}'">
                    <div class="status-indicator ${streamer.live ? 'live' : 'offline'}"></div>
                </div>
                <div class="streamer-info">
                    <div class="streamer-name">
                        ${streamer.displayName}
                        ${streamer.isVerified ? '<span class="verified" title="Verified">✓</span>' : ''}
                        ${streamer.error ? '<span class="error" title="Error loading data">⚠️</span>' : ''}
                    </div>
                    <div class="streamer-stats">
                        ${streamer.live ? 
                            `${streamer.viewers.toLocaleString()} viewers${duration ? ` • ${duration}` : ''}` : 
                            `Offline${lastSeen ? ` • ${lastSeen}` : ''}`
                        }
                    </div>
                </div>
                <div class="streamer-actions">
                    <button class="btn btn-icon favorite-btn ${this.storage.isFavorite(streamer.name) ? 'active' : ''}" 
                            data-streamer="${streamer.name}" 
                            title="Toggle Favorite"
                            aria-label="Toggle favorite for ${streamer.displayName}">
                        ${this.storage.isFavorite(streamer.name) ? '★' : '☆'}
                    </button>
                    <button class="btn btn-icon menu-btn" 
                            data-streamer="${streamer.name}" 
                            title="More options"
                            aria-label="More options for ${streamer.displayName}">
                        ⋮
                    </button>
                </div>
            </div>
            
            ${streamer.live ? `
                <div class="streamer-thumbnail">
                    <img src="${streamer.thumbnail || this.getPlaceholderThumbnail()}" 
                         alt="Stream thumbnail" 
                         loading="lazy"
                         onerror="this.src='${this.getPlaceholderThumbnail()}'">
                    <div class="live-indicator">LIVE</div>
                    ${streamer.mature ? '<div class="mature-indicator">18+</div>' : ''}
                </div>
            ` : ''}
            
            <div class="streamer-content">
                <div class="stream-title" title="${streamer.title}">${streamer.title}</div>
                ${streamer.category ? `<div class="stream-category">${streamer.category}</div>` : ''}
                ${streamer.tags && streamer.tags.length > 0 ? `
                    <div class="stream-tags">
                        ${streamer.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                        ${streamer.tags.length > 3 ? `<span class="tag-more">+${streamer.tags.length - 3}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        
        // Add event listeners
        this.setupStreamerCardEvents(card, streamer);
        
        return card;
    }

    setupStreamerCardEvents(card, streamer) {
        // Click to open stream
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.streamer-actions')) {
                window.open(streamer.url, '_blank');
            }
        });
        
        // Favorite button
        const favoriteBtn = card.querySelector('.favorite-btn');
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFavorite(streamer.name);
        });
        
        // Menu button
        const menuBtn = card.querySelector('.menu-btn');
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showStreamerMenu(e, streamer);
        });
        
        // Context menu
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showStreamerMenu(e, streamer);
        });
    }

    toggleFavorite(streamerName) {
        const isFavorite = this.storage.toggleFavorite(streamerName);
        
        // Update UI
        const card = document.querySelector(`[data-streamer-name="${streamerName}"]`);
        if (card) {
            const favoriteBtn = card.querySelector('.favorite-btn');
            favoriteBtn.classList.toggle('active', isFavorite);
            favoriteBtn.textContent = isFavorite ? '★' : '☆';
        }
        
        // Update stats
        this.updateStats();
        
        // Show notification
        const streamer = this.streamers.find(s => s.name === streamerName);
        if (streamer) {
            this.ui.showToast(
                `${isFavorite ? 'Added' : 'Removed'} ${streamer.displayName} ${isFavorite ? 'to' : 'from'} favorites`,
                'success'
            );
        }
    }

    showStreamerMenu(event, streamer) {
        const menuItems = [
            {
                label: 'Open Stream',
                icon: '🔗',
                action: 'open',
                callback: () => window.open(streamer.url, '_blank')
            },
            {
                label: this.storage.isFavorite(streamer.name) ? 'Remove from Favorites' : 'Add to Favorites',
                icon: this.storage.isFavorite(streamer.name) ? '★' : '☆',
                action: 'favorite',
                callback: () => this.toggleFavorite(streamer.name)
            },
            {
                label: 'View Analytics',
                icon: '📊',
                action: 'analytics',
                callback: () => this.showStreamerAnalytics(streamer.name)
            },
            { separator: true },
            {
                label: 'Copy URL',
                icon: '📋',
                action: 'copy',
                callback: () => {
                    navigator.clipboard.writeText(streamer.url);
                    this.ui.showToast('URL copied to clipboard', 'success');
                }
            },
            {
                label: 'Remove Streamer',
                icon: '🗑️',
                action: 'remove',
                danger: true,
                callback: () => this.confirmRemoveStreamer(streamer.name)
            }
        ];
        
        this.ui.showContextMenu(event.clientX, event.clientY, menuItems);
    }

    async confirmRemoveStreamer(streamerName) {
        const confirmed = await this.ui.showConfirmDialog(
            `Are you sure you want to remove ${streamerName} from your list?`,
            {
                title: 'Remove Streamer',
                confirmText: 'Remove',
                cancelText: 'Cancel'
            }
        );
        
        if (confirmed) {
            try {
                await this.streamer.removeStreamer(streamerName);
                this.ui.showToast(`Removed ${streamerName} successfully`, 'success');
            } catch (error) {
                this.ui.showToast('Failed to remove streamer: ' + error.message, 'error');
            }
        }
    }

    updateStats() {
        const live = this.filteredStreamers.filter(s => s.live);
        const favorites = this.filteredStreamers.filter(s => this.storage.isFavorite(s.name));
        const totalViewers = live.reduce((sum, s) => sum + (s.viewers || 0), 0);
        
        this.elements.totalCount.textContent = this.filteredStreamers.length;
        this.elements.liveCount.textContent = live.length;
        this.elements.favoritesCount.textContent = favorites.length;
        this.elements.totalViewers.textContent = totalViewers.toLocaleString();
    }

    updateLastUpdated() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        this.elements.lastUpdatedTime.textContent = timeString;
    }

    updateConnectionStatus(status, text) {
        this.elements.connectionStatus.className = `status-indicator ${status}`;
        this.elements.connectionText.textContent = text;
    }

    setLoading(loading) {
        this.isLoading = loading;
        
        if (this.elements.loadingState) {
            this.elements.loadingState.style.display = loading ? 'flex' : 'none';
        }
        
        this.elements.refreshBtn.disabled = loading;
        this.elements.refreshBtn.classList.toggle('loading', loading);
    }

    setView(view) {
        this.currentView = view;
        
        // Update buttons
        this.elements.gridView.classList.toggle('active', view === 'grid');
        this.elements.listView.classList.toggle('active', view === 'list');
        
        // Update container
        this.elements.streamersContainer.className = `streamers-container ${view}-view`;
        
        // Save preference
        this.storage.setSetting('viewMode', view);
    }

    setActiveFilterButton(container, activeButton) {
        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-checked', 'false');
        });
        activeButton.classList.add('active');
        activeButton.setAttribute('aria-checked', 'true');
    }

    updateSortDirectionButton() {
        const direction = this.filter.getSortDirection();
        this.elements.sortDirection.textContent = direction === 'asc' ? '↑' : '↓';
        this.elements.sortDirection.title = `Sort ${direction === 'asc' ? 'descending' : 'ascending'}`;
    }

    setupAutoRefresh() {
        this.setRefreshInterval(this.storage.getSetting('refreshInterval', 60));
    }

    setRefreshInterval(seconds) {
        // Clear existing interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        // Set new interval
        if (seconds > 0) {
            this.refreshIntervalTime = seconds * 1000;
            this.refreshInterval = setInterval(() => {
                this.refreshStreamers();
            }, this.refreshIntervalTime);
        }
        
        // Update UI
        this.elements.refreshInterval.value = seconds;
        
        // Save setting
        this.storage.setSetting('refreshInterval', seconds);
    }

    applySavedSettings() {
        // Apply saved view mode
        const savedView = this.storage.getSetting('viewMode', 'grid');
        this.setView(savedView);
        
        // Apply saved theme
        const savedTheme = this.storage.getSetting('theme', 'dark');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
        }
        
        // Apply saved filters
        const savedFilters = this.storage.getSetting('filters', {});
        if (Object.keys(savedFilters).length > 0) {
            this.filter.setFilters(savedFilters);
            this.updateFilterUI();
        }
    }

    updateFilterUI() {
        const filters = this.filter.getFilters();
        
        // Update status filter
        const statusBtn = this.elements.statusFilter.querySelector(`[data-value="${filters.status}"]`);
        if (statusBtn) {
            this.setActiveFilterButton(this.elements.statusFilter, statusBtn);
        }
        
        // Update other filters
        this.elements.viewersFilter.value = filters.viewers;
        this.elements.categoryFilter.value = filters.category;
        this.elements.searchInput.value = filters.search;
        
        // Update sort
        this.elements.sortFilter.value = this.filter.getSortBy();
        this.updateSortDirectionButton();
    }

    toggleTheme() {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        this.storage.setSetting('theme', isLight ? 'light' : 'dark');
    }

    showSettings() {
        // Implementation for settings modal
        this.ui.showToast('Settings panel coming soon!', 'info');
    }

    showAnalytics() {
        // Implementation for analytics modal
        this.ui.showToast('Analytics dashboard coming soon!', 'info');
    }

    showStreamerAnalytics(streamerName) {
        // Implementation for individual streamer analytics
        this.ui.showToast(`Analytics for ${streamerName} coming soon!`, 'info');
    }

    // Event handlers
    handleStreamersLoaded(streamers) {
        this.streamers = streamers;
        this.applyFilters();
        this.updateStats();
        this.updateLastUpdated();
    }

    handleStreamerUpdated(streamer) {
        // Update streamer in list
        const index = this.streamers.findIndex(s => s.name === streamer.name);
        if (index !== -1) {
            this.streamers[index] = streamer;
            this.applyFilters();
            this.updateStats();
        }
        
        // Send notification if needed
        if (streamer.live) {
            this.notification.sendLiveNotification(streamer);
        } else {
            this.notification.sendOfflineNotification(streamer);
        }
    }

    handleStreamerError(error) {
        console.error('Streamer error:', error);
        this.ui.showToast('Error loading streamer data: ' + error.message, 'error');
    }

    // Utility methods
    formatDuration(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ago`;
        } else if (hours > 0) {
            return `${hours}h ago`;
        } else {
            const minutes = Math.floor(diff / (1000 * 60));
            return `${minutes}m ago`;
        }
    }

    getPlaceholderAvatar() {
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzMzIi8+CjxjaXJjbGUgY3g9IjMyIiBjeT0iMjQiIHI9IjEyIiBmaWxsPSIjNjY2Ii8+CjxwYXRoIGQ9Ik0xNiA1NkMxNiA0OC4yNjggMjMuMjY4IDQyIDMyIDQyUzQ4IDQ4LjI2OCA0OCA1NlYxNkgxNlY1NloiIGZpbGw9IiM2NjYiLz4KPC9zdmc+';
    }

    getPlaceholderThumbnail() {
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDMyMCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMTgwIiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjE2MCIgeT0iOTAiIGZpbGw9IiM2NjYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+TElWRTwvdGV4dD4KPC9zdmc+';
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Cleanup
    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.storage.destroy();
        this.ui.destroy();
        this.notification.cleanup();
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new KickStreamersApp();
    app.init();
    
    // Make app globally available for debugging
    window.kickApp = app;
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.kickApp) {
        window.kickApp.destroy();
    }
});

