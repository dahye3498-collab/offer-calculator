type CacheEntry<T> = {
    data: T;
    timestamp: number;
};

const cache: Record<string, CacheEntry<unknown>> = {};

export function getCache<T>(key: string, ttlSeconds: number): T | null {
    const entry = cache[key];
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > ttlSeconds * 1000) {
        delete cache[key];
        return null;
    }

    return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
    cache[key] = {
        data,
        timestamp: Date.now(),
    };
}
