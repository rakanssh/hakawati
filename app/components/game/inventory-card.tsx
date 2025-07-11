import { useGameStore } from "@/store/useGameStore";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { InventoryItem } from "./inventory-item";

export function InventoryCard() {
  const { inventory } = useGameStore();
  return (
    <div>
      {" "}
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-sm">Inventory</CardTitle>
          <Separator />
        </CardHeader>
        <CardContent>
          {inventory.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {inventory.map((item) => (
                <li key={item}>
                  <InventoryItem item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Your inventory is empty.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
