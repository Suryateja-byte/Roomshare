"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { startConversation } from "@/app/actions/chat";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function ContactHostButton({
  listingId,
}: {
  listingId: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const isStartingRef = useRef(false);
  const router = useRouter();

  const handleContact = async () => {
    // Guard synchronously so rapid double-clicks in the same render frame
    // cannot enqueue multiple startConversation actions before disabled applies.
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIsLoading(true);
    try {
      const result = await startConversation(listingId);

      if ("error" in result && result.error) {
        if (result.error === "Unauthorized") {
          router.push("/login");
        } else {
          toast.error(result.error);
        }
        return;
      }

      if ("conversationId" in result && result.conversationId) {
        router.push(`/messages/${result.conversationId}`);
      }
    } catch (error: unknown) {
      console.error("Failed to start conversation:", error);
      toast.error("Failed to start conversation");
    } finally {
      isStartingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleContact}
      disabled={isLoading}
      size="lg"
      className="w-full"
    >
      {isLoading ? "Starting Chat..." : "Contact Host"}
    </Button>
  );
}
