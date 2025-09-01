import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { PencilIcon } from "lucide-react";
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
        {items.map(
          ({ id, name, description, scenarioHead, updatedAt, logCount }) => (
            <Card
              key={id}
              className="flex flex-col p-0 cursor-pointer hover:bg-muted rounded-xs m-0"
              onClick={(e) => handleClickCard(id, e)}
            >
              <CardContent className="flex flex-row p-0 pr-2">
                <div className="relative">
                  {scenarioHead?.thumbnailWebp ? (
                    <img
                      src={bytesToObjectUrl(
                        scenarioHead.thumbnailWebp as unknown as Uint8Array,
                      )}
                      alt={`${name} thumbnail`}
                      className="h-18 w-128 object-cover pr-2"
                    />
                  ) : (
                    <img
                      src={placeholderImage}
                      alt={`${name} thumbnail`}
                      className="h-18 w-128 object-cover pr-2"
                    />
                  )}
                  <div className="absolute left-1 top-0 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-6 w-6 rounded-full pb-1.5 bg-accent/50"
                          aria-label="Scenario actions"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          ...
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        sideOffset={4}
                        className="rounded-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {scenarioHead?.id && (
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: `/scenarios/${scenarioHead?.id}`,
                              });
                            }}
                            className="rounded-xs text-xs"
                          >
                            <PencilIcon className="w-4 h-4 mr-2" /> Scenario
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClickDelete(id);
                          }}
                          variant="destructive"
                          className="rounded-xs text-xs"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-row gap-2 pt-1">
                    <p className="text-sm font-medium">{name}</p>
                    <Badge variant="outline" className="rounded-xs text-xs">
                      {logCount} {logCount === 1 ? "turn" : "turns"}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="rounded-xs text-xs">
                          {formatRelativeTime(updatedAt)}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Last played: {formatExactDateTime(updatedAt)}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {description}
                  </p>
                </div>
                <div className="flex flex-col justify-center ml-2"></div>
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
