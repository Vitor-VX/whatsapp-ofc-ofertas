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
import { envelopeService } from '../services/envelope';
import { isYouTubeUrl } from '../utils/isValidYoutube';

function getPhotoIndexFromNodeId(nodeId: string): number {
    const match = nodeId.match(/photo_received_(\d+)/);
    if (!match) return 0;
    const index = parseInt(match[1], 10);
    return index >= 1 && index <= 5 ? index : 0;
}

function collectPhotos(collectedData: Map<string, string>): string[] {
    const photos: string[] = [];
    for (let i = 1; i <= 5; i++) {
        const url = collectedData.get(`photo_${i}`);
        if (url && url.startsWith("http")) photos.push(url);
    }
    return photos;
}

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
    actionRegistry.register("sendPhotoList", async (_node: ActionNode, user, _ctx) => {
        const freshUser = await User.findById(user._id);
        if (!freshUser) return;

        const data = freshUser.collectedData as Map<string, string>;

        const lines: string[] = ["📷 *Suas fotos enviadas:*\n"];
        for (let i = 1; i <= 3; i++) {
            const url = data.get(`photo_${i}`);
            if (url && url.startsWith("http")) {
                lines.push(`*${i}* — Foto ${i} ✅`);
            }
        }

        if (lines.length === 1) {
            await whatsappService.sendMessage(user.whatsappId, {
                type: "text",
                body: "📸 Você ainda não enviou nenhuma foto.",
            });
            await User.updateOne({ _id: user._id }, { $set: { currentNodeId: "info_photos" } });
            return;
        }

        await whatsappService.sendMessage(user.whatsappId, {
            type: "text",
            body: lines.join("\n"),
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Action: routePhotoEdit
    // Lê o número digitado (editPhotoIndex) e avança para o nó replace_photo_N
    // ─────────────────────────────────────────────────────────────────────────────
    actionRegistry.register("routePhotoEdit", async (_node: ActionNode, user, _ctx) => {
        const data = user.collectedData as Map<string, string>;
        const index = parseInt(data.get("editPhotoIndex") ?? "0", 10);

        if (index < 1 || index > 5) {
            logger.warn(`[routePhotoEdit] Invalid index ${index} for user ${user.whatsappId}`);
            await User.updateOne({ _id: user._id }, { $set: { currentNodeId: "ask_which_photo" } });
            return;
        }

        // Verifica se a foto existe (não faz sentido trocar um slot vazio)
        const freshUser = await User.findById(user._id);
        const photoUrl = (freshUser?.collectedData as Map<string, string>)?.get(`photo_${index}`);

        if (!photoUrl || !photoUrl.startsWith("http")) {
            await whatsappService.sendMessage(user.whatsappId, {
                type: "text",
                body: `⚠️ Você não tem essa foto especificada. Digite o número de uma foto existente.`,
            });
            await User.updateOne({ _id: user._id }, { $set: { currentNodeId: "wait_which_photo" } });
            return;
        }

        const targetNode = `replace_photo_${index}`;
        await User.updateOne({ _id: user._id }, { $set: { currentNodeId: targetNode } });
        logger.info(`[routePhotoEdit] Routing user ${user.whatsappId} → ${targetNode}`);
    });

    actionRegistry.register("savePhoto", async (node: ActionNode, user, _ctx) => {
        const photoIndex = getPhotoIndexFromNodeId(node.id);
        if (photoIndex === 0) {
            logger.warn(`[savePhoto] Could not determine photo index from node.id: "${node.id}"`);
            return;
        }

        const data = user.collectedData as Map<string, string>;
        const photoMediaId = data.get(`photo_${photoIndex}`);

        if (!photoMediaId) {
            const freshUser = await User.findById(user._id);
            const freshData = freshUser?.collectedData as Map<string, string> | undefined;
            const freshMediaId = freshData?.get(`photo_${photoIndex}`);

            if (!freshMediaId) {
                logger.warn(`[savePhoto] photo_${photoIndex} not found in collectedData for user ${user.whatsappId}`);
                return;
            }

            logger.debug(`[savePhoto] Used DB fallback for photo_${photoIndex}`);
            return processPhotoUpload(user._id, user.whatsappId, photoIndex, freshMediaId);
        }

        if (photoMediaId.startsWith("http")) {
            logger.debug(`[savePhoto] photo_${photoIndex} already uploaded, skipping`);
            return;
        }

        return processPhotoUpload(user._id, user.whatsappId, photoIndex, photoMediaId);
    });

    actionRegistry.register("prepareCheckout", async (_node: ActionNode, user, _ctx) => {
        const data = user.collectedData as Map<string, string>;
        const price = parseFloat("19.90");
        const priceInCents = Math.round(price * 100);
        const priceStr = `R$${price.toFixed(2).replace(".", ",")}`;

        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    "collectedData.packagePrice": priceStr,
                    "collectedData.packagePriceCents": String(priceInCents),
                },
            }
        );

        logger.debug(`[prepareCheckout] ${priceStr} for ${user.whatsappId}`);
    });

    actionRegistry.register("createPixPayment", async (_node: ActionNode, user, _ctx) => {
        logger.info(`[createPixPayment] Creating Pix for ${user.whatsappId}`);

        try {
            const data = user.collectedData as Map<string, string>;
            const recipient = data.get("recipient") ?? "Envelope Digital";
            const packagePrice = parseFloat("19.90");

            const { code, qrCodeBase64, paymentId } = await mercadoPagoService.createPixPayment(
                user.whatsappId,
                user._id,
                packagePrice,
                `Envelope Digital — ${recipient}`
            );

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        "payment.id": paymentId,
                        "payment.qrCode": qrCodeBase64,
                        "payment.code": code,
                        "collectedData.pixCode": code,
                    },
                }
            );

            logger.info(`[createPixPayment] Pix created for ${user.whatsappId} — paymentId: ${paymentId}`);
        } catch (error) {
            logger.error(`[createPixPayment] ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    });

    actionRegistry.register("deliverEnvelope", async (_node: ActionNode, user, _ctx) => {
        logger.info(`[deliverEnvelope] Starting delivery for ${user.whatsappId}`);

        try {
            const freshUser = await User.findById(user._id);
            if (!freshUser) throw new Error("User not found");

            const paymentId = freshUser.payment?.id;
            const alreadyExists = freshUser.envelope.some(
                (env) => env.paymentId === paymentId
            );
            if (alreadyExists) {
                logger.warn(`[deliverEnvelope] Já existe envelope para payment ${paymentId}`);
                return;
            }

            const data = freshUser.collectedData as Map<string, string>;
            const photos = collectPhotos(data);

            if (photos.length === 0) throw new Error("No photos found — cannot create envelope");

            const startDateStr = data.get("startDate") ?? "";
            const [yyyy, mm, dd] = startDateStr.split("-").map(Number);
            const startDate = new Date(yyyy, mm - 1, dd);

            const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

            const rawMusicUrl = data.get("musicUrl") ?? "";

            const DEFAULT_MUSIC_URL = "https://www.youtube.com/watch?v=cNGjD0VG4R8";
            const DEFAULT_MUSIC_NAME = "Ed Sheeran - Perfeita";
            const validMusicUrl = isYouTubeUrl(rawMusicUrl)
                ? rawMusicUrl
                : DEFAULT_MUSIC_URL;

            const musicName = isYouTubeUrl(rawMusicUrl)
                ? data.get("musicName") ?? "Sua música"
                : DEFAULT_MUSIC_NAME;

            const payload = {
                title: data.get("recipient") ?? "Para você",
                message: data.get("message") ?? "",
                signature: data.get("signature") ?? "",
                photos,
                paymentId: paymentId,
                options: {
                    startDate,
                    hasMusic: true,
                    musicUrl: validMusicUrl,
                    musicName: musicName,
                },
                expiresAt,
            };

            const { slug, envelopeUrl, qrCodeImageBuffer } = await envelopeService.create(String(user._id), payload);

            const qrUpload = await r2Cloudflare.uploadBuffer(qrCodeImageBuffer, "envelopes-whatsapp");
            const qrUrl = qrUpload?.url;

            if (!qrUrl) throw new Error("QR Code upload returned no URL");
            await envelopeService.saveQrCodeUrl(String(user._id), slug, qrUrl);

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        paymentStatus: "paid",
                        "collectedData.envelopeSlug": slug,
                        "collectedData.envelopeUrl": envelopeUrl,
                        "collectedData.envelopeQrCode": qrUrl,
                    },
                }
            );

            const expiresLabel = expiresAt.toLocaleDateString("pt-BR");
            await whatsappService.sendMessage(user.whatsappId, {
                type: "text",
                body: `🎉 *Seu Envelope Digital está pronto!*\n\n🔗 Acesse ou compartilhe:\n${envelopeUrl}\n\n⏳ _Válido até: ${expiresLabel}_`,
            });

            await whatsappService.sendMessage(user.whatsappId, {
                type: "image",
                image: { link: qrUrl },
                caption: "📱 *QR Code do seu envelope!*\n\nImprima, mande por mensagem ou coloque num bilhetinho. É só apontar a câmera para abrir! 💌",
            });

            logger.info(`[deliverEnvelope] Done — slug: ${slug} | user: ${user.whatsappId}`);
        } catch (error) {
            logger.error(`[deliverEnvelope] ${error instanceof Error ? error.message : String(error)}`);
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

            const planMap: Record<string, { days: number; price: number; label: string }> = {
                plan_30: { days: 30, price: 19.90, label: "30 dias" },
                plan_90: { days: 90, price: 29.90, label: "90 dias" },
            };

            const plan = planMap[data.plan] ?? planMap["plan_30"];
            const priceInCents = Math.round(plan.price * 100);
            const priceStr = `R$${plan.price.toFixed(2).replace(".", ",")}`;

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + plan.days);

            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        flowData: data,
                        "collectedData.planDays": String(plan.days),
                        "collectedData.planLabel": plan.label,
                        "collectedData.packagePrice": priceStr,
                        "collectedData.packagePriceValue": String(plan.price),
                        "collectedData.packagePriceCents": String(priceInCents),
                        "collectedData.envelopeExpiresAt": expiresAt.toISOString(),
                        "collectedData.recipient": data.recipient,
                        "collectedData.message": data.message,
                        "collectedData.signature": data.signature,
                        "collectedData.musicUrl": data.music_url,
                        "collectedData.musicName": data.music_name,
                        "collectedData.startDate": data.start_date,
                    },
                }
            );

            await User.updateOne(
                { _id: user._id },
                { currentNodeId: "plan_selected" }
            );

            logger.info(`User ${phoneNumber} → plan_selected (via flow)`);
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
                    { currentNodeId: 'payment_confirmed', paymentStatus: 'paid' },
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
