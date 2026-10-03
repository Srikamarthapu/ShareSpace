import { Shell } from '@/components/shell';
import { WorkspaceProvider } from '@/components/workspace-provider';
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><Shell>{children}</Shell></WorkspaceProvider>;
}
