// Main Application Entry Point
import { StreamerManager } from './services/streamerManager.js';
import { FilterManager } from './services/filterManager.js';
import { HistoryManager } from './services/historyManager.js';
import { NotificationManager } from './services/notificationManager.js';
import { UIManager } from './services/uiManager.js';
import { StorageManager } from './services/storageManager.js';

class KickStreamersApp {
    constructor() {
        this.isInitialized = false;
        this.refreshInterval = null;
        this.refreshCountdown = null;
        this.countdownTimer = null;
        
        // Initialize managers
        this.storage = new StorageManager();
        this.streamerManager = new StreamerManager(this.storage);
        this.filterManager = new FilterManager();
        this.historyManager = new HistoryManager(this.storage);
        this.notificationManager = new NotificationManager();
        this.uiManager = new UIManager();
        
        // Bind methods
        this.handleRefresh = this.handleRefresh.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        this.handleAddStreamer = this.handleAddStreamer.bind(this);
        this.handleFilterChange = this.handleFilterChange.bind(this);
        this.handleSortChange = this.handleSortChange.bind(this);
        this.handleViewChange = this.handleViewChange.bind(this);
        this.handleThemeToggle = this.handleThemeToggle.bind(this);
        
        this.init();
    }

    async init() {
        try {
            console.log('Initializing Kick Streamers Monitor v4.0...');
            
            // Initialize theme
            this.initializeTheme();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize managers
            await this.initializeManagers();
            
            // Load initial data
            await this.loadInitialData();
            
            // Setup auto-refresh
            this.setupAutoRefresh();
            
            // Mark as initialized
            this.isInitialized = true;
            
            console.log('Application initialized successfully');
            this.uiManager.showToast('Application loaded successfully', 'success');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.uiManager.showToast('Failed to initialize application', 'error');
            this.showErrorState(error);
        }
    }

    async initializeManagers() {
        // Initialize storage
        await this.storage.init();
        
        // Initialize notification manager
        await this.notificationManager.init();
        
        // Initialize history manager
        await this.historyManager.init();
        
        // Setup manager event listeners
        this.setupManagerEvents();
    }

    setupManagerEvents() {
        // Streamer manager events
        this.streamerManager.on('streamersLoaded', (streamers) => {
            this.handleStreamersLoaded(streamers);
        });
        
        this.streamerManager.on('streamerUpdated', (streamer) => {
            this.handleStreamerUpdated(streamer);
        });
        
        this.streamerManager.on('error', (error) => {
            this.uiManager.showToast(`Error: ${error.message}`, 'error');
        });
        
        // Filter manager events
        this.filterManager.on('filtersChanged', (filters) => {
            this.applyFilters();
            this.updateStats();
        });
        
        // History manager events
        this.historyManager.on('historyUpdated', (history) => {
            this.updateAnalytics();
        });
        
        // Notification manager events
        this.notificationManager.on('notificationSent', (notification) => {
            console.log('Notification sent:', notification);
        });
    }

