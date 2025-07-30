// History Manager - Tracks stream history and provides analytics
export class HistoryManager {
    constructor(storage) {
        this.storage = storage;
        this.eventListeners = new Map();
        this.historyData = new Map();
        this.maxHistoryDays = 30; // Keep 30 days of history
        this.isInitialized = false;
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
                    console.error('History event listener error:', error);
                }
            });
        }
    }

    async init() {
        try {
            // Load existing history data
            await this.loadHistoryData();
            
            // Clean up old data
            this.cleanupOldData();
            
            this.isInitialized = true;
            console.log('HistoryManager initialized');
        } catch (error) {
            console.error('Failed to initialize HistoryManager:', error);
        }
    }

    async loadHistoryData() {
        const savedHistory = this.storage.get('streamHistory', {});
        
        // Convert saved data back to Map
        for (const [streamerName, history] of Object.entries(savedHistory)) {
            this.historyData.set(streamerName, {
                sessions: history.sessions || [],
                viewerHistory: history.viewerHistory || [],
                statusChanges: history.statusChanges || [],
                lastSeen: history.lastSeen || null,
                totalStreamTime: history.totalStreamTime || 0,
                averageViewers: history.averageViewers || 0,
                peakViewers: history.peakViewers || 0,
                streamCount: history.streamCount || 0
            });
        }
    }

    saveHistoryData() {
        const historyObject = {};
        for (const [streamerName, history] of this.historyData) {
            historyObject[streamerName] = history;
        }
        this.storage.set('streamHistory', historyObject);
    }

    recordStreamerUpdate(streamer) {
        if (!this.isInitialized) return;

        const streamerName = streamer.name;
        const now = Date.now();
        
        // Get or create history for this streamer
        let history = this.historyData.get(streamerName);
        if (!history) {
            history = {
                sessions: [],
                viewerHistory: [],
                statusChanges: [],
                lastSeen: null,
                totalStreamTime: 0,
                averageViewers: 0,
                peakViewers: 0,
                streamCount: 0
            };
            this.historyData.set(streamerName, history);
        }

        // Record status change
        const lastStatus = history.statusChanges.length > 0 ? 
            history.statusChanges[history.statusChanges.length - 1] : null;
        
        if (!lastStatus || lastStatus.live !== streamer.live) {
            const statusChange = {
                timestamp: now,
                live: streamer.live,
                viewers: streamer.viewers || 0,
                title: streamer.title || '',
                category: streamer.category || null
            };
            
            history.statusChanges.push(statusChange);
            
            // Handle session tracking
            if (streamer.live) {
                this.startStreamSession(streamerName, statusChange);
            } else {
                this.endStreamSession(streamerName, statusChange);
            }
        }

        // Record viewer count if live
        if (streamer.live) {
            this.recordViewerCount(streamerName, streamer.viewers || 0, now);
            history.lastSeen = now;
        } else if (!history.lastSeen) {
            history.lastSeen = now;
        }

        // Update peak viewers
        if (streamer.viewers > history.peakViewers) {
            history.peakViewers = streamer.viewers;
        }

        // Save data periodically
        this.saveHistoryData();
        this.emit('historyUpdated', { streamerName, history });
    }

    startStreamSession(streamerName, statusChange) {
        const history = this.historyData.get(streamerName);
        if (!history) return;

        const session = {
            id: this.generateSessionId(),
            startTime: statusChange.timestamp,
            endTime: null,
            startViewers: statusChange.viewers,
            peakViewers: statusChange.viewers,
            endViewers: null,
            title: statusChange.title,
            category: statusChange.category,
            viewerSamples: [{
                timestamp: statusChange.timestamp,
                viewers: statusChange.viewers
            }],
            duration: 0
        };

        history.sessions.push(session);
        history.streamCount++;
    }

    endStreamSession(streamerName, statusChange) {
        const history = this.historyData.get(streamerName);
        if (!history || history.sessions.length === 0) return;

        const lastSession = history.sessions[history.sessions.length - 1];
        if (lastSession.endTime) return; // Session already ended

        lastSession.endTime = statusChange.timestamp;
        lastSession.endViewers = statusChange.viewers;
        lastSession.duration = statusChange.timestamp - lastSession.startTime;

        // Update total stream time
        history.totalStreamTime += lastSession.duration;

        // Calculate average viewers for this session
        if (lastSession.viewerSamples.length > 0) {
            const avgViewers = lastSession.viewerSamples.reduce((sum, sample) => sum + sample.viewers, 0) / lastSession.viewerSamples.length;
            lastSession.averageViewers = Math.round(avgViewers);
        }

        // Update overall average viewers
        this.updateAverageViewers(streamerName);
    }

    recordViewerCount(streamerName, viewers, timestamp) {
        const history = this.historyData.get(streamerName);
        if (!history) return;

        // Add to viewer history (sample every 5 minutes)
        const lastSample = history.viewerHistory.length > 0 ? 
            history.viewerHistory[history.viewerHistory.length - 1] : null;
        
        if (!lastSample || timestamp - lastSample.timestamp >= 5 * 60 * 1000) {
            history.viewerHistory.push({
                timestamp,
                viewers
            });
        }

        // Update current session
        if (history.sessions.length > 0) {
            const currentSession = history.sessions[history.sessions.length - 1];
            if (!currentSession.endTime) {
                // Add viewer sample to current session
                const lastSessionSample = currentSession.viewerSamples.length > 0 ?
                    currentSession.viewerSamples[currentSession.viewerSamples.length - 1] : null;
                
                if (!lastSessionSample || timestamp - lastSessionSample.timestamp >= 2 * 60 * 1000) {
                    currentSession.viewerSamples.push({ timestamp, viewers });
                }

                // Update peak viewers for session
                if (viewers > currentSession.peakViewers) {
                    currentSession.peakViewers = viewers;
                }
            }
        }
    }

    updateAverageViewers(streamerName) {
        const history = this.historyData.get(streamerName);
        if (!history || history.sessions.length === 0) return;

        const completedSessions = history.sessions.filter(s => s.endTime);
        if (completedSessions.length === 0) return;

        const totalViewerTime = completedSessions.reduce((sum, session) => {
            const sessionAvg = session.averageViewers || 0;
            const sessionDuration = session.duration || 0;
            return sum + (sessionAvg * sessionDuration);
        }, 0);

        const totalDuration = completedSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
        
        if (totalDuration > 0) {
            history.averageViewers = Math.round(totalViewerTime / totalDuration);
        }
    }

    // Analytics methods
    getStreamerAnalytics(streamerName, days = 7) {
        const history = this.historyData.get(streamerName);
        if (!history) return null;

        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        
        // Filter data to specified time range
        const recentSessions = history.sessions.filter(s => s.startTime >= cutoffTime);
        const recentViewerHistory = history.viewerHistory.filter(v => v.timestamp >= cutoffTime);
        const recentStatusChanges = history.statusChanges.filter(s => s.timestamp >= cutoffTime);

        // Calculate analytics
        const totalStreamTime = recentSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        const streamCount = recentSessions.filter(s => s.endTime).length;
        const averageStreamDuration = streamCount > 0 ? totalStreamTime / streamCount : 0;
        
        const peakViewers = Math.max(...recentSessions.map(s => s.peakViewers || 0), 0);
        const averageViewers = this.calculateAverageViewers(recentSessions);
        
        // Calculate stream frequency
        const liveEvents = recentStatusChanges.filter(s => s.live);
        const streamFrequency = liveEvents.length / Math.max(days, 1);

        // Calculate viewer growth
        const viewerGrowth = this.calculateViewerGrowth(recentViewerHistory);

        // Get popular categories
        const categories = this.getPopularCategories(recentSessions);

        // Get stream schedule pattern
        const schedulePattern = this.analyzeSchedulePattern(recentSessions);

        return {
            streamerName,
            period: `${days} days`,
            totalStreamTime,
            streamCount,
            averageStreamDuration,
            peakViewers,
            averageViewers,
            streamFrequency,
            viewerGrowth,
            categories,
            schedulePattern,
            recentSessions: recentSessions.slice(-10), // Last 10 sessions
            viewerChart: this.generateViewerChart(recentViewerHistory)
        };
    }

    getOverallAnalytics(days = 7) {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        const analytics = {
            totalStreamers: this.historyData.size,
            activeStreamers: 0,
            totalStreamTime: 0,
            totalSessions: 0,
            averageViewers: 0,
            peakViewers: 0,
            popularCategories: new Map(),
            viewerDistribution: {
                '0-100': 0,
                '100-500': 0,
                '500-1000': 0,
                '1000+': 0
            },
            streamingHours: new Array(24).fill(0),
            dailyStats: []
        };

        let totalViewerTime = 0;
        let totalDuration = 0;

        for (const [streamerName, history] of this.historyData) {
            const recentSessions = history.sessions.filter(s => s.startTime >= cutoffTime);
            
            if (recentSessions.length > 0) {
                analytics.activeStreamers++;
            }

            for (const session of recentSessions) {
                if (session.endTime) {
                    analytics.totalSessions++;
                    analytics.totalStreamTime += session.duration;
                    
                    if (session.peakViewers > analytics.peakViewers) {
                        analytics.peakViewers = session.peakViewers;
                    }

                    // Category popularity
                    if (session.category) {
                        const count = analytics.popularCategories.get(session.category) || 0;
                        analytics.popularCategories.set(session.category, count + 1);
                    }

                    // Viewer distribution
                    const avgViewers = session.averageViewers || 0;
                    if (avgViewers <= 100) {
                        analytics.viewerDistribution['0-100']++;
                    } else if (avgViewers <= 500) {
                        analytics.viewerDistribution['100-500']++;
                    } else if (avgViewers <= 1000) {
                        analytics.viewerDistribution['500-1000']++;
                    } else {
                        analytics.viewerDistribution['1000+']++;
                    }

                    // Streaming hours
                    const startHour = new Date(session.startTime).getHours();
                    analytics.streamingHours[startHour]++;

                    // For average calculation
                    if (session.averageViewers && session.duration) {
                        totalViewerTime += session.averageViewers * session.duration;
                        totalDuration += session.duration;
                    }
                }
            }
        }

        // Calculate overall average viewers
        if (totalDuration > 0) {
            analytics.averageViewers = Math.round(totalViewerTime / totalDuration);
        }

        // Convert popular categories to sorted array
        analytics.popularCategories = Array.from(analytics.popularCategories.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Generate daily stats
        analytics.dailyStats = this.generateDailyStats(days);

        return analytics;
    }

    calculateAverageViewers(sessions) {
        if (sessions.length === 0) return 0;

        let totalViewerTime = 0;
        let totalDuration = 0;

        for (const session of sessions) {
            if (session.averageViewers && session.duration) {
                totalViewerTime += session.averageViewers * session.duration;
                totalDuration += session.duration;
            }
        }

        return totalDuration > 0 ? Math.round(totalViewerTime / totalDuration) : 0;
    }

    calculateViewerGrowth(viewerHistory) {
        if (viewerHistory.length < 2) return 0;

        const firstWeek = viewerHistory.slice(0, Math.floor(viewerHistory.length / 2));
        const secondWeek = viewerHistory.slice(Math.floor(viewerHistory.length / 2));

        const firstAvg = firstWeek.reduce((sum, v) => sum + v.viewers, 0) / firstWeek.length;
        const secondAvg = secondWeek.reduce((sum, v) => sum + v.viewers, 0) / secondWeek.length;

        if (firstAvg === 0) return 0;
        return Math.round(((secondAvg - firstAvg) / firstAvg) * 100);
    }

    getPopularCategories(sessions) {
        const categoryCount = new Map();
        
        for (const session of sessions) {
            if (session.category) {
                const count = categoryCount.get(session.category) || 0;
                categoryCount.set(session.category, count + 1);
            }
        }

        return Array.from(categoryCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    }

    analyzeSchedulePattern(sessions) {
        const hourCounts = new Array(24).fill(0);
        const dayCounts = new Array(7).fill(0);

        for (const session of sessions) {
            const date = new Date(session.startTime);
            const hour = date.getHours();
            const day = date.getDay();
            
            hourCounts[hour]++;
            dayCounts[day]++;
        }

        // Find most common streaming hours
        const topHours = hourCounts
            .map((count, hour) => ({ hour, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        // Find most common streaming days
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const topDays = dayCounts
            .map((count, day) => ({ day: dayNames[day], count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        return {
            topHours,
            topDays,
            hourDistribution: hourCounts,
            dayDistribution: dayCounts
        };
    }

    generateViewerChart(viewerHistory) {
        if (viewerHistory.length === 0) return [];

        // Sample data points for chart (max 100 points)
        const maxPoints = 100;
        const step = Math.max(1, Math.floor(viewerHistory.length / maxPoints));
        
        const chartData = [];
        for (let i = 0; i < viewerHistory.length; i += step) {
            const sample = viewerHistory[i];
            chartData.push({
                timestamp: sample.timestamp,
                viewers: sample.viewers,
                date: new Date(sample.timestamp).toISOString()
            });
        }

        return chartData;
    }

    generateDailyStats(days) {
        const dailyStats = [];
        const now = Date.now();

        for (let i = days - 1; i >= 0; i--) {
            const dayStart = now - (i * 24 * 60 * 60 * 1000);
            const dayEnd = dayStart + (24 * 60 * 60 * 1000);
            
            let liveStreamers = 0;
            let totalViewers = 0;
            let streamStarts = 0;

            for (const [streamerName, history] of this.historyData) {
                // Count stream starts
                const dayStarts = history.statusChanges.filter(s => 
                    s.live && s.timestamp >= dayStart && s.timestamp < dayEnd
                );
                streamStarts += dayStarts.length;

                // Sample viewer data for this day
                const dayViewers = history.viewerHistory.filter(v => 
                    v.timestamp >= dayStart && v.timestamp < dayEnd
                );
                
                if (dayViewers.length > 0) {
                    const avgViewers = dayViewers.reduce((sum, v) => sum + v.viewers, 0) / dayViewers.length;
                    totalViewers += avgViewers;
                    liveStreamers++;
                }
            }

            dailyStats.push({
                date: new Date(dayStart).toISOString().split('T')[0],
                liveStreamers,
                averageViewers: liveStreamers > 0 ? Math.round(totalViewers / liveStreamers) : 0,
                streamStarts
            });
        }

        return dailyStats;
    }

    // Utility methods
    getLastSeen(streamerName) {
        const history = this.historyData.get(streamerName);
        return history ? history.lastSeen : null;
    }

    getStreamCount(streamerName, days = 7) {
        const history = this.historyData.get(streamerName);
        if (!history) return 0;

        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        return history.sessions.filter(s => s.startTime >= cutoffTime && s.endTime).length;
    }

    getTotalStreamTime(streamerName, days = 7) {
        const history = this.historyData.get(streamerName);
        if (!history) return 0;

        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        return history.sessions
            .filter(s => s.startTime >= cutoffTime && s.endTime)
            .reduce((sum, s) => sum + s.duration, 0);
    }

    cleanupOldData() {
        const cutoffTime = Date.now() - (this.maxHistoryDays * 24 * 60 * 60 * 1000);

        for (const [streamerName, history] of this.historyData) {
            // Clean up old sessions
            history.sessions = history.sessions.filter(s => s.startTime >= cutoffTime);
            
            // Clean up old viewer history
            history.viewerHistory = history.viewerHistory.filter(v => v.timestamp >= cutoffTime);
            
            // Clean up old status changes
            history.statusChanges = history.statusChanges.filter(s => s.timestamp >= cutoffTime);
        }

        this.saveHistoryData();
    }

    generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Export/Import methods
    exportHistory() {
        const historyObject = {};
        for (const [streamerName, history] of this.historyData) {
            historyObject[streamerName] = history;
        }
        return historyObject;
    }

    importHistory(historyData) {
        for (const [streamerName, history] of Object.entries(historyData)) {
            this.historyData.set(streamerName, history);
        }
        this.saveHistoryData();
    }

    // Statistics for debugging
    getStats() {
        let totalSessions = 0;
        let totalViewerSamples = 0;
        let totalStatusChanges = 0;

        for (const [streamerName, history] of this.historyData) {
            totalSessions += history.sessions.length;
            totalViewerSamples += history.viewerHistory.length;
            totalStatusChanges += history.statusChanges.length;
        }

        return {
            streamers: this.historyData.size,
            totalSessions,
            totalViewerSamples,
            totalStatusChanges,
            memoryUsage: JSON.stringify(this.exportHistory()).length
        };
    }
}

