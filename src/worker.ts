import { connectMongoDB } from './config/mongodb';
import { connectRedis } from './config/redis';
import { connectRabbitMQ } from './config/rabbitmq';
import { startConsumer } from './queue/consumer';
import { logger } from './logger';
import { whatsappService } from './services/whatsapp';

/**
 * Worker process - handles background job processing
 * This runs independently from the main API server
 */
async function startWorker(): Promise<void> {
  try {
    logger.info('Starting WhatsApp Pet Art Worker...');

    // Connect to databases
    await connectMongoDB();
    await connectRedis();
    await connectRabbitMQ();

    // Start consuming messages from RabbitMQ
    await startConsumer();

    logger.info('Worker started successfully');
  } catch (error) {
    logger.error(
      `Failed to start worker: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker gracefully...');
  process.exit(0);
});

// Start the worker
startWorker().catch((error) => {
  logger.error(`Startup error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
