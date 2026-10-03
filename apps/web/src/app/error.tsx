"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-page">
      <h1>We couldn’t load this view.</h1>
      <p>
        Please retry. If the problem continues, sign in again or contact the workspace
        administrator.
      </p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
