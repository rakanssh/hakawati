import { useTaleStore } from "@/store/useTaleStore";
import { Separator } from "@/components/ui/separator";
import { InventoryItem } from "./inventory-item";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { AddIconButton } from "./add-icon-button";
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

const InventoryButton = ({ setOpen }: { setOpen: (open: boolean) => void }) => (
  <AddIconButton onClick={() => setOpen(true)} ariaLabel="Add item" />
);

export function InventoryCard() {
  const { inventory, addToInventory } = useTaleStore();
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState("");

  const handleSubmit = () => {
    if (itemName.trim()) {
      addToInventory(itemName.trim());
      setItemName("");
      setOpen(false);
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div className="py-1 flex flex-col gap-1 mt-2">
        <div className="px-1">
          <div className="relative flex flex-row justify-between">
            <div className="absolute right-0">
              <InventoryButton setOpen={setOpen} />
            </div>
            <Label className="text-sm pb-1">Inventory</Label>
          </div>
          <Separator className="mb-1" />
        </div>
        <div className="px-1">
          {inventory.length > 0 ? (
            <ul className="flex flex-row flex-wrap gap-1">
              {inventory.map((item) => (
                <li key={item.id}>
                  <InventoryItem item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <Label className="text-muted-foreground text-xs">Nothing...</Label>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
            <DialogDescription>
              Enter a new item to add to your inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 w-full">
            <Input
              placeholder="Item name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!itemName.trim()}>
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
