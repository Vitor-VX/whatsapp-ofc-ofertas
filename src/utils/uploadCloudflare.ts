import {
    S3,
    PutObjectCommand,
    DeleteObjectCommand
} from "@aws-sdk/client-s3";

import crypto from "crypto";
import { getEnv } from "../config/env";
import { logger } from "../logger";

const s3Client = new S3({
    endpoint: getEnv().STORAGE_ENDPOINT,
    region: "auto",
    credentials: {
        accessKeyId: getEnv().STORAGE_ACCESS_KEY_ID,
        secretAccessKey: getEnv().STORAGE_SECRET_ACCESS_KEY
    }
});

const BUCKET = "botsync-files";
const PUBLIC_URL = "https://files.botsync.site";

const allowedAudioMime = [
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/mp4",
    "audio/ogg"
];

function detectAudioMime(buffer: Buffer) {
    const hex = buffer.toString("hex", 0, 16);
    const ascii = buffer.toString("ascii", 0, 16);

    if (hex.startsWith("494433")) {
        return { ext: "mp3", mime: "audio/mpeg" };
    }

    if (hex.startsWith("fff") || hex.startsWith("fffb")) {
        return { ext: "mp3", mime: "audio/mpeg" };
    }

    if (ascii.startsWith("RIFF") && ascii.includes("WAVE")) {
        return { ext: "wav", mime: "audio/wav" };
    }

    if (ascii.startsWith("OggS")) {
        return { ext: "ogg", mime: "audio/ogg" };
    }

    if (ascii.startsWith("RIFF") && ascii.includes("WEBM")) {
        return { ext: "webm", mime: "audio/webm" };
    }

    if (ascii.includes("ftyp")) {
        return { ext: "m4a", mime: "audio/mp4" };
    }

    return null;
}

class UploadCloudFlare {
    async uploadBuffer(
        buffer: Buffer,
        folder = "audios"
    ): Promise<{ url: string; key: string } | null> {
        try {
            let type = detectAudioMime(buffer);
            if (!type) {
                const header = buffer.toString("hex", 0, 3);
                if (header.startsWith("494433") || header.startsWith("fff")) {
                    type = { ext: "mp3", mime: "audio/mpeg" } as any;
                }
            }

            if (!type) {
                throw new Error("Formato de áudio não suportado");
            }

            if (!allowedAudioMime.includes(type.mime)) {
                throw new Error(`Tipo não permitido: ${type.mime}`);
            }

            const uuid = crypto.randomUUID();
            const key = `${folder}/${uuid}.${type.ext}`;

            await s3Client.send(
                new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: key,
                    Body: buffer,
                    ContentType: type.mime
                })
            );

            const url = `${PUBLIC_URL}/${key}`;
            logger.debug(`Upload realizado: ${url}`);

            return { key, url };
        } catch (err: any) {
            logger.error(`Erro Cloudflare R2: ${err.message}`);
            return null;
        }
    }

    async deleteFile(key: string): Promise<boolean> {
        try {
            await s3Client.send(
                new DeleteObjectCommand({
                    Bucket: BUCKET,
                    Key: key
                })
            );

            logger.debug(`Arquivo deletado: ${key}`);
            return true;

        } catch (err: any) {
            logger.error(`Erro ao deletar: ${err.message}`);
            return false;
        }
    }
}

export const r2Cloudflare = new UploadCloudFlare();