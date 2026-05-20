import axios, { AxiosInstance } from 'axios';
import { getEnv } from '../config/env';
import { logger } from '../logger';
import crypto from "crypto";

interface WhatsAppMessage {
    type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'interactive';
    body?: string;
    image?: { link: string };
    audio?: { link: string };
    video?: { link: string };
    caption?: string;
    interactive?: any;
}

interface PixDynamicCode {
    code: string;
    merchant_name: string;
    key: string;
    key_type: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
}

interface OrderItem {
    retailer_id: string;
    name: string;
    amount: {
        value: number;
        offset: number;
    };
    quantity: number;
}

interface PixPaymentOptions {
    referenceId: string;
    bodyText: string;
    totalAmount: number;
    pix: PixDynamicCode;
    order?: {
        items: OrderItem[];
        subtotal: number;
        tax?: number;
        taxDescription?: string;
    };
}

export class WhatsAppService {
    private client: AxiosInstance;
    private phoneNumberId: string;
    private accessToken: string;

    constructor() {
        const env = getEnv();
        this.phoneNumberId = env.META_PHONE_NUMBER_ID;
        this.accessToken = env.META_ACCESS_TOKEN;

        this.client = axios.create({
            baseURL: `https://graph.facebook.com/v23.0/${this.phoneNumberId}/messages`,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Send message to user
     */
    async sendMessage(phoneNumber: string, message: WhatsAppMessage): Promise<void> {
        try {
            const payload: any = {
                messaging_product: 'whatsapp',
                to: phoneNumber.replace(/\D/g, ''),
                type: message.type,
            };

            switch (message.type) {
                case 'text':
                    payload.text = { body: message.body };
                    break;
                case 'image':
                    payload.image = message.image;
                    if (message.caption) {
                        payload.image.caption = message.caption;
                    }
                    break;
                case 'audio':
                    payload.audio = message.audio;
                    break;
                case 'video':
                    payload.video = message.video;
                    if (message.caption) {
                        payload.video.caption = message.caption;
                    }
                    break;
                case 'interactive':
                    payload.interactive = message.interactive;
                    break;
            }

            await this.client.post('', payload);
            logger.debug(`Message sent to ${phoneNumber}`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to send message to ${phoneNumber}: ${errorMsg}`);
            throw error;
        }
    }

    /**
     * Send PIX payment button (botão de pagamento via Pix)
     */
    async sendPixPayment(phoneNumber: string, options: PixPaymentOptions): Promise<void> {
        try {
            const { referenceId, bodyText, totalAmount, pix, order } = options;

            const parameters: any = {
                reference_id: referenceId,
                type: 'digital-goods',
                payment_type: 'br',
                payment_settings: [
                    {
                        type: 'pix_dynamic_code',
                        pix_dynamic_code: {
                            code: pix.code,
                            merchant_name: pix.merchant_name,
                            key: pix.key,
                            key_type: pix.key_type,
                        },
                    },
                ],
                currency: 'BRL',
                total_amount: {
                    value: totalAmount,
                    offset: 100,
                },
            };

            if (order) {
                parameters.order = {
                    status: 'pending',
                    tax: {
                        value: order.tax ?? 0,
                        offset: 100,
                        description: order.taxDescription ?? '',
                    },
                    items: order.items.map((item) => ({
                        retailer_id: item.retailer_id,
                        name: item.name,
                        amount: {
                            value: item.amount.value,
                            offset: item.amount.offset,
                        },
                        quantity: item.quantity,
                    })),
                    subtotal: {
                        value: order.subtotal,
                        offset: 100,
                    },
                };
            }

            const payload = {
                recipient_type: 'individual',
                messaging_product: 'whatsapp',
                to: phoneNumber.replace(/\D/g, ''),
                type: 'interactive',
                interactive: {
                    type: 'order_details',
                    body: {
                        text: bodyText,
                    },
                    action: {
                        name: 'review_and_pay',
                        parameters,
                    },
                },
            };

            await this.client.post('', payload);
            logger.debug(`PIX payment sent to ${phoneNumber} — ref: ${referenceId}`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to send PIX payment to ${phoneNumber}: ${errorMsg}`);
            throw error;
        }
    }

    /**
     * Mark message as read and show typing indicator
     * Use messageId from the incoming webhook (messages.id)
     * Typing indicator is automatically removed after reply or 25 seconds
     */
    async sendChatAction(messageId: string): Promise<void> {
        try {
            await this.client.post('', {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId,
                typing_indicator: {
                    type: 'text',
                },
            });

            logger.debug(`Typing indicator sent for message ${messageId}`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.debug(`Failed to send typing indicator: ${errorMsg}`);
        }
    }

    /**
     * Download media from Meta
     */
    async downloadMedia(mediaId: string): Promise<Buffer> {
        try {
            const mediaUrl = await this.getMediaUrl(mediaId);
            const response = await axios.get(mediaUrl, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
                responseType: 'arraybuffer',
            });
            return Buffer.from(response.data);
        } catch (error) {
            logger.error(`Failed to download media ${mediaId}: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get media download URL
     */
    private async getMediaUrl(mediaId: string): Promise<string> {
        try {
            const response = await axios.get(`https://graph.facebook.com/v23.0/${mediaId}`, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });
            return response.data.url;
        } catch (error) {
            logger.error(`Failed to get media URL: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Verify webhook signature
     */
    static verifyWebhookSignature(
        body: string,
        signature: string,
        appSecret: string,
    ): boolean {
        const hash = crypto
            .createHmac('sha256', appSecret)
            .update(body)
            .digest('hex');
        return hash === signature;
    }
}

export const whatsappService = new WhatsAppService();
