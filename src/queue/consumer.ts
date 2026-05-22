import { ConsumeMessage } from 'amqplib';
import { consumeQueue } from '../config/rabbitmq';
import { User } from '../models/User';
import { FunnelEngine } from '../funnel/engine';
import { FunnelExecutor, FunnelContext, actionRegistry } from '../funnel/executor';
import { logger } from '../logger';
import { whatsappService } from '../services/whatsapp';
import { geminiService } from '../services/gemini';
import { stripeService } from '../services/stripe';
import { watermarkService } from '../services/watermark';
import { remarketingScheduler } from '../services/remarketing';
import * as petArtFunnel from '../funnel/funnels/pet-art.json';
import { ActionNode, isWaitingNode } from '../funnel/nodeTypes';
import path from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { r2Cloudflare } from '../utils/uploadCloudflare';
import { mercadoPagoService } from '../services/mercadoPago';

/**
 * Initialize action handlers
 */
function initializeActionHandlers(): void {

    actionRegistry.register('saveStyle', async (node: ActionNode, user, ctx) => {
        const styleMap: Record<string, string> = {
            save_style_sky: "sky",
            save_style_renaissance: "renaissance",
            save_style_rococo: "rococo"
        };
        const style = styleMap[node.id] || "sky";

        await User.updateOne(
            { _id: user._id },
            { $set: { "collectedData.style": style } }
        );
        logger.debug(`Style ${style} saved for user ${user.whatsappId}`);
    });

    actionRegistry.register("prepareCheckout", async (node, user, ctx) => {
        const deliveredCount = Number(user.collectedData.get("deliveredCount")) || 0;

        const price = deliveredCount > 0 ? 7.90 : 10.90;
        const priceStr = `R$${price.toFixed(2).replace(".", ",")}`;

        await User.updateOne({ _id: user._id }, {
            $set: {
                "collectedData.packagePrice": priceStr
            }
        });
        ctx.user.currentNodeId = "delay_5";
    });

    actionRegistry.register("generatePetImage", async (node: ActionNode, user, ctx) => {
        logger.info(`Generating pet image for ${user.whatsappId}`);

        try {
            const data = user.collectedData;
            const photoMediaId = data.get("photoMediaId");

            if (!photoMediaId) throw new Error("No photo provided");

            const photoBuffer = await whatsappService.downloadMedia(photoMediaId);

            const tmpDir = tmpdir();
            const photoPath = path.join(tmpDir, `${user.whatsappId}_${Date.now()}_original.jpg`);
            writeFileSync(photoPath, photoBuffer);

            const style = (data.get("style") || "sky") as "sky" | "renaissance" | "rococo";
            const petName = data.get("petName") || "Pet";

            const generatedBuffer = await geminiService.generatePetImage({
                petName,
                style,
                photoPath,
            });

            const finalPath = path.join(tmpDir, `${user.whatsappId}_${Date.now()}_final.jpg`);
            const watermarkedPath = path.join(tmpDir, `${user.whatsappId}_${Date.now()}_preview.jpg`);

            writeFileSync(finalPath, generatedBuffer);
            await watermarkService.processImage(finalPath, watermarkedPath, {
                watermarkText: "Preview - Watermarked",
                quality: 85,
            });

            const previewBuffer = readFileSync(watermarkedPath);
            const finalImageBuffer = readFileSync(finalPath);

            const previewUpload = await r2Cloudflare.uploadBuffer(previewBuffer, "quadros-whatsapp");
            const finalUpload = await r2Cloudflare.uploadBuffer(finalImageBuffer, "quadros-whatsapp");

            await User.updateOne(
                { _id: user._id },
                {
                    $push: {
                        generatedPreviews: previewUpload?.url,
                        generatedImages: finalUpload?.url,
                    },
                    $set: {
                        "collectedData.lastPreview": previewUpload?.url
                    }
                }
            );

            logger.info(`Pet image generated for ${user.whatsappId}`);
        } catch (error) {
            logger.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    });

    actionRegistry.register("createPixPayment", async (node: ActionNode, user, ctx) => {
        logger.info(`Creating Pix payment link for ${user.whatsappId}`);

        try {
            const petName = user.collectedData.get("petName") || 'Pet Art';
            const { code, qrCodeBase64, paymentId, expiresAt } = await mercadoPagoService.createPixPayment(user.whatsappId, user._id, petName);

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        "payment.id": paymentId,
                        "payment.qrCode": qrCodeBase64,
                        "payment.code": code,
                        "collectedData.pixCode": code,
                    }
                },
            );

            logger.info(`Payment link created for ${user.whatsappId}`);
        } catch (error) {
            logger.error(`Failed to create payment link: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    });

    actionRegistry.register("deliverFinalImage", async (node: ActionNode, user, ctx) => {
        logger.info(`Delivering image to ${user.whatsappId}`);

        try {
            const freshUser = await User.findById(user._id);
            const images = freshUser?.generatedImages || [];
            const deliveredCount = Number(freshUser?.collectedData.get("deliveredCount") || 0);

            if (images.length === 0) throw new Error("No images to deliver");
            const latestImage = images[images.length - 1];

            await whatsappService.sendMessage(user.whatsappId, {
                type: "image",
                image: { link: latestImage },
                caption: `🎨 Aqui está sua arte original em alta resolução!`,
            });

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        "collectedData.deliveredCount": deliveredCount + 1,
                        paymentStatus: 'paid'
                    }
                }
            );

            logger.info(`Delivered image successfully`);
        } catch (error) {
            logger.error(`Delivery error: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    });
}

