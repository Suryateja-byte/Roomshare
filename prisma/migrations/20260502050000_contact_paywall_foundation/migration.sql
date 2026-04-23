CREATE TYPE "ProductCode" AS ENUM ('CONTACT_PACK_3', 'MOVERS_PASS_30D');
CREATE TYPE "ContactKind" AS ENUM ('MESSAGE_START');
CREATE TYPE "PaymentStatus" AS ENUM ('CHECKOUT_CREATED', 'CHECKOUT_COMPLETED', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE "EntitlementGrantType" AS ENUM ('PACK', 'PASS');
CREATE TYPE "EntitlementGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "ContactConsumptionSource" AS ENUM ('FREE', 'PACK', 'PASS');

CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "stripe_object_id" TEXT,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_code" "ProductCode" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CHECKOUT_CREATED',
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "metadata" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "stripe_refund_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entitlement_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_code" "ProductCode" NOT NULL,
    "contact_kind" "ContactKind" NOT NULL,
    "grant_type" "EntitlementGrantType" NOT NULL,
    "status" "EntitlementGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "credit_count" INTEGER,
    "payment_id" TEXT,
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_until" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entitlement_grants_pack_or_pass_shape_chk"
      CHECK (
        ("grant_type" = 'PACK' AND "credit_count" IS NOT NULL)
        OR
        ("grant_type" = 'PASS' AND "active_until" IS NOT NULL)
      )
);

CREATE TABLE "contact_consumption" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "unit_identity_epoch" INTEGER NOT NULL,
    "contact_kind" "ContactKind" NOT NULL,
    "source" "ContactConsumptionSource" NOT NULL,
    "entitlement_grant_id" TEXT,
    "conversation_id" TEXT,
    "metadata" JSONB,
    "consumed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_consumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_events_stripe_event_id_key"
    ON "stripe_events"("stripe_event_id");
CREATE INDEX "stripe_events_type_received_at_idx"
    ON "stripe_events"("event_type", "received_at");

CREATE UNIQUE INDEX "payments_stripe_checkout_session_id_key"
    ON "payments"("stripe_checkout_session_id");
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key"
    ON "payments"("stripe_payment_intent_id");
CREATE INDEX "payments_user_status_idx"
    ON "payments"("user_id", "status");
CREATE INDEX "payments_product_status_idx"
    ON "payments"("product_code", "status");

CREATE UNIQUE INDEX "refunds_stripe_refund_id_key"
    ON "refunds"("stripe_refund_id");
CREATE INDEX "refunds_payment_id_idx"
    ON "refunds"("payment_id");

CREATE INDEX "entitlement_grants_user_kind_status_idx"
    ON "entitlement_grants"("user_id", "contact_kind", "status");
CREATE UNIQUE INDEX "entitlement_grants_payment_id_key"
    ON "entitlement_grants"("payment_id");

CREATE UNIQUE INDEX "contact_consumption_user_unit_epoch_kind_idx"
    ON "contact_consumption"("user_id", "unit_id", "unit_identity_epoch", "contact_kind");
CREATE INDEX "contact_consumption_user_kind_consumed_at_idx"
    ON "contact_consumption"("user_id", "contact_kind", "consumed_at");
CREATE INDEX "contact_consumption_grant_id_idx"
    ON "contact_consumption"("entitlement_grant_id");
CREATE INDEX "contact_consumption_conversation_id_idx"
    ON "contact_consumption"("conversation_id");
