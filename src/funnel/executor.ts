import { IUser } from '../models/User';
import {
    FunnelNode,
    ActionNode,
    isWaitingNode,
    isSequentialNode,
    isActionNode as checkIsActionNode,
} from './nodeTypes';
import { FunnelEngine } from './engine';
import { logger } from '../logger';
import { User } from '../models/User';
import { randomUUID } from 'crypto';

/**
 * Context passed to node executors
 */
export interface FunnelContext {
    engine: FunnelEngine;
    user: IUser;
    whatsappService: any;
    geminiService: any;
    stripeService: any;
    watermarkService: any;
    messageId: string;
}

/**
 * Type for action handlers
 */
export type ActionHandler = (node: ActionNode, user: IUser, ctx: FunnelContext) => Promise<void>;

/**
 * Action Registry - pluggable system for custom actions
 */
class ActionRegistry {
    private handlers: Map<string, ActionHandler> = new Map();

    register(actionName: string, handler: ActionHandler): void {
        this.handlers.set(actionName, handler);
        logger.debug(`Action registered: ${actionName}`);
    }

    get(actionName: string): ActionHandler | undefined {
        return this.handlers.get(actionName);
    }

    has(actionName: string): boolean {
        return this.handlers.has(actionName);
    }

    getAll(): Map<string, ActionHandler> {
        return this.handlers;
    }
}

export const actionRegistry = new ActionRegistry();

/**
 * Executor - Executes individual nodes in the funnel
 */
export class FunnelExecutor {
    constructor(private context: FunnelContext) { }

    /**
     * Execute a node and return the next node ID (or null if terminal)
     */
    async execute(node: FunnelNode): Promise<string | null> {
        logger.debug(`Executing node: ${node.id} (type: ${node.type})`);

        switch (node.type) {
            case 'text':
                return await this.executeText(node);
            case 'image':
                return await this.executeImage(node);
            case 'audio':
                return await this.executeAudio(node);
            case 'cards':
                return await this.executeCards(node);
            case 'pix':
                return await this.executePix(node);
            case 'video':
                return await this.executeVideo(node);
            case 'delay':
                return await this.executeDelay(node);
            case 'typing':
                return await this.executeTyping(node);
            case 'buttons':
                return await this.executeButtons(node);
            case 'list':
                return await this.executeList(node);
            case 'waitInput':
                return await this.executeWaitInput(node);
            case 'waitPhoto':
                return await this.executeWaitPhoto(node);
            case 'action':
                return await this.executeAction(node);
            case 'remarketing':
                return await this.executeRemarketing(node);
            case 'end':
                return null;
            default:
                logger.warn(`Unknown node type: ${(node as any).type}`);
                return null;
        }
    }

