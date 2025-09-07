import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "@tanstack/react-router";
import { useTalesList } from "@/hooks/useTales";
import {
  bytesToObjectUrl,
  formatExactDateTime,
  formatRelativeTime,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { TrashIcon } from "lucide-react";
import placeholderImage from "@/assets/scen-ph.png";

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

  const handleClickDelete = async (id: string) => {
    deleteTale(id);
  };

  // no-op

  return (
    <div className="mx-auto w-full max-w-screen-2xl py-5 flex flex-col gap-4 px-3">
      <div className="flex gap-4">
        {/* back button */}
        <Button
          variant="default"
          onClick={() => navigate({ to: "/" })}
          className="rounded-xs mt-1.5"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </Button>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(
          ({
            id,
            name,
            description,
            thumbnail,
            scenarioHead,
            updatedAt,
            logCount,
          }) => (
            <Card
              key={id}
              className="flex flex-col rounded-xs gap-1 pt-0 pb-2 border-accent/50"
            >
              <CardHeader className="p-0 m-0">
                <div className="relative">
                  {thumbnail ? (
                    <img
                      src={bytesToObjectUrl(thumbnail as unknown as Uint8Array)}
                      alt={`${name} thumbnail`}
                      className="h-48 w-full object-cover"
                    />
                  ) : (
                    <img
                      src={placeholderImage}
                      alt={`${name} thumbnail`}
                      className="h-48 w-full object-cover"
                    />
                  )}
                  <div className="absolute right-1.5 top-0.5 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-6 w-6 rounded-full pb-1.5 bg-accent/50"
                          aria-label="Tale actions"
                        >
                          ...
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        sideOffset={4}
                        className="rounded-xs"
                      >
                        {scenarioHead?.id && (
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() =>
                              navigate({ to: `/scenarios/${scenarioHead?.id}` })
                            }
                            className="rounded-xs text-xs"
                          >
                            <PencilIcon className="w-4 h-4 mr-2" /> Scenario
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => handleClickDelete(id)}
                          variant="destructive"
                          className="rounded-xs text-xs"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="absolute top-1 left-1 text-xs text-muted-foreground bg-accent/50">
                        {formatRelativeTime(updatedAt)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Last played: {formatExactDateTime(updatedAt)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent className="px-2 flex flex-col justify-between  gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{name}</span>
                  <Badge variant="outline" className="rounded-xs text-xs">
                    {logCount} {logCount === 1 ? "turn" : "turns"}
                  </Badge>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground h-16 rounded-xs">
                  {description}
                </p>
                <Button
                  onClick={async () => {
                    await loadIntoGame(id);
                    navigate({ to: "/demo" });
                  }}
                  className="w-full rounded-xs"
                >
                  Load Tale
                </Button>
              </CardContent>
            </Card>
          ),
        )}
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
