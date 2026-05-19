import amqp, { Connection, Channel, ConsumeMessage, ChannelModel } from 'amqplib';
import { getEnv } from './env';
import { logger } from '../logger';

let rabbitmqConnection: ChannelModel | null = null;
let rabbitmqChannel: Channel | null = null;

const QUEUE_CONFIG = {
    whatsapp_inbound: {
        name: 'whatsapp.inbound.v1',
        options: {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': 'dlx',
                'x-dead-letter-routing-key': 'whatsapp.inbound.v1',
                'x-max-length': 10000,
            },
        },
    },
    whatsapp_outbound: {
        name: 'whatsapp.outbound',
        options: { durable: true },
    },
    payment_events: {
        name: 'payment.events',
        options: { durable: true },
    },
    whatsapp_inbound_dlq: {
        name: 'whatsapp.inbound.dlq',
        options: { durable: true },
    },
};

export async function connectRabbitMQ(): Promise<{ connection: ChannelModel; channel: Channel }> {
    if (rabbitmqConnection && rabbitmqChannel) {
        return { connection: rabbitmqConnection, channel: rabbitmqChannel };
    }

    const env = getEnv();

    try {
        rabbitmqConnection = await amqp.connect(env.RABBITMQ_URL);
        rabbitmqChannel = await rabbitmqConnection.createChannel();

        await rabbitmqChannel.prefetch(1);

        for (const queueConfig of Object.values(QUEUE_CONFIG)) {
            await rabbitmqChannel.assertQueue(queueConfig.name, queueConfig.options);
        }

        await rabbitmqChannel.assertExchange('dlx', 'direct', { durable: true });
        await rabbitmqChannel.bindQueue(
            QUEUE_CONFIG.whatsapp_inbound_dlq.name,
            'dlx',
            QUEUE_CONFIG.whatsapp_inbound.name,
        );

        rabbitmqConnection.on('error', (err) => {
            logger.error(`RabbitMQ error: ${err.message}`);
            rabbitmqConnection = null;
            rabbitmqChannel = null;
        });

        rabbitmqConnection.on('close', () => {
            logger.warn('RabbitMQ connection closed');
            rabbitmqConnection = null;
            rabbitmqChannel = null;
        });

        logger.info('RabbitMQ connected');
        return { connection: rabbitmqConnection, channel: rabbitmqChannel };
    } catch (error) {
        logger.error(`RabbitMQ connection failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

export async function getRabbitMQChannel(): Promise<Channel> {
    if (!rabbitmqChannel) {
        const { channel } = await connectRabbitMQ();
        return channel;
    }
    return rabbitmqChannel;
}

export async function publishMessage(
    queueName: keyof typeof QUEUE_CONFIG,
    message: Record<string, any>,
): Promise<void> {
    const channel = await getRabbitMQChannel();
    const queue = QUEUE_CONFIG[queueName];

    const messageBuffer = Buffer.from(JSON.stringify(message));
    channel.sendToQueue(queue.name, messageBuffer, {
        persistent: true,
        deliveryMode: 2,
    });
}

export async function consumeQueue(
    queueName: keyof typeof QUEUE_CONFIG,
    handler: (msg: ConsumeMessage | null) => Promise<void>,
    options?: { autoAck?: boolean },
): Promise<void> {
    const channel = await getRabbitMQChannel();
    const queue = QUEUE_CONFIG[queueName];

    await channel.consume(
        queue.name,
        async (msg) => {
            if (msg) {
                try {
                    await handler(msg);
                    if (!options?.autoAck) {
                        channel.ack(msg);
                    }
                } catch (error) {
                    logger.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
                    // Nack with requeue (will retry, and eventually DLQ after x-death limit)
                    channel.nack(msg, false, true);
                }
            }
        },
        { noAck: options?.autoAck ?? false },
    );
}

export async function disconnectRabbitMQ(): Promise<void> {
    if (rabbitmqChannel) {
        await rabbitmqChannel.close();
        rabbitmqChannel = null;
    }
    if (rabbitmqConnection) {
        await rabbitmqConnection.close();
        rabbitmqConnection = null;
    }
}

export default { connectRabbitMQ, getRabbitMQChannel, publishMessage, consumeQueue, disconnectRabbitMQ };
