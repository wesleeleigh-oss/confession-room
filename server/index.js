// server/index.js
// Minimal Express server to create Stripe Checkout sessions and handle webhook events.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const stripeLib = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY not set. Please set environment variables from .env.example');
}

const stripe = stripeLib(process.env.STRIPE_SECRET_KEY);

// Serve static confession page at root (so EB can serve UI from same app)
app.use(express.static(path.join(__dirname, '..')));

// Use JSON body parsing for normal routes
app.use(express.json());

// Utility: safe write to payments.json (demo persistence)
const PAYMENTS_FILE = path.join(__dirname, 'payments.json');
function recordPayment(obj){
  try{
    const data = fs.existsSync(PAYMENTS_FILE) ? JSON.parse(fs.readFileSync(PAYMENTS_FILE)) : [];
    data.push(obj);
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
  }catch(err){
    console.error('Failed to record payment', err);
  }
}

// POST /api/create-checkout-session
// Expects JSON body: { email, plan }
app.post('/api/create-checkout-session', async (req, res) => {
  try{
    const { email, plan } = req.body || {};
    if (!email || !plan) return res.status(400).json({ error: 'Missing email or plan' });

    // Map plan keys to Stripe Price IDs (set via env)
    const priceMonthly = process.env.PRICE_MONTHLY_ID; // subscription price id
    const priceSingle = process.env.PRICE_SINGLE_ID;   // one-time price id

    let sessionParams = {
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      metadata: { plan },
      // These should be set to your domain and include query params for detection
      success_url: (process.env.SUCCESS_URL || 'http://localhost:3000/confession-room.html') + '?checkout_status=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: (process.env.CANCEL_URL || 'http://localhost:3000/confession-room.html') + '?checkout_status=cancel',
    };

    if (plan === 'monthly'){
      if (!priceMonthly) return res.status(500).json({ error: 'PRICE_MONTHLY_ID not configured' });
      sessionParams.mode = 'subscription';
      sessionParams.line_items = [{ price: priceMonthly, quantity: 1 }];
    } else if (plan === 'single'){
      if (!priceSingle) return res.status(500).json({ error: 'PRICE_SINGLE_ID not configured' });
      sessionParams.mode = 'payment';
      sessionParams.line_items = [{ price: priceSingle, quantity: 1 }];
    } else {
      return res.status(400).json({ error: 'Unknown plan' });
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Return session id and hosted url (Stripe may return url for hosted checkout)
    return res.json({ sessionId: session.id, url: session.url });

  } catch(err){
    console.error('Error creating checkout session', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Stripe webhook handler. Must use raw body parsing for signature verification
app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try{
    if (!webhookSecret){
      // If no webhook secret configured, attempt to parse body directly (NOT recommended for production)
      event = JSON.parse(req.body.toString());
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
  } catch(err){
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Checkout session completed', session.id, session.metadata);
      // Record minimal information to payments.json (demo)
      recordPayment({ id: session.id, email: session.customer_email, mode: session.mode, metadata: session.metadata, timestamp: new Date().toISOString() });
      // Here you would provision entitlements: create user, update DB, send email, etc.
      break;
    case 'invoice.payment_succeeded':
      // For subscription renewals etc.
      console.log('Invoice payment succeeded for', event.data.object.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  res.json({ received: true });
});

// Basic health
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
