# API Documentation - WhatsApp Pet Art Funnel Engine

## Base URL
```
Production: https://your-domain.com
Development: http://localhost:3000
```

## Authentication
All webhook endpoints use HMAC signature verification. No API key authentication is used for webhooks (they come from trusted sources: Meta and Stripe).

---

## Endpoints

### 1. Webhook Verification (Meta)

**GET** `/webhook/whatsapp`

**Purpose:** Verify webhook endpoint with Meta Cloud API

**Query Parameters:**
```
hub.mode=subscribe
hub.challenge=<challenge_token>
hub.verify_token=<your_verify_token>
```

**Response (Success):**
```
Status: 200
Body: <challenge_token>
```

**Example:**
```bash
curl "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=your_verify_token"
```

**Config in Meta Dashboard:**
```
Webhook URL: https://your-domain.com/webhook/whatsapp
Verify Token: your_verify_token (set in .env as META_VERIFY_TOKEN)
Subscriptions: messages, message_status
```

---

### 2. Incoming Messages (Meta)

**POST** `/webhook/whatsapp`

**Purpose:** Receive messages from users via Meta Cloud API

**Headers:**
```
Content-Type: application/json
X-Hub-Signature-256: sha256=<hmac_signature>
```

**Request Body (Example):**
```json
{
  "entry": [
    {
      "id": "123456789",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "messages": [
              {
                "from": "5521987654321",
                "id": "wamid.xxx",
                "timestamp": "1620000000",
                "type": "text",
                "text": {
                  "body": "Hola"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Message Types Supported:**
```
- text: User sends text message
- image: User sends photo
- audio: User sends audio file
- video: User sends video
- document: User sends file
- interactive: User clicks button/list
```

**Response (Always):**
```
Status: 200
Body: {"status":"received"}
```

**Processing Flow:**
1. Signature verified
2. Immediately return 200 (within 30s required by Meta)
3. Publish to RabbitMQ queue (async)
4. Worker processes message and advances funnel

**Message Logged As:**
```
[15/07/2025] 14:33 — [USER MSG] 📱 +521234567890 | "Hola"
```

---

### 3. Health Check

**GET** `/health`

**Purpose:** Simple health check endpoint

**Response (Success):**
```json
Status: 200
{
  "status": "ok",
  "timestamp": "2025-07-15T14:32:00.000Z"
}
```

---

### 4. Stripe Payment Events

**POST** `/webhook/stripe`

**Purpose:** Receive payment events from Stripe

**Headers:**
```
Content-Type: application/json
Stripe-Signature: t=<timestamp>,v1=<signature>
```

**Supported Events:**

#### checkout.session.completed
Triggered when user completes payment.

```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_live_xxx",
      "status": "complete",
      "amount_total": 500,
      "currency": "usd",
      "metadata": {
        "whatsappId": "5521987654321",
        "userId": "ObjectId",
        "petName": "Thor"
      }
    }
  }
}
```

**Action:** 
- Mark user as `paymentStatus: "paid"`
- Publish to payment.events queue
- Worker sends final image without watermark

#### checkout.session.expired
Triggered when payment link expires.

```json
{
  "type": "checkout.session.expired",
  "data": {
    "object": {
      "id": "cs_live_xxx"
    }
  }
}
```

**Action:**
- Notify user that link expired
- Offer to generate new link

#### charge.failed
Triggered when payment attempt fails.

```json
{
  "type": "charge.failed",
  "data": {
    "object": {
      "id": "ch_1xxx",
      "failure_message": "Card declined"
    }
  }
}
```

**Action:**
- Mark user as `paymentStatus: "failed"`
- Notify user of failure reason
- Offer retry

#### charge.refunded
Triggered when payment is refunded.

```json
{
  "type": "charge.refunded",
  "data": {
    "object": {
      "id": "ch_1xxx"
    }
  }
}
```

**Response (All Events):**
```
Status: 200
Body: {"received":true}
```

---

## Funnel Nodes - Detailed Reference

### Text Node
Sends a simple text message.

```json
{
  "id": "welcome",
  "type": "text",
  "content": "Hello {{name}}! 👋",
  "nextNode": "next_node_id"
}
```

**Variables Supported:**
```
{{name}}           - User name
{{petName}}        - Pet name (from collectedData)
{{generatedImageUrl}} - Preview image URL
{{originalImageUrl}}  - Final image URL
{{stripePaymentLink}} - Payment link
{{style}}          - Selected style
```

---

### Button Node
Shows up to 3 quick reply buttons.

```json
{
  "id": "ask_choice",
  "type": "buttons",
  "body": "What's your choice?",
  "buttons": [
    {
      "id": "option1",
      "title": "Option 1 🎨",
      "nextNode": "node_after_option1"
    },
    {
      "id": "option2",
      "title": "Option 2 🎭",
      "nextNode": "node_after_option2"
    }
  ]
}
```

**Limits:**
- Maximum 3 buttons
- Button text max 20 characters
- Button IDs are unique per node

---

### List Node
Shows a selectable list with sections.

```json
{
  "id": "choose_style",
  "type": "list",
  "body": "Choose a style:",
  "buttonText": "View Options",
  "sections": [
    {
      "title": "Classic",
      "rows": [
        {
          "id": "renaissance",
          "title": "Renaissance 🎭",
          "description": "Classical style",
          "nextNode": "renaissance_selected"
        }
      ]
    }
  ]
}
```

**Limits:**
- Maximum 10 items total
- Maximum 3 sections
- Rows are auto-numbered by Meta

---

### Wait Input Node
Waits for user to send text.

```json
{
  "id": "ask_name",
  "type": "waitInput",
  "saveAs": "petName",
  "content": "What's your pet's name?",
  "validation": "text",
  "timeoutMs": 300000,
  "timeoutNode": "timeout_node"
}
```

**Validation Options:**
```
"text"   - Any text (default)
"email"  - Valid email format
"phone"  - Phone number (10+ digits)
```

**On Validation Failure:**
- Resend the prompt
- Stay on same node

**On Timeout:**
- Move to `timeoutNode` if specified
- Otherwise stay on node

**Saved As:** `collectedData[saveAs] = user_input`

---

### Wait Photo Node
Waits for user to send an image.

```json
{
  "id": "upload_photo",
  "type": "waitPhoto",
  "content": "Send your pet's photo 📸",
  "timeoutMs": 300000,
  "timeoutNode": "timeout"
}
```

**Saved As:** `collectedData.photoMediaId = meta_media_id`

---

### Image Node
Sends an image to user.

```json
{
  "id": "show_preview",
  "type": "image",
  "url": "https://cdn.example.com/image.jpg",
  "caption": "Here's your preview 🖼️",
  "nextNode": "next_node"
}
```

---

### Audio Node
Sends an audio file.

```json
{
  "id": "send_audio",
  "type": "audio",
  "url": "https://cdn.example.com/audio.ogg",
  "nextNode": "next_node"
}
```

**Format:** OGG/Opus (Meta requirement)

---

### Video Node
Sends a video file.

```json
{
  "id": "send_video",
  "type": "video",
  "url": "https://cdn.example.com/video.mp4",
  "caption": "Watch this! 🎥",
  "nextNode": "next_node"
}
```

---

### Typing Indicator
Shows "typing..." or "recording audio..." status.

```json
{
  "id": "typing_indicator",
  "type": "typing",
  "durationMs": 2000,
  "action": "typing",
  "nextNode": "next_node"
}
```

**Actions:**
```
"typing"            - Shows typing indicator
"recording_audio"   - Shows recording indicator
```

---

### Delay Node
Wait before proceeding to next node.

```json
{
  "id": "wait_before_continue",
  "type": "delay",
  "ms": 1000,
  "nextNode": "next_node"
}
```

---

### Action Node
Execute custom logic (pluggable).

```json
{
  "id": "generate_image",
  "type": "action",
  "action": "generatePetImage",
  "nextNode": "next_node"
}
```

**Built-in Actions:**

1. **generatePetImage**
   - Generates AI artwork from user's photo
   - Uses: Gemini API, FFmpeg for watermark
   - Sets: `generatedImageUrl`, `originalImageUrl`

2. **createStripePaymentLink**
   - Creates $5 USD payment link
   - Sets: `stripePaymentLink` in collectedData

3. **deliverFinalImage**
   - Sends image without watermark after payment
   - Sets: `paymentStatus: "paid"`

4. **saveStyle**
   - Saves style selection from button
   - Sets: `collectedData.style`

---

### Remarketing Node
Schedule a message for later (within 24h window).

```json
{
  "id": "remarketing",
  "type": "remarketing",
  "delayMs": 82800000,
  "message": "Don't forget! {{petName}}'s art is still available",
  "nextNodeAfterRemarketing": "end_node"
}
```

**Timing:**
- `delayMs`: milliseconds from now
- 82800000 = 23 hours
- Only sends if within 24h window from first message

---

### End Node
Marks funnel as complete.

```json
{
  "id": "end",
  "type": "end",
  "message": null
}
```

Sets `user.funnelCompleted = true`

---

## User Data Model

### Structure
```javascript
{
  _id: ObjectId,
  whatsappId: "+5521987654321",
  name: null,
  phone: "5521987654321",
  funnelId: "pet-art-mx",
  currentNodeId: "ask_pet_name_msg",
  funnelCompleted: false,
  funnelStartedAt: ISODate("2025-07-15T14:30:00Z"),
  lastMessageAt: ISODate("2025-07-15T14:35:00Z"),
  windowExpiresAt: ISODate("2025-07-16T14:30:00Z"), // 24h from lastMessageAt
  collectedData: {
    petName: "Thor",
    style: "sky",
    photoMediaId: "120363xxx",
    generatedImageUrl: "https://cdn/preview.jpg",
    stripePaymentLink: "https://pay.stripe.com/..."
  },
  paymentStatus: "pending", // pending | paid | failed
  stripeSessionId: "cs_live_xxx",
  generatedImageUrl: "https://cdn/preview.jpg",
  originalImageUrl: "https://cdn/final.jpg",
  remarketingSentAt: null,
  createdAt: ISODate("2025-07-15T14:30:00Z"),
  updatedAt: ISODate("2025-07-15T14:35:00Z")
}
```

---

## Error Responses

### Webhook Verification Failed
```
Status: 403
{
  "error": "Invalid signature"
}
```

### Not Found
```
Status: 404
{
  "error": "Not found"
}
```

### Server Error
```
Status: 500
{
  "error": "Internal server error"
}
```

---

## Rate Limits

Not explicitly implemented but recommended for production:

```
- API: 1000 requests/min
- Per User: 100 messages/min
- Webhook: 100 events/sec
```

---

## Testing

### Test with ngrok (for webhooks)

```bash
# Start ngrok
ngrok http 3000

