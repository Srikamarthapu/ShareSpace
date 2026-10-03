import "@/features/workspace-controls/workspace-controls.css";
import { SettingsTabs } from "@/features/settings/settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="settings-title">Settings</h1>
      <SettingsTabs />
      {children}
    </>
  );
}
