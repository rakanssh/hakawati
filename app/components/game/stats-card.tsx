import { useGameStore } from "@/store/useGameStore";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";

export function StatsCard() {
  const { stats } = useGameStore();
  return (
    <div>
      {" "}
      <Card className="py-2 flex flex-col gap-2">
        <CardHeader>
          <CardTitle className="text-sm">Stats</CardTitle>
          <Separator />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {stats.map((stat) => (
              <div key={stat.name} className="flex flex-col gap-1">
                <div className="flex flex-row justify-between items-baseline">
                  <Badge variant="outline" className="text-xs">
                    {stat.name}
                  </Badge>
                  <span className="text-sm font-mono text-muted-foreground">
                    {stat.value} / {stat.range[1]}
                  </span>
                </div>
                <Progress value={stat.value} max={stat.range[1]} />
                {/* <div className="w-full bg-muted rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full"
                    style={{
                      width: `${
                        ((stat.value - stat.range[0]) /
                          (stat.range[1] - stat.range[0])) *
                        100
                      }%`,
                    }}
                  />
                </div> */}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
