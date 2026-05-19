import { Router, Request, Response } from 'express';
import { stripeService } from '../services/stripe';
import { User } from '../models/User';
import { publishMessage } from '../config/rabbitmq';
import { logger } from '../logger';
import Stripe from 'stripe';

const router = Router();

/**
 * POST /webhook/stripe - Receives payment events from Stripe
 */
router.post('/webhook/stripe', async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
        logger.warn('Stripe webhook missing signature');
        res.status(400).json({ error: 'Missing signature' });
        return;
    }

    try {
        // Verify and construct the event
        const event = stripeService.verifyWebhookSignature(
            (req as any).rawBody || JSON.stringify(req.body),
            signature,
        );

        // Acknowledge immediately
        res.status(200).json({ received: true });

        // Handle specific event types
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                logger.info(`Checkout session completed: ${session.id}`);

                // Extract metadata
                const whatsappId = session.metadata?.whatsappId;
                const userId = session.metadata?.userId;

                if (whatsappId && userId) {
                    // Update user payment status
                    await User.updateOne({ whatsappId }, { paymentStatus: 'paid', stripeSessionId: session.id });

                    // Publish event for processing
                    await publishMessage('payment_events', {
                        type: 'PAYMENT_SUCCESS',
                        whatsappId,
                        userId,
                        sessionId: session.id,
                        amount: session.amount_total,
                        currency: session.currency,
                        timestamp: new Date(),
                    });

                    logger.info(`Payment confirmed for ${whatsappId}`);
                }
                break;
            }

            case 'checkout.session.expired': {
                const session = event.data.object as Stripe.Checkout.Session;
                logger.info(`Checkout session expired: ${session.id}`);

                const whatsappId = session.metadata?.whatsappId;
                if (whatsappId) {
                    await publishMessage('payment_events', {
                        type: 'PAYMENT_EXPIRED',
                        whatsappId,
                        sessionId: session.id,
                        timestamp: new Date(),
                    });
                }
                break;
            }

            case 'charge.failed': {
                const charge = event.data.object as Stripe.Charge;
                logger.warn(`Charge failed: ${charge.id}`);

                // Find user by charge metadata or customer
                const whatsappId = charge.metadata?.whatsappId;
                if (whatsappId) {
                    await User.updateOne({ whatsappId }, { paymentStatus: 'failed' });

                    await publishMessage('payment_events', {
                        type: 'PAYMENT_FAILED',
                        whatsappId,
                        chargeId: charge.id,
                        failureReason: charge.failure_message,
                        timestamp: new Date(),
                    });

                    logger.error(`Payment failed for ${whatsappId}: ${charge.failure_message}`);
                }
                break;
            }

            case 'charge.refunded': {
                const charge = event.data.object as Stripe.Charge;
                logger.info(`Charge refunded: ${charge.id}`);

                const whatsappId = charge.metadata?.whatsappId;
                if (whatsappId) {
                    await publishMessage('payment_events', {
                        type: 'PAYMENT_REFUNDED',
                        whatsappId,
                        chargeId: charge.id,
                        timestamp: new Date(),
                    });
                }
                break;
            }

            default:
                logger.debug(`Unhandled Stripe event type: ${event.type}`);
        }
    } catch (error) {
        logger.error(`Stripe webhook error: ${error instanceof Error ? error.message : String(error)}`);
        res.status(400).json({ error: 'Webhook error' });
    }
});

export default router;