/**
 * Process incoming WhatsApp message
 */
async function processIncomingMessage(msg: ConsumeMessage | null): Promise<void> {
    try {
        if (!msg) return;

        const data = JSON.parse(msg.content.toString());
        const { from: phoneNumber, type, timestamp, text, image, button, interactive, messageId } = data;

        let user = await User.findOne({ whatsappId: phoneNumber });

        if (!user) {
            logger.info(`New user detected: ${phoneNumber}`);

            user = await User.create({
                whatsappId: phoneNumber,
                phone: phoneNumber,
                funnelId: 'pet-art-mx',
                currentNodeId: 'welcome',
                funnelStartedAt: new Date(),
                lastMessageAt: new Date(),
                windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                collectedData: {},
            });

            logger.info(`User created: ${phoneNumber}`);
        }

        await User.updateOne(
            { _id: user._id },
            {
                lastMessageAt: new Date(),
                windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        );

        const funnelEngine = FunnelEngine.loadFunnel(petArtFunnel as any);
        const currentNode = funnelEngine.getNode(user.currentNodeId);

        if (!currentNode) {
            logger.error(`Node not found: ${user.currentNodeId}`);
            return;
        }

        if (user.funnelCompleted) {
            logger.debug(`User ${phoneNumber} already completed funnel`);
            return;
        }

        const incomingButtonId =
            button?.payload ||
            interactive?.button_reply?.id ||
            interactive?.list_reply?.id;

        if (currentNode.id === "payment_pending_hold") {
            logger.warn(
                `Texto de verificação de pagamento ignorado por enquanto..`,
            );
            return;
        }

        if (incomingButtonId && currentNode.type !== 'buttons' && currentNode.type !== 'list') {
            // Botão de mensagem antiga clicado enquanto usuário está em outro nó → ignorar
            logger.warn(
                `Stale button click ignored: buttonId="${incomingButtonId}" currentNode="${currentNode.id}" (type=${currentNode.type})`,
            );
            return;
        }

        if (incomingButtonId && (currentNode.type === 'buttons' || currentNode.type === 'list')) {
            // Verificar se o buttonId pertence ao nó atualFD
            const validIds = getValidButtonIds(currentNode);
            if (!validIds.includes(incomingButtonId)) {
                logger.warn(
                    `Button "${incomingButtonId}" does not belong to current node "${currentNode.id}" — ignoring stale click`,
                );
                return;
            }
        }

        if (isWaitingNode(currentNode)) {
            if (currentNode.type === 'waitInput') {
                const input = text?.body || text || button?.text || interactive?.button_reply?.title || '';

                if (currentNode.validation) {
                    if (!funnelEngine.validateInput(currentNode, input)) {
                        logger.warn(`Invalid input for ${phoneNumber}: "${input}"`);
                        const prompt = currentNode.content
                            ? funnelEngine.interpolateText(currentNode.content, user)
                            : 'Por favor, envie uma resposta válida.';
                        await whatsappService.sendMessage(phoneNumber, { type: 'text', body: prompt });
                        return;
                    }
                }

                await User.updateOne(
                    { _id: user._id },
                    { $set: { [`collectedData.${currentNode.saveAs}`]: input } },
                );

                const nextNodeId = currentNode.nextNode || null;
                if (nextNodeId) {
                    await User.updateOne({ _id: user._id }, { currentNodeId: nextNodeId });
                    logger.info(`User ${phoneNumber} (waitInput) → ${nextNodeId}`);
                }
            } else if (currentNode.type === 'waitPhoto') {
                if (image?.id) {
                    await User.updateOne(
                        { _id: user._id },
                        { $set: { 'collectedData.photoMediaId': image.id } },
                    );

                    const nextNodeId = currentNode.nextNode || null;
                    if (nextNodeId) {
                        await User.updateOne({ _id: user._id }, { currentNodeId: nextNodeId });
                        logger.info(`User ${phoneNumber} (waitPhoto) → ${nextNodeId}`);
                    }
                } else {
                    logger.warn(`Expected photo but got type="${type}" from ${phoneNumber}`);
                    const prompt = currentNode.content
                        ? funnelEngine.interpolateText(currentNode.content, user)
                        : '📸 Por favor, envie uma foto do seu pet!';
                    await whatsappService.sendMessage(phoneNumber, { type: 'text', body: prompt });
                    return;
                }
            }
        } else if (currentNode.type === 'buttons' || currentNode.type === 'list') {
            if (!incomingButtonId) {
                // Usuário digitou texto livre em vez de clicar no botão — ignorar ou reenviar
                logger.warn(`Free text received while waiting for button selection from ${phoneNumber}`);
                return;
            }

            const nextNodeId = funnelEngine.getNextNodeForSelection(currentNode, incomingButtonId);
            if (nextNodeId) {
                const updates: Record<string, any> = { currentNodeId: nextNodeId };

                if (currentNode.id === 'ask_style') {
                    updates['collectedData.style'] = incomingButtonId;
                }

                await User.updateOne({ _id: user._id }, { $set: updates });
                logger.info(`User ${phoneNumber} selected "${incomingButtonId}" → ${nextNodeId}`);
            }
        }

        user = (await User.findOne({ whatsappId: phoneNumber })) || user;
        await executeNodeSequence(user, funnelEngine, messageId);
    } catch (error) {
        logger.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Retorna os IDs válidos de botões/lista para um dado nó.
 * Usado para rejeitar cliques em mensagens antigas.
 */
function getValidButtonIds(node: any): string[] {
    if (node.type === 'buttons') {
        return (node.buttons ?? []).map((b: any) => b.id);
    }
    if (node.type === 'list') {
        return (node.sections ?? []).flatMap((s: any) => (s.rows ?? []).map((r: any) => r.id));
    }
    return [];
}

/**
 * Execute nodes sequentially until hitting a waiting node or end
 */
async function executeNodeSequence(
    user: any,
    engine: FunnelEngine,
    messageId: string = "",
    forced: boolean = false
): Promise<void> {
    if (forced) {
        const freshUser = await User.findOne({ _id: user._id });
        if (freshUser) {
            user = freshUser;
        }
    }

    const context: FunnelContext = {
        engine,
        user,
        whatsappService,
        geminiService,
        stripeService,
        watermarkService,
        messageId
    };

    const executor = new FunnelExecutor(context);
    let currentNodeId = user.currentNodeId;
    let iterations = 0;
    const maxIterations = 100;

    while (currentNodeId && iterations < maxIterations) {
        iterations++;

        const node = engine.getNode(currentNodeId);
        if (!node) {
            logger.error(`Node not found: ${currentNodeId}`);
            break;
        }

        logger.debug(`Executing node: ${currentNodeId} (${node.type})`);

        try {
            const nextNodeId = await executor.execute(node);
            if (node.type === "action") {
                const freshUser = await User.findOne({ _id: user._id });
                if (freshUser) {
                    user = freshUser;
                    context.user = freshUser;
                    currentNodeId = freshUser.currentNodeId;
                }
            }

            if (node.type !== "delay") {
                await User.updateOne(
                    { _id: user._id },
                    { currentNodeId }
                );
            }

            if (!nextNodeId) {
                if (node.type === "end") {
                    await User.updateOne(
                        { _id: user._id },
                        { funnelCompleted: true }
                    );
                    logger.info(`Funnel completed for ${user.whatsappId}`);
                }
                break;
            }

            if (
                isWaitingNode(node) ||
                node.type === "buttons" ||
                node.type === "list"
            ) {
                logger.debug(`Waiting node reached: ${currentNodeId}`);
                break;
            }

            currentNodeId = nextNodeId;
        } catch (error) {
            logger.error(
                `Error executing node ${currentNodeId}: ${error instanceof Error ? error.message : String(error)
                }`
            );
            break;
        }
    }

    if (iterations >= maxIterations) {
        logger.warn(`Max iterations reached for user ${user.whatsappId}`);
    }
}

/**
 * Process payment events
 */
async function processPaymentEvent(msg: ConsumeMessage | null): Promise<void> {
    try {
        if (!msg) return;

        const data = JSON.parse(msg.content.toString());
        const { type, whatsappId } = data;

        const user = await User.findOne({ whatsappId });
        if (!user) {
            logger.warn(`User not found for payment event: ${whatsappId}`);
            return;
        }

        const engine = FunnelEngine.loadFunnel(petArtFunnel as any);

        switch (type) {
            case 'PAYMENT_SUCCESS': {
                logger.info(`Payment success for ${whatsappId}`);
                await User.updateOne(
                    { _id: user._id },
                    { currentNodeId: 'deliver_image', paymentStatus: 'paid' },
                );
                await executeNodeSequence(user, engine, "", true);
                break;
            }

            case 'PAYMENT_PENDING': {
                logger.info(`Payment pending for ${whatsappId}`);
                // await User.updateOne(
                //     { _id: user._id },
                //     { currentNodeId: 'payment_still_pending' },
                // );
                // await executeNodeSequence(user, engine);
                break;
            }

            case 'PAYMENT_EXPIRED': {
                logger.info(`Payment expired for ${whatsappId}`);
                await whatsappService.sendMessage(whatsappId, {
                    type: "text",
                    body: "Olá! Identificamos que o prazo para o pagamento anterior foi expirado.\n\nCaso ainda tenha interesse em continuar com o seu pedido, basta responder esta mensagem e geraremos automaticamente um novo pagamento para você.\n\nSe preferir não continuar, não é necessário fazer nada."
                });
                break;
            }

            case 'PAYMENT_FAILED': {
                logger.warn(`Payment failed for ${whatsappId}`);
                // await User.updateOne(
                //     { _id: user._id },
                //     { currentNodeId: 'payment_failed', paymentStatus: 'failed' },
                // );
                // await executeNodeSequence(user, engine);
                break;
            }

            case 'PAYMENT_REFUNDED': {
                logger.info(`Payment refunded for ${whatsappId}`);
                await User.updateOne(
                    { _id: user._id },
                    { currentNodeId: 'end_node', paymentStatus: 'refunded' },
                );
                await whatsappService.sendMessage(whatsappId, {
                    type: 'text',
                    body: '↩️ Seu reembolso foi processado com sucesso. Qualquer dúvida, é só chamar! 🐾',
                });
                break;
            }

            default:
                logger.debug(`Unhandled payment event type: ${type}`);
        }
    } catch (error) {
        logger.error(`Error processing payment event: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

/**
 * Start the consumer
 */
export async function startConsumer(): Promise<void> {
    try {
        logger.info('Starting RabbitMQ consumer...');

        // Initialize action handlers
        initializeActionHandlers();

        // Consume WhatsApp messages
        await consumeQueue('whatsapp_inbound', processIncomingMessage);
        logger.info('WhatsApp message consumer started');

        // Consume payment events
        await consumeQueue('payment_events', processPaymentEvent);
        logger.info('Payment event consumer started');

        logger.info('All consumers started successfully');
    } catch (error) {
        logger.error(`Failed to start consumer: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
