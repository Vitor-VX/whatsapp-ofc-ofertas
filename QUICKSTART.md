# Quick Start Guide

## 🚀 Get Running in 5 Minutes

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Start Services (with Docker Compose)
```bash
docker-compose up -d
```

### 4. Run Application
```bash
# Terminal 1 - API Server
npm run dev

# Terminal 2 - Background Worker
npm run dev:worker
```

### 5. Test Webhook
```bash
# Create a test tunnel
npm install -g ngrok
ngrok http 3000

# Get your public URL: https://XXXXX.ngrok.io/webhook/whatsapp
# Configure in Meta Dashboard
```

---

## 📁 Project Structure

```
whatsapp-api-ofc-ofertas/
├── src/
│   ├── config/              # Configuration & database connections
│   │   ├── env.ts          # Environment variables (Zod validation)
│   │   ├── mongodb.ts      # MongoDB connection
│   │   ├── redis.ts        # Redis connection
│   │   └── rabbitmq.ts     # RabbitMQ setup
│   │
│   ├── models/             # Mongoose schemas
│   │   ├── User.ts         # User model
│   │   └── FunnelSession.ts # Session tracking
│   │
│   ├── routes/             # Express routes
│   │   ├── webhook.ts      # Meta Cloud API webhooks
│   │   └── stripe.ts       # Stripe payment webhooks
│   │
│   ├── middleware/         # Express middleware
│   │   ├── validateWebhook.ts # HMAC signature verification
│   │   └── errorHandler.ts    # Global error handler
│   │
│   ├── funnel/             # Funnel engine
│   │   ├── engine.ts       # Core funnel logic
│   │   ├── executor.ts     # Node execution & action handlers
│   │   ├── nodeTypes.ts    # TypeScript node definitions
│   │   └── funnels/
│   │       └── pet-art.json # Pet art product funnel (Spanish)
│   │
│   ├── services/           # External API wrappers
│   │   ├── whatsapp.ts     # Meta Cloud API wrapper
│   │   ├── gemini.ts       # Google Gemini AI integration
│   │   ├── stripe.ts       # Stripe payment integration
│   │   ├── watermark.ts    # FFmpeg watermarking
│   │   └── remarketing.ts  # Redis-based scheduler
│   │
│   ├── queue/              # Message queue system
│   │   ├── producer.ts     # Publish messages to RabbitMQ
│   │   └── consumer.ts     # Consume & process messages
│   │
│   ├── logger/             # Custom logging
│   │   └── index.ts        # Formatted logs [dd/mm/yyyy] hh:mm
│   │
│   ├── utils/              # Utility functions
│   │   └── delay.ts        # Sleep & retry helpers
│   │
│   ├── app.ts              # Express server entry point
│   └── worker.ts           # Background worker entry point
│
├── docker-compose.yml      # Local dev stack
├── Dockerfile              # Production container
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── .env.example            # Environment template
├── README.md               # Project overview
├── API.md                  # API documentation
├── DEPLOYMENT.md           # Deployment guide
└── .gitignore             # Git ignore rules
```

---

## 🔧 Key Features

### ✅ Complete Implementation
- [x] WhatsApp Meta Cloud API integration
- [x] RabbitMQ async message processing
- [x] MongoDB user persistence
- [x] Redis caching & remarketing
- [x] Stripe payment processing
- [x] Google Gemini image generation
- [x] FFmpeg watermarking
- [x] Custom logger with formatted output
- [x] Pluggable action system
- [x] 12+ funnel node types
- [x] Spanish-language AIDA funnel

### 📊 Funnel Nodes
- **Messaging**: Text, Image, Audio, Video
- **Interaction**: Buttons, Lists
- **Input**: Text input, Photo upload
- **Flow Control**: Delay, Typing indicator
- **Actions**: Generate image, Create payment link, Deliver files
- **Advanced**: Remarketing scheduler, End node

### 🔐 Security
- HMAC signature verification (Meta & Stripe)
- Input validation (email, phone)
- User state persistence before execution
- Rate limiting ready
- DLQ for failed messages

### 📈 Scalability
- Queue-based async architecture
- Database-backed state
- Horizontal scaling ready
- Image processing offloadable

---

## 🎯 Next Steps

### For Development
1. Run locally with `npm run dev` + `npm run dev:worker`
2. Test webhooks with ngrok
3. Review funnel in `src/funnel/funnels/pet-art.json`
4. Customize funnel nodes as needed

### For Deployment
1. Review [DEPLOYMENT.md](DEPLOYMENT.md)
2. Choose hosting (Render, Railway, AWS, GCP)
3. Set up production environment variables
4. Configure webhooks (Meta, Stripe)
5. Set up monitoring & logs

### For Customization
1. Create new funnel: Copy `pet-art.json`, modify nodes
2. Add new action: Register handler in `src/queue/consumer.ts`
3. Add service: Create wrapper in `src/services/`
4. Extend model: Update `src/models/User.ts`

---

## 📚 Documentation

- **README.md** - Project overview & setup
- **API.md** - Webhook & endpoint documentation
- **DEPLOYMENT.md** - Production deployment guide
- **Code Comments** - Inline documentation throughout

---

## 🐛 Troubleshooting

### "ECONNREFUSED - Can't connect to database"
```
Make sure MongoDB is running:
docker-compose up mongodb
# or: brew services start mongodb-community
```

### "RabbitMQ connection failed"
```
Make sure RabbitMQ is running:
docker-compose up rabbitmq
# Check: http://localhost:15672 (guest/guest)
```

### "Webhook signature invalid"
```
1. Check META_APP_SECRET is correct
2. Verify webhook is receiving raw body
3. Test with curl to debug
```

### "Messages not processing"
```
1. Check worker is running: npm run dev:worker
2. Check RabbitMQ queue: http://localhost:15672
3. Review worker logs for errors
4. Check MongoDB connection
```

---

## 📞 Support

For detailed documentation:
- Funnel structure: see `API.md` "Funnel Nodes" section
- Webhook setup: see `API.md` "Endpoints" section
- Deployment options: see `DEPLOYMENT.md`
- Code structure: check inline comments in source files

---

## 🎓 Learning Resources

### Meta Cloud API
- https://developers.facebook.com/docs/whatsapp/cloud-api/

### RabbitMQ
- https://www.rabbitmq.com/tutorials/
- Persistence guide: https://www.rabbitmq.com/persistence-conf.html

### MongoDB with Mongoose
- https://mongoosejs.com/docs/
- Schemas: https://mongoosejs.com/docs/guide.html

### Stripe Payments
- https://stripe.com/docs/api
- Webhooks: https://stripe.com/docs/webhooks

### Google Gemini
- https://ai.google.dev/docs

---

**Ready to go? Start with:** `npm install && npm run dev` & `npm run dev:worker`

Questions? Check the docs first, then review the code comments. 🚀
