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

export default function ScenariosHome() {
  const { items, loading, error } = useScenariosList();
  const navigate = useNavigate();
  return (
    <div className="container mx-auto py-10 flex flex-col gap-6">
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
        {items.map(({ id, scenario }) => (
          <Card key={id} className="flex flex-col pt-4 pb-3">
            <CardHeader className="px-4">
              <CardTitle>{scenario.name}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 ">
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {scenario.initialDescription}
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
        ))}
      </div>
    </div>
  );
}
