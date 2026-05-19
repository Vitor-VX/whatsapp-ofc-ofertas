# WhatsApp Pet Art Funnel Engine

A robust, scalable backend system for a WhatsApp sales funnel automation engine. This system converts WhatsApp conversations into sales using AI-generated pet artwork and Stripe payments.

## 🚀 Project Overview

This is an **MVP-ready backend** for a pet art digital product sales funnel:

- **Product**: Personalized AI-generated digital pet artwork ($5 USD)
- **Automation**: AIDA-structured WhatsApp funnel (Attention → Interest → Desire → Action)
- **Target Market**: Mexican market (Spanish language)
- **Processing**: Queue-based async architecture with RabbitMQ
- **Persistence**: MongoDB for user state, Redis for caching & remarketing

## 🏗️ Architecture

### Core Components

1. **Express API Server** (`src/app.ts`)
   - Webhook endpoints for Meta Cloud API and Stripe
   - Immediate acknowledgment with async processing
   - Health check endpoint

2. **Background Worker** (`src/worker.ts`)
   - Consumes messages from RabbitMQ queues
   - Executes funnel logic asynchronously
   - Handles image generation, payments, and user interactions

3. **Funnel Engine** (`src/funnel/engine.ts`)
   - Loads funnel definition from JSON
   - Manages node navigation and variable interpolation
   - Validates user inputs

4. **Message Queue** (RabbitMQ)
   - `whatsapp.inbound`: User messages from Meta
   - `whatsapp.outbound`: Messages to be sent (optional rate limiting)
   - `payment.events`: Stripe webhook events
   - `whatsapp.inbound.dlq`: Dead letter queue for failed messages

5. **Services**
   - **WhatsApp**: Meta Cloud API wrapper
   - **Gemini**: Google Generative AI for image generation
   - **Stripe**: Payment link creation and verification
   - **Watermark**: FFmpeg-based image watermarking
   - **Remarketing**: Redis-based scheduler for follow-up messages

## 📋 Prerequisites

### System Requirements
- Node.js 18+
- MongoDB (local or Atlas)
- Redis
- RabbitMQ
- FFmpeg (for watermark processing)

### API Keys & Credentials
- Meta Cloud API access token
- Stripe API keys
- Google Gemini API key
- Cloud storage (S3, Cloudflare R2, etc.)

## 🔧 Installation & Setup

### 1. Clone and Install

```bash
cd whatsapp-api-ofc-ofertas
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Meta WhatsApp
META_ACCESS_TOKEN=your_token_here
META_PHONE_NUMBER_ID=your_phone_id
META_VERIFY_TOKEN=your_verify_token
META_APP_SECRET=your_app_secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Database
MONGODB_URI=mongodb://localhost:27017/petart
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672

# AI & Storage
GEMINI_API_KEY=your_gemini_key
STORAGE_BUCKET=your_bucket
STORAGE_ENDPOINT=https://your-endpoint.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=your_key_id
STORAGE_SECRET_ACCESS_KEY=your_secret_key

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

### 3. Build TypeScript

```bash
npm run build
```

Or for development with ts-node:

```bash
npm install -g ts-node
```

## 🚀 Running the System

### Option A: Development Mode

Terminal 1 - API Server:
```bash
npm run dev
```

Terminal 2 - Background Worker:
```bash
npm run dev:worker
```

### Option B: Production Mode

Build first:
```bash
npm run build
```

Terminal 1 - API Server:
```bash
npm start
```

Terminal 2 - Background Worker:
```bash
npm run worker
```

### Option C: Docker (Recommended)

See deployment section below.

## 📚 Funnel Structure

The pet art funnel (`src/funnel/funnels/pet-art.json`) follows AIDA logic:

### **Attention** 🐾
- Greeting and image showcase
- Opens attention with "Do you love your pet?"

### **Interest** 💡
- Explains the service and styles
- Shows audio explanation
- Buttons to proceed, learn more, or skip

### **Desire** 😍
- Collects pet name
- Shows style options (Sky, Renaissance, Rococo)
- Waits for user photo
- Generates and displays AI artwork preview
- Option to regenerate or proceed to payment

### **Action** 💳
- Creates Stripe payment link ($5)
- Waits for payment confirmation
- Delivers final artwork without watermark
- Triggers remarketing if user doesn't buy

## 🔄 Message Flow

```
User sends message
         ↓
   Meta Webhook
         ↓
  Validate Signature
         ↓
 Publish to RabbitMQ
         ↓
Return 200 to Meta
         ↓
Worker consumes message
         ↓
 Load/Create User
         ↓
  Execute Funnel
         ↓
  Send Messages/Actions
         ↓
  Await User Input
