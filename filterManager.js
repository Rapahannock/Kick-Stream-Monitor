// Advanced Filter Manager
export class FilterManager {
    constructor() {
        this.filters = {
            status: 'all',        // all, live, offline, favorites
            viewers: 'all',       // all, 0-100, 100-500, 500-1000, 1000-5000, 5000+
            category: 'all',      // all, specific categories
            search: '',           // search query
            duration: 'all',      // all, <1h, 1-4h, 4h+
            language: 'all'       // all, specific languages
        };
        
        this.sortBy = 'status';   // status, viewers, name, category, duration, offline-time
        this.sortDirection = 'desc'; // asc, desc
        
        this.eventListeners = new Map();
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
            this.eventListeners.get(event).forEach(callback => callback(data));
        }
    }

    // Filter management
    setFilter(type, value) {
        if (this.filters.hasOwnProperty(type)) {
            this.filters[type] = value;
            this.emit('filtersChanged', this.filters);
        }
    }

    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.emit('filtersChanged', this.filters);
    }

    getFilters() {
        return { ...this.filters };
    }

    getFilter(type) {
        return this.filters[type];
    }

    clearFilters() {
        this.filters = {
            status: 'all',
            viewers: 'all',
            category: 'all',
            search: '',
            duration: 'all',
            language: 'all'
        };
        this.emit('filtersChanged', this.filters);
    }

    // Sort management
    setSortBy(sortBy) {
        this.sortBy = sortBy;
        this.emit('filtersChanged', this.filters);
    }

    getSortBy() {
        return this.sortBy;
    }

    setSortDirection(direction) {
        this.sortDirection = direction;
        this.emit('filtersChanged', this.filters);
    }

    getSortDirection() {
        return this.sortDirection;
    }

    toggleSortDirection() {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        this.emit('filtersChanged', this.filters);
    }

    // Main filtering method
    applyFilters(streamers) {
        if (!Array.isArray(streamers)) {
            return [];
        }

        let filtered = [...streamers];

        // Apply status filter
        filtered = this.applyStatusFilter(filtered);

        // Apply viewer count filter
        filtered = this.applyViewerFilter(filtered);

        // Apply category filter
        filtered = this.applyCategoryFilter(filtered);

        // Apply search filter
        filtered = this.applySearchFilter(filtered);

        // Apply duration filter
        filtered = this.applyDurationFilter(filtered);

        // Apply language filter
        filtered = this.applyLanguageFilter(filtered);

        // Apply sorting
        filtered = this.applySorting(filtered);

        return filtered;
    }

    applyStatusFilter(streamers) {
        const status = this.filters.status;
        
        switch (status) {
            case 'live':
                return streamers.filter(s => s.live);
            case 'offline':
                return streamers.filter(s => !s.live);
            case 'favorites':
                // This requires access to favorites list, will be handled in main app
                return streamers.filter(s => s.isFavorite);
            case 'all':
            default:
                return streamers;
        }
    }

    applyViewerFilter(streamers) {
        const viewerRange = this.filters.viewers;
        
        if (viewerRange === 'all') {
            return streamers;
        }

        return streamers.filter(streamer => {
            const viewers = streamer.viewers || 0;
            
            switch (viewerRange) {
                case '0-100':
                    return viewers >= 0 && viewers <= 100;
                case '100-500':
                    return viewers > 100 && viewers <= 500;
                case '500-1000':
                    return viewers > 500 && viewers <= 1000;
                case '1000-5000':
                    return viewers > 1000 && viewers <= 5000;
                case '5000+':
                    return viewers > 5000;
                default:
                    return true;
            }
        });
    }

    applyCategoryFilter(streamers) {
        const category = this.filters.category;
        
        if (category === 'all') {
            return streamers;
        }

        return streamers.filter(streamer => {
            return streamer.category === category;
        });
    }

    applySearchFilter(streamers) {
        const query = this.filters.search.toLowerCase().trim();
        
        if (!query) {
            return streamers;
        }

        return streamers.filter(streamer => {
            const searchableText = [
                streamer.name,
                streamer.displayName,
                streamer.title,
                streamer.category
            ].filter(Boolean).join(' ').toLowerCase();
            
            return searchableText.includes(query);
        });
    }

    applyDurationFilter(streamers) {
        const duration = this.filters.duration;
        
        if (duration === 'all') {
            return streamers;
        }

        return streamers.filter(streamer => {
            if (!streamer.live || !streamer.streamStartTime) {
                return duration === 'offline';
            }

            const streamDuration = Date.now() - streamer.streamStartTime;
            const hours = streamDuration / (1000 * 60 * 60);

            switch (duration) {
                case '<1h':
                    return hours < 1;
                case '1-4h':
                    return hours >= 1 && hours <= 4;
                case '4h+':
                    return hours > 4;
                case 'offline':
                    return !streamer.live;
                default:
                    return true;
            }
        });
    }

    applyLanguageFilter(streamers) {
        const language = this.filters.language;
        
        if (language === 'all') {
            return streamers;
        }

        return streamers.filter(streamer => {
            return streamer.language === language;
        });
    }

    applySorting(streamers) {
        const sortBy = this.sortBy;
        const direction = this.sortDirection === 'asc' ? 1 : -1;

        return streamers.sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case 'status':
                    // Live streamers first, then by viewer count
                    if (a.live !== b.live) {
                        comparison = b.live - a.live;
                    } else if (a.live && b.live) {
                        comparison = (b.viewers || 0) - (a.viewers || 0);
                    } else {
                        comparison = a.name.localeCompare(b.name);
                    }
                    break;

                case 'viewers':
                    comparison = (b.viewers || 0) - (a.viewers || 0);
                    break;

                case 'name':
                    comparison = a.displayName.localeCompare(b.displayName);
                    break;

                case 'category':
                    const categoryA = a.category || '';
                    const categoryB = b.category || '';
                    comparison = categoryA.localeCompare(categoryB);
                    break;

                case 'duration':
                    if (a.live && b.live) {
                        const durationA = a.streamStartTime ? Date.now() - a.streamStartTime : 0;
                        const durationB = b.streamStartTime ? Date.now() - b.streamStartTime : 0;
                        comparison = durationB - durationA;
                    } else if (a.live !== b.live) {
                        comparison = b.live - a.live;
                    } else {
                        comparison = 0;
                    }
                    break;

                case 'offline-time':
                    if (!a.live && !b.live) {
                        const offlineA = a.lastSeen || 0;
                        const offlineB = b.lastSeen || 0;
                        comparison = offlineB - offlineA; // Most recently offline first
                    } else if (a.live !== b.live) {
                        comparison = a.live - b.live; // Offline streamers first
                    } else {
                        comparison = 0;
                    }
                    break;

                case 'followers':
                    comparison = (b.followers || 0) - (a.followers || 0);
                    break;

                default:
                    comparison = 0;
            }

            return comparison * direction;
        });
    }

    // Advanced filtering methods
    getFilteredCount(streamers, filterType, filterValue) {
        const tempFilters = { ...this.filters };
        this.filters[filterType] = filterValue;
        
        const filtered = this.applyFilters(streamers);
        const count = filtered.length;
        
        this.filters = tempFilters;
        return count;
    }

    getAvailableCategories(streamers) {
        const categories = new Set();
        
        streamers.forEach(streamer => {
            if (streamer.category) {
                categories.add(streamer.category);
            }
        });

        return Array.from(categories).sort();
    }

    getAvailableLanguages(streamers) {
        const languages = new Set();
        
        streamers.forEach(streamer => {
            if (streamer.language) {
                languages.add(streamer.language);
            }
        });

        return Array.from(languages).sort();
    }

    getViewerRangeStats(streamers) {
        const ranges = {
            '0-100': 0,
            '100-500': 0,
            '500-1000': 0,
            '1000-5000': 0,
            '5000+': 0
        };

        streamers.forEach(streamer => {
            const viewers = streamer.viewers || 0;
            
            if (viewers <= 100) {
                ranges['0-100']++;
            } else if (viewers <= 500) {
                ranges['100-500']++;
            } else if (viewers <= 1000) {
                ranges['500-1000']++;
            } else if (viewers <= 5000) {
                ranges['1000-5000']++;
            } else {
                ranges['5000+']++;
            }
        });

        return ranges;
    }

    // Filter presets
    getFilterPresets() {
        return {
            'popular-live': {
                status: 'live',
                viewers: '1000+',
                category: 'all'
            },
            'new-streamers': {
                status: 'live',
                viewers: '0-100',
                category: 'all'
            },
            'just-chatting': {
                status: 'all',
                viewers: 'all',
                category: 'Just Chatting'
            },
            'gaming': {
                status: 'live',
                viewers: 'all',
                category: 'all'
            },
            'favorites-live': {
                status: 'favorites',
                viewers: 'all',
                category: 'all'
            }
        };
    }

    applyFilterPreset(presetName) {
        const presets = this.getFilterPresets();
        const preset = presets[presetName];
        
        if (preset) {
            this.setFilters(preset);
        }
    }

    // Export/Import filters
    exportFilters() {
        return {
            filters: this.filters,
            sortBy: this.sortBy,
            sortDirection: this.sortDirection
        };
    }

    importFilters(filterData) {
        if (filterData.filters) {
            this.setFilters(filterData.filters);
        }
        if (filterData.sortBy) {
            this.setSortBy(filterData.sortBy);
        }
        if (filterData.sortDirection) {
            this.setSortDirection(filterData.sortDirection);
        }
    }

    // Filter validation
    validateFilters() {
        const validStatuses = ['all', 'live', 'offline', 'favorites'];
        const validViewerRanges = ['all', '0-100', '100-500', '500-1000', '1000-5000', '5000+'];
        const validSortOptions = ['status', 'viewers', 'name', 'category', 'duration', 'offline-time', 'followers'];
        const validSortDirections = ['asc', 'desc'];

        const errors = [];

        if (!validStatuses.includes(this.filters.status)) {
            errors.push(`Invalid status filter: ${this.filters.status}`);
            this.filters.status = 'all';
        }

        if (!validViewerRanges.includes(this.filters.viewers)) {
            errors.push(`Invalid viewer range filter: ${this.filters.viewers}`);
            this.filters.viewers = 'all';
        }

        if (!validSortOptions.includes(this.sortBy)) {
            errors.push(`Invalid sort option: ${this.sortBy}`);
            this.sortBy = 'status';
        }

        if (!validSortDirections.includes(this.sortDirection)) {
            errors.push(`Invalid sort direction: ${this.sortDirection}`);
            this.sortDirection = 'desc';
        }

        return errors;
    }

    // Performance optimization for large datasets
    createFilterIndex(streamers) {
        const index = {
            byStatus: { live: [], offline: [] },
            byCategory: {},
            byViewerRange: {
                '0-100': [],
                '100-500': [],
                '500-1000': [],
                '1000-5000': [],
                '5000+': []
            }
        };

        streamers.forEach((streamer, i) => {
            // Index by status
            if (streamer.live) {
                index.byStatus.live.push(i);
            } else {
                index.byStatus.offline.push(i);
            }

            // Index by category
            if (streamer.category) {
                if (!index.byCategory[streamer.category]) {
                    index.byCategory[streamer.category] = [];
                }
                index.byCategory[streamer.category].push(i);
            }

            // Index by viewer range
            const viewers = streamer.viewers || 0;
            if (viewers <= 100) {
                index.byViewerRange['0-100'].push(i);
            } else if (viewers <= 500) {
                index.byViewerRange['100-500'].push(i);
            } else if (viewers <= 1000) {
                index.byViewerRange['500-1000'].push(i);
            } else if (viewers <= 5000) {
                index.byViewerRange['1000-5000'].push(i);
            } else {
                index.byViewerRange['5000+'].push(i);
            }
        });

        return index;
    }

    // Quick filter methods using index
    quickFilter(streamers, index) {
        if (!index) {
            return this.applyFilters(streamers);
        }

        let indices = new Set();
        let firstFilter = true;

        // Apply status filter
        if (this.filters.status !== 'all') {
            const statusIndices = index.byStatus[this.filters.status] || [];
            if (firstFilter) {
                indices = new Set(statusIndices);
                firstFilter = false;
            } else {
                indices = new Set([...indices].filter(i => statusIndices.includes(i)));
            }
        }

        // Apply category filter
        if (this.filters.category !== 'all') {
            const categoryIndices = index.byCategory[this.filters.category] || [];
            if (firstFilter) {
                indices = new Set(categoryIndices);
                firstFilter = false;
            } else {
                indices = new Set([...indices].filter(i => categoryIndices.includes(i)));
            }
        }

        // Apply viewer filter
        if (this.filters.viewers !== 'all') {
            const viewerIndices = index.byViewerRange[this.filters.viewers] || [];
            if (firstFilter) {
                indices = new Set(viewerIndices);
                firstFilter = false;
            } else {
                indices = new Set([...indices].filter(i => viewerIndices.includes(i)));
            }
        }

        // If no filters applied, use all streamers
        if (firstFilter) {
            indices = new Set(streamers.map((_, i) => i));
        }

        // Get filtered streamers
        let filtered = Array.from(indices).map(i => streamers[i]);

        // Apply remaining filters that can't use index
        filtered = this.applySearchFilter(filtered);
        filtered = this.applyDurationFilter(filtered);
        filtered = this.applyLanguageFilter(filtered);

        // Apply sorting
        filtered = this.applySorting(filtered);

        return filtered;
    }
}

