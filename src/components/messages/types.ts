export type MessageDirection = "sent" | "received";

export type MessageDeliveryState =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type MessageTimestamp = Date | string | number;
