import { GoogleGenAI } from "@google/genai";
import { getEnv } from '../config/env';
import { logger } from '../logger';
import * as fs from 'fs';
import * as path from 'path';

interface GenerateImageOptions {
    petName: string;
    style: 'sky' | 'renaissance' | 'rococo';
    photoPath: string;
}

export class GeminiService {
    private client: GoogleGenAI;

    constructor() {
        const env = getEnv();
        this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }

    /**
     * Generate pet artwork using Gemini
     */
    async generatePetImage(options: GenerateImageOptions): Promise<Buffer> {
        try {
            const model = this.client.models;

            const imageData = fs.readFileSync(options.photoPath);
            const base64Image = imageData.toString('base64');
            const mimeType = this.getMimeType(options.photoPath);

            const stylePrompts = {
                sky: `Using the animal in the uploaded photo as the exact reference,
create a hyperrealistic royal portrait painting of THIS specific
animal, preserving its exact appearance: fur color, body pattern,
face shape and eye color.
Dress it in a crimson velvet royal mantle with ermine fur trim,
seated on an ornate silk embroidered cushion with gold tassels.
Dramatic old master lighting, atmospheric stormy sky background
with golden hour light rays, smooth and blended oil painting
technique, no visible brushstrokes,
ultra detailed fur texture with individual hair strands,
chiaroscuro technique, epic and cinematic mood,
soft vignette edges, museum quality,
photographic realism combined with classical portrait painting,
shallow depth of field background.
Do NOT change the animal's face, body pattern, or eye color.
Adapt the royal costume naturally to the animal's body shape.`.trim(),
                renaissance: `Using the animal in the uploaded photo as the exact reference,
create a hyperrealistic royal portrait painting of THIS specific
animal, preserving its exact appearance: fur color, body pattern,
face shape and eye color.
Dress it in a deep wine red velvet royal mantle with ermine fur trim,
seated on an ornate gold embroidered cushion with tassels.
Florentine Renaissance style, timeless elegance, refined brushwork,
classical composition, dark warm brown background,
NOT white, NOT bright, NOT gray, NOT cold tones,
background must be dark olive brown, soft blurred bokeh,
smooth and blended oil painting technique, no visible brushstrokes,
ultra detailed fur texture with individual hair strands,
warm amber and deep earth tones, soft vignette edges,
dramatic yet soft lighting, museum quality,
photographic realism combined with classical portrait painting,
shallow depth of field background, cinematic portrait lighting.
Do NOT change the animal's face, body pattern, or eye color.
Adapt the royal costume naturally to the animal's body shape.`.trim(),
                rococo: `Using the animal in the uploaded photo as the exact reference,
create a hyperrealistic royal portrait painting of THIS specific
animal, preserving its exact appearance: fur color, body pattern,
face shape and eye color.
Dress it in a crimson velvet royal mantle with ermine fur trim,
seated on an ornate silk embroidered cushion with gold tassels.
Rococo painterly style with rich color harmonies and elegant mood,
dark neutral smoky background, NOT white, NOT bright, NOT pastel,
background must be dark brown or dark gray, soft blurred bokeh,
smooth and blended oil painting technique, no visible brushstrokes,
ultra detailed fur texture with individual hair strands,
warm amber tones, soft vignette edges, museum quality,
photographic realism combined with classical portrait painting,
shallow depth of field background, cinematic portrait lighting.
Do NOT change the animal's face, body pattern, or eye color.
Adapt the royal costume naturally to the animal's body shape.`.trim()
            };

            const promptText = `${stylePrompts[options.style]}`;
            const prompt = [
                {
                    text: promptText
                },
                {
                    inlineData: {
                        mimeType,
                        data: base64Image,
                    },
                },
            ];

            const response = await model.generateContent(
                {
                    model: "gemini-3-pro-image-preview",
                    contents: prompt,
                    config: {
                        responseModalities: ["IMAGE"]
                    }
                },
            );

            logger.info(`Generated image prompt for pet: ${options.petName} (style: ${options.style})`);

            const parts = response.candidates?.[0]?.content?.parts;
            if (!parts) throw new Error("No response parts from Gemini");

            const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
            if (!imagePart?.inlineData?.data) throw new Error("No image returned from Gemini");

            return Buffer.from(imagePart.inlineData.data, 'base64');
        } catch (error) {
            logger.error(`Failed to generate pet image: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get MIME type from file extension
     */
    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
        };
        return mimeTypes[ext] || 'image/jpeg';
    }

    /**
     * Analyze image with Gemini Vision
     */
    async analyzeImage(imagePath: string): Promise<string> {
        try {
            const model = this.client.models;

            const imageData = fs.readFileSync(imagePath);
            const base64Image = imageData.toString('base64');
            const mimeType = this.getMimeType(imagePath);

            const prompt = [
                {
                    text: "Describe this pet image in detail. What breed/type of pet is it? What are the distinctive features?"
                },
                {
                    inlineData: {
                        mimeType,
                        data: base64Image,
                    },
                },
            ];

            const response = await model.generateContent(
                {
                    model: "gemini-2.5-pro",
                    contents: prompt
                }
            );

            const textContent = response.text ?? "Nada a ser dito.";
            return textContent;
        } catch (error) {
            logger.error(`Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}

export const geminiService = new GeminiService();
