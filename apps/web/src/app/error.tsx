'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="standalone-page"><h1>We couldn’t load this view.</h1><p>Your saved sample data is still in your browser.</p><button className="button button-primary" onClick={reset}>Try again</button></main>; }
