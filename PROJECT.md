# Project Files Summary

## Complete WhatsApp Pet Art Funnel Engine - File Inventory

### Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, metadata |
| `tsconfig.json` | TypeScript compiler configuration (strict mode) |
| `.env.example` | Environment variables template |
| `.gitignore` | Git ignore rules |
| `.dockerignore` | Docker build ignore rules |
| `Dockerfile` | Production container image |
| `docker-compose.yml` | Local development stack (MongoDB, Redis, RabbitMQ) |

### Documentation
| File | Purpose |
|------|---------|
| `README.md` | Project overview, architecture, prerequisites, local setup |
| `QUICKSTART.md` | 5-minute setup guide, quick reference |
| `API.md` | Complete API documentation, webhook formats, examples |
| `DEPLOYMENT.md` | Production deployment guide, cloud options, monitoring |
| `PROJECT.md` | This file - inventory of all files |

---

## Source Code Structure

### Configuration & Database (`src/config/`)
| File | Purpose | Key Exports |
|------|---------|------------|
| `env.ts` | Environment variable validation with Zod | `getEnv()`, `Env` type |
| `mongodb.ts` | MongoDB connection & lifecycle | `connectMongoDB()`, `getMongoDB()` |
| `redis.ts` | Redis connection manager | `connectRedis()`, `getRedisClient()` |
| `rabbitmq.ts` | RabbitMQ setup with durable queues | `connectRabbitMQ()`, `publishMessage()`, `consumeQueue()` |

### Data Models (`src/models/`)
| File | Purpose | Key Types |
|------|---------|-----------|
| `User.ts` | User/Lead MongoDB schema | `IUser` interface, Mongoose model |
| `FunnelSession.ts` | Session tracking schema | `IFunnelSession` interface |

### Routes (`src/routes/`)
| File | Purpose | Endpoints |
|------|---------|-----------|
| `webhook.ts` | Meta Cloud API webhooks | `GET/POST /webhook/whatsapp` |
| `stripe.ts` | Stripe payment webhooks | `POST /webhook/stripe` |

### Middleware (`src/middleware/`)
| File | Purpose | Functions |
|------|---------|-----------|
| `validateWebhook.ts` | HMAC signature verification | `validateWhatsAppWebhook()`, `validateStripeWebhook()` |
| `errorHandler.ts` | Global error handler | `errorHandler()` |

### Funnel Engine (`src/funnel/`)
| File | Purpose | Key Exports |
|------|---------|------------|
| `nodeTypes.ts` | TypeScript node type definitions | `FunnelNode`, `TextNode`, `ButtonNode`, etc. Type guards |
| `engine.ts` | Funnel loading & navigation logic | `FunnelEngine` class |
| `executor.ts` | Node execution & action registry | `FunnelExecutor`, `ActionRegistry` |
| `funnels/pet-art.json` | Pet art product funnel (Spanish) | Complete AIDA-structured funnel |

### Services (`src/services/`)
| File | Purpose | Key Methods |
|------|---------|------------|
| `whatsapp.ts` | Meta Cloud API wrapper | `sendMessage()`, `sendChatAction()`, `downloadMedia()` |
| `gemini.ts` | Google Gemini AI integration | `generatePetImage()`, `analyzeImage()` |
| `stripe.ts` | Stripe payment integration | `createPaymentLink()`, `verifyWebhookSignature()` |
| `watermark.ts` | FFmpeg watermarking | `addTextWatermark()`, `addImageWatermark()`, `processImage()` |
| `remarketing.ts` | Redis-based scheduler | `RemarketingScheduler` class |

### Queue System (`src/queue/`)
| File | Purpose | Key Functions |
|------|---------|-----------|
| `producer.ts` | Publish messages to RabbitMQ | `publishWhatsAppMessage()`, `publishPaymentEvent()` |
| `consumer.ts` | Consume & process messages | `startConsumer()`, `processIncomingMessage()`, action handlers |

### Logger (`src/logger/`)
| File | Purpose | Key Methods |
|------|---------|-----------|
| `index.ts` | Custom formatter logger | `logger.info()`, `logger.error()`, `logger.userMessage()` |

### Utilities (`src/utils/`)
| File | Purpose | Key Functions |
|------|---------|-----------|
| `delay.ts` | Delay & retry utilities | `delay()`, `retryWithBackoff()` |

### Entry Points (`src/`)
| File | Purpose | Usage |
|------|---------|-------|
| `app.ts` | Express server | `npm start` or `npm run dev` |
| `worker.ts` | Background worker | `npm run worker` or `npm run dev:worker` |

---

## Total Project Statistics

### Code Files
- **Configuration**: 4 files
- **Models**: 2 files
- **Routes**: 2 files
- **Middleware**: 2 files
- **Funnel Engine**: 4 files (3 TS + 1 JSON)
- **Services**: 5 files
- **Queue**: 2 files
- **Logger**: 1 file
- **Utils**: 1 file
- **Entry Points**: 2 files
- **Total Source Code**: 25 files

