import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { User } from '../models/User';
import { publishMessage } from '../config/rabbitmq';
import { logger } from '../logger';
import { getEnv } from '../config/env';

const router = Router();

const MP_ACCESS_TOKEN = getEnv().MERCADOPAGO_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = getEnv().MERCADOPAGO_WEBHOOK_SECRET;

/**
 * Verifica a assinatura do webhook do Mercado Pago
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
function verifyMercadoPagoSignature(req: Request): boolean {
    try {
        const xSignature = req.headers['x-signature'] as string;
        const xRequestId = req.headers['x-request-id'] as string;
        const dataId = (req.query['data.id'] || req.body?.data?.id) as string;

        if (!xSignature || !xRequestId || !dataId) return false;

        const parts = Object.fromEntries(xSignature.split(',').map(p => p.split('=')));
        const ts = parts['ts'];
        const v1 = parts['v1'];

        if (!ts || !v1) return false;
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

        const expectedHash = crypto
            .createHmac('sha256', MP_WEBHOOK_SECRET)
            .update(manifest)
            .digest('hex');

        return expectedHash === v1;
    } catch {
        return false;
    }
}

/**
 * Busca os detalhes do pagamento na API do Mercado Pago
 */
async function fetchPaymentDetails(paymentId: string) {
    const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    return response.data;
}

/**
 * POST /webhook/mercadopago - Recebe eventos de pagamento do Mercado Pago
 */
router.post('/webhook/mercadopago', async (req: Request, res: Response) => {
    if (!verifyMercadoPagoSignature(req)) {
        logger.warn('Mercado Pago webhook: assinatura inválida');
        res.status(400).json({ error: 'Invalid signature' });
        return;
    }

    res.status(200).json({ received: true });

    const topic = req.query.topic || req.body?.type;
    const dataId = (req.query['data.id'] || req.body?.data?.id) as string;

    try {
        if (topic !== 'payment' && topic !== 'payment_intent') {
            logger.debug(`Webhook MP ignorado: topic=${topic}`);
            return;
        }

        if (!dataId) {
            logger.warn('Webhook MP: data.id ausente');
            return;
        }

        const payment = await fetchPaymentDetails(dataId);

        const whatsappId = payment.metadata?.whatsapp_id;
        const userId = payment.metadata?.user_id;

        logger.info(`Webhook MP | status=${payment.status} | payment_id=${payment.id}`);

        switch (payment.status) {
            case 'approved': {
                if (whatsappId && userId) {
                    await publishMessage('payment_events', {
                        type: 'PAYMENT_SUCCESS',
                        whatsappId,
                        userId,
                        paymentId: payment.id,
                        amount: payment.transaction_amount,
                        currency: payment.currency_id,
                        timestamp: new Date(),
                    });

                    logger.info(`Pagamento aprovado para ${whatsappId}`);
                }
                break;
            }

            case 'pending':
            case 'in_process': {
                if (whatsappId) {
                    await publishMessage('payment_events', {
                        type: 'PAYMENT_PENDING',
                        whatsappId,
                        paymentId: payment.id,
                        paymentMethod: payment.payment_type_id,
                        timestamp: new Date(),
                    });

                    logger.info(`Pagamento pendente para ${whatsappId}`);
                }
                break;
            }

            case 'rejected': {
                if (whatsappId) {
                    await User.updateOne({ whatsappId }, { paymentStatus: 'failed' });

                    await publishMessage('payment_events', {
                        type: 'PAYMENT_FAILED',
                        whatsappId,
                        paymentId: payment.id,
                        failureReason: payment.status_detail,
                        timestamp: new Date(),
                    });

                    logger.error(`Pagamento rejeitado para ${whatsappId}: ${payment.status_detail}`);
                }
                break;
            }

            case 'cancelled': {
                if (whatsappId) {
                    await publishMessage('payment_events', {
                        type: 'PAYMENT_EXPIRED',
                        whatsappId,
                        paymentId: payment.id,
                        timestamp: new Date(),
                    });

                    logger.info(`Pagamento cancelado/expirado para ${whatsappId}`);
                }
                break;
            }

            case 'refunded':
            case 'charged_back': {
                if (whatsappId) {
                    await publishMessage('payment_events', {
                        type: 'PAYMENT_REFUNDED',
                        whatsappId,
                        paymentId: payment.id,
                        timestamp: new Date(),
                    });

                    logger.info(`Pagamento reembolsado para ${whatsappId}`);
                }
                break;
            }

            default:
                logger.debug(`Status MP não tratado: ${payment.status}`);
        }
    } catch (error) {
        logger.error(`Erro no webhook MP: ${error instanceof Error ? error.message : String(error)}`);
    }
});

export default router;