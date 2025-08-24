import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "@tanstack/react-router";
import { useTalesList } from "@/hooks/useTales";

export default function TalesHome() {
  const navigate = useNavigate();
  const { items, loading, error, loadIntoGame, page, limit, total, setPage } =
    useTalesList();

  return (
    <div className="container mx-auto py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Label className="text-xl">Tales</Label>
          <span className="text-sm text-muted-foreground">
            Browse and load saved tales
          </span>
        </div>
      </div>
      <Separator />
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {Boolean(error) && (
        <div className="text-sm text-red-500">Failed to load tales.</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ id, name, description }) => (
          <Card key={id} className="flex flex-col pt-4 pb-3">
            <CardHeader className="px-4">
              <CardTitle>{name}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 ">
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {description}
              </p>
            </CardContent>
            <CardFooter className="mt-auto flex justify-end px-4 gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await loadIntoGame(id);
                  navigate({ to: "/demo" });
                }}
              >
                Load
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {total > limit && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
          >
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.max(1, Math.ceil(total / limit) || 1)}
          </span>
          <Button
            variant="secondary"
            disabled={page * limit >= total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
