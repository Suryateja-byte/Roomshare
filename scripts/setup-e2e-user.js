#!/usr/bin/env node
/**
 * Setup E2E Test User
 *
 * Ensures the E2E test user exists with the correct password.
 * Run this before E2E tests to ensure credentials are valid.
 *
 * Usage: node scripts/setup-e2e-user.js
 *
 * Required environment variables:
 *   - E2E_TEST_EMAIL: Email for the test user
 *   - E2E_TEST_PASSWORD: Password for the test user (min 12 chars)
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const prisma = new PrismaClient();

async function setupE2EUser() {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    console.error(
      "Error: E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env",
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("Error: E2E_TEST_PASSWORD must be at least 12 characters");
    process.exit(1);
  }

  console.log(`Setting up E2E test user: ${email}`);

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Try to find existing user
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Update existing user's password
      await prisma.user.update({
        where: { email },
        data: {
          password: hashedPassword,
          emailVerified: new Date(), // Ensure email is verified for tests
        },
      });
      console.log(`Updated password for existing user: ${email}`);
    } else {
      // Create new test user
      await prisma.user.create({
        data: {
          email,
          name: "E2E Test User",
          password: hashedPassword,
          emailVerified: new Date(),
          isVerified: true,
        },
      });
      console.log(`Created new test user: ${email}`);
    }

    console.log("E2E test user setup complete!");
  } catch (error) {
    console.error("Failed to setup E2E test user:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupE2EUser();
