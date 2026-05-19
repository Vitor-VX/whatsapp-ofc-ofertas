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
     * Send chat action (typing indicator, recording audio indicator)
     */
    async sendChatAction(phoneNumber: string, action: 'typing' | 'recording_audio'): Promise<void> {
        try {
            const payload = {
                messaging_product: 'whatsapp',
                to: phoneNumber.replace(/\D/g, ''),
                type: 'text',
                text: {
                    preview_url: false,
                },
            };

            await this.client.post('', {
                ...payload,
                status: action === 'typing' ? 'typing' : 'recording',
            });

            logger.debug(`Chat action sent: ${action} to ${phoneNumber}`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.debug(`Failed to send chat action: ${errorMsg}`);
            // Don't throw - chat actions are optional
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
