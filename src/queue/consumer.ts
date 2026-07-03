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
import { isYouTubeUrl } from '../utils/isValidYoutube';
import { sunoService } from '../services/sunoService';
import { downloadAudioBuffer, trimAudioBuffer } from '../utils/audioUtils';

const photoDebounceMap = new Map<string, NodeJS.Timeout>();

async function processPhotoUpload(
    userId: any,
    whatsappId: string,
    photoIndex: number,
    mediaId: string
): Promise<void> {
    try {
        const photoBuffer = await whatsappService.downloadMedia(mediaId);
        const upload = await r2Cloudflare.uploadBuffer(photoBuffer, "envelopes-whatsapp");
        const url = upload?.url;

        if (!url) throw new Error("R2 upload returned no URL");

        await User.updateOne(
            { _id: userId },
            {
                $set: { [`collectedData.photo_${photoIndex}`]: url },
                $push: { clientsImage: url },
            }
        );

        logger.info(`[savePhoto] photo_${photoIndex} uploaded for ${whatsappId}: ${url}`);
    } catch (error) {
        logger.error(
            `[savePhoto] Failed photo_${photoIndex} for ${whatsappId}: ${error instanceof Error ? error.message : String(error)
            }`
        );
    }
}

export function initializeActionHandlers(): void {
    actionRegistry.register("createComboCheckout", async (_node, user, _ctx) => {
        logger.info(`[createComboCheckout] Criando checkout combo para ${user.whatsappId}`);

        try {
            const { initPoint, preferenceId } = await mercadoPagoService.createCheckoutPreference({
                title: "ZukMusics — Combo 2 Músicas Personalizadas",
                price: 19.90,
                whatsappId: user.whatsappId,
                userId: user._id
            });

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        "payment.id": preferenceId,
                        "payment.link": initPoint,
                        "collectedData.checkoutUrl": initPoint,
                    },
                }
            );

            logger.info(`[createComboCheckout] Checkout criado para ${user.whatsappId}: ${initPoint}`);
        } catch (error) {
            console.log(error);

            logger.error(`[createComboCheckout] ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    });

    actionRegistry.register("generateSong", async (_node: ActionNode, user, _ctx) => {
        logger.info(`[generateSong] Iniciando geração para ${user.whatsappId}`);

        try {
            const freshUser = await User.findById(user._id);
            if (!freshUser) throw new Error("User not found");

            const flow = freshUser.flowData;
            if (!flow) throw new Error("flowData ausente — flow do WhatsApp não foi processado");

            const { lyrics, style, title } = await sunoService.generateSong(flow);
            if (!lyrics) {
                logger.info("[generateSong] Não foi possível gerar a letra da música..");
                return;
            }

            const taskId = await sunoService.generateMusic({ prompt: lyrics, style, title, instrumental: false });
            logger.info(`[generateSong] Task criada no Suno: ${taskId} (${user.whatsappId})`);

            const track = await sunoService.waitForCompletion(taskId, {
                maxWaitMs: 5 * 60 * 1000,
                intervalMs: 5000,
            });

            if (!track.audioUrl) throw new Error("Suno não retornou audio_url");

            const fullAudioBuffer = await downloadAudioBuffer(track.audioUrl);
            const previewBuffer = await trimAudioBuffer(fullAudioBuffer, 60);

            const [fullUpload, previewUpload] = await Promise.all([
                r2Cloudflare.uploadBuffer(fullAudioBuffer, "musicas-completas"),
                r2Cloudflare.uploadBuffer(previewBuffer, "musicas-previa"),
            ]);

            if (!fullUpload?.url || !previewUpload?.url) {
                throw new Error("Falha ao subir os áudios pro R2");
            }

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        "music.musicUrl": fullUpload.url,
                        "music.previewUrl": previewUpload.url,
                        "music.taskId": taskId,
                        "music.audioId": track.id,
                        "collectedData.songPreviewUrl": previewUpload.url,
                    },
                }
            );

            logger.info(`[generateSong] Música pronta para ${user.whatsappId}`);
        } catch (error) {
            logger.error(`[generateSong] ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    });

    actionRegistry.register("deliverFullSong", async (_node: ActionNode, user, _ctx) => {
        try {
            const freshUser = await User.findById(user._id);
            if (!freshUser?.music?.musicUrl || !freshUser.music.taskId) {
                throw new Error(`music.musicUrl ausente para ${user.whatsappId}`);
            }

            await whatsappService.sendMessage(freshUser.whatsappId, {
                type: "audio",
                audio: {
                    link: freshUser.music.musicUrl,
                    voice: false,
                }
            });
            logger.info(`[deliverFullSong] Música completa enviada para ${freshUser.whatsappId}`);

            const twoMusic = await sunoService.getTaskStatus(freshUser.music.taskId);
            if (!twoMusic.response?.sunoData[0].audioUrl) {
                logger.info("[deliverFullSong] Não foi possível obter a primeira música..");
                return;
            }

            await whatsappService.sendMessage(freshUser.whatsappId, {
                type: "audio",
                audio: {
                    link: twoMusic.response?.sunoData?.[0].audioUrl,
                    voice: false,
                }
            });
        } catch (error) {
            logger.error(`[deliverFullSong] ${error instanceof Error ? error.message : String(error)}`);
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

        const flowResponse = interactive?.nfm_reply;
        if (flowResponse) {
            logger.info(`Flow response received from ${phoneNumber}`);

            const raw = flowResponse.response_json;
            const data = typeof raw === "string" ? JSON.parse(raw) : raw;

            console.log("FLOW DATA:", JSON.stringify(data, null, 2));

            const safe = (v: any) => (v === undefined || v === null ? "" : String(v));

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        flowData: data,
                        "collectedData.honoreeName": safe(data.honoreeName),
                        "collectedData.relationship": safe(data.relationship),
                        "collectedData.specialMessage": safe(data.specialMessage),
                        "collectedData.musicStyle": safe(data.musicStyle),
                        "collectedData.customStyle": safe(data.customStyle),
                        "collectedData.voicePreference": safe(data.voicePreference),

                        ...(data.specialQuality && {
                            "collectedData.specialQuality": safe(data.specialQuality),
                        }),

                        ...(data.feelingsDetails && {
                            "collectedData.feelingsDetails": safe(data.feelingsDetails),
                        }),
                    },
                }
            );

            await User.updateOne(
                { _id: user._id },
                { currentNodeId: "flow_received" }
            );

            logger.info(`User ${phoneNumber} → flow_received (via flow)`);
        } else {
            const incomingButtonId =
                button?.payload ||
                interactive?.button_reply?.id ||
                interactive?.list_reply?.id ||
                interactive?.carousel_reply?.button_reply?.id;

            if (currentNode.id === "payment_pending_hold") {
                logger.warn(
                    `Texto de verificação de pagamento ignorado por enquanto..`,
                );
                return;
            }

            if (incomingButtonId && currentNode.type !== 'buttons' && currentNode.type !== 'list' && currentNode.type !== "cards") {
                // Botão de mensagem antiga clicado enquanto usuário está em outro nó → ignorar
                logger.warn(
                    `Stale button click ignored: buttonId="${incomingButtonId}" currentNode="${currentNode.id}" (type=${currentNode.type})`,
                );
                return;
            }

            if (incomingButtonId && (currentNode.type === 'buttons' || currentNode.type === 'list' || currentNode.type === 'cards')) {
                const validIds = getValidButtonIds(currentNode);
                if (!validIds.includes(incomingButtonId)) {
                    logger.warn(
                        `Button "${incomingButtonId}" does not belong to current node "${currentNode.id}" — ignoring stale click`,
                    );
                    return;
                }
            }

            if (currentNode.type === 'waitPhotos') {
                if (image?.id) {
                    const freshUser = await User.findById(user._id);
                    const data = freshUser?.collectedData as Map<string, string>;

                    let nextSlot = 1;
                    for (let i = 1; i <= (currentNode.maxPhotos ?? 3); i++) {
                        if (data?.get(`photo_${i}`)?.startsWith('http')) {
                            nextSlot = i + 1;
                        }
                    }

                    const max = currentNode.maxPhotos ?? 3;
                    if (nextSlot > max) {
                        await whatsappService.sendMessage(phoneNumber, {
                            type: 'text',
                            body: `Todas as fotos já foram recebidas..`,
                        });

                        await User.updateOne({ _id: user._id }, { currentNodeId: currentNode.nextNode });
                        await executeNodeSequence(freshUser!, funnelEngine, messageId, true);
                        return;
                    }

                    // Faz upload e salva
                    await processPhotoUpload(user._id, phoneNumber, nextSlot, image.id);

                    if (nextSlot === max) {
                        // Atingiu o limite — avança automaticamente pro confirm
                        const pending = photoDebounceMap.get(phoneNumber);
                        if (pending) { clearTimeout(pending); photoDebounceMap.delete(phoneNumber); }

                        await whatsappService.sendMessage(phoneNumber, {
                            type: 'text',
                            body: `✅ ${max} fotos recebidas!`,
                        });
                        await User.updateOne({ _id: user._id }, { currentNodeId: currentNode.nextNode });
                        const u = await User.findById(user._id);
                        await executeNodeSequence(u!, funnelEngine, messageId, true);
                    } else {
                        await whatsappService.sendMessage(phoneNumber, {
                            type: 'text',
                            body: `✅ Foto ${nextSlot} recebida! Manda mais ou aguarde para confirmar.`,
                        });

                        const pending = photoDebounceMap.get(phoneNumber);
                        if (pending) clearTimeout(pending);

                        const timeout = setTimeout(async () => {
                            photoDebounceMap.delete(phoneNumber);
                            const u = await User.findOne({ whatsappId: phoneNumber });
                            if (u && u.currentNodeId === currentNode.id) {
                                await User.updateOne({ _id: u._id }, { currentNodeId: currentNode.nextNode });
                                const fresh = await User.findById(u._id);
                                await executeNodeSequence(fresh!, funnelEngine, messageId, true);
                            }
                        }, currentNode.debounceMs ?? 5000);

                        photoDebounceMap.set(phoneNumber, timeout);
                    }
                } else {
                    // Mandou texto/outro — relembra o que espera
                    await whatsappService.sendMessage(phoneNumber, {
                        type: 'text',
                        body: currentNode.content ?? '📸 Por favor, envie as fotos!',
                    });
                }

                return;
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
                            { $set: { [`collectedData.${currentNode.saveAs}`]: image.id } }
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
            } else if (currentNode.type === 'buttons' || currentNode.type === 'list' || currentNode.type === 'cards') {
                if (!incomingButtonId) {
                    // Usuário digitou texto livre em vez de clicar no botão — ignorar ou reenviar
                    logger.warn(`Free text received while waiting for button selection from ${phoneNumber}`);
                    return;
                }

                const nextNodeId = funnelEngine.getNextNodeForSelection(currentNode, incomingButtonId);
                if (nextNodeId) {
                    const updates: Record<string, any> = { currentNodeId: nextNodeId };

                    if (currentNode.id === 'ask_style' || currentNode.id === 'ask_style_bonus') {
                        updates['collectedData.style'] = incomingButtonId;
                    }

                    await User.updateOne({ _id: user._id }, { $set: updates });
                    logger.info(`User ${phoneNumber} selected "${incomingButtonId}" → ${nextNodeId}`);
                }
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
    if (node.type === 'cards') {
        return node.cards.flatMap((card: any) =>
            card.buttons.map((b: any) => b.id)
        );
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

                    const previousNodeId = currentNodeId;
                    currentNodeId = freshUser.currentNodeId;

                    if (!nextNodeId && freshUser.currentNodeId !== previousNodeId) {
                        continue;
                    }
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
                    { currentNodeId: 'payment_confirmed', paymentStatus: 'paid', funnelCompleted: false },
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
                await User.updateOne(
                    { _id: user._id },
                    { currentNodeId: "interest_1", paymentStatus: "pending" },
                );
                await whatsappService.sendMessage(whatsappId, {
                    type: "text",
                    body: "Olá! Identificamos que o prazo para o pagamento anterior foi expirado.\n\nSua sessão foi reiniciada, ok?"
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
