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

import { BookOpenIcon } from "lucide-react";
import { Header, ModelSelect } from "@/components/layout";

export default function Home() {
  const navigate = useNavigate();
  const { apiKey, setApiKey, model } = useSettingsStore();
  return (
    <main className="flex flex-col items-center justify-center h-screen ">
      <Header />
      {/* Title header */}
      <header className="flex flex-col items-center justify-center ">
        <BookOpenIcon className="w-10 h-10 mr-2" />
        <h1 className="text-4xl font-bold ">Hakawati</h1>
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
            <ModelSelect />
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
