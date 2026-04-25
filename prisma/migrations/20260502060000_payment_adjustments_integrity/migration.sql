ALTER TYPE "EntitlementGrantStatus" ADD VALUE 'FROZEN';

CREATE TYPE "PaymentDisputeStatus" AS ENUM ('OPEN', 'WON', 'LOST');

CREATE TABLE "payment_disputes" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "stripe_dispute_id" TEXT NOT NULL,
    "stripe_charge_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PaymentDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_disputes_stripe_dispute_id_key"
    ON "payment_disputes"("stripe_dispute_id");
CREATE INDEX "payment_disputes_payment_id_idx"
    ON "payment_disputes"("payment_id");
CREATE INDEX "payment_disputes_status_updated_at_idx"
    ON "payment_disputes"("status", "updated_at");
