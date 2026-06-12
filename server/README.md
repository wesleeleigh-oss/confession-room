# Confession Room: Server for Stripe Checkout & Webhook

This folder contains a minimal Node/Express server that provides two endpoints used by confession-room.html:

- POST /api/create-checkout-session
  - Accepts JSON { email, plan }
  - Creates a Stripe Checkout session (subscription or payment depending on plan)
  - Returns { sessionId, url }

- POST /api/stripe-webhook
  - Receives Stripe webhook events and verifies the signature
  - Records checkout.session.completed events to payments.json (demo)

Setup
1. Copy `.env.example` to `.env` and fill in your Stripe keys and price IDs.
2. Install deps:
   npm install
3. Run server locally:
   npm start

Testing Webhooks
- Use the Stripe CLI to forward events to your local server:
  stripe listen --forward-to localhost:3000/api/stripe-webhook

- Or use ngrok to expose your local server and configure webhook endpoints in the Stripe dashboard.

Security & Production Notes
- Do NOT store secret keys in source control. Use environment variables or a secrets manager.
- Verify webhooks using the STRIPE_WEBHOOK_SECRET and stripe.webhooks.constructEvent (this server does this when the secret is set).
- Replace the demo payments.json persistence with a proper database in production.
- Use server-side logic to provision entitlements (create user accounts, store subscriptions, send receipts).
