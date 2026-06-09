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
  Sparkles,
} from "lucide-react";
import placeholderImage from "@/assets/scen-ph.png";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { GenerateScenarioDialog } from "@/components/scenario";
import { useState } from "react";

export default function ScenariosHome() {
  const { t } = useLingui();
  const { items, loading, error, page, limit, total, setPage, remove } =
    useScenariosList();
  const navigate = useNavigate();
  const { load: loadTale } = useLoadTale();
  const { exportById } = useScenariosExport();
  const { importFromClipboard } = useScenariosImport();
  const [generateOpen, setGenerateOpen] = useState(false);
  return (
    <div className="mx-auto w-full max-w-screen-2xl py-5 flex flex-col gap-4 px-3">
      <div className="flex items-center justify-between">
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
              <Trans>Scenarios</Trans>
            </Label>
            <span className="text-sm text-muted-foreground">
              <Trans>Browse and manage your scenarios</Trans>
            </span>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <Button
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
                toast.error("Failed to import scenario from clipboard");
              }
            }}
          >
            <Trans>Import</Trans>
          </Button>

          <Button onClick={() => navigate({ to: "/scenarios/new" })}>
            <Trans>Create</Trans>
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <Sparkles className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Separator />
      {loading && (
        <div className="text-sm text-muted-foreground">
          <Trans>Loading…</Trans>
        </div>
      )}
      {Boolean(error) && (
        <div className="text-sm text-destructive">
          <Trans>Failed to load scenarios.</Trans>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map(({ id, name, description, thumbnail, updatedAt }) => {
          return (
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
                          aria-label={t`Scenario actions`}
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
                          className="text-xs"
                        >
                          <PencilIcon className="w-4 h-4 me-2" />{" "}
                          <Trans>Edit</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => exportById(id)}
                          className="text-xs"
                        >
                          <ClipboardIcon className="w-4 h-4 me-2" />{" "}
                          <Trans>Export JSON</Trans>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          onClick={() => {
                            remove(id);
                          }}
                          variant="destructive"
                          className="text-xs"
                        >
                          <TrashIcon className="w-4 h-4 me-2" />{" "}
                          <Trans>Delete</Trans>
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
                      <Trans>
                        Last updated: {formatExactDateTime(updatedAt)}
                      </Trans>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent className="px-2 flex flex-col justify-between  gap-1">
                <span className="font-bold">{name}</span>
                <div className="flex items-center gap-2"></div>
                <p className="line-clamp-3 text-sm text-muted-foreground h-16 rounded-xs">
                  {description}
                </p>
                <Button
                  onClick={async () => {
                    const taleId = await initTaleFromScenario(id);
                    await loadTale(taleId);
                    navigate({ to: "/play" });
                  }}
                  className="w-full "
                >
                  <Trans>New Tale</Trans>
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
      <GenerateScenarioDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={(scenario) => {
          navigate({
            to: "/scenarios/new",
            state: (prev) => ({
              ...(prev ?? {}),
              importedScenario: scenario,
            }),
          });
        }}
      />
    </div>
  );
}
