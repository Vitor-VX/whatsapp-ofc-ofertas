import mongoose, { Connection } from 'mongoose';
import { getEnv } from './env';
import { logger } from '../logger';

let mongoConnection: Connection | null = null;

export async function connectMongoDB(): Promise<Connection> {
    if (mongoConnection && mongoConnection.readyState === 1) {
        return mongoConnection;
    }

    const env = getEnv();

    try {
        const conn = await mongoose.connect(env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        mongoConnection = conn.connection;
        logger.info('MongoDB connected');
        return mongoConnection;
    } catch (error) {
        logger.error(`MongoDB connection failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

export async function getMongoDB(): Promise<Connection> {
    if (!mongoConnection || mongoConnection.readyState !== 1) {
        return connectMongoDB();
    }
    return mongoConnection;
}

export async function disconnectMongoDB(): Promise<void> {
    if (mongoConnection) {
        await mongoose.disconnect();
        mongoConnection = null;
    }
}

export default mongoose;
