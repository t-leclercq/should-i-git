import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";

interface MessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: React.ReactNode[];
  lastButtonLabel?: string;
  onComplete?: () => void;
  onLastButtonClick?: () => void;
}

/**
 * MessageDialog component that displays messages in a carousel within a dialog
 * Each message is shown as a carousel slide with "Got it" button (or custom label for last slide)
 */
export function MessageDialog({
  open,
  onOpenChange,
  messages,
  lastButtonLabel = "Show me!",
  onComplete,
  onLastButtonClick,
}: MessageDialogProps) {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const handleNext = () => {
    if (!api) return;
    
    if (current < messages.length - 1) {
      api.scrollNext();
    } else {
      // Last slide - call onLastButtonClick if provided, otherwise close and call onComplete
      if (onLastButtonClick) {
        onLastButtonClick();
      } else {
        onOpenChange(false);
        onComplete?.();
      }
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset to first slide when closing
    if (api) {
      api.scrollTo(0);
    }
  };

  React.useEffect(() => {
    // Reset to first slide when dialog opens
    if (open && api) {
      api.scrollTo(0);
      setCurrent(0);
    }
  }, [open, api]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Git Instructions</DialogTitle>
          <DialogDescription>
            Follow these steps to resolve your situation
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Carousel setApi={setApi} className="w-full">
            <CarouselContent>
              {messages.map((message, index) => (
                <CarouselItem key={index}>
                    <div className="p-6 min-h-[200px] flex flex-col">
                      <div className="flex-1 mb-4 text-sm">
                        {message}
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={handleNext}>
                          {index === messages.length - 1 ? lastButtonLabel : "Got it"}
                        </Button>
                      </div>
                    </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </DialogContent>
    </Dialog>
  );
}

