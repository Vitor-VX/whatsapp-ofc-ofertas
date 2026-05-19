import { Router, Request, Response } from 'express';
import { validateWhatsAppWebhook } from '../middleware/validateWebhook';
import { publishMessage } from '../config/rabbitmq';
import { logger } from '../logger';

const router = Router();

/**
 * GET /webhook/whatsapp - Webhook verification challenge from Meta
 */
router.get('/webhook/whatsapp', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.status(403).json({ error: 'Forbidden' });
    }
});

/**
 * POST /webhook/whatsapp - Receives messages and events from Meta
 */
router.post('/webhook/whatsapp', validateWhatsAppWebhook, async (req: Request, res: Response) => {
    try {
        const body = req.body;

        // Acknowledge immediately to Meta (must respond within 30 seconds)
        res.status(200).json({ status: 'received' });

        // Process webhook asynchronously
        if (body.entry && Array.isArray(body.entry)) {
            for (const entry of body.entry) {
                if (entry.changes && Array.isArray(entry.changes)) {
                    for (const change of entry.changes) {
                        if (change.value && change.value.messages) {
                            // Handle incoming messages
                            for (const message of change.value.messages) {
                                const from = message.from;
                                const messageType = message.type;
                                const messageId = message.id;

                                logger.info(`Incoming message from ${from} (type: ${messageType})`);

                                // Publish to RabbitMQ for async processing
                                await publishMessage('whatsapp_inbound', {
                                    from,
                                    messageId,
                                    type: messageType,
                                    timestamp: message.timestamp,
                                    text: message.text?.body || null,
                                    image: message.image || null,
                                    audio: message.audio || null,
                                    video: message.video || null,
                                    document: message.document || null,
                                    interactive: message.interactive || null,
                                    button: message.button || null,
                                    contacts: message.contacts || null,
                                    location: message.location || null,
                                });

                                // Log user message
                                if (messageType === 'text') {
                                    logger.userMessage(from, message.text?.body || '');
                                } else {
                                    logger.userMessage(from, `[${messageType.toUpperCase()}]`);
                                }
                            }
                        }

                        // Handle message status updates
                        if (change.value && change.value.statuses) {
                            for (const status of change.value.statuses) {
                                logger.debug(
                                    `Message status update: ${status.id} -> ${status.status} (${status.recipient_id})`,
                                );
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.error(`Error processing webhook: ${error instanceof Error ? error.message : String(error)}`);
    }
});

export default router;
