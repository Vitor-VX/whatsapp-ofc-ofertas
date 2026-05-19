import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Meta WhatsApp
  META_ACCESS_TOKEN: z.string(),
  META_PHONE_NUMBER_ID: z.string(),
  META_VERIFY_TOKEN: z.string(),
  META_APP_SECRET: z.string(),

  // Stripe
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  STRIPE_PRICE_ID: z.string(),

  // MongoDB
  MONGODB_URI: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // RabbitMQ
  RABBITMQ_URL: z.string().url(),

  // Google Gemini
  GEMINI_API_KEY: z.string(),

  // Storage
  STORAGE_BUCKET: z.string(),
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_ACCESS_KEY_ID: z.string(),
  STORAGE_SECRET_ACCESS_KEY: z.string(),

  // App
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  MERCADOPAGO_ACCESS_TOKEN: z.string(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string(),
  MERCADOPAGO_AMOUNT: z.string(),
  APP_URL: z.string(),
});

export type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function getEnv(): Env {
  if (!env) {
    try {
      env = envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Environment variable validation failed:');
        error.errors.forEach((err) => {
          console.error(`  - ${err.path.join('.')}: ${err.message}`);
        });
      }
      process.exit(1);
    }
  }
  return env;
}

export default getEnv();
