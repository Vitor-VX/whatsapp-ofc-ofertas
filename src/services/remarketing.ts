import { getRedisClient } from '../config/redis';
import { User } from '../models/User';
import { whatsappService } from '../services/whatsapp';
import { FunnelEngine } from '../funnel/engine';
import { logger } from '../logger';
import * as petArtFunnel from '../funnel/funnels/pet-art.json';

/**
 * Remarketing Scheduler
 * Checks every 60 seconds for scheduled remarketing messages
 * Sends messages if the 24-hour window is still active
 */
export class RemarketingScheduler {
    private intervalId: NodeJS.Timeout | null = null;
    private checkIntervalMs = 60000; // 60 seconds

    /**
     * Start the scheduler
     */
    async start(): Promise<void> {
        logger.info('Starting remarketing scheduler...');

        this.intervalId = setInterval(async () => {
            try {
                await this.checkAndSendRemarketingMessages();
            } catch (error) {
                logger.error(`Remarketing check error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }, this.checkIntervalMs);
    }

    /**
     * Stop the scheduler
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Remarketing scheduler stopped');
        }
    }

    /**
     * Check for and send pending remarketing messages
     */
    private async checkAndSendRemarketingMessages(): Promise<void> {
        const redis = await getRedisClient();
        const now = Date.now();

        try {
            // Get all scheduled remarketing messages from Redis
            // We use a sorted set with score = timestamp when to send
            const pendingMessages = await redis.zRangeByScore(
                'remarketing:scheduled',
                0,
                now,
            );

            if (pendingMessages.length === 0) {
                return;
            }

            logger.debug(`Found ${pendingMessages.length} pending remarketing messages`);

            for (const messageKey of pendingMessages) {
                try {
                    // Get message data
                    const messageData = await redis.get(messageKey);
                    if (!messageData) {
                        // Message expired from cache
                        await redis.zRem('remarketing:scheduled', messageKey);
                        continue;
                    }

                    const { whatsappId, message, nodeId } = JSON.parse(messageData);

                    // Check if user still exists and is in the remarketing window
                    const user = await User.findOne({ whatsappId });
                    if (!user) {
                        // User deleted
                        await redis.del(messageKey);
                        await redis.zRem('remarketing:scheduled', messageKey);
                        continue;
                    }

                    // Check if the 24-hour window is still active
                    if (Date.now() > user.windowExpiresAt.getTime()) {
                        logger.debug(`Remarketing window expired for ${whatsappId}`);
                        await redis.del(messageKey);
                        await redis.zRem('remarketing:scheduled', messageKey);
                        continue;
                    }

                    // Check if user already paid
                    if (user.paymentStatus === 'paid') {
                        logger.debug(`User ${whatsappId} already paid, skipping remarketing`);
                        await redis.del(messageKey);
                        await redis.zRem('remarketing:scheduled', messageKey);
                        continue;
                    }

                    // Send remarketing message
                    const engine = FunnelEngine.loadFunnel(petArtFunnel as any);
                    const interpolatedMessage = engine.interpolateText(message, user);

                    await whatsappService.sendMessage(whatsappId, {
                        type: 'text',
                        body: interpolatedMessage,
                    });

                    logger.info(`Remarketing message sent to ${whatsappId}`);

                    // Update user
                    await User.updateOne(
                        { _id: user._id },
                        { remarketingSentAt: new Date() },
                    );

                    // Remove from scheduled set
                    await redis.del(messageKey);
                    await redis.zRem('remarketing:scheduled', messageKey);
                } catch (error) {
                    logger.error(`Error processing remarketing message ${messageKey}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        } catch (error) {
            logger.error(`Error in remarketing scheduler: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Schedule a remarketing message
     */
    async scheduleMessage(
        whatsappId: string,
        message: string,
        delayMs: number,
        nodeId: string,
    ): Promise<void> {
        const redis = await getRedisClient();
        const scheduleTime = Date.now() + delayMs;
        const messageKey = `remarketing:${whatsappId}:${scheduleTime}`;

        try {
            // Store message data
            await redis.set(
                messageKey,
                JSON.stringify({ whatsappId, message, nodeId }),
                {
                    EX: Math.ceil((delayMs + 86400000) / 1000), // Expire after delay + 1 day
                },
            );

            // Add to scheduled set
            await redis.zAdd('remarketing:scheduled', {
                score: scheduleTime,
                value: messageKey,
            });

            logger.debug(`Remarketing message scheduled for ${whatsappId} at ${new Date(scheduleTime)}`);
        } catch (error) {
            logger.error(`Failed to schedule remarketing message: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}

export const remarketingScheduler = new RemarketingScheduler();
