import { useSettingsModalStore } from "@/store/useSettingsModalStore";
import { SettingsModal } from "./settings-modal";

export function AppSettingsModal() {
  const open = useSettingsModalStore((state) => state.open);
  const tab = useSettingsModalStore((state) => state.tab);
  const opened = useSettingsModalStore((state) => state.opened);
  const setOpen = useSettingsModalStore((state) => state.setOpen);
  return (
    <SettingsModal
      key={opened}
      open={open}
      onOpenChange={setOpen}
      defaultTab={tab}
    />
  );
}
