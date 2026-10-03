import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { stripeConfig } from '@/lib/billing/stripe';
import { CheckoutButton } from '@/features/billing/checkout-button';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stripe sandbox' };
export default async function Page() {
  const client = await createSupabaseServer();
  if (!client) redirect('/login');
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect('/login');
  const { data: receipts, error: receiptsError } = await client.from('sandbox_payments').select('checkout_session_id, paid_at').order('paid_at', { ascending: false }).limit(10);
  const configured = !!stripeConfig();
  return <main className="standalone-page"><Link href="/live" className="back-link">← Real workspace</Link><div className="eyebrow">SPONSOR INTEGRATION / STRIPE</div><h1>Test the payment loop.</h1><p>This isolated sandbox demonstrates hosted Checkout and verified, durable payment receipts. It does not charge real money or unlock a paid plan.</p>{configured ? <CheckoutButton /> : <div className="inline-note"><p>Configure STRIPE_SECRET_KEY with a sandbox key, STRIPE_SANDBOX_PRICE_ID with a one-time price, APP_URL, and the webhook credentials. See docs/INTEGRATIONS.md.</p></div>}<section className="section-spacing"><h2>Verified sandbox receipts</h2><p className="muted small">Returning from Checkout is not proof of payment. Only a signed paid event recorded by the webhook appears here.</p>{receiptsError ? <p className="error-text" role="alert">Receipts are unavailable. Apply the billing migration and retry.</p> : receipts?.length ? <ul>{receipts.map(receipt => <li key={receipt.checkout_session_id}><code>{receipt.checkout_session_id}</code><span className="muted small"> · Paid {receipt.paid_at}</span></li>)}</ul> : <div className="empty-state"><h2>No verified payments yet</h2><p>Complete a sandbox checkout and forward its webhook to this application.</p></div>}</section></main>;
}