### Documentation
- 4 comprehensive markdown files
- ~3000 lines of documentation

### Configuration
- 7 configuration files
- Docker support included

---

## Key Architectural Components

### 1. Message Pipeline
```
User Message (WhatsApp)
    ↓
Meta Webhook (POST /webhook/whatsapp)
    ↓
Validate Signature
    ↓
Publish to RabbitMQ (whatsapp.inbound)
    ↓
Return 200 to Meta (immediate)
    ↓
Worker Consumes Message
    ↓
Load/Create User (MongoDB)
    ↓
Execute Funnel (engine.ts)
    ↓
Send Responses (WhatsApp API)
    ↓
Save State (MongoDB)
```

### 2. Funnel Node Types (12 Total)
- **Messaging** (4): text, image, audio, video
- **Interaction** (2): buttons, list
- **Input** (2): waitInput, waitPhoto
- **Flow** (2): delay, typing
- **Actions** (1): action
- **Advanced** (2): remarketing, end

### 3. Action System
- **Pluggable** - Add new actions by registering handlers
- **Built-in** - generatePetImage, createStripePaymentLink, deliverFinalImage, saveStyle
- **Extensible** - Custom actions can be added to ActionRegistry

### 4. Database Strategy
- **MongoDB** - User state, funnel sessions (source of truth)
- **Redis** - Session cache, remarketing scheduler
- **RabbitMQ** - Message queue with persistence

### 5. Service Integrations
- **Meta Cloud API v23.0** - WhatsApp messaging
- **Google Gemini** - Image generation
- **Stripe** - Payments
- **FFmpeg** - Watermarking
- **AWS S3/Cloudflare R2** - Image storage (pluggable)

---

## File Size Overview

```
Source Code:    ~2500 lines
Documentation:  ~3500 lines
Config:         ~1000 lines
---
Total:          ~7000 lines
```

---

## Dependencies Summary

### Core
- express (web framework)
- mongoose (MongoDB ORM)
- amqplib (RabbitMQ client)
- redis (Redis client)
- axios (HTTP client)

### External Services
- stripe (payments)
- @google/generative-ai (Gemini AI)
- fluent-ffmpeg (watermarking)

### Validation & Config
- zod (schema validation)
- dotenv (environment variables)

### TypeScript
- typescript (strict mode)
- ts-node (development)
- @types/* (type definitions)

### Development Tools
- eslint (linting)
- prettier (formatting)

---

## Code Organization Principles

✅ **Separation of Concerns**
- Routes → Controllers → Services → Models
- Database access isolated in models
- Business logic in services & engine

✅ **Type Safety**
- Full TypeScript strict mode
- Zod validation for env vars
- Type guards for node types

✅ **Scalability**
- Queue-based async processing
- Database-backed state
- Pluggable action system
- Horizontal scaling ready

✅ **Maintainability**
- Clear file structure
- Inline documentation
- Type definitions for all interfaces
- Error handling throughout

✅ **Security**
- HMAC signature verification
- Input validation
- Environment variable isolation
- No hardcoded secrets

---

## Quick File Lookup

### By Purpose

**Adding a new feature:**
1. Create route in `src/routes/`
2. Create service in `src/services/`
3. Register action in `src/queue/consumer.ts`
4. Update models if needed

**Adding a new funnel:**
1. Create JSON in `src/funnel/funnels/`
2. Update consumer to load it
3. Register new actions if needed

**Fixing a bug:**
1. Check logs from `src/logger/`
2. Review relevant service
3. Check database state in MongoDB
4. Check queue state in RabbitMQ

**Deploying:**
1. Review `DEPLOYMENT.md`
2. Update `.env` with production values
3. Use `docker-compose` or cloud platform
4. Configure webhooks in Meta & Stripe

---

## Testing Checklist

- [ ] Local setup with docker-compose works
- [ ] API health endpoint responds
- [ ] Meta webhook verification works
- [ ] Test message flows through funnel
- [ ] Database stores user data
- [ ] Redis caches state
- [ ] RabbitMQ processes messages
- [ ] Image generation works
- [ ] Payment links created correctly
- [ ] Stripe webhooks processed
- [ ] Logs show expected format

---

## File Modification Guide

### Safe to Modify
- `src/funnel/funnels/pet-art.json` - Change funnel flow
- `.env.example` - Add new env vars
- `src/models/User.ts` - Add user fields
- `src/services/*` - Customize integrations
- `src/queue/consumer.ts` - Add actions

### Careful with Modifications
- `src/funnel/engine.ts` - Core engine logic
- `src/funnel/executor.ts` - Node execution
- `src/config/rabbitmq.ts` - Queue configuration
- `src/app.ts` - Server setup
- `src/worker.ts` - Worker setup

### Do Not Modify
- `tsconfig.json` - Unless you know TypeScript well
- `package.json` - Unless adding/removing packages
- Dependency versions - Test thoroughly

---

**Last Updated**: 2025-07-15
**Project Status**: Production Ready (MVP)
**Maintainability**: High (clear structure, documented)
**Scalability**: Ready (queue-based architecture)
