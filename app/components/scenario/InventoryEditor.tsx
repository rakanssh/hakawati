import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";

export type InventoryEditorProps = {
  items: string[];
  onAdd: (name: string) => void;
  onUpdate: (index: number, name: string) => void;
  onRemove: (index: number) => void;
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
        {items.map((item, idx) => (
          <div key={`${item}-${idx}`} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => onUpdate(idx, e.target.value)}
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onRemove(idx)}
              className="w-24"
            >
              <Trans>Remove</Trans>
            </Button>
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
