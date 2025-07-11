import * as React from "react";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/store";
import { useNavigate } from "react-router";
import { useGameStore } from "@/store/useGameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const apiType = useSettingsStore((state) => state.apiType);
  const navigate = useNavigate();
  const { inventory, stats, resetAllState } = useGameStore();
  return (
    <Sidebar variant="inset" className="bg-background" {...props}>
      <SidebarContent className="flex flex-col gap-4 bg-background">
        <div className="flex flex-row items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold">TingTing</h1>
          <Badge variant="outline">{apiType}</Badge>
        </div>
        <Separator />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-sm">Inventory</CardTitle>
            <Separator />
          </CardHeader>
          <CardContent>
            {inventory.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {inventory.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Your inventory is empty.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-sm">Stats</CardTitle>
            <Separator />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {stats.map((stat) => (
                <div key={stat.name} className="flex flex-col gap-1">
                  <div className="flex flex-row justify-between items-baseline">
                    <span className="font-semibold">{stat.name}</span>
                    <span className="text-sm font-mono text-muted-foreground">
                      {stat.value} / {stat.range[1]}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5">
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
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Button variant="outline" onClick={resetAllState}>
          Reset
        </Button>
      </SidebarContent>
    </Sidebar>
  );
}
