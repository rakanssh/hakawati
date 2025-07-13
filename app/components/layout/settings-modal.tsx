import { useSettingsStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { ModelSelect } from "@/components/layout";
import { SettingsIcon } from "lucide-react";
import { useState } from "react";

export function SettingsModal() {
  const { apiKey, setApiKey } = useSettingsStore();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="interactive-ghost" size="icon">
          <SettingsIcon className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="api">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="scenario">Scenario</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
          </TabsList>
          <TabsContent value="api">
            <div className="flex flex-col gap-2">
              <Label>API Key</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Label>Model</Label>
              <ModelSelect />
            </div>
          </TabsContent>
          <TabsContent value="scenario">
            <div className="flex flex-col gap-2">
              <Label>Scenario</Label>
            </div>
          </TabsContent>
          <TabsContent value="model">
            <div className="flex flex-col gap-2">
              <Label>Model settings</Label>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
