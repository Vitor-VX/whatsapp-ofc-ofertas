import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import { logger } from '../logger';

export class WatermarkService {
    /**
     * Add text watermark to image
     */
    async addTextWatermark(
        inputPath: string,
        outputPath: string,
        text: string,
        options?: {
            position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
            fontSize?: number;
            fontColor?: string;
            opacity?: number;
        },
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const position = options?.position || 'bottom-right';
            const fontSize = options?.fontSize || 24;
            const fontColor = options?.fontColor || 'white';
            const opacity = options?.opacity !== undefined ? options.opacity : 0.7;

            // Position mapping for FFmpeg drawtext filter
            const positions: Record<string, string> = {
                'top-left': '10:10',
                'top-right': `w-text_w-10:10`,
                'bottom-left': `10:h-text_h-10`,
                'bottom-right': `w-text_w-10:h-text_h-10`,
                center: `(w-text_w)/2:(h-text_h)/2`,
            };

            const x_y = positions[position];

            // Escape text for FFmpeg
            const escapedText = text.replace(/[\\:]/g, '\\$&').replace(/'/g, "\\'");

            const drawtext = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}@${opacity}:x=${x_y}`;

            try {
                ffmpeg(inputPath)
                    .videoFilters(drawtext)
                    .output(outputPath)
                    .on('end', () => {
                        logger.info(`Watermark added: ${outputPath}`);
                        resolve();
                    })
                    .on('error', (error) => {
                        logger.error(`Watermark failed: ${error.message}`);
                        reject(error);
                    })
                    .run();
            } catch (error) {
                logger.error(`Failed to create watermark filter: ${error instanceof Error ? error.message : String(error)}`);
                reject(error);
            }
        });
    }

    /**
     * Add image watermark (logo) to image
     */
    async addImageWatermark(
        inputPath: string,
        watermarkPath: string,
        outputPath: string,
        options?: {
            position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
            scale?: number; // 0-1, percentage of input image width
            opacity?: number; // 0-1
        },
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const position = options?.position || 'bottom-right';
            const scale = options?.scale || 0.2;
            const opacity = options?.opacity !== undefined ? options.opacity : 0.7;

            const positions: Record<string, string> = {
                'top-left': '10:10',
                'top-right': `W-w-10:10`,
                'bottom-left': `10:H-h-10`,
                'bottom-right': `W-w-10:H-h-10`,
            };

            const x_y = positions[position];
            const width = Math.round(scale * 1000); // Approximate

            const overlay = `overlay=${x_y}:alpha=${opacity}`;

            try {
                ffmpeg(inputPath)
                    .input(watermarkPath)
                    // .filter(overlay)
                    .output(outputPath)
                    .on('end', () => {
                        logger.info(`Image watermark added: ${outputPath}`);
                        resolve();
                    })
                    .on('error', (error) => {
                        logger.error(`Image watermark failed: ${error.message}`);
                        reject(error);
                    })
                    .run();
            } catch (error) {
                logger.error(
                    `Failed to create image watermark filter: ${error instanceof Error ? error.message : String(error)}`,
                );
                reject(error);
            }
        });
    }

    /**
     * Add watermark and resize image
     */
    async processImage(
        inputPath: string,
        outputPath: string,
        options?: {
            watermarkText?: string;
            watermarkImage?: string;
            width?: number;
            height?: number;
            quality?: number;
        },
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            let ffmpegCommand = ffmpeg(inputPath);

            if (options?.watermarkText) {
                const text = options.watermarkText.replace(/'/g, "\\'");

                const positions = [
                    [30, 30], [280, 30], [530, 30], [780, 30],
                    [155, 120], [405, 120], [655, 120], [905, 120],
                    [30, 210], [280, 210], [530, 210], [780, 210],
                    [155, 300], [405, 300], [655, 300], [905, 300],
                    [30, 390], [280, 390], [530, 390], [780, 390],
                    [155, 480], [405, 480], [655, 480], [905, 480],
                    [30, 570], [280, 570], [530, 570], [780, 570],
                    [155, 660], [405, 660], [655, 660], [905, 660],
                    [30, 750], [280, 750], [530, 750], [780, 750],
                ];

                const filterChain = positions
                    .map(([x, y]) => `drawtext=text='${text}':fontsize=28:fontcolor=white@0.35:x=${x}:y=${y}`)
                    .join(',');

                ffmpegCommand = ffmpegCommand.outputOptions([`-vf`, filterChain]);
            }

            if (options?.width && options?.height) {
                ffmpegCommand = ffmpegCommand.size(`${options.width}x${options.height}`).autopad();
            }

            ffmpegCommand = ffmpegCommand.output(outputPath);
            if (options?.quality && outputPath.endsWith('.jpg')) {
                ffmpegCommand = ffmpegCommand.outputOptions([`-q:v ${Math.round((100 - options.quality) / 10)}`]);
            }

            ffmpegCommand
                .on('end', () => {
                    logger.info(`Image processed: ${outputPath}`);
                    resolve();
                })
                .on('error', (error) => {
                    logger.error(`Image processing failed: ${error.message}`);
                    reject(error);
                })
                .run();
        });
    }
}

export const watermarkService = new WatermarkService();
