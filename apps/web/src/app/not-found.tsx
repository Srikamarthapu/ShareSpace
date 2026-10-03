import Link from 'next/link';
export default function NotFound() { return <main className="standalone-page"><h1>This space is not available.</h1><p>The link may be wrong or the record may no longer exist.</p><Link className="button button-primary" href="/">Back to workspace</Link></main>; }
