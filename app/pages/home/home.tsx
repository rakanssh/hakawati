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

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="flex flex-col items-center justify-center h-screen">
      {/* Title header */}
      <header className="flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold">Hakawati</h1>
      </header>

      <Card className="w-full max-w-md mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>OpenRouter API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Input placeholder="Enter your key here" />
            <Button
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
