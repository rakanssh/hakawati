import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";
import type { Item } from "@/types/item.type";

export type InventoryEditorProps = {
  items: Item[];
  onAdd: (name: string) => void;
  onUpdate: (
    id: string,
    update: Partial<Pick<Item, "name" | "description">>,
  ) => void;
  onRemove: (id: string) => void;
};

export function InventoryEditor({
  items,
  onAdd,
  onUpdate,
  onRemove,
}: InventoryEditorProps) {
  const [newItem, setNewItem] = useState("");
  const { t } = useLingui();
  return (
    <div className="flex flex-col gap-2">
      <Label>
        <Trans>Initial Inventory</Trans>
      </Label>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-xs border p-3"
          >
            <div className="flex items-center gap-2">
              <Input
                value={item.name}
                onChange={(e) => onUpdate(item.id, { name: e.target.value })}
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onRemove(item.id)}
                className="w-24"
              >
                <Trans>Remove</Trans>
              </Button>
            </div>
            <Input
              value={item.description ?? ""}
              onChange={(e) =>
                onUpdate(item.id, { description: e.target.value })
              }
              placeholder={t`Description (optional)`}
              className="text-sm text-muted-foreground"
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            placeholder={t`Add inventory item`}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAdd(newItem);
                setNewItem("");
              }
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              onAdd(newItem);
              setNewItem("");
            }}
            className="w-24"
          >
            <Trans>Add Item</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
