import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "@tanstack/react-router";
import {
  useScenariosList,
  useScenariosExport,
  useScenariosImport,
} from "@/hooks/useScenarios";
import { initTaleFromScenario } from "@/services/scenario.service";
import { useLoadTale } from "@/hooks/useGameSaves";
import {
  bytesToObjectUrl,
  formatExactDateTime,
  formatRelativeTime,
} from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  ClipboardIcon,
} from "lucide-react";
import placeholderImage from "@/assets/scen-ph.png";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

export default function ScenariosHome() {
  const { items, loading, error, page, limit, total, setPage, remove } =
    useScenariosList();
  const navigate = useNavigate();
  const { load: loadTale } = useLoadTale();
  const { exportById } = useScenariosExport();
  const { importFromClipboard } = useScenariosImport();
  return (
    <div className="mx-auto w-full max-w-screen-2xl py-5 flex flex-col gap-4 px-3">
      <div className="flex items-center justify-between">
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
            <Label className="text-xl">Scenarios</Label>
            <span className="text-sm text-muted-foreground">
              Browse and manage your scenarios
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            className="rounded-xs"
            onClick={async () => {
              try {
                const scenario = await importFromClipboard();
                navigate({
                  to: "/scenarios/new",
                  state: (prev) => ({
                    ...(prev ?? {}),
                    importedScenario: scenario,
                  }),
                });
              } catch (_e) {
                toast.error("Failed to import scenario");
              }
            }}
          >
            Import From Clipboard
          </Button>
          <Button
            onClick={() => navigate({ to: "/scenarios/new" })}
            className="rounded-xs"
          >
            Create Scenario
          </Button>
        </div>
      </div>

      <Separator />
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {Boolean(error) && (
        <div className="text-sm text-red-500">Failed to load scenarios.</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(({ id, name, initialDescription, thumbnail, updatedAt }) => {
          return (
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
                          aria-label="Scenario actions"
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
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => navigate({ to: `/scenarios/${id}` })}
                          className="rounded-xs text-xs"
                        >
                          <PencilIcon className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => exportById(id)}
                          className="rounded-xs text-xs"
                        >
                          <ClipboardIcon className="w-4 h-4 mr-2" /> Export JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => {
                            remove(id);
                          }}
                          variant="destructive"
                          className="rounded-xs text-xs"
                        >
                          <TrashIcon className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {/* Top left date */}{" "}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="absolute top-1 left-1 text-xs text-muted-foreground bg-accent/50">
                        {formatRelativeTime(updatedAt)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Last updated: {formatExactDateTime(updatedAt)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent className="px-2 flex flex-col justify-between  gap-1">
                <span className="font-bold">{name}</span>
                <div className="flex items-center gap-2"></div>
                <p className="line-clamp-3 text-sm text-muted-foreground h-16 rounded-xs">
                  {initialDescription}
                </p>
                <Button
                  onClick={async () => {
                    const taleId = await initTaleFromScenario(id);
                    await loadTale(taleId);
                    navigate({ to: "/demo" });
                  }}
                  className="w-full rounded-xs"
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
            className="rounded-xs"
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
            className="rounded-xs"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