    /**
     * Send text message to user
     */
    private async executeText(node: any): Promise<string | null> {
        const content = this.context.engine.interpolateText(node.content, this.context.user);

        try {
            await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                type: 'text',
                body: content,
            });
            logger.botMessage(this.context.user.phone, content.substring(0, 100) + '...');
        } catch (error) {
            logger.error(`Failed to send text message: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        return node.nextNode || null;
    }

    /**
     * Send image to user
     */
    private async executeImage(node: any): Promise<string | null> {
        const url = this.context.engine.interpolateText(node.url, this.context.user);
        const caption = node.caption
            ? this.context.engine.interpolateText(node.caption, this.context.user)
            : undefined;

        try {
            await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                type: 'image',
                image: { link: url },
                caption,
            });
            logger.botMessage(this.context.user.phone, `[IMAGE] ${caption || url}`);
        } catch (error) {
            logger.error(`Failed to send image: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        return node.nextNode || null;
    }

    /**
     * Send CARDS to user
     */
    private async executeCards(node: any): Promise<string | null> {
        const body = this.context.engine.interpolateText(node.body, this.context.user);
        const cards = node.cards || [];

        try {
            await this.context.whatsappService.sendCarousel(this.context.user.whatsappId, {
                bodyText: body,
                cards: cards
           });
            logger.botMessage(this.context.user.phone, `[CARDS] ${body}`);
        } catch (error) {
            logger.error(`Failed to send image: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        return null;
    }

    /**
     * Send audio to user
     */
    private async executeAudio(node: any): Promise<string | null> {
        try {
            await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                type: 'audio',
                audio: { link: node.url },
            });
            logger.botMessage(this.context.user.phone, `[AUDIO] ${node.url}`);
        } catch (error) {
            logger.error(`Failed to send audio: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        return node.nextNode || null;
    }

    private async executePix(node: any): Promise<string | null> {
        try {
            if (node.content && node.namePix && node.key && node.keyType) {
                const content = this.context.engine.interpolateText(node.content, this.context.user);
                const name = node.namePix;
                const key = node.key;
                const keyType = node.keyType;
                const price = this.context.engine.interpolateText(node.price, this.context.user)

                await this.context.whatsappService.sendPixPayment(this.context.user.whatsappId, {
                    referenceId: randomUUID().toString(),
                    bodyText: 'Seu pagamento está pronto!',
                    totalAmount: price,
                    pix: {
                        code: content,
                        merchant_name: name,
                        key,
                        key_type: keyType,
                    },
                });
                logger.botMessage(this.context.user.phone, `[PIX] ${node.key}`);
            }
        } catch (error) {
            logger.error(`Failed to send pix: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        return node.nextNode || null;
    }

    /**
     * Send video to user
     */
    private async executeVideo(node: any): Promise<string | null> {
        const caption = node.caption
            ? this.context.engine.interpolateText(node.caption, this.context.user)
            : undefined;

        try {
            await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                type: 'video',
                video: { link: node.url },
                caption,
            });
            logger.botMessage(this.context.user.phone, `[VIDEO] ${caption || node.url}`);
        } catch (error) {
            logger.error(`Failed to send video: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        return node.nextNode || null;
    }

    /**
     * Delay before moving to next node
     */
    private async executeDelay(node: any): Promise<string | null> {
        await new Promise((resolve) => setTimeout(resolve, node.ms));
        return node.nextNode || null;
    }

    /**
     * Show typing indicator
     */
    private async executeTyping(node: any): Promise<string | null> {
        try {
            if (this.context.messageId) {
                await this.context.whatsappService.sendChatAction(this.context.messageId);
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        } catch (error) {
            logger.error(`Failed to send typing indicator: ${error instanceof Error ? error.message : String(error)}`);
        }
        return node.nextNode || null;
    }

    /**
     * Send button options
     */
    private async executeButtons(node: any): Promise<string | null> {
        const body = this.context.engine.interpolateText(node.body, this.context.user);

        try {
            await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: body },
                    action: {
                        buttons: node.buttons.map((btn: any) => ({
                            type: 'reply',
                            reply: {
                                id: btn.id,
                                title: btn.title,
                            },
                        })),
                    },
                },
            });
            logger.botMessage(this.context.user.phone, `[BUTTONS] ${body}`);
        } catch (error) {
            logger.error(`Failed to send buttons: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        // IMPORTANT: Buttons require user interaction. Return null to pause here.
        // The next node will be determined when the user clicks a button.
        return null;
    }

    /**
     * Send list options
     */
    private async executeList(node: any): Promise<string | null> {
        const body = this.context.engine.interpolateText(node.body, this.context.user);

        try {
            await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                type: 'interactive',
                interactive: {
                    type: 'list',
                    body: { text: body },
                    action: {
                        button: node.buttonText,
                        sections: node.sections.map((section: any) => ({
                            title: section.title,
                            rows: section.rows.map((row: any) => ({
                                id: row.id,
                                title: row.title,
                                description: row.description,
                            })),
                        })),
                    },
                },
            });
            logger.botMessage(this.context.user.phone, `[LIST] ${body}`);
        } catch (error) {
            logger.error(`Failed to send list: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        // IMPORTANT: Lists require user interaction. Return null to pause here.
        return null;
    }

    /**
     * Wait for user text input
     */
    private async executeWaitInput(node: any): Promise<string | null> {
        if (node.content) {
            const content = this.context.engine.interpolateText(node.content, this.context.user);
            try {
                await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                    type: 'text',
                    body: content,
                });
                logger.botMessage(this.context.user.phone, content.substring(0, 100) + '...');
            } catch (error) {
                logger.error(`Failed to send waitInput prompt: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Mark user as waiting for input
        await User.updateOne({ _id: this.context.user._id }, { $set: { currentNodeId: node.id } });

        // Return null to pause execution - the next message from user will resume
        return null;
    }

    /**
     * Wait for user to send a photo
     */
    private async executeWaitPhoto(node: any): Promise<string | null> {
        if (node.content) {
            const content = this.context.engine.interpolateText(node.content, this.context.user);
            try {
                await this.context.whatsappService.sendMessage(this.context.user.whatsappId, {
                    type: 'text',
                    body: content,
                });
                logger.botMessage(this.context.user.phone, content.substring(0, 100) + '...');
            } catch (error) {
                logger.error(`Failed to send waitPhoto prompt: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Mark user as waiting for photo
        await User.updateOne({ _id: this.context.user._id }, { $set: { currentNodeId: node.id } });

        // Return null to pause execution
        return null;
    }

    /**
     * Execute custom action (pluggable)
     */
    private async executeAction(node: ActionNode): Promise<string | null> {
        const handler = actionRegistry.get(node.action);

        if (!handler) {
            logger.error(`Action handler not found: ${node.action}`);
            throw new Error(`Action handler not found: ${node.action}`);
        }

        try {
            await handler(node, this.context.user, this.context);
        } catch (error) {
            logger.error(`Action failed: ${node.action} - ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }

        return node.nextNode || null;
    }

    /**
     * Schedule remarketing message
     */
    private async executeRemarketing(node: any): Promise<string | null> {
        try {
            const message = this.context.engine.interpolateText(node.message, this.context.user);

            // Schedule the message using Redis scheduler
            // This is handled by the remarketing scheduler service
            logger.info(`Remarketing scheduled for user ${this.context.user.whatsappId}`);

            // In a real implementation, we would use the remarketingScheduler here
            // For now, we just move to the next node
        } catch (error) {
            logger.error(`Failed to schedule remarketing: ${error instanceof Error ? error.message : String(error)}`);
        }

        return node.nextNodeAfterRemarketing || null;
    }
}
