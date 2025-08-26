import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { useSettingsStore } from "@/store/useSettingsStore";

import { ModelSelect } from "@/components/layout";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { useTaleStore } from "@/store/useTaleStore";

export default function Home() {
  const navigate = useNavigate();
  const { apiKey, setApiKey, model } = useSettingsStore();
  const { log } = useTaleStore();
  return (
    <main className="flex flex-col items-center justify-center h-[calc(100vh-2.5rem)] ">
      <Card className="w-full max-w-xl rounded-xs">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">API Key</Label>
              <div className="flex flex-row gap-2">
                <Input
                  type="password"
                  placeholder="Enter your key here"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="rounded-xs"
                />
                <Button className="rounded-xs">Fetch</Button>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Model</Label>
            <ModelSelect />
            <Button
              onClick={() => navigate({ to: "/demo" })}
              disabled={log.length === 0}
              className="rounded-xs"
            >
              Continue
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/tales" })}
              className="rounded-xs"
            >
              My Tales
            </Button>
            <Button
              variant="outline"
              disabled={!apiKey || !model}
              onClick={() => navigate({ to: "/scenarios" })}
              className="rounded-xs"
            >
              Scenarios
            </Button>
          </div>
        </CardContent>
      </Card>

      <Accordion
        type="single"
        collapsible
        className="w-full max-w-xl rounded-none mt-4"
      >
        <AccordionItem value="how">
          <AccordionTrigger>How to play</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>Type an action, the AI continues the story.</li>
              <li>State changes appear under the narration.</li>
              <li>Your health and inventory are displayed on the sidebar.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="llms">
          <AccordionTrigger>Supported Providers</AccordionTrigger>
          <AccordionContent>
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-bold underline">
                      OpenAI-Compatible
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Any OpenAI-compatible provider. OpenAi, OpenRouter, etc.
                  </TooltipContent>
                </Tooltip>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
}
