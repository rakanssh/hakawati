import { useGameStore } from "@/store/useGameStore";
import { CardContent, CardHeader, CardTitle, SquareCard } from "../ui/card";
import { Separator } from "../ui/separator";
import { InventoryItem } from "./inventory-item";
import { PlusIcon } from "lucide-react";
// Button is no longer used here after AddIconButton extraction
import { useRef, useState } from "react";
import { AddDrawer } from "./add-drawer";
import { Input } from "../ui/input";
import { AddIconButton } from "./add-icon-button";
import { Label } from "../ui/label";

const InventoryButton = ({ setOpen }: { setOpen: (open: boolean) => void }) => (
  <AddIconButton onClick={() => setOpen(true)} ariaLabel="Add item" />
);

export function InventoryCard() {
  const { inventory, addToInventory } = useGameStore();
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative overflow-hidden">
      <SquareCard className="py-1 flex flex-col gap-1 mt-2">
        <CardHeader className="px-4">
          <div className="relative flex flex-row justify-between">
            <div className="absolute right-0">
              <InventoryButton setOpen={setOpen} />
            </div>
            <CardTitle className="text-sm">Inventory</CardTitle>
          </div>
          <Separator />
        </CardHeader>
        <CardContent className="px-4">
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
        </CardContent>
        <AddDrawer
          open={open}
          setOpen={(o) => {
            setOpen(o);
            if (!o) setItemName("");
          }}
          containerRef={containerRef}
          onSubmit={() => {
            if (itemName.trim()) {
              addToInventory(itemName.trim());
              setItemName("");
            }
          }}
          submitDisabled={!itemName.trim()}
          submitIcon={<PlusIcon className="w-4 h-4" />}
          submitAriaLabel="Add item"
        >
          <Input
            placeholder="Item name"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
        </AddDrawer>
      </SquareCard>
    </div>
  );
}
