import "@/features/workspace-controls/workspace-controls.css";
import { JoinInvite } from "@/features/workspace-controls/join";

export const metadata = { title: "Join a team" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinInvite token={token} />;
}
