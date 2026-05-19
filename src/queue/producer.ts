import { publishMessage } from '../config/rabbitmq';
import { logger } from '../logger';

export interface QueueMessage {
  type: string;
  payload: any;
  timestamp: Date;
  retries?: number;
}

/**
 * Publish a message to the whatsapp inbound queue
 */
export async function publishWhatsAppMessage(payload: any): Promise<void> {
  try {
    await publishMessage('whatsapp_inbound', {
      type: 'incoming_message',
      payload,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to publish WhatsApp message: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Publish a payment event
 */
export async function publishPaymentEvent(payload: any): Promise<void> {
  try {
    await publishMessage('payment_events', {
      type: 'payment_event',
      payload,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to publish payment event: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Publish an outbound message to be sent to user
 */
export async function publishOutboundMessage(whatsappId: string, message: any): Promise<void> {
  try {
    await publishMessage('whatsapp_outbound', {
      whatsappId,
      message,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error(`Failed to publish outbound message: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
