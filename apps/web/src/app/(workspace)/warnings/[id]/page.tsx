import { WarningDetail } from "@/features/warnings/warnings";

export const metadata = { title: "Warning details" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WarningDetail id={id} />;
}
