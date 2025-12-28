import { toast } from "sonner";

/**
 * Shows a sequence of toast notifications
 * Each message is shown as a separate toast, with the first one requiring a click to dismiss
 * @param messages - Array of messages to display as toasts
 * @param onComplete - Optional callback when all toasts are dismissed
 * @param lastButtonLabel - Optional custom label for the last toast button (default: "Got it")
 */
export function showToastSequence(messages: string[], onComplete?: () => void, lastButtonLabel: string = "Got it"): void {
  if (messages.length === 0) {
    onComplete?.();
    return;
  }

  // Show first toast (requires click to dismiss)
  toast.info(messages[0], {
    duration: Infinity, // Only expire on click
    action: {
      label: "Got it",
      onClick: () => {
        // After first toast is dismissed, show remaining toasts
        if (messages.length > 1) {
          // Show remaining toasts with a small delay between each
          messages.slice(1).forEach((message, index) => {
            setTimeout(() => {
              const isLastToast = index === messages.length - 2;
              toast.info(message, {
                duration: 5000, // 5 seconds for subsequent toasts
                action: {
                  label: isLastToast ? lastButtonLabel : "Got it",
                  onClick: () => {
                    // Call onComplete when the last toast is dismissed
                    if (isLastToast) {
                      onComplete?.();
                    }
                  },
                },
                onDismiss: () => {
                  // Call onComplete when the last toast is dismissed
                  if (isLastToast) {
                    onComplete?.();
                  }
                },
              });
            }, index * 500); // 500ms delay between each toast
          });
        } else {
          // If only one message, call onComplete immediately
          onComplete?.();
        }
      },
    },
    onDismiss: () => {
      // After first toast is dismissed, show remaining toasts
      if (messages.length > 1) {
        // Show remaining toasts with a small delay between each
        messages.slice(1).forEach((message, index) => {
          setTimeout(() => {
            const isLastToast = index === messages.length - 2;
            toast.info(message, {
              duration: 5000, // 5 seconds for subsequent toasts
              action: {
                label: isLastToast ? lastButtonLabel : "Got it",
                onClick: () => {
                  // Call onComplete when the last toast is dismissed
                  if (isLastToast) {
                    onComplete?.();
                  }
                },
              },
              onDismiss: () => {
                // Call onComplete when the last toast is dismissed
                if (isLastToast) {
                  onComplete?.();
                }
              },
            });
          }, index * 500); // 500ms delay between each toast
        });
      } else {
        // If only one message, call onComplete immediately
        onComplete?.();
      }
    },
  });
}

