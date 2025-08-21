import { Drawer, DrawerFooter } from "../ui/drawer";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { Drawer as DrawerPrimitive } from "vaul";
import { ReactNode } from "react";

interface AddDrawerProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitIcon?: ReactNode;
  submitAriaLabel?: string;
}

export function AddDrawer({
  open,
  setOpen,
  containerRef,
  children,
  onSubmit,
  submitDisabled,
  submitIcon,
  submitAriaLabel,
}: AddDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={setOpen} container={containerRef.current}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="absolute inset-0 bg-black/30" />
        <DrawerPrimitive.Content
          className={cn(
            "bg-background absolute inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border-t",
          )}
        >
          <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />

          <DrawerFooter className="flex flex-row justify-center gap-2">
            {children}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                onSubmit();
                setOpen(false);
              }}
              className="w-10 h-10"
              disabled={submitDisabled}
              aria-label={submitAriaLabel}
            >
              {submitIcon}
            </Button>
          </DrawerFooter>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Drawer>
  );
}