```

## 🛠️ Node Types

The funnel system supports these node types:

- **`text`** - Simple text message with variable interpolation
- **`image`** - Image with optional caption
- **`audio`** - Audio file (OGG/Opus format)
- **`video`** - Video file with caption
- **`buttons`** - Quick reply buttons (up to 3)
- **`list`** - List selection with sections
- **`typing`** - Shows typing/recording indicator
- **`delay`** - Pause before next node
- **`waitInput`** - Wait for text input, optionally validate (email, phone, text)
- **`waitPhoto`** - Wait for user to send a photo
- **`action`** - Execute custom action (pluggable handlers)
- **`remarketing`** - Schedule message for later
- **`end`** - Terminal node

## 💾 Data Models

### User Schema
```typescript
{
  whatsappId: string;          // Phone number with country code
  name: string | null;
  phone: string;
  funnelId: string;            // Current funnel
  currentNodeId: string;       // Current position in funnel
  funnelCompleted: boolean;    // Is funnel finished?
  collectedData: Record<string, string>;  // User inputs
  paymentStatus: 'pending' | 'paid' | 'failed';
  stripeSessionId: string | null;
  generatedImageUrl: string;   // Watermarked preview
  originalImageUrl: string;    // Final artwork
  windowExpiresAt: Date;       // 24-hour remarketing window
  remarketingSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## 🔐 Security & Validation

- ✅ HMAC signature verification for Meta webhooks
- ✅ Stripe webhook signature verification
- ✅ Input validation (email, phone formats)
- ✅ User state persistence before node execution
- ✅ Automatic retry with exponential backoff
- ✅ Dead letter queue for failed messages
- ✅ Rate limiting ready (implement as needed)

## 📊 Logging

All logs follow the format: `[dd/mm/yyyy] hh:mm — [LEVEL] message`

### Log Types
- **INFO** - General information (white)
- **WARN** - Warnings (yellow)
- **ERROR** - Errors (red)
- **DEBUG** - Debug info (gray)
- **USER MSG** - Incoming user messages (cyan) - `📱 +55XXXXXXXXX | "message"`
- **BOT MSG** - Outgoing bot messages (white) - `📤 +55XXXXXXXXX | message`

Example:
```
[15/07/2025] 14:32 — [INFO] RabbitMQ connected
[15/07/2025] 14:33 — [USER MSG] 📱 +521234567890 | "Hola"
[15/07/2025] 14:33 — [INFO] User created: +521234567890
[15/07/2025] 14:33 — [BOT MSG] 📤 +521234567890 | ¡Hola! 🐾
```

## 🚀 Deployment

### Prerequisites
- Docker & Docker Compose
- Cloud hosting (AWS, Google Cloud, Railway, Render, etc.)
- MongoDB Atlas (or self-hosted)
- Redis Cloud or self-hosted instance

### Using Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      MONGODB_URI: ${MONGODB_URI}
      REDIS_URL: ${REDIS_URL}
      RABBITMQ_URL: ${RABBITMQ_URL}
      # ... other env vars
    depends_on:
      - mongodb
      - redis
      - rabbitmq
    restart: unless-stopped

  worker:
    build: .
    command: npm run worker
    environment:
      NODE_ENV: production
      MONGODB_URI: ${MONGODB_URI}
      REDIS_URL: ${REDIS_URL}
      RABBITMQ_URL: ${RABBITMQ_URL}
      # ... other env vars
    depends_on:
      - mongodb
      - redis
      - rabbitmq
    restart: unless-stopped

  mongodb:
    image: mongo:7
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: user
      RABBITMQ_DEFAULT_PASS: password
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  mongodb_data:
  redis_data:
  rabbitmq_data:
```

### Environment Variables for Hosting

Create a `.env.prod` file with production values:

```bash
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# All API keys and URLs here
```

### Deployment Steps

1. **Set up databases** (MongoDB Atlas, Redis Cloud, CloudAMQP)
2. **Configure environment variables** in your hosting platform
3. **Deploy API and Worker** as separate services/containers
4. **Configure webhooks**:
   - Meta: `https://your-domain.com/webhook/whatsapp`
   - Stripe: `https://your-domain.com/webhook/stripe`
5. **Set up monitoring** (Sentry, LogRocket, etc.)
6. **Configure domain** with SSL/TLS certificate

## 🔗 Webhook Configuration

### Meta Cloud API Webhook

In your Meta app dashboard:
```
Webhook URL: https://your-domain.com/webhook/whatsapp
Verify Token: (use META_VERIFY_TOKEN from .env)
Subscriptions: messages, message_status
```

### Stripe Webhook

In your Stripe dashboard:
```
Endpoint URL: https://your-domain.com/webhook/stripe
Events: checkout.session.completed, checkout.session.expired, charge.failed, charge.refunded
```

## 📈 Scaling Considerations

### Current Bottlenecks
- Sequential message processing per user (by design)
- Image generation wait time (3-5s per request)

### Optimization Options
1. **Horizontal scaling**: Run multiple worker instances
2. **Rate limiting**: Implement token bucket on Meta API calls
3. **Caching**: Cache generated images by style + breed
4. **CDN**: Use CloudFlare for watermarking
5. **Lambda**: Offload image processing to serverless

## 🐛 Troubleshooting

### Messages not being processed
- Check RabbitMQ connection: `RABBITMQ_URL` in .env
- Verify worker is running: `npm run dev:worker`
- Check MongoDB connection
- Look for errors in worker logs

### Webhooks not triggering
- Verify webhook URLs are publicly accessible
- Check signature verification (test with curl)
- Ensure .env variables match webhook setup
- Check firewall/security groups

### Image generation failing
- Verify Gemini API key is valid
- Check FFmpeg is installed: `ffmpeg -version`
- Ensure temp directory has write permissions

## 📝 Next Steps

1. ✅ Test locally with ngrok or localtunnel
2. ✅ Create Stripe test account and get credentials
3. ✅ Set up Meta test phone number
4. ✅ Deploy to staging environment
5. ✅ Run end-to-end funnel test
6. ✅ Deploy to production
7. ✅ Monitor metrics and conversion rates

## 🤝 Contributing

This is an MVP ready for expansion. To add features:

1. Create new action handlers in `src/queue/consumer.ts`
2. Add new funnel nodes to pet-art.json
3. Create new service wrappers as needed
4. Update environment variables

## 📄 License

All rights reserved © 2025

---

**Built with ❤️ for pet lovers worldwide** 🐾
