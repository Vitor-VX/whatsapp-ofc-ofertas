import QRCode from "qrcode";
import { logger } from "../logger";
import { User, IEnvelope } from "../models/User";
import { randomUUID } from "crypto";

export interface EnvelopePayload {
    title: string;
    message: string;
    signature: string;
    photos: string[];
    options: {
        startDate: Date;
        hasMusic: boolean;
        musicUrl?: string;
        musicName?: string;
    };
    expiresAt: Date;
}

export interface EnvelopeCreateResult {
    slug: string;
    envelopeUrl: string;
    qrCodeImageBuffer: Buffer;
    qrCodeDataUrl: string;
}

const SITE_URL = process.env.SITE_URL ?? "https://envelopedoamor.shop";

async function generateUniqueSlug(): Promise<string> {
    return randomUUID().toString();
}

async function generateQrCode(url: string): Promise<{ buffer: Buffer; dataUrl: string }> {
    const [buffer, dataUrl] = await Promise.all([
        QRCode.toBuffer(url, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#ffffff" },
        }),
        QRCode.toDataURL(url, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#ffffff" },
        }),
    ]);
    return { buffer, dataUrl };
}

export const envelopeService = {

    /**
     * Cria um novo envelope digital para o usuário.
     *
     * 1. Gera slug único
     * 2. Monta o objeto IEnvelope
     * 3. Salva no array envelope[] do User
     * 4. Gera o QR Code apontando para a URL pública
     * 5. Retorna slug, URL e buffer do QR Code para upload
     */
    async create(userId: string, payload: EnvelopePayload): Promise<EnvelopeCreateResult> {
        logger.info(`Creating envelope for userId: ${userId}`);

        const slug = await generateUniqueSlug();
        const envelopeUrl = `${SITE_URL}/envelope/${slug}`;

        const envelopeDoc: IEnvelope = {
            slug,
            qrCode: "",
            title: payload.title,
            message: payload.message,
            signature: payload.signature,
            photos: payload.photos,
            options: {
                startDate: payload.options.startDate,
                hasMusic: payload.options.hasMusic,
                musicUrl: payload.options.musicUrl,
                musicName: payload.options.musicName,
            },
            lastAccessAt: new Date(),
            expiresAt: payload.expiresAt,
        };

        await User.updateOne(
            { _id: userId },
            { $push: { envelope: envelopeDoc } }
        );

        logger.info(`Envelope saved — slug: ${slug}, expires: ${payload.expiresAt.toISOString()}`);
        const { buffer: qrCodeImageBuffer, dataUrl: qrCodeDataUrl } = await generateQrCode(envelopeUrl);

        return {
            slug,
            envelopeUrl,
            qrCodeImageBuffer,
            qrCodeDataUrl,
        };
    },

    /**
     * Atualiza a URL do QR Code no envelope após o upload para o R2.
     * Chamado pelo deliverEnvelope depois de fazer o upload do buffer.
     */
    async saveQrCodeUrl(userId: string, slug: string, qrCodeUrl: string): Promise<void> {
        await User.updateOne(
            { _id: userId, "envelope.slug": slug },
            { $set: { "envelope.$.qrCode": qrCodeUrl } }
        );
        logger.debug(`QR Code URL saved for slug ${slug}: ${qrCodeUrl}`);
    },

    /**
     * Registra o acesso ao envelope (atualiza lastAccessAt).
     * Chame isso na rota pública do seu site quando o envelope for aberto.
     */
    async registerAccess(slug: string): Promise<IEnvelope | null> {
        const user = await User.findOneAndUpdate(
            { "envelope.slug": slug },
            { $set: { "envelope.$.lastAccessAt": new Date() } },
            { new: true }
        );

        if (!user) {
            logger.warn(`Envelope not found for slug: ${slug}`);
            return null;
        }

        const envelope = user.envelope.find((e) => e.slug === slug) ?? null;
        return envelope;
    },

    /**
     * Busca um envelope pelo slug.
     * Use na rota GET /envelope/:slug do seu site.
     *
     * Retorna null se:
     *  - Envelope não existir
     *  - Envelope estiver expirado
     */
    async findBySlug(slug: string): Promise<IEnvelope | null> {
        const user = await User.findOne({ "envelope.slug": slug });
        if (!user) return null;

        const envelope = user.envelope.find((e) => e.slug === slug);
        if (!envelope) return null;

        if (envelope.expiresAt && envelope.expiresAt < new Date()) {
            logger.info(`Envelope expired — slug: ${slug}, expiresAt: ${envelope.expiresAt}`);
            return null;
        }

        return envelope;
    },

    /**
     * Verifica se um envelope ainda está válido (não expirado).
     */
    async isValid(slug: string): Promise<boolean> {
        const envelope = await this.findBySlug(slug);
        return envelope !== null;
    },
};