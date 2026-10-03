"use client";
import { useRef, useState } from "react";

export function CheckoutButton({ portal = false }: { portal?: boolean }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requestKey = useRef<string | null>(null);
  async function openCheckout() {
    setPending(true);
    setError("");
    requestKey.current ??= crypto.randomUUID();
    try {
      const result = await fetch(`/api/billing/${portal ? "portal" : "checkout"}`, {
        method: "POST",
        headers: { "Idempotency-Key": requestKey.current },
      });
      const data = await result.json();
      if (!result.ok || typeof data.url !== "string")
        throw new Error(data.error?.message ?? "Billing is unavailable.");
      const url = new URL(data.url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== (portal ? "billing.stripe.com" : "checkout.stripe.com")
      )
        throw new Error("Unexpected billing destination.");
      window.location.assign(url.toString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Billing is unavailable.");
      setPending(false);
    }
  }
  return (
    <div>
      <button className="button button-primary" onClick={openCheckout} disabled={pending}>
        {pending
          ? "Opening Stripe…"
          : portal
            ? "Manage test subscription"
            : "Start $20/month test subscription"}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
