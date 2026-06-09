import { useTaleStore } from "@/store/useTaleStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { InlineEditableBadge } from "./inline-editable-badge";
import {
  SidebarSectionHeader,
  sidebarChipClass,
  sidebarEmptyLabelClass,
} from "./sidebar-section";

export function InventoryCard({ className }: { className?: string }) {
  const { inventory, addToInventory, updateItem, removeFromInventory } =
    useTaleStore();
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");

  const handleSubmit = () => {
    if (itemName.trim()) {
      addToInventory(itemName.trim(), itemDescription.trim() || undefined);
      setItemName("");
      setItemDescription("");
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative flex flex-col overflow-hidden", className)}>
      <SidebarSectionHeader
        actionLabel={t`Add item`}
        onAction={() => setOpen(true)}
      >
        <Trans>Inventory</Trans>
      </SidebarSectionHeader>
      <ScrollArea className="flex-1 min-h-0">
        <div className="pt-3 pb-1">
          {inventory.length > 0 ? (
            <ul className="flex flex-row flex-wrap gap-1.5">
              {inventory.map((item) => (
                <li key={item.id}>
                  <InlineEditableBadge
                    label={item.name}
                    onRename={(newName) =>
                      updateItem(item.id, { name: newName })
                    }
                    onRemove={() => removeFromInventory(item.id)}
                    className={sidebarChipClass}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Label className={sidebarEmptyLabelClass}>
              <Trans>Nothing...</Trans>
            </Label>
          )}
        </div>
      </ScrollArea>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Add Item</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Enter a new item to add to your inventory.</Trans>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-name">
                <Trans>Name</Trans>
              </Label>
              <Input
                id="item-name"
                placeholder={t`Item name`}
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-description">
                <Trans>Description (optional)</Trans>
              </Label>
              <Input
                id="item-description"
                placeholder={t`Add context for the AI...`}
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={handleSubmit} disabled={!itemName.trim()}>
              <PlusIcon className="w-4 h-4 me-2" />
              <Trans>Add Item</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
