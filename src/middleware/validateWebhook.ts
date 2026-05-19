import { Request, Response, NextFunction } from 'express';
import { WhatsAppService } from '../services/whatsapp';
import { logger } from '../logger';

/**
 * Middleware to validate WhatsApp webhook signature
 */
export function validateWhatsAppWebhook(req: Request, res: Response, next: NextFunction): void {
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!signature) {
        logger.warn('WhatsApp webhook request missing signature');
        res.status(403).json({ error: 'Missing signature' });
        return;
    }

    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2) {
        res.status(403).json({ error: 'Invalid signature format' });
        return;
    }

    const [algorithm, hash] = signatureParts;

    // Get raw body
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    try {
        const isValid = WhatsAppService.verifyWebhookSignature(rawBody, hash, process.env.META_APP_SECRET || '');
        if (!isValid) {
            logger.warn('Invalid WhatsApp webhook signature');
            res.status(403).json({ error: 'Invalid signature' });
            return;
        }

        next();
    } catch (error) {
        logger.error(`Webhook validation error: ${error instanceof Error ? error.message : String(error)}`);
        res.status(403).json({ error: 'Validation failed' });
    }
}

/**
 * Middleware to validate Stripe webhook signature
 */
export function validateStripeWebhook(req: Request, res: Response, next: NextFunction): void {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
        logger.warn('Stripe webhook request missing signature');
        res.status(403).json({ error: 'Missing signature' });
        return;
    }

    // Stripe validation is handled in the route itself using stripe.webhooks.constructEvent
    next();
}

/**
 * Global error handler middleware
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
    logger.error(`Error: ${err.message}`);

    const statusCode = (err as any).statusCode || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
}
