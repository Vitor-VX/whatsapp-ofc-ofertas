# Deployment Guide - WhatsApp Pet Art Funnel Engine

## Table of Contents
1. [Local Development Setup](#local-development-setup)
2. [Docker Deployment](#docker-deployment)
3. [Cloud Deployment Options](#cloud-deployment-options)
4. [Production Configuration](#production-configuration)
5. [Monitoring & Logs](#monitoring--logs)

---

## Local Development Setup

### Prerequisites
```bash
# Install required software
- Node.js 18+
- MongoDB Community Edition
- Redis
- RabbitMQ
- FFmpeg
```

### macOS (using Homebrew)
```bash
brew install node mongodb redis rabbitmq ffmpeg
# Start services
brew services start mongodb-community
brew services start redis
brew services start rabbitmq
```

### Linux (Ubuntu/Debian)
```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org

# Redis
sudo apt-get install -y redis-server

# RabbitMQ
sudo apt-get install -y rabbitmq-server

# FFmpeg
sudo apt-get install -y ffmpeg
```

### Windows (using WSL2 or Docker)
Use WSL2 with Linux commands, or Docker Compose (recommended)

### Setup Project

```bash
# Clone and navigate
cd whatsapp-api-ofc-ofertas

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your local credentials
nano .env

# Build TypeScript
npm run build
```

### Run Locally

**Terminal 1 - API Server:**
```bash
npm run dev
```
Server will be available at http://localhost:3000

**Terminal 2 - Background Worker:**
```bash
npm run dev:worker
```

**Terminal 3 - Monitor Logs:**
```bash
# Watch MongoDB
mongosh petart

# Watch Redis
redis-cli

# Watch RabbitMQ
# Open http://localhost:15672 (guest/guest)
```

---

## Docker Deployment

### Using Docker Compose (Easiest)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api
docker-compose logs -f worker

# Stop
docker-compose down

# Rebuild images
docker-compose up -d --build
```

### Service URLs (Docker)
- **API**: http://localhost:3000
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379

### Docker-only API Container

```bash
# Build image
docker build -t petart:latest .

# Run API
docker run -d \
  --name petart-api \
  -p 3000:3000 \
  -e MONGODB_URI=mongodb://mongodb:27017/petart \
  -e REDIS_URL=redis://redis:6379 \
  -e RABBITMQ_URL=amqp://rabbitmq:5672 \
  -e META_ACCESS_TOKEN=your_token \
  petart:latest

# Run Worker
docker run -d \
  --name petart-worker \
  -e MONGODB_URI=mongodb://mongodb:27017/petart \
  -e REDIS_URL=redis://redis:6379 \
  -e RABBITMQ_URL=amqp://rabbitmq:5672 \
  petart:latest \
  npm run worker
```

---

## Cloud Deployment Options

### Option 1: Render (Recommended for MVP)

#### Setup
1. Push code to GitHub
2. Connect GitHub to Render
3. Create two services:
   - **Web Service** (API)
   - **Background Worker** (Worker)

#### API Service Configuration
```
- Build Command: npm install && npm run build
- Start Command: node dist/app.js
- Environment Variables:
  - NODE_ENV=production
  - PORT=3000
  - All .env variables
- Dockerfile: Use provided Dockerfile
```

#### Worker Service Configuration
```
- Build Command: npm install && npm run build
- Start Command: node dist/worker.js
- Environment Variables: Same as API
- Keep-Alive: Enable (to prevent sleeping)
```

#### Database Services
- MongoDB Atlas (free tier available)
- Redis Cloud (free tier available)
- CloudAMQP (RabbitMQ hosting)

### Option 2: Railway.app (Great UX)

1. Login to railway.app
2. Create new project
3. Add services:
   - GitHub repository
   - MongoDB (from marketplace)
   - Redis (from marketplace)
   - RabbitMQ via CloudAMQP

4. Configure API service:
```
- Root Directory: ./
- Build Command: npm install && npm run build
- Start Command: npm start
```

5. Configure Worker service:
```
- Root Directory: ./
- Build Command: npm install && npm run build
- Start Command: npm run worker
- Dockerfile: Yes, use provided
```

### Option 3: AWS (Most Control)

#### Using ECS + Docker

```bash
# Create ECR repository
aws ecr create-repository --repository-name petart

# Build and push image
docker build -t petart:latest .
docker tag petart:latest ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/petart:latest
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com
docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/petart:latest

# Create ECS task definition (task-definition.json)
# Create ECS service pointing to task definition
# Create RDS for MongoDB (or use MongoDB Atlas)
# Create ElastiCache for Redis
# Create CloudAMQP for RabbitMQ
```

#### Security Groups
```
Allow inbound:
- Port 3000 from ALB
- Port 27017 from ECS (MongoDB)
- Port 6379 from ECS (Redis)
- Port 5672 from ECS (RabbitMQ)
```

### Option 4: Google Cloud Run + Cloud Tasks

```bash
# Build and push to Container Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/petart-api

# Deploy API
gcloud run deploy petart-api \
  --image gcr.io/PROJECT_ID/petart-api \
  --memory 512Mi \
  --timeout 3600s \
  --set-env-vars "MONGODB_URI=..." \
  --allow-unauthenticated

# Deploy Worker
gcloud run deploy petart-worker \
  --image gcr.io/PROJECT_ID/petart-api \
  --memory 1024Mi \
  --command npm,run,worker \
  --set-env-vars "MONGODB_URI=..." \
  --no-allow-unauthenticated
```

---

## Production Configuration

### Environment Variables - Production

Create `.env.prod` or set in hosting platform:

```env
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn

# Security
META_APP_SECRET=your_production_secret
STRIPE_WEBHOOK_SECRET=your_production_webhook_secret

# APIs
META_ACCESS_TOKEN=your_production_token
META_PHONE_NUMBER_ID=your_production_phone_id
META_VERIFY_TOKEN=your_production_verify_token
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
GEMINI_API_KEY=your_production_key

# Database - Production URLs
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/petart?retryWrites=true&w=majority
REDIS_URL=redis://:password@redis-hostname:6379
RABBITMQ_URL=amqp://user:password@rabbitmq-hostname:5672

# Storage - Cloudflare R2 or AWS S3
STORAGE_BUCKET=production-bucket
STORAGE_ENDPOINT=https://your-bucket.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=prod_key_id
STORAGE_SECRET_ACCESS_KEY=prod_secret_key

# Optional: Error Tracking
SENTRY_DSN=https://your_sentry_dsn@sentry.io/project_id
```

### Database Backups

#### MongoDB Atlas
- Automatic daily backups included
- Configure point-in-time restore
- Enable IP whitelisting

#### Redis Cloud
- Enable automatic backups
- Configure replication
- Use dedicated instances for production

#### RabbitMQ (CloudAMQP)
- Enable automatic backups
- Use dedicated clusters
- Configure durable queues (already in code)

### SSL/TLS Certificate

```bash
# Using Let's Encrypt with Certbot
sudo certbot certonly --standalone -d your-domain.com

# Or use AWS Certificate Manager / Google Cloud Certificate Manager
```

### Domain Configuration

**Meta Webhook Setup:**
```
Webhook URL: https://your-domain.com/webhook/whatsapp
Verify Token: your_verify_token
Subscribe to: messages, message_status
```

**Stripe Webhook Setup:**
```
Endpoint URL: https://your-domain.com/webhook/stripe
Events: 
  - checkout.session.completed
  - checkout.session.expired
  - charge.failed
  - charge.refunded
```

---

## Monitoring & Logs

### Application Logs

Logs are printed to stdout in format: `[dd/mm/yyyy] hh:mm — [LEVEL] message`

**Levels:**
- INFO (white): Normal operations
- WARN (yellow): Warnings
- ERROR (red): Errors
- DEBUG (gray): Debug info

### Suggested Monitoring Stack

#### Option 1: AWS CloudWatch
```bash
# Install CloudWatch agent
# Configure log groups:
# - /petart/api
# - /petart/worker

# Create alarms for:
# - Error count > 10/5min
# - Message processing latency > 5s
# - RabbitMQ queue depth > 1000
```

#### Option 2: Sentry (Error Tracking)
```bash
npm install @sentry/node

# In app.ts and worker.ts:
import * as Sentry from '@sentry/node';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

#### Option 3: DataDog
```bash
npm install dd-trace

# Enable distributed tracing and metrics
```

### Health Checks

**API Health:**
```bash
curl https://your-domain.com/health
# Returns: {"status":"ok","timestamp":"2025-07-15T14:30:00.000Z"}
```

**Database Checks:**
```bash
# MongoDB
mongosh "mongodb+srv://..." --eval "db.adminCommand('ping')"

# Redis
redis-cli ping

# RabbitMQ
curl -u guest:guest http://rabbitmq:15672/api/overview
```

### Metrics to Track

1. **Funnel Metrics:**
   - Users entering funnel
   - Completion rate
   - Drop-off points
   - Average time per node

2. **Payment Metrics:**
   - Payment attempts
   - Success rate
   - Revenue
   - Average order value

3. **System Metrics:**
   - API response time
   - Worker message processing time
   - Queue depth
   - Database connections
   - Error rate

4. **RabbitMQ Metrics:**
   - Messages in/out
   - Queue length
   - DLQ depth

### Performance Optimization

**API Response Time Targets:**
- Webhook acknowledgment: < 100ms ✓ (immediate 200 response)
- Health check: < 50ms
- Error rate: < 0.1%

**Worker Processing Targets:**
- Message processing: < 5s (excluding wait nodes)
- Image generation: < 30s
- Database write: < 100ms

**Scale Planning:**
- 100 messages/min → 1 worker sufficient
- 1000 messages/min → 3-5 workers
- 10000 messages/min → 10+ workers + load balancer

---

## Maintenance

### Regular Tasks

**Daily:**
- Monitor error logs
- Check payment processing
- Verify funnel completion rates

**Weekly:**
- Review user analytics
- Check database size growth
- Monitor API latency

**Monthly:**
- Database maintenance (defrag MongoDB)
- Analyze user behavior
- Update dependencies (`npm audit fix`)
- Review spending on external APIs

### Scaling Checklist

- [ ] Database indexed properly (check slow queries)
- [ ] Redis memory usage < 80%
- [ ] RabbitMQ queue depth < 1000
- [ ] API response time < 200ms
- [ ] Worker processing latency < 5s
- [ ] Storage usage under quota
- [ ] API rate limits configured
- [ ] Error tracking configured
- [ ] Backup strategy tested

---

## Troubleshooting Production Issues

### API won't start
```bash
# Check logs
docker-compose logs api

# Verify environment variables
env | grep META_
env | grep STRIPE_

# Test database connection
mongosh $MONGODB_URI
```

### Messages not being processed
```bash
# Check RabbitMQ queue depth
rabbitmqctl list_queues

# Verify worker is running
docker-compose logs worker

# Check dead letter queue
# In RabbitMQ: whatsapp.inbound.dlq
```

### Image generation failing
```bash
# Verify Gemini API key
curl -X POST https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent
  -H "Content-Type: application/json"
  -d '{"contents":[{"parts":[{"text":"test"}]}]}'
  -H "x-goog-api-key: YOUR_API_KEY"

# Check FFmpeg installation
ffmpeg -version

# Verify temp directory permissions
ls -la /tmp
```

### Stripe webhooks not firing
```bash
# Test with Stripe CLI
stripe listen --forward-to localhost:3000/webhook/stripe

# Send test event
stripe trigger checkout.session.completed
```

---

## Rollback Plan

### Database Rollback
```bash
# MongoDB - Use point-in-time restore
db.adminCommand({
  restore: 1,
  timestamp: ISODate("2025-07-15T14:00:00Z")
})

# Redis - From backup
aws s3 cp s3://backups/redis-backup.rdb /var/lib/redis/dump.rdb
```

### Code Rollback
```bash
# Git revert
git revert HEAD

# Docker rollback
docker-compose down
git checkout previous-tag
docker-compose up -d
```

---

For production issues, check logs first, then check database/queue status, then check API health.
