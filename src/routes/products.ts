import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { User } from '../models/User';

const router = Router();

router.get('/product/envelope/:slug', async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug;

        const user = await User.findOne({
            "collectedData.envelopeSlug": slug
        });
        if (!user) {
            return res.status(404).json({ error: 'Envelope not found' });
        }

        const data = user.collectedData as Map<string, string>;
        function extractPhotos(data: Map<string, string>): string[] {
            return Array.from(data.entries())
                .filter(([key]) => key.startsWith("photo_"))
                .sort((a, b) => {
                    const aIndex = Number(a[0].split("_")[1]);
                    const bIndex = Number(b[0].split("_")[1]);
                    return aIndex - bIndex;
                })
                .map(([, value]) => value)
                .filter(Boolean);
        }
        const photos = extractPhotos(data);

        const response = {
            slug: data.get("envelopeSlug"),
            url: data.get("envelopeUrl"),
            qrCode: data.get("envelopeQrCode"),

            recipient: data.get("recipient"),
            message: data.get("message"),
            signature: data.get("signature"),

            photos,

            music: {
                name: data.get("musicName"),
                url: data.get("musicUrl"),
            },

            plan: {
                days: data.get("planDays"),
                label: data.get("planLabel"),
                price: data.get("packagePrice"),
                priceValue: data.get("packagePriceValue"),
                priceCents: data.get("packagePriceCents"),
            },

            startDate: data.get("startDate"),
            expiresAt: data.get("envelopeExpiresAt"),
        };

        return res.json(response);

    } catch (error) {
        logger.error(`Error fetching envelope: ${error instanceof Error ? error.message : String(error)}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
