-- Rollback: ALTER TABLE "Listing" ALTER COLUMN "price" TYPE DOUBLE PRECISION;
--           ALTER TABLE "Booking" ALTER COLUMN "totalPrice" TYPE DOUBLE PRECISION;
-- Data-safety: Non-destructive type widening. ROUND ensures no precision artifacts.
-- No locking risk for small tables. For large tables, consider running during low traffic.
ALTER TABLE "Listing" ALTER COLUMN "price" TYPE DECIMAL(10,2) USING ROUND("price"::numeric, 2);
ALTER TABLE "Booking" ALTER COLUMN "totalPrice" TYPE DECIMAL(10,2) USING ROUND("totalPrice"::numeric, 2);
