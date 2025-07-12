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

export function SettingsModal() {
  const { apiKey, setApiKey } = useSettingsStore();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Settings</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs>
          <TabsList>
            <TabsTrigger value="api">API</TabsTrigger>
            {/* <TabsTrigger value="scenario">Scenario</TabsTrigger> */}
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
        </Tabs>
        <DialogFooter>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
