import Redis, { createClient } from 'redis';
import { getEnv } from './env';
import { logger } from '../logger';

let redisClient: Redis.RedisClientType | null = null;

export async function connectRedis(): Promise<Redis.RedisClientType> {
    if (redisClient) {
        return redisClient;
    }

    const env = getEnv();
    redisClient = createClient({
        url: env.REDIS_URL,
    });

    redisClient.on('error', (err) => {
        logger.error(`Redis error: ${err.message}`);
    });

    redisClient.on('connect', () => {
        logger.info('Redis connected');
    });

    await redisClient.connect();
    return redisClient;
}

export async function getRedisClient(): Promise<Redis.RedisClientType> {
    if (!redisClient) {
        return connectRedis();
    }
    return redisClient;
}

export async function disconnectRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.disconnect();
        redisClient = null;
    }
}

export default redisClient;
