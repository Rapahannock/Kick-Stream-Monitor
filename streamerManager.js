// Streamer Manager - Handles API calls and streamer data
export class StreamerManager {
    constructor(storage) {
        this.storage = storage;
        this.streamers = [];
        this.cache = new Map();
        this.eventListeners = new Map();
        this.rateLimiter = new RateLimiter(10, 1000); // 10 requests per second
        this.abortController = null;
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
                    console.error('Event listener error:', error);
                }
            });
        }
    }

    // Main methods
    async loadStreamers() {
        try {
            // Cancel any ongoing requests
            if (this.abortController) {
                this.abortController.abort();
            }
            this.abortController = new AbortController();

            // Load streamers list from external source
            const streamerNames = await this.fetchStreamersList();
            
            // Fetch info for all streamers
            const streamersData = await this.fetchMultipleStreamers(streamerNames, {
                signal: this.abortController.signal
            });

            this.streamers = streamersData;
            this.emit('streamersLoaded', this.streamers);
            
            return this.streamers;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Failed to load streamers:', error);
                this.emit('error', error);
            }
            throw error;
        }
    }

    async refreshStreamers() {
        if (this.streamers.length === 0) {
            return this.loadStreamers();
        }

        try {
            // Cancel any ongoing requests
            if (this.abortController) {
                this.abortController.abort();
            }
            this.abortController = new AbortController();

            const streamerNames = this.streamers.map(s => s.name);
            const updatedStreamers = await this.fetchMultipleStreamers(streamerNames, {
                signal: this.abortController.signal
            });

            // Update streamers and emit individual update events
            updatedStreamers.forEach(updatedStreamer => {
                const index = this.streamers.findIndex(s => s.name === updatedStreamer.name);
                if (index !== -1) {
                    const oldStreamer = this.streamers[index];
                    this.streamers[index] = updatedStreamer;
                    
                    // Emit update event if status changed
                    if (oldStreamer.live !== updatedStreamer.live) {
                        this.emit('streamerUpdated', updatedStreamer);
                    }
                }
            });

            this.emit('streamersLoaded', this.streamers);
            return this.streamers;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Failed to refresh streamers:', error);
                this.emit('error', error);
            }
            throw error;
        }
    }

    async addStreamer(streamerName) {
        const normalizedName = streamerName.toLowerCase().trim();
        
        if (!normalizedName) {
            throw new Error('Streamer name cannot be empty');
        }

        if (this.streamers.some(s => s.name === normalizedName)) {
            throw new Error('Streamer already exists');
        }

        try {
            // Add to external list first
            await this.addStreamerToList(normalizedName);
            
            // Fetch streamer info
            const streamerInfo = await this.fetchStreamerInfo(normalizedName);
            
            // Add to local list
            this.streamers.push(streamerInfo);
            this.emit('streamersLoaded', this.streamers);
            
            return streamerInfo;
        } catch (error) {
            console.error(`Failed to add streamer ${normalizedName}:`, error);
            throw error;
        }
    }

    async removeStreamer(streamerName) {
        const normalizedName = streamerName.toLowerCase().trim();
        
        try {
            // Remove from external list
            await this.removeStreamerFromList(normalizedName);
            
            // Remove from local list
            this.streamers = this.streamers.filter(s => s.name !== normalizedName);
            this.emit('streamersLoaded', this.streamers);
            
            return true;
        } catch (error) {
            console.error(`Failed to remove streamer ${normalizedName}:`, error);
            throw error;
        }
    }

    getStreamers() {
        return [...this.streamers];
    }

    getStreamer(name) {
        return this.streamers.find(s => s.name === name.toLowerCase());
    }

    // API methods
    async fetchStreamersList() {
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(
                `https://gist.githubusercontent.com/Rapahannock/9d6241637b3be456f610b3aa415d8b4f/raw/streamers1455.json${cacheBuster}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch streamers list: ${response.status}`);
            }

            const streamers = await response.json();
            return Array.isArray(streamers) ? streamers : [];
        } catch (error) {
            console.error('Failed to fetch streamers list:', error);
            // Return cached list if available
            const cached = this.storage.get('cachedStreamersList', []);
            return cached;
        }
    }

    async fetchStreamerInfo(username, options = {}) {
        const cacheKey = `streamer_${username}`;
        const cached = this.cache.get(cacheKey);
        
        // Return cached data if still valid (1 minute)
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached.data;
        }

        try {
            await this.rateLimiter.wait();
            
            const response = await fetch(`https://kick.com/api/v1/channels/${username}`, {
                signal: options.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'KickStreamersMonitor/4.0'
                }
            });

            if (!response.ok) {
                if (response.status === 429) {
                    // Rate limited, wait and retry
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.fetchStreamerInfo(username, options);
                }
                throw new APIError(`HTTP ${response.status}: ${response.statusText}`, response.status);
            }

            const data = await response.json();
            const streamerInfo = this.transformStreamerData(data, username);
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: streamerInfo,
                timestamp: Date.now()
            });

            return streamerInfo;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            
            console.error(`Failed to fetch info for ${username}:`, error);
            return this.getFallbackStreamerInfo(username);
        }
    }

    async fetchMultipleStreamers(usernames, options = {}) {
        const batchSize = 5;
        const results = [];
        
        for (let i = 0; i < usernames.length; i += batchSize) {
            const batch = usernames.slice(i, i + batchSize);
            const batchPromises = batch.map(username => 
                this.fetchStreamerInfo(username, options)
            );
            
            try {
                const batchResults = await Promise.allSettled(batchPromises);
                const successfulResults = batchResults
                    .filter(result => result.status === 'fulfilled')
                    .map(result => result.value);
                
                results.push(...successfulResults);
                
                // Small delay between batches to respect rate limits
                if (i + batchSize < usernames.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }
                console.error('Batch fetch error:', error);
            }
        }
        
        return results.filter(Boolean);
    }

    transformStreamerData(data, username) {
        const livestream = data.livestream;
        const user = data.user || {};
        
        return {
            name: username,
            displayName: user.username || username,
            live: livestream !== null,
            title: livestream?.session_title || 'Offline',
            viewers: livestream?.viewer_count || 0,
            url: `https://kick.com/${username}`,
            category: livestream?.categories?.[0]?.name || null,
            thumbnail: livestream?.thumbnail?.url || null,
            avatar: user.profile_pic || null,
            followers: data.followers_count || 0,
            isVerified: data.verified || false,
            language: livestream?.language || 'en',
            streamStartTime: livestream?.created_at ? new Date(livestream.created_at).getTime() : null,
            lastSeen: livestream ? Date.now() : this.getLastSeenTime(username),
            tags: livestream?.tags || [],
            mature: livestream?.is_mature || false,
            error: false,
            lastUpdated: Date.now()
        };
    }

    getFallbackStreamerInfo(username) {
        return {
            name: username,
            displayName: username,
            live: false,
            title: 'Unavailable',
            viewers: 0,
            url: `https://kick.com/${username}`,
            category: null,
            thumbnail: null,
            avatar: null,
            followers: 0,
            isVerified: false,
            language: 'en',
            streamStartTime: null,
            lastSeen: this.getLastSeenTime(username),
            tags: [],
            mature: false,
            error: true,
            lastUpdated: Date.now()
        };
    }

    getLastSeenTime(username) {
        return this.storage.get(`lastSeen_${username}`, Date.now() - (24 * 60 * 60 * 1000));
    }

    // External API methods for adding/removing streamers
    async addStreamerToList(streamerName) {
        try {
            const response = await fetch('https://autumn-base-826c.rapahannock.workers.dev/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ streamer: streamerName })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to add streamer');
            }

            return await response.text();
        } catch (error) {
            console.error('Failed to add streamer to external list:', error);
            throw error;
        }
    }

    async removeStreamerFromList(streamerName) {
        const pin = prompt('Enter PIN to remove streamer:');
        if (!pin) {
            throw new Error('PIN required to remove streamer');
        }

        try {
            const response = await fetch('https://autumn-base-826c.rapahannock.workers.dev/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    remove: streamerName, 
                    pin: String(pin).padStart(5, '0') 
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to remove streamer');
            }

            return await response.text();
        } catch (error) {
            console.error('Failed to remove streamer from external list:', error);
            throw error;
        }
    }

    // Cache management
    clearCache() {
        this.cache.clear();
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }

    // Cleanup
    destroy() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.clearCache();
        this.eventListeners.clear();
    }
}

// Rate limiter utility
class RateLimiter {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
    }

    async wait() {
        const now = Date.now();
        
        // Remove old requests outside the window
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = Math.min(...this.requests);
            const waitTime = this.windowMs - (now - oldestRequest);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.wait(); // Recursive call after waiting
        }
        
        this.requests.push(now);
    }
}

// API Error class
class APIError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'APIError';
        this.status = status;
    }
}

