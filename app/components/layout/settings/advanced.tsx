import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsStore } from "@/store";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  GM_SYSTEM_PROMPT,
  STORY_TELLER_SYSTEM_PROMPT,
  CONTINUE_SYSTEM_PROMPT,
  CONTINUE_AUTHOR_NOTE,
} from "@/prompts";
import { AlertTriangleIcon } from "lucide-react";

export default function SettingsAdvanced() {
  const {
    customGmPrompt,
    customStorytellerPrompt,
    customContinuePrompt,
    customContinueAuthorNote,
    useCustomGmPrompt,
    useCustomStorytellerPrompt,
    useCustomContinuePrompt,
    useCustomContinueAuthorNote,
    setCustomGmPrompt,
    setCustomStorytellerPrompt,
    setCustomContinuePrompt,
    setCustomContinueAuthorNote,
    setUseCustomGmPrompt,
    setUseCustomStorytellerPrompt,
    setUseCustomContinuePrompt,
    setUseCustomContinueAuthorNote,
    resetGmPrompt,
    resetStorytellerPrompt,
    resetContinuePrompt,
    resetContinueAuthorNote,
    resetAllPromptsToDefault,
  } = useSettingsStore();

  const handleGmCheckChange = (checked: boolean) => {
    setUseCustomGmPrompt(checked);
    if (checked) {
      setCustomGmPrompt(GM_SYSTEM_PROMPT);
    }
  };

  const handleStorytellerCheckChange = (checked: boolean) => {
    setUseCustomStorytellerPrompt(checked);
    if (checked) {
      setCustomStorytellerPrompt(STORY_TELLER_SYSTEM_PROMPT);
    }
  };

  const handleContinueCheckChange = (checked: boolean) => {
    setUseCustomContinuePrompt(checked);
    if (checked) {
      setCustomContinuePrompt(CONTINUE_SYSTEM_PROMPT);
    }
  };

  const handleContinueAuthorNoteCheckChange = (checked: boolean) => {
    setUseCustomContinueAuthorNote(checked);
    if (checked) {
      setCustomContinueAuthorNote(CONTINUE_AUTHOR_NOTE);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-full">
      <Label>Advanced Settings</Label>
      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>System Prompts</Label>
          <Button
            variant="destructive"
            onClick={resetAllPromptsToDefault}
            disabled={
              !useCustomGmPrompt &&
              !useCustomStorytellerPrompt &&
              !useCustomContinuePrompt &&
              !useCustomContinueAuthorNote
            }
          >
            Reset All to Default
          </Button>
        </div>
        <Separator />
        <p className="text-sm text-muted-foreground mt-2">
          Customize system prompts that control how the AI responds. Users with
          default prompts will automatically receive updates when the app is
          updated. Custom prompts will be preserved until you reset them.
        </p>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="gm-prompt">
            <AccordionTrigger>GM System Prompt</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3">
                {" "}
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    This is the system prompt used when the game is in
                    &quot;Game Master&quot; mode. The story description is
                    appended to the prompt. (Two new lines, followed by
                    &quot;The story is: &quot; and the description text.)
                    <br />
                    <b className="flex items-center gap-2">
                      <AlertTriangleIcon className="w-4 h-4 inline-block" />
                      GM mode is still in development and is very sensitive to
                      the system prompt.
                    </b>{" "}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-custom-gm"
                    checked={useCustomGmPrompt}
                    onCheckedChange={handleGmCheckChange}
                  />
                  <Label htmlFor="use-custom-gm" className="cursor-pointer">
                    Use Custom Prompt
                  </Label>
                </div>
                <Textarea
                  value={useCustomGmPrompt ? customGmPrompt : GM_SYSTEM_PROMPT}
                  onChange={(e) => setCustomGmPrompt(e.target.value)}
                  disabled={!useCustomGmPrompt}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="System prompt for Game Master mode..."
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetGmPrompt}
                    disabled={!useCustomGmPrompt}
                  >
                    Reset to Default
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="storyteller-prompt">
            <AccordionTrigger>Storyteller System Prompt</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    This is the system prompt used when the game is in
                    &quot;Story Teller&quot; mode. The story description is
                    appended to the prompt. (Two new lines, followed by
                    &quot;The story is: &quot; and the description text.)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-custom-storyteller"
                    checked={useCustomStorytellerPrompt}
                    onCheckedChange={handleStorytellerCheckChange}
                  />
                  <Label
                    htmlFor="use-custom-storyteller"
                    className="cursor-pointer"
                  >
                    Use Custom Prompt
                  </Label>
                </div>
                <Textarea
                  value={
                    useCustomStorytellerPrompt
                      ? customStorytellerPrompt
                      : STORY_TELLER_SYSTEM_PROMPT
                  }
                  onChange={(e) => setCustomStorytellerPrompt(e.target.value)}
                  disabled={!useCustomStorytellerPrompt}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="System prompt for Story Teller mode..."
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetStorytellerPrompt}
                    disabled={!useCustomStorytellerPrompt}
                  >
                    Reset to Default
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="continue-prompt">
            <AccordionTrigger>Continue System Prompt</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    This is the user message that is sent to the AI when the
                    continue button is clicked.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-custom-continue"
                    checked={useCustomContinuePrompt}
                    onCheckedChange={handleContinueCheckChange}
                  />
                  <Label
                    htmlFor="use-custom-continue"
                    className="cursor-pointer"
                  >
                    Use Custom Prompt
                  </Label>
                </div>
                <Textarea
                  value={
                    useCustomContinuePrompt
                      ? customContinuePrompt
                      : CONTINUE_SYSTEM_PROMPT
                  }
                  onChange={(e) => setCustomContinuePrompt(e.target.value)}
                  disabled={!useCustomContinuePrompt}
                  rows={6}
                  className="font-mono text-xs"
                  placeholder="Prompt used when continuing the story..."
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetContinuePrompt}
                    disabled={!useCustomContinuePrompt}
                  >
                    Reset to Default
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="continue-author-note">
            <AccordionTrigger>Continue Author Note</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    This is an extra author note that is injected early with
                    other system prompts only during a <b>Continue</b> action.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-custom-continue-author"
                    checked={useCustomContinueAuthorNote}
                    onCheckedChange={handleContinueAuthorNoteCheckChange}
                  />
                  <Label
                    htmlFor="use-custom-continue-author"
                    className="cursor-pointer"
                  >
                    Use Custom Prompt
                  </Label>
                </div>
                <Textarea
                  value={
                    useCustomContinueAuthorNote
                      ? customContinueAuthorNote
                      : CONTINUE_AUTHOR_NOTE
                  }
                  onChange={(e) => setCustomContinueAuthorNote(e.target.value)}
                  disabled={!useCustomContinueAuthorNote}
                  rows={8}
                  className="font-mono text-xs"
                  placeholder="Author's note injected during continuation..."
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetContinueAuthorNote}
                    disabled={!useCustomContinueAuthorNote}
                  >
                    Reset to Default
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Separator />
      </div>
    </div>
  );
}
