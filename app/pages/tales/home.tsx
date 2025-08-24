import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "@tanstack/react-router";
import { useTalesList } from "@/hooks/useTales";
import { useState } from "react";

export default function TalesHome() {
  const navigate = useNavigate();
  const {
    items,
    loading,
    error,
    loadIntoGame,
    page,
    limit,
    total,
    setPage,
    deleteTale,
  } = useTalesList();
  const [currentlyDeleting, setCurrentlyDeleting] = useState<string | null>(
    null,
  );
  const handleClickDelete = async (id: string) => {
    if (currentlyDeleting === id) {
      await deleteTale(id);
      return;
    }
    setCurrentlyDeleting(id);
    setTimeout(() => {
      setCurrentlyDeleting(null);
    }, 1500);
  };

  const handleClickCard = async (id: string, e?: React.MouseEvent) => {
    // Prevent card click if the event target is the delete button or its children
    if (e?.target instanceof Element && e.target.closest("button")) {
      return;
    }
    await loadIntoGame(id);
    navigate({ to: "/demo" });
  };

  return (
    <div className="container mx-auto py-5 flex flex-col gap-4">
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
      <div className="flex flex-col gap-4">
        {items.map(({ id, name, description }) => (
          <Card
            key={id}
            className="flex flex-col py-1 cursor-pointer hover:bg-muted rounded-xs"
            onClick={(e) => handleClickCard(id, e)}
          >
            <CardContent className="flex flex-row">
              <div>{/* Scenario Image (Or placeholder) */}</div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{name}</p>
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
              <div className="flex flex-col justify-center ml-2">
                <Button
                  variant={
                    currentlyDeleting === id ? "destructive" : "secondary"
                  }
                  size="default"
                  className="rounded-xs w-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleClickDelete(id);
                  }}
                >
                  {currentlyDeleting === id ? (
                    <span>Sure?</span>
                  ) : (
                    <span>Delete</span>
                  )}
                </Button>
              </div>
            </CardContent>
            {/* <CardFooter className="mt-auto flex justify-end px-4 gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await loadIntoGame(id);
                  navigate({ to: "/demo" });
                }}
              >
                Load
              </Button>
            </CardFooter> */}
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
