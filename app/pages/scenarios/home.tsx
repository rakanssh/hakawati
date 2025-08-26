import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "@tanstack/react-router";
import { useScenariosList } from "@/hooks/useScenarios";
import { initTaleFromScenario } from "@/services/scenario.service";
import { bytesToObjectUrl } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PencilIcon, TrashIcon } from "lucide-react";

export default function ScenariosHome() {
  const { items, loading, error, page, limit, total, setPage } =
    useScenariosList();
  const navigate = useNavigate();
  return (
    <div className="container mx-auto py-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <Label className="text-xl">Scenarios</Label>
          <span className="text-sm text-muted-foreground">
            Browse and manage your scenarios
          </span>
        </div>
        <Button onClick={() => navigate({ to: "/scenarios/new" })}>
          Create Scenario
        </Button>
      </div>
      <Separator />
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {Boolean(error) && (
        <div className="text-sm text-red-500">Failed to load scenarios.</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(({ id, name, initialDescription, thumbnailWebp }) => {
          console.log(thumbnailWebp);
          return (
            <Card
              key={id}
              className="flex flex-col rounded-xs gap-1 pt-0 pb-2 w"
            >
              <CardHeader className="p-0 m-0">
                <div className="relative">
                  {thumbnailWebp && (
                    <img
                      src={bytesToObjectUrl(
                        thumbnailWebp as unknown as Uint8Array,
                      )}
                      alt={`${name} thumbnail`}
                      className="h-48 w-full object-cover rounded mb-1 border"
                    />
                  )}
                  <div className="absolute right-1.5 top-0.5 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-6 w-6 rounded-full pb-1.5 bg-accent/50"
                          aria-label="Scenario actions"
                        >
                          ...
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        sideOffset={4}
                      >
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => navigate({ to: `/scenarios/${id}` })}
                        >
                          <PencilIcon className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => {}}
                        >
                          <TrashIcon className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 flex flex-col gap-1">
                <span className="font-bold">{name}</span>
                <div className="flex items-center gap-2"></div>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {initialDescription}
                </p>
                <Button
                  onClick={async () => {
                    await initTaleFromScenario(id);
                    navigate({ to: "/demo" });
                  }}
                >
                  New Tale
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {total > limit && (
        <div className="flex items-center justify-end gap-2 ">
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
