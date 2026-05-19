#!/usr/bin/env node

/**
 * WhatsApp Pet Art Funnel Engine
 * Complete Backend System for Sales Automation
 * 
 * 📖 START HERE:
 * 1. Read: QUICKSTART.md (5-minute setup)
 * 2. Read: README.md (full project overview)
 * 3. Read: API.md (webhook documentation)
 * 4. Read: DEPLOYMENT.md (for production)
 * 
 * 🚀 QUICK COMMANDS:
 * npm install           - Install dependencies
 * npm run dev          - Start API server (dev)
 * npm run dev:worker   - Start worker (dev)
 * npm run build        - Compile TypeScript
 * npm start            - Start API server (prod)
 * npm run worker       - Start worker (prod)
 * docker-compose up    - Start full stack locally
 * 
 * 📁 PROJECT STRUCTURE:
 * src/
 *   ├── config/        - Database connections
 *   ├── models/        - MongoDB schemas
 *   ├── routes/        - API endpoints
 *   ├── middleware/    - Express middleware
 *   ├── funnel/        - Funnel engine & nodes
 *   ├── services/      - External API wrappers
 *   ├── queue/         - Message queue system
 *   ├── logger/        - Custom logging
 *   ├── utils/         - Utilities
 *   ├── app.ts         - Server entry
 *   └── worker.ts      - Worker entry
 * 
 * 📚 DOCUMENTATION:
 * - QUICKSTART.md      → 5-minute setup guide
 * - README.md          → Full project overview
 * - API.md             → Webhook & endpoint docs
 * - DEPLOYMENT.md      → Production deployment
 * - PROJECT.md         → File inventory & structure
 * 
 * 🏗️ ARCHITECTURE:
 * User → Meta Webhook → RabbitMQ → Worker → Execute Funnel → WhatsApp Response
 *                          ↓
 *                      MongoDB (State)
 *                      Redis (Cache)
 * 
 * 🎯 KEY FEATURES:
 * ✓ Meta Cloud API integration (WhatsApp)
 * ✓ RabbitMQ async processing with persistence
 * ✓ MongoDB user state management
 * ✓ Redis caching & remarketing scheduler
 * ✓ Stripe payment processing
 * ✓ Google Gemini image generation
 * ✓ FFmpeg watermarking
 * ✓ 12+ configurable funnel node types
 * ✓ Pluggable action system
 * ✓ AIDA-structured Spanish funnel
 * ✓ Production-ready Docker setup
 * 
 * 🔐 SECURITY:
 * ✓ HMAC signature verification (Meta & Stripe)
 * ✓ Input validation (email, phone)
 * ✓ Database state persistence
 * ✓ DLQ for failed messages
 * ✓ Environment variable isolation
 * 
 * 🚀 GETTING STARTED:
 * 1. npm install
 * 2. cp .env.example .env
 * 3. docker-compose up -d
 * 4. npm run dev &
 * 5. npm run dev:worker &
 * 6. Visit http://localhost:3000/health
 * 
 * 📈 SCALING:
 * - Horizontal: Run multiple worker instances
 * - Vertical: Increase RabbitMQ prefetch
 * - Database: MongoDB sharding, Redis cluster
 * 
 * 🐛 TROUBLESHOOTING:
 * - Check logs: Check src/logger output
 * - Database issue: Verify MongoDB connection
 * - Queue issue: Check RabbitMQ (http://localhost:15672)
 * - Message not processing: Check if worker is running
 * 
 * 📞 DEVELOPMENT TIPS:
 * - Use ngrok for local webhook testing
 * - Test with stripe CLI: stripe listen --forward-to localhost:3000/webhook/stripe
 * - Monitor RabbitMQ: http://localhost:15672 (guest/guest)
 * - View logs: docker-compose logs -f worker
 * 
 * 🎓 LEARNING RESOURCES:
 * - Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/
 * - RabbitMQ: https://www.rabbitmq.com/tutorials/
 * - MongoDB: https://mongoosejs.com/docs/
 * - Stripe: https://stripe.com/docs/api
 * - Google Gemini: https://ai.google.dev/docs
 * 
 * 📊 PROJECT STATS:
 * - Source Files: 25
 * - TypeScript Strict Mode: Yes
 * - Tests: Add using Jest (recommended)
 * - Documentation: 5 guides (~3500 lines)
 * - Ready for Production: Yes
 * 
 * 🎉 YOU'RE READY!
 * Start with: npm install && npm run dev
 * Then read: QUICKSTART.md
 */

console.log(`
╔════════════════════════════════════════════════════════════════╗
║       WhatsApp Pet Art Funnel Engine - Backend System          ║
║                                                                ║
║  A complete, production-ready sales automation platform       ║
║  for WhatsApp with AI image generation and Stripe payments.   ║
╚════════════════════════════════════════════════════════════════╝

📖 DOCUMENTATION:
  1. QUICKSTART.md    → 5-minute setup (START HERE!)
  2. README.md        → Full overview & architecture
  3. API.md           → Webhook & endpoint documentation  
  4. DEPLOYMENT.md    → Production deployment guide
  5. PROJECT.md       → File inventory & structure

🚀 QUICK START:
  $ npm install
  $ cp .env.example .env
  $ docker-compose up -d
  $ npm run dev          # Terminal 1
  $ npm run dev:worker   # Terminal 2

🏗️  ARCHITECTURE:
  User Message → Meta Webhook → RabbitMQ Queue
                                    ↓
         Worker Process → Funnel Engine → WhatsApp Response
                ↓           ↓          ↓
            MongoDB    Redis   Stripe/Gemini

✨ KEY FEATURES:
  ✓ Meta Cloud API (WhatsApp) integration
  ✓ RabbitMQ async queue with persistence
  ✓ MongoDB user state management
  ✓ Redis caching & remarketingscheduler
  ✓ Stripe payment processing
  ✓ Google Gemini AI image generation
  ✓ FFmpeg watermarking
  ✓ 12+ funnel node types
  ✓ Pluggable action system
  ✓ Production Docker setup
  ✓ Full TypeScript with strict mode
  ✓ Comprehensive documentation

🎯 NEXT STEPS:
  1. Read QUICKSTART.md
  2. Run: npm install
  3. Run: docker-compose up -d  
  4. Run: npm run dev & npm run dev:worker
  5. Test at: http://localhost:3000/health

For questions, check the documentation files!
Built with ❤️  for pet lovers worldwide 🐾
`);
