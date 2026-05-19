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

function detectImageMime(buffer: Buffer) {
    const hex = buffer.toString("hex", 0, 12);

    if (hex.startsWith("ffd8ff")) {
        return { ext: "jpg", mime: "image/jpeg" };
    }

    if (hex.startsWith("89504e47")) {
        return { ext: "png", mime: "image/png" };
    }

    if (hex.startsWith("47494638")) {
        return { ext: "gif", mime: "image/gif" };
    }

    if (
        hex.startsWith("52494646") &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return { ext: "webp", mime: "image/webp" };
    }

    return null;
}

const BUCKET = "botsync-files";
const PUBLIC_URL = "https://files.botsync.site";

class UploadCloudFlare {

    /**
     * Upload inteligente:
     * - detecta tipo real do arquivo
     * - gera uuid
     * - define extensão correta
     * - protege contra arquivos inválidos
     */
    async uploadBuffer(
        buffer: Buffer,
        folder = "uploads"
    ): Promise<{ url: string; key: string } | null> {

        try {
            let type = detectImageMime(buffer);
            if (!type) {
                const header = buffer.toString("utf8", 0, 4);
                if (header === "%PDF") {
                    type = { ext: "pdf", mime: "application/pdf" };
                }
            }

            if (!type) {
                throw new Error("Formato de arquivo não suportado");
            }

            if (
                !type.mime.startsWith("image/") &&
                type.mime !== "application/pdf"
            ) {
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

    /**
     * Remove arquivo do bucket
     */
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