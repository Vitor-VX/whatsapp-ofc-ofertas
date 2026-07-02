import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import axios from "axios";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

export async function downloadAudioBuffer(url: string): Promise<Buffer> {
    const { data } = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
    return Buffer.from(data);
}

export async function trimAudioBuffer(input: Buffer, seconds: number): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `${randomUUID()}.mp3`);
    const outputPath = path.join(tmpDir, `${randomUUID()}.mp3`);

    await fs.writeFile(inputPath, input);

    try {
        await new Promise<void>((resolve, reject) => {
            const fadeStart = Math.max(seconds - 2, 0);
            const proc = spawn(ffmpegPath as string, [
                "-y",
                "-i", inputPath,
                "-t", String(seconds),
                "-af", `afade=t=out:st=${fadeStart}:d=2`,
                "-acodec", "libmp3lame",
                "-b:a", "128k",
                outputPath,
            ]);

            let stderr = "";
            proc.stderr.on("data", (d) => (stderr += d.toString()));
            proc.on("error", reject);
            proc.on("close", (code) => {
                code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com código ${code}: ${stderr}`));
            });
        });

        return await fs.readFile(outputPath);
    } finally {
        await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
    }
}