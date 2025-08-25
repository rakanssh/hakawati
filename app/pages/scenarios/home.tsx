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
import { Link, useNavigate } from "@tanstack/react-router";
import { useScenariosList } from "@/hooks/useScenarios";
import { initTaleFromScenario } from "@/services/scenario.service";
import { bytesToObjectUrl } from "@/lib/utils";

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ id, name, initialDescription, thumbnailWebp }) => {
          console.log(thumbnailWebp);
          return (
            <Card key={id} className="flex flex-col pt-4 pb-3">
              <CardHeader className="px-4">
                <CardTitle>{name}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 ">
                {thumbnailWebp && (
                  <img
                    src={bytesToObjectUrl(
                      thumbnailWebp as unknown as Uint8Array,
                    )}
                    alt={`${name} thumbnail`}
                    className="h-28 w-full object-cover rounded mb-2 border"
                  />
                )}
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {initialDescription}
                </p>
              </CardContent>
              <CardFooter className="mt-auto flex justify-between px-4">
                <Button variant="secondary" asChild>
                  <Link to={`/scenarios/${id}`}>Edit</Link>
                </Button>
                <Button
                  onClick={async () => {
                    await initTaleFromScenario(id);
                    navigate({ to: "/demo" });
                  }}
                >
                  Start Tale
                </Button>
              </CardFooter>
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
