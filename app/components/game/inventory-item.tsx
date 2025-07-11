import { Badge } from "../ui/badge";

export function InventoryItem({ item }: { item: string }) {
  return (
    <div className="flex flex-row items-center justify-between">
      <Badge variant="outline">{item}</Badge>
    </div>
  );
}
