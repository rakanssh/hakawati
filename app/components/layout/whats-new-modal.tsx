import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface WhatsNewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  notes: string;
}

export function WhatsNewModal({
  open,
  onOpenChange,
  version,
  notes,
}: WhatsNewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>What&apos;s New in version {version}</DialogTitle>
        <ScrollArea className="flex-1 pr-4">
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
          </div>
        </ScrollArea>
        <div className="flex justify-end ">
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
