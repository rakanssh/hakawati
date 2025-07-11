import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router";
import { useSettingsStore } from "@/store/useSettingsStore";

import { useLLMProviders } from "@/hooks/useLLMProviders";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Header } from "@/components/layout";

export default function Home() {
  const navigate = useNavigate();
  const { apiKey, setApiKey, model, setModel } = useSettingsStore();
  const { models, loading } = useLLMProviders();
  const [open, setOpen] = useState(false);
  return (
    <main className="flex flex-col items-center justify-center h-screen">
      <Header />
      {/* Title header */}
      <header className="flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold">TingTing</h1>
      </header>

      <Card className="w-full max-w-md mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>OpenRouter API Key</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-row gap-2">
            <Input
              placeholder="Enter your key here"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button>Fetch</Button>
          </div>
          <div className="flex flex-col gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between"
                >
                  {loading ? "Loading..." : model?.name ?? "Select a model"}
                  <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search model..." />
                  <CommandList>
                    <CommandEmpty>No model found.</CommandEmpty>
                    <CommandGroup>
                      {models.map((m) => (
                        <CommandItem
                          key={m.id}
                          value={m.name}
                          onSelect={(_) => {
                            setModel(m);
                            setOpen(false);
                          }}
                        >
                          <CheckIcon
                            className={cn(
                              "mr-2 h-4 w-4",
                              model?.name === m.name
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {m.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              disabled={!apiKey || !model}
              onClick={() => {
                navigate("/demo");
              }}
            >
              Play
            </Button>
          </div>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible className="w-full max-w-md">
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
              <li>OpenRouter</li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
}
