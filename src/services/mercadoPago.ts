import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { getEnv } from '../config/env';
import { logger } from '../logger';

export class MercadoPagoService {
    private client: MercadoPagoConfig;
    private payment: Payment;
    private preference: Preference;
    private amount: number;

    constructor() {
        const env = getEnv();
        this.client = new MercadoPagoConfig({
            accessToken: env.MERCADOPAGO_ACCESS_TOKEN,
        });
        this.payment = new Payment(this.client);
        this.preference = new Preference(this.client);
        this.amount = Number(env.MERCADOPAGO_AMOUNT);
    }

    /**
     * Create a PIX payment (expires in 30 min)
     */
    async createPixPayment(whatsappId: string, userId: string, amount: number, petName: string): Promise<{
        code: string;
        qrCodeBase64: string;
        paymentId: string;
        expiresAt: string;
    }> {
        try {
            const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
            const response = await this.payment.create({
                body: {
                    transaction_amount: amount,
                    description: `Arte Digital - ${petName}`,
                    payment_method_id: 'pix',
                    date_of_expiration: expiresAt,
                    payer: {
                        email: `${whatsappId}@gmail.com`,
                    },
                    metadata: {
                        whatsapp_id: whatsappId,
                        user_id: userId,
                        pet_name: petName,
                    },
                },
            });

            const txInfo = response.point_of_interaction?.transaction_data;

            if (!txInfo?.qr_code || !txInfo?.qr_code_base64) {
                throw new Error('PIX data not returned from MercadoPago');
            }

            logger.info(`PIX payment created for ${whatsappId}: ${response.id}`);

            return {
                code: txInfo.qr_code,
                qrCodeBase64: txInfo.qr_code_base64,
                paymentId: String(response.id),
                expiresAt,
            };
        } catch (error) {
            console.log(error);

            logger.error(`Failed to create PIX payment: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Create a preference link (checkout page - card, boleto, pix)
     */
    async createPaymentLink(whatsappId: string, userId: string, petName: string): Promise<string> {
        try {
            const env = getEnv();

            const response = await this.preference.create({
                body: {
                    items: [
                        {
                            id: 'pet-art',
                            title: `Arte Digital - ${petName}`,
                            quantity: 1,
                            unit_price: this.amount,
                            currency_id: 'BRL',
                        },
                    ],
                    metadata: {
                        whatsapp_id: whatsappId,
                        user_id: userId,
                        pet_name: petName,
                    },
                    auto_return: 'approved',
                    notification_url: `${env.APP_URL}/mercadopago/webhook`,
                    expires: true,
                    expiration_date_from: new Date().toISOString(),
                    expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                },
            });

            if (!response.init_point) {
                throw new Error('Payment link not returned from MercadoPago');
            }

            logger.info(`Payment link created for ${whatsappId}: ${response.init_point}`);
            return response.init_point;
        } catch (error) {
            logger.error(`Failed to create payment link: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    async createCheckoutPreference(params: {
        title: string;
        price: number;
        whatsappId: string;
        userId: string;
    }) {
        const env = getEnv();
        const preference = new Preference(this.client);
        const response = await preference.create({
            body: {
                items: [
                    {
                        id: "combo-2-musicas",
                        title: params.title,
                        quantity: 1,
                        unit_price: params.price,
                        currency_id: "BRL",
                    },
                ],
                payment_methods: {
                    installments: 6,
                },
                metadata: {
                    whatsapp_id: params.whatsappId,
                    user_id: params.userId
                },
                external_reference: params.whatsappId,
                notification_url: `${env.APP_URL}/webhook/mercadopago`
            },
        });

        return {
            initPoint: response.init_point as string,
            preferenceId: response.id as string,
        };
    }

    /**
     * Get payment by ID
     */
    async getPayment(paymentId: string): Promise<any> {
        try {
            return await this.payment.get({ id: paymentId });
        } catch (error) {
            logger.error(`Failed to get payment: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Verify if payment is approved
     */
    async isPaymentApproved(paymentId: string): Promise<boolean> {
        try {
            const payment = await this.getPayment(paymentId);
            return payment.status === 'approved';
        } catch (error) {
            logger.error(`Failed to verify payment: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Verify webhook notification
     * MercadoPago sends x-signature header
     */
    verifyWebhookSignature(
        xSignature: string,
        xRequestId: string,
        dataId: string,
    ): boolean {
        try {
            const env = getEnv();
            const crypto = require('crypto');

            const manifest = `id:${dataId};request-id:${xRequestId};ts:${xSignature.split(',')[0].split('=')[1]};`;
            const [, v1Part] = xSignature.split(',');
            const receivedHash = v1Part?.split('=')[1];

            const expectedHash = crypto
                .createHmac('sha256', env.MERCADOPAGO_WEBHOOK_SECRET)
                .update(manifest)
                .digest('hex');

            return expectedHash === receivedHash;
        } catch (error) {
            logger.error(`Failed to verify webhook signature: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Refund a payment
     */
    async refundPayment(paymentId: string): Promise<void> {
        try {
            // MercadoPago SDK v2 refund via payment refund endpoint
            const response = await fetch(
                `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${getEnv().MERCADOPAGO_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            if (!response.ok) {
                throw new Error(`Refund failed: ${response.statusText}`);
            }

            logger.info(`Payment ${paymentId} refunded`);
        } catch (error) {
            logger.error(`Failed to refund payment: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}

export const mercadoPagoService = new MercadoPagoService();