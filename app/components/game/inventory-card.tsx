import { useGameStore } from "@/store/useGameStore";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { InventoryItem } from "./inventory-item";
import { PlusIcon } from "lucide-react";
import { Button } from "../ui/button";
import { useRef, useState } from "react";
import { AddItem } from "./add-item";

const InventoryButton = ({ setOpen }: { setOpen: (open: boolean) => void }) => {
  return (
    <Button
      className="p-0 w-6 h-5"
      variant="interactive-ghost"
      size="icon"
      onClick={() => setOpen(true)}
    >
      <PlusIcon className="w-4 h-4" />
    </Button>
  );
};

export function InventoryCard() {
  const { inventory } = useGameStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className="relative overflow-hidden">
      <Card className="py-2 ">
        <CardHeader>
          <div className="flex flex-row justify-between">
            <CardTitle className="text-sm">Inventory</CardTitle>
            <InventoryButton setOpen={setOpen} />
          </div>
          <Separator />
        </CardHeader>
        <CardContent>
          {inventory.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {inventory.map((item) => (
                <li key={item.id}>
                  <InventoryItem item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Your inventory is empty.</p>
          )}
        </CardContent>
        <AddItem open={open} setOpen={setOpen} containerRef={containerRef} />
      </Card>
    </div>
  );
}
