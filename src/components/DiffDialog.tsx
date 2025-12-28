import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerge: () => void;
}

export function DiffDialog({ open, onOpenChange, onMerge }: DiffDialogProps) {
  const handleMerge = () => {
    onMerge();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Merge Conflict Resolution</DialogTitle>
          <DialogDescription>
            Review the changes and resolve conflicts between feature-branch and main
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-lg">
          <div className="grid grid-cols-2 divide-x">
            {/* Left side - feature-branch */}
            <div className="p-4 bg-muted/30">
              <div className="sticky top-0 bg-muted/50 p-2 mb-2 rounded font-semibold text-sm">
                feature-branch
              </div>
              <div className="space-y-1 font-mono text-xs">
                <div className="p-2 bg-green-500/20 rounded">
                  <div className="text-green-600 font-semibold mb-1">+ Added line</div>
                  <div className="text-muted-foreground">function newFeature() {'{'}</div>
                  <div className="text-muted-foreground">  return "new functionality";</div>
                  <div className="text-muted-foreground">{'}'}</div>
                </div>
                <div className="p-2 bg-yellow-500/20 rounded">
                  <div className="text-yellow-600 font-semibold mb-1">~ Modified line</div>
                  <div className="text-muted-foreground">const value = calculateNewValue();</div>
                </div>
                <div className="p-2">
                  <div className="text-muted-foreground">console.log("Feature branch code");</div>
                </div>
              </div>
            </div>
            
            {/* Right side - main branch */}
            <div className="p-4 bg-muted/30">
              <div className="sticky top-0 bg-muted/50 p-2 mb-2 rounded font-semibold text-sm">
                main
              </div>
              <div className="space-y-1 font-mono text-xs">
                <div className="p-2">
                  <div className="text-muted-foreground">function existingFeature() {'{'}</div>
                  <div className="text-muted-foreground">  return "existing code";</div>
                  <div className="text-muted-foreground">{'}'}</div>
                </div>
                <div className="p-2 bg-yellow-500/20 rounded">
                  <div className="text-yellow-600 font-semibold mb-1">~ Modified line</div>
                  <div className="text-muted-foreground">const value = calculateUpdatedValue();</div>
                </div>
                <div className="p-2">
                  <div className="text-muted-foreground">console.log("Main branch code");</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMerge}>
            I want to merge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