# Get public URL
# https://abcd1234.ngrok.io

# Update Meta Webhook URL to:
# https://abcd1234.ngrok.io/webhook/whatsapp

# Send test message
curl -X POST https://abcd1234.ngrok.io/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=xxx" \
  -d '{...webhook_payload...}'
```

### Test Stripe Webhooks

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward to local
stripe listen --forward-to localhost:3000/webhook/stripe

# Send test event
stripe trigger checkout.session.completed
```

---

## Examples

### Complete User Journey

1. **User sends "Hola"**
   ```
   → POST /webhook/whatsapp (message received)
   → Worker: Create User, set currentNodeId = "welcome"
   → Worker: Execute typing indicator (1.5s)
   → Worker: Send "¡Hola! 🐾" text message
   → Worker: Execute delay (1.2s)
   → Worker: Send example image
   → ... continues through funnel
   ```

2. **User selects button "¡Sí, quiero verlo! 🎨"**
   ```
   → POST /webhook/whatsapp (button reply received)
   → Worker: currentNodeId = "ask_pet_name_msg"
   → Worker: Send "¿Cómo se llama tu mascota?"
   → currentNodeId = "ask_pet_name_msg" (waiting for input)
   ```

3. **User sends "Thor"**
   ```
   → POST /webhook/whatsapp (text received)
   → Worker: Save collectedData.petName = "Thor"
   → Worker: currentNodeId = "ask_style"
   → Worker: Send buttons with {{petName}} interpolated
   ```

4. **User clicks "🌩️ Cielo Épico"**
   ```
   → POST /webhook/whatsapp (button reply)
   → Worker: Save collectedData.style = "sky"
   → Worker: Execute action "generatePetImage"
   → Worker: Send image preview
   → Worker: Set currentNodeId = "action_decision"
   ```

5. **User clicks "💳 ¡Quiero el original! $5"**
   ```
   → POST /webhook/whatsapp (button reply)
   → Worker: Execute action "createStripePaymentLink"
   → Worker: Send payment link URL
   → Worker: currentNodeId = "wait_payment"
   ```

6. **User pays on Stripe**
   ```
   → POST /webhook/stripe (checkout.session.completed)
   → Worker: Update paymentStatus = "paid"
   → Worker: Execute action "deliverFinalImage"
   → Worker: Send image without watermark
   → Worker: Set funnelCompleted = true
   ```

---

For more examples and testing, see README.md and DEPLOYMENT.md
