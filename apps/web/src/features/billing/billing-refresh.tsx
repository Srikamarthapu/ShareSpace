"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function BillingRefresh({ awaitingPayment }: { awaitingPayment: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!awaitingPayment) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      router.refresh();
      if (++attempts >= 18) window.clearInterval(timer);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [awaitingPayment, router]);
  return (
    <button type="button" className="button button-secondary" onClick={() => router.refresh()}>
      Refresh billing status
    </button>
  );
}
