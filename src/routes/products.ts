import { Router, Request, Response } from 'express';
import { logger } from '../logger';
import { User } from '../models/User';

const router = Router();

router.get('/product/envelope/:slug', async (req: Request, res: Response) => {
    try {
        const slug = req.params.slug;

        const user = await User.findOne({
            "envelope.slug": slug
        });
        if (!user) {
            return res.status(404).json({ error: 'Envelope not found' });
        }

        const envelope = user.envelope.find(el => el.slug === slug);
        const photos = envelope?.photos;

        const response = {
            slug: envelope?.slug,
            recipient: envelope?.title,
            message: envelope?.message,
            signature: envelope?.signature,

            photos,

            music: {
                name: envelope?.options.musicName,
                url: envelope?.options.musicUrl,
            },

            startDate: envelope?.options.startDate,
            expiresAt: envelope?.expiresAt,
        };

        return res.json(response);

    } catch (error) {
        logger.error(`Error fetching envelope: ${error instanceof Error ? error.message : String(error)}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
