import Stripe from 'stripe';
import { getEnv } from '../config/env';
import { logger } from '../logger';

export class StripeService {
    private stripe: Stripe;
    private priceId: string;

    constructor() {
        const env = getEnv();
        this.stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            apiVersion: "2023-08-16"
        });
        this.priceId = env.STRIPE_PRICE_ID;
    }

    /**
     * Create a payment link for the pet art product
     */
    async createPaymentLink(whatsappId: string, userId: string, petName: string): Promise<string> {
        try {
            const paymentLink = await this.stripe.paymentLinks.create({
                line_items: [
                    {
                        price: this.priceId,
                        quantity: 1,
                    },
                ],
                metadata: {
                    whatsappId,
                    userId,
                    petName,
                },
                after_completion: {
                    type: 'redirect',
                    redirect: {
                        url: 'https://your-domain.com/success?sessionId={CHECKOUT_SESSION_ID}',
                    },
                },
            });

            logger.info(`Payment link created for ${whatsappId}: ${paymentLink.url}`);
            return paymentLink.url;
        } catch (error) {
            logger.error(`Failed to create payment link: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(body: string, signature: string): Stripe.Event {
        try {
            const env = getEnv();
            const event = this.stripe.webhooks.constructEvent(
                body,
                signature,
                env.STRIPE_WEBHOOK_SECRET,
            );
            return event;
        } catch (error) {
            logger.error(`Failed to verify webhook: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get checkout session
     */
    async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
        try {
            return await this.stripe.checkout.sessions.retrieve(sessionId);
        } catch (error) {
            logger.error(`Failed to retrieve checkout session: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get payment intent
     */
    async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
        try {
            return await this.stripe.paymentIntents.retrieve(paymentIntentId);
        } catch (error) {
            logger.error(`Failed to retrieve payment intent: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Refund a payment
     */
    async refundPayment(paymentIntentId: string): Promise<Stripe.Refund> {
        try {
            return await this.stripe.refunds.create({
                payment_intent: paymentIntentId,
            });
        } catch (error) {
            logger.error(`Failed to refund payment: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}

export const stripeService = new StripeService();
