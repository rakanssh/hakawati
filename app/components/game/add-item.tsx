import { Drawer, DrawerFooter, DrawerHeader, DrawerTitle } from "../ui/drawer";
import { Button } from "../ui/button";
import { PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer as DrawerPrimitive } from "vaul";
import { Input } from "../ui/input";
import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";

export function AddItem({
  open,
  setOpen,
  containerRef,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [itemName, setItemName] = useState("");
  const { addToInventory } = useGameStore();
  return (
    <Drawer open={open} onOpenChange={setOpen} container={containerRef.current}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="absolute inset-0 bg-black/30" />
        <DrawerPrimitive.Content
          className={cn(
            "bg-background absolute inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border-t"
          )}
        >
          <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />

          <DrawerFooter className="flex flex-row justify-center gap-2">
            <Input
              placeholder="Item name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setOpen(false);
                addToInventory(itemName);
                setItemName("");
              }}
              className="w-10 h-10"
            >
              <PlusIcon className="w-4 h-4" />
            </Button>
          </DrawerFooter>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Drawer>
  );
}
