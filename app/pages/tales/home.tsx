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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeftIcon,
  FilePlus2Icon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import placeholderImage from "@/assets/scen-ph.png";
import { Trans, useLingui } from "@lingui/react/macro";

export default function TalesHome() {
  const navigate = useNavigate();
  const { t } = useLingui();
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
    saveAsScenario,
  } = useTalesList();

  const handleClickDelete = async (id: string) => {
    deleteTale(id);
  };

  const handleSaveAsScenario = async (id: string) => {
    await saveAsScenario(id);
  };

  // no-op

  return (
    <div className="mx-auto w-full max-w-screen-2xl py-5 flex flex-col gap-4 px-3">
      <div className="flex gap-4">
        {/* back button */}
        <Button
          variant="default"
          onClick={() => navigate({ to: "/" })}
          className="mt-1.5"
        >
          <ArrowLeftIcon className="w-4 h-4 rtl:rotate-180" />
        </Button>
        <div className="flex flex-col">
          <Label className="text-xl">
            <Trans>Tales</Trans>
          </Label>
          <span className="text-sm text-muted-foreground">
            <Trans>Browse and load saved tales</Trans>
          </span>
        </div>
      </div>
      <Separator />
      {loading && (
        <div className="text-sm text-muted-foreground">
          <Trans>Loading...</Trans>
        </div>
      )}
      {Boolean(error) && (
        <div className="text-sm text-destructive">
          <Trans>Failed to load tales.</Trans>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(
          ({
            id,
            name,
            description,
            lastLogEntry,
            thumbnail,
            scenarioHead,
            updatedAt,
            logCount,
          }) => (
            <Card
              key={id}
              className="flex flex-col gap-1 pt-0 pb-2 border-accent/50"
            >
              <CardHeader className="p-0 m-0">
                <div className="relative">
                  {thumbnail ? (
                    <img
                      src={bytesToObjectUrl(thumbnail as unknown as Uint8Array)}
                      alt={t`${name} thumbnail`}
                      className="h-48 w-full object-cover"
                    />
                  ) : (
                    <img
                      src={placeholderImage}
                      alt={t`${name} thumbnail`}
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
                          aria-label={t`Tale actions`}
                        >
                          ...
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        sideOffset={4}
                      >
                        {scenarioHead?.id && (
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() =>
                              navigate({ to: `/scenarios/${scenarioHead?.id}` })
                            }
                            className="text-xs"
                          >
                            <PencilIcon className="w-4 h-4 me-2" />{" "}
                            <Trans>Scenario</Trans>
                          </DropdownMenuItem>
                        )}
                        {!scenarioHead?.id && (
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            onClick={() => handleSaveAsScenario(id)}
                            className="text-xs"
                          >
                            <FilePlus2Icon className="w-4 h-4 me-2" />{" "}
                            <Trans>Save as Scenario</Trans>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => handleClickDelete(id)}
                          variant="destructive"
                          className="text-xs"
                        >
                          <TrashIcon className="w-4 h-4 me-2" />{" "}
                          <Trans>Delete</Trans>
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
                      <Trans>
                        Last played: {formatExactDateTime(updatedAt)}
                      </Trans>
                    </TooltipContent>
                  </Tooltip>
                  <Badge className="absolute left-1 top-8 h-5 bg-accent/50 px-2 text-xs text-muted-foreground">
                    {logCount} {logCount === 1 ? t`turn` : t`turns`}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex h-36 flex-col gap-2 px-2">
                <span className="line-clamp-2 min-h-9 text-sm font-semibold leading-snug">
                  {name}
                </span>
                <p className="line-clamp-3 min-h-0 flex-1 rounded-xs text-sm text-muted-foreground">
                  {lastLogEntry?.text ?? description}
                </p>

                <Button
                  onClick={async () => {
                    await loadIntoGame(id);
                    navigate({ to: "/play" });
                  }}
                  className="mt-auto w-full"
                >
                  <Trans>Load Tale</Trans>
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
            <Trans>Prev</Trans>
          </Button>
          <span className="text-sm text-muted-foreground">
            <Trans>
              Page {page} of {Math.max(1, Math.ceil(total / limit) || 1)}
            </Trans>
          </span>
          <Button
            variant="secondary"
            disabled={page * limit >= total}
            onClick={() => setPage(page + 1)}
          >
            <Trans>Next</Trans>
          </Button>
        </div>
      )}
    </div>
  );
}
