import { SessionDetail } from '@/features/sessions/sessions';
export const metadata = { title: 'Session' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDetail id={id} />;
}
