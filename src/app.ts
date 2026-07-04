import express, { Express, Request, Response, NextFunction } from 'express';
import { connectMongoDB } from './config/mongodb';
import { connectRedis } from './config/redis';
import { connectRabbitMQ } from './config/rabbitmq';
import { getEnv } from './config/env';
import { logger } from './logger';
import whatsappRoutes from './routes/webhook';
import stripeRoutes from './routes/stripe';
import mercadoRoutes from './routes/mercadopago';
import productRoutes from './routes/products';
import { errorHandler } from './middleware/errorHandler';
import cors from "cors";
import { sunoService } from './services/sunoService';

const app: Express = express();
const env = getEnv();

app.use(cors());

/**
 * Middleware to capture raw body for webhook signature verification
 */
app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));

/**
 * Request logging middleware
 */
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

/**
 * Routes
 */
app.use(whatsappRoutes);
app.use(stripeRoutes);
app.use(mercadoRoutes);
app.use(productRoutes);

app.post("/webhooks/suno-callback", (req, res) => {
    // logger.debug(`[suno-callback] recebido: ${JSON.stringify(req.body)}`);
    res.status(200).json({ received: true });
});

// sunoService.generateSong({
//     honoreeName: "Daniel e may",
//     relationship: "Os dois e ex",
//     specialMessage: "Eles se amam mais nao pode fica juntos pos se machucar demais e um amor q dói na alma deles, elex brigava muito mas quando ta longe sente saudades, fala q a may ama ele e quer ela ora pra ele volta, todos os dias eles passaram dois anos juntos os dois são como fogo e água os dois tem uma química so pelo olha e lindo e um amor a doi senti",
//     musicStyle: "Sertanejo raiz",
//     voicePreference: "Masculina",
//     specialQuality: "Um momento especial foi a conexão dos dois q eles sentiram eles entendem vai sabe oq e"
// }).then(res => {
//     console.log(res);
// }).catch(err => {
//     console.log(err);
// })

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
});

/**
 * Error handler
 */
app.use(errorHandler);

/**
 * Initialize and start server
 */
async function startServer(): Promise<void> {
    try {
        logger.info('Starting WhatsApp Pet Art Funnel Engine...');

        // Connect to databases
        await connectMongoDB();
        await connectRedis();
        await connectRabbitMQ();

        // Start server
        const port = env.PORT || 3000;
        app.listen(port, () => {
            logger.info(`Server listening on port ${port}`);
        });
    } catch (error) {
        logger.error(
            `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer().catch((error) => {
    logger.error(`Startup error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});

export default app;