    setupEventListeners() {
        // Search
        const searchInput = document.getElementById('search-input');
        const clearSearchBtn = document.getElementById('clear-search');
        
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(this.handleSearch, 300));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleSearch();
                }
            });
        }
        
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                this.handleSearch();
            });
        }
        
        // Add streamer
        const addInput = document.getElementById('add-streamer-input');
        const addBtn = document.getElementById('add-streamer-btn');
        
        if (addInput) {
            addInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleAddStreamer();
                }
            });
        }
        
        if (addBtn) {
            addBtn.addEventListener('click', this.handleAddStreamer);
        }
        
        // Filter buttons
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.handleFilterChange('status', filter);
            });
        });
        
        // Filter selects
        const viewerRange = document.getElementById('viewer-range');
        const categoryFilter = document.getElementById('category-filter');
        const sortSelect = document.getElementById('sort-select');
        
        if (viewerRange) {
            viewerRange.addEventListener('change', (e) => {
                this.handleFilterChange('viewers', e.target.value);
            });
        }
        
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.handleFilterChange('category', e.target.value);
            });
        }
        
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.handleSortChange(e.target.value);
            });
        }
        
        // Sort direction
        const sortDirection = document.getElementById('sort-direction');
        if (sortDirection) {
            sortDirection.addEventListener('click', () => {
                this.filterManager.toggleSortDirection();
                this.updateSortDirectionUI();
            });
        }
        
        // View controls
        const gridViewBtn = document.getElementById('grid-view');
        const listViewBtn = document.getElementById('list-view');
        
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.handleViewChange('grid'));
        }
        
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.handleViewChange('list'));
        }
        
        // Refresh controls
        const refreshBtn = document.getElementById('refresh-btn');
        const refreshInterval = document.getElementById('refresh-interval');
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.handleRefresh);
        }
        
        if (refreshInterval) {
            refreshInterval.addEventListener('change', (e) => {
                this.setupAutoRefresh(parseInt(e.target.value));
            });
        }
        
        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', this.handleThemeToggle);
        }
        
        // Analytics button
        const analyticsBtn = document.getElementById('analytics-btn');
        if (analyticsBtn) {
            analyticsBtn.addEventListener('click', () => this.showAnalytics());
        }
        
        // Settings button
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.showSettings());
        }
        
        // Modal close buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || 
                e.target.classList.contains('modal-overlay')) {
                this.closeModals();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'f':
                        e.preventDefault();
                        searchInput?.focus();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.handleRefresh();
                        break;
                    case 'k':
                        e.preventDefault();
                        addInput?.focus();
                        break;
                }
            }
            
            if (e.key === 'Escape') {
                this.closeModals();
            }
        });
    }

    async loadInitialData() {
        this.uiManager.showLoading(true);
        
        try {
            // Load streamers list
            await this.streamerManager.loadStreamers();
            
            // Load saved filters
            const savedFilters = this.storage.get('filters', {});
            this.filterManager.setFilters(savedFilters);
            
            // Load saved view mode
            const savedView = this.storage.get('viewMode', 'grid');
            this.handleViewChange(savedView);
            
            // Load saved refresh interval
            const savedInterval = this.storage.get('refreshInterval', 60);
            document.getElementById('refresh-interval').value = savedInterval;
            this.setupAutoRefresh(savedInterval);
            
            // Apply initial filters
            this.applyFilters();
            this.updateStats();
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
            this.uiManager.showToast('Failed to load streamers', 'error');
        } finally {
            this.uiManager.showLoading(false);
        }
    }

    async handleRefresh() {
        if (!this.isInitialized) return;
        
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.classList.add('spinning');
        }
        
        try {
            await this.streamerManager.refreshStreamers();
            this.updateLastUpdatedTime();
            this.uiManager.showToast('Streamers refreshed', 'success');
        } catch (error) {
            console.error('Refresh failed:', error);
            this.uiManager.showToast('Refresh failed', 'error');
        } finally {
            if (refreshBtn) {
                refreshBtn.classList.remove('spinning');
            }
        }
    }

    handleSearch() {
        const searchInput = document.getElementById('search-input');
        const query = searchInput?.value.trim() || '';
        
        this.filterManager.setFilter('search', query);
        this.applyFilters();
        
        // Update clear button visibility
        const clearBtn = document.getElementById('clear-search');
        if (clearBtn) {
            clearBtn.style.display = query ? 'block' : 'none';
        }
    }

    async handleAddStreamer() {
        const addInput = document.getElementById('add-streamer-input');
        const streamerName = addInput?.value.trim();
        
        if (!streamerName) {
            this.uiManager.showToast('Please enter a streamer name', 'warning');
            return;
        }
        
        try {
            await this.streamerManager.addStreamer(streamerName);
            addInput.value = '';
            this.uiManager.showToast(`Added ${streamerName}`, 'success');
        } catch (error) {
            console.error('Failed to add streamer:', error);
            this.uiManager.showToast(`Failed to add ${streamerName}`, 'error');
        }
    }

    handleFilterChange(type, value) {
        this.filterManager.setFilter(type, value);
        this.updateFilterUI(type, value);
        this.applyFilters();
        this.updateStats();
        
        // Save filters
        this.storage.set('filters', this.filterManager.getFilters());
    }

    handleSortChange(sortBy) {
        this.filterManager.setSortBy(sortBy);
        this.applyFilters();
        
        // Save sort preference
        this.storage.set('sortBy', sortBy);
    }

    handleViewChange(viewMode) {
        const gridBtn = document.getElementById('grid-view');
        const listBtn = document.getElementById('list-view');
        const streamersGrid = document.getElementById('streamers-grid');
        
        // Update button states
        if (gridBtn && listBtn) {
            gridBtn.classList.toggle('active', viewMode === 'grid');
            listBtn.classList.toggle('active', viewMode === 'list');
        }
        
        // Update grid class
        if (streamersGrid) {
            streamersGrid.classList.toggle('list-view', viewMode === 'list');
        }
        
        // Save view mode
        this.storage.set('viewMode', viewMode);
    }

    handleThemeToggle() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.body.setAttribute('data-theme', newTheme);
        this.storage.set('theme', newTheme);
        
        this.uiManager.showToast(`Switched to ${newTheme} theme`, 'info');
    }

    updateFilterUI(type, value) {
        if (type === 'status') {
            // Update filter buttons
            const filterButtons = document.querySelectorAll('.filter-btn');
            filterButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === value);
            });
        }
    }

    updateSortDirectionUI() {
        const sortBtn = document.getElementById('sort-direction');
        if (sortBtn) {
            const isAscending = this.filterManager.getSortDirection() === 'asc';
            sortBtn.textContent = isAscending ? '↑' : '↓';
            sortBtn.title = isAscending ? 'Sort descending' : 'Sort ascending';
        }
    }

    applyFilters() {
        const streamers = this.streamerManager.getStreamers();
        const filteredStreamers = this.filterManager.applyFilters(streamers);
        this.renderStreamers(filteredStreamers);
    }

    renderStreamers(streamers) {
        const container = document.getElementById('streamers-grid');
        const emptyState = document.getElementById('empty-state');
        
        if (!container) return;
        
        // Clear existing content
        container.innerHTML = '';
        
        if (streamers.length === 0) {
            if (emptyState) {
                emptyState.style.display = 'flex';
            }
            return;
        }
        
        if (emptyState) {
            emptyState.style.display = 'none';
        }
        
        // Render streamer cards
        streamers.forEach(streamer => {
            const card = this.createStreamerCard(streamer);
            container.appendChild(card);
        });
    }

    createStreamerCard(streamer) {
        const card = document.createElement('div');
        card.className = this.getCardClasses(streamer);
        card.setAttribute('data-streamer', streamer.name);
        card.innerHTML = this.getCardHTML(streamer);
        
        // Add event listeners
        this.setupCardEventListeners(card, streamer);
        
        return card;
    }

    getCardClasses(streamer) {
        const classes = ['streamer-card'];
        
        if (streamer.live) classes.push('live');
        if (streamer.error) classes.push('error');
        if (!streamer.live) classes.push('offline');
        if (this.storage.isFavorite(streamer.name)) classes.push('favorite');
        
        return classes.join(' ');
    }

    getCardHTML(streamer) {
        const isFavorite = this.storage.isFavorite(streamer.name);
        const offlineDuration = this.getOfflineDuration(streamer);
        
        return `
            <div class="card-header">
                <div class="streamer-info">
                    ${streamer.avatar ? `<img class="avatar" src="${streamer.avatar}" alt="${streamer.displayName}" loading="lazy">` : ''}
                    <div class="streamer-details">
                        <h3 class="streamer-name">
                            <a href="${streamer.url}" target="_blank" rel="noopener">
                                ${this.escapeHTML(streamer.displayName)}
                                ${streamer.isVerified ? '<span class="verified">✓</span>' : ''}
                            </a>
                        </h3>
                        <div class="streamer-stats">
                            ${streamer.followers > 0 ? `<span class="followers">${this.formatNumber(streamer.followers)} followers</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-action="toggle-favorite" aria-label="Toggle favorite">
                        ${isFavorite ? '⭐' : '☆'}
                    </button>
                    <button class="menu-btn" data-action="show-menu" aria-label="More options">⋮</button>
                </div>
            </div>
            
            <div class="card-content">
                <div class="stream-status">
                    ${this.getStatusHTML(streamer)}
                </div>
                
                ${streamer.category ? `
                    <div class="stream-category">
                        <span class="category-icon">${this.getCategoryIcon(streamer.category)}</span>
                        <span class="category-name">${this.escapeHTML(streamer.category)}</span>
                    </div>
                ` : ''}
                
                ${streamer.live && streamer.thumbnail ? `
                    <div class="thumbnail-container">
                        <img class="thumbnail" 
                             src="${streamer.thumbnail}" 
                             alt="Stream preview" 
                             loading="lazy"
                             onclick="window.open('${streamer.url}', '_blank')">
                        <div class="thumbnail-overlay">
                            <button class="play-btn" onclick="window.open('${streamer.url}', '_blank')">▶</button>
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <div class="card-footer">
                <div class="last-updated">
                    Updated: ${new Date().toLocaleTimeString()}
                </div>
            </div>
        `;
    }

    getStatusHTML(streamer) {
        if (streamer.error) {
            return '<span class="status error">⚠️ Unavailable</span>';
        }
        
        if (streamer.live) {
            return `
                <span class="status live">🔴 Live</span>
                <div class="stream-title">${this.escapeHTML(streamer.title)}</div>
                <span class="viewer-count">${this.formatNumber(streamer.viewers)} viewers</span>
            `;
        }
        
        return `
            <span class="status offline">⚫ Offline</span>
            <span class="offline-duration">${this.getOfflineDuration(streamer)}</span>
        `;
    }

    setupCardEventListeners(card, streamer) {
        card.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            
            switch (action) {
                case 'toggle-favorite':
                    e.preventDefault();
                    this.toggleFavorite(streamer.name);
                    break;
                case 'show-menu':
                    e.preventDefault();
                    this.showContextMenu(e.target, streamer);
                    break;
            }
        });
    }

    toggleFavorite(streamerName) {
        const isFavorite = this.storage.toggleFavorite(streamerName);
        
        // Update card appearance
        const card = document.querySelector(`[data-streamer="${streamerName}"]`);
        if (card) {
            card.classList.toggle('favorite', isFavorite);
            
            const favoriteBtn = card.querySelector('.favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.textContent = isFavorite ? '⭐' : '☆';
                favoriteBtn.classList.toggle('active', isFavorite);
            }
        }
        
        this.updateStats();
        this.uiManager.showToast(
            `${streamerName} ${isFavorite ? 'added to' : 'removed from'} favorites`,
            'info'
        );
    }

    updateStats() {
        const streamers = this.streamerManager.getStreamers();
        const filteredStreamers = this.filterManager.applyFilters(streamers);
        const favorites = this.storage.getFavorites();
        
        const liveCount = streamers.filter(s => s.live).length;
        const totalViewers = streamers.reduce((sum, s) => sum + (s.viewers || 0), 0);
        
        // Update stat displays
        this.updateStatElement('total-count', streamers.length);
        this.updateStatElement('live-count', liveCount);
        this.updateStatElement('favorites-count', favorites.length);
        this.updateStatElement('total-viewers', this.formatNumber(totalViewers));
    }

    updateStatElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    setupAutoRefresh(intervalSeconds = 60) {
        // Clear existing timers
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
        }
        
        if (intervalSeconds === 0) {
            this.hideRefreshCountdown();
            return;
        }
        
        this.refreshCountdown = intervalSeconds;
        
        // Setup refresh interval
        this.refreshInterval = setInterval(() => {
            this.handleRefresh();
            this.refreshCountdown = intervalSeconds;
        }, intervalSeconds * 1000);
        
        // Setup countdown timer
        this.countdownTimer = setInterval(() => {
            this.refreshCountdown--;
            this.updateRefreshCountdown();
            
            if (this.refreshCountdown <= 0) {
                this.refreshCountdown = intervalSeconds;
            }
        }, 1000);
        
        this.updateRefreshCountdown();
        this.storage.set('refreshInterval', intervalSeconds);
    }

    updateRefreshCountdown() {
        const countdownElement = document.getElementById('refresh-countdown');
        if (countdownElement && this.refreshCountdown > 0) {
            countdownElement.textContent = `⏳ Refreshing in ${this.refreshCountdown}s`;
            countdownElement.style.display = 'block';
        }
    }

    hideRefreshCountdown() {
        const countdownElement = document.getElementById('refresh-countdown');
        if (countdownElement) {
            countdownElement.style.display = 'none';
        }
    }

    updateLastUpdatedTime() {
        const element = document.getElementById('last-updated');
        if (element) {
            element.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    }

    initializeTheme() {
        const savedTheme = this.storage.get('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        
        document.body.setAttribute('data-theme', theme);
    }

    // Utility methods
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

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    getCategoryIcon(category) {
        const icons = {
            'Just Chatting': '💬',
            'Call of Duty': '🎯',
            'GTA V': '🚗',
            'Sports': '🏀',
            'Music': '🎵',
            'Valorant': '🔫',
            'Fortnite': '🛡️',
            'League of Legends': '🧙‍♂️',
            'Minecraft': '⛏️',
            'IRL': '🌍',
            'Poker': '🃏',
            'Slots': '🎰'
        };
        return icons[category] || '🎮';
    }

    getOfflineDuration(streamer) {
        const lastSeen = this.historyManager.getLastSeen(streamer.name);
        if (!lastSeen) return 'Unknown';
        
        const diffMs = Date.now() - lastSeen;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ago`;
        }
        
        return hours > 0 ? `${hours}h ${minutes}m ago` : `${minutes}m ago`;
    }

    // Event handlers for manager events
    handleStreamersLoaded(streamers) {
        this.applyFilters();
        this.updateStats();
        this.updateLastUpdatedTime();
    }

    handleStreamerUpdated(streamer) {
        // Update history
        this.historyManager.recordStreamerUpdate(streamer);
        
        // Check for live notifications
        if (streamer.live && this.storage.isFavorite(streamer.name)) {
            this.notificationManager.sendLiveNotification(streamer);
        }
        
        // Update card if visible
        const card = document.querySelector(`[data-streamer="${streamer.name}"]`);
        if (card) {
            // Update card content without full re-render
            this.updateStreamerCard(card, streamer);
        }
    }

    updateStreamerCard(card, streamer) {
        // Update classes
        card.className = this.getCardClasses(streamer);
        
        // Update status
        const statusElement = card.querySelector('.stream-status');
        if (statusElement) {
            statusElement.innerHTML = this.getStatusHTML(streamer);
        }
        
        // Update thumbnail
        const thumbnailContainer = card.querySelector('.thumbnail-container');
        if (streamer.live && streamer.thumbnail) {
            if (!thumbnailContainer) {
                // Add thumbnail if it doesn't exist
                const cardContent = card.querySelector('.card-content');
                const categoryElement = cardContent.querySelector('.stream-category');
                const thumbnailHTML = `
                    <div class="thumbnail-container">
                        <img class="thumbnail" 
                             src="${streamer.thumbnail}" 
                             alt="Stream preview" 
                             loading="lazy"
                             onclick="window.open('${streamer.url}', '_blank')">
                        <div class="thumbnail-overlay">
                            <button class="play-btn" onclick="window.open('${streamer.url}', '_blank')">▶</button>
                        </div>
                    </div>
                `;
                if (categoryElement) {
                    categoryElement.insertAdjacentHTML('afterend', thumbnailHTML);
                } else {
                    cardContent.insertAdjacentHTML('beforeend', thumbnailHTML);
                }
            } else {
                // Update existing thumbnail
                const img = thumbnailContainer.querySelector('.thumbnail');
                if (img) {
                    img.src = streamer.thumbnail;
                }
            }
        } else if (thumbnailContainer) {
            // Remove thumbnail if streamer is offline
            thumbnailContainer.remove();
        }
        
        // Update footer timestamp
        const footer = card.querySelector('.last-updated');
        if (footer) {
            footer.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
        }
    }

    showAnalytics() {
        // Implementation for analytics modal
        console.log('Show analytics modal');
    }

    showSettings() {
        // Implementation for settings modal
        console.log('Show settings modal');
    }

    showContextMenu(target, streamer) {
        // Implementation for context menu
        console.log('Show context menu for', streamer.name);
    }

    closeModals() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    showErrorState(error) {
        const container = document.getElementById('streamers-grid');
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Something went wrong</h3>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" class="retry-btn">Retry</button>
                </div>
            `;
        }
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new KickStreamersApp());
} else {
    new KickStreamersApp();
}

