/**
 * Lightweight E2E seed script
 * Creates minimal test data for Playwright journeys (5 SF listings + reviews)
 *
 * Run with: node scripts/seed-e2e.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const E2E_USER_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e-test@roomshare.dev';
const E2E_USER_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

// SF locations within the bounds used by E2E tests
const SF_LISTINGS = [
  {
    title: 'Sunny Mission Room',
    description: 'Bright private room in the heart of the Mission District. Walking distance to BART.',
    price: 1200,
    roomType: 'Private Room',
    lat: 37.7599, lng: -122.4148,
    address: '2400 Mission St', city: 'San Francisco', state: 'CA', zip: '94110',
  },
  {
    title: 'Spacious SOMA Shared',
    description: 'Shared room in modern SOMA loft. Great for young professionals.',
    price: 800,
    roomType: 'Shared Room',
    lat: 37.7785, lng: -122.3950,
    address: '500 Howard St', city: 'San Francisco', state: 'CA', zip: '94105',
  },
  {
    title: 'Cozy Sunset Studio',
    description: 'Entire studio in the Outer Sunset. Ocean views, near Golden Gate Park.',
    price: 2200,
    roomType: 'Entire Place',
    lat: 37.7535, lng: -122.4950,
    address: '1800 Irving St', city: 'San Francisco', state: 'CA', zip: '94122',
  },
  {
    title: 'Hayes Valley Private Suite',
    description: 'Furnished private suite with en-suite bath. Close to restaurants and shops.',
    price: 1800,
    roomType: 'Private Room',
    lat: 37.7760, lng: -122.4240,
    address: '400 Hayes St', city: 'San Francisco', state: 'CA', zip: '94102',
  },
  {
    title: 'Richmond District Room',
    description: 'Quiet private room near Golden Gate Park. Ideal for students.',
    price: 1000,
    roomType: 'Private Room',
    lat: 37.7800, lng: -122.4700,
    address: '600 Clement St', city: 'San Francisco', state: 'CA', zip: '94118',
  },
];

async function main() {
  console.log('🌱 Seeding E2E test data...');

  // 1. Upsert E2E test user
  const hashedPassword = await bcrypt.hash(E2E_USER_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: {},
    create: {
      email: E2E_USER_EMAIL,
      name: 'E2E Test User',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
    },
  });
  console.log(`  ✓ User: ${user.email} (${user.id})`);

  // 2. Create a second user for reviews
  const reviewer = await prisma.user.upsert({
    where: { email: 'e2e-reviewer@roomshare.dev' },
    update: {},
    create: {
      email: 'e2e-reviewer@roomshare.dev',
      name: 'E2E Reviewer',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
    },
  });
  console.log(`  ✓ Reviewer: ${reviewer.email} (${reviewer.id})`);

  // 3. Create listings with locations
  const createdListings = [];
  for (const data of SF_LISTINGS) {
    const existing = await prisma.listing.findFirst({
      where: { title: data.title, ownerId: user.id },
    });

    if (existing) {
      createdListings.push(existing);
      console.log(`  ⏭ Listing exists: ${data.title}`);
      continue;
    }

    const listing = await prisma.listing.create({
      data: {
        ownerId: user.id,
        title: data.title,
        description: data.description,
        price: data.price,
        roomType: data.roomType,
        amenities: ['WiFi', 'Furnished', 'Kitchen Access'],
        houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
        householdLanguages: ['en'],
        totalSlots: 2,
        availableSlots: 1,
        moveInDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        images: [
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600',
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600',
        ],
        location: {
          create: {
            address: data.address,
            city: data.city,
            state: data.state,
            zip: data.zip,
          },
        },
      },
    });

    // Set PostGIS coords
    const point = `POINT(${data.lng} ${data.lat})`;
    await prisma.$executeRaw`
      UPDATE "Location"
      SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
      WHERE "listingId" = ${listing.id}
    `;

    createdListings.push(listing);
    console.log(`  ✓ Listing: ${data.title} (${listing.id})`);
  }

  // 4. Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'e2e-admin@roomshare.dev' },
    update: { isAdmin: true },
    create: {
      email: 'e2e-admin@roomshare.dev',
      name: 'E2E Admin',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
      isAdmin: true,
    },
  });
  console.log(`  ✓ Admin: ${admin.email} (${admin.id})`);

  // 5. Create third user (for blocking/messaging tests)
  const thirdUser = await prisma.user.upsert({
    where: { email: 'e2e-other@roomshare.dev' },
    update: {},
    create: {
      email: 'e2e-other@roomshare.dev',
      name: 'E2E Other User',
      password: hashedPassword,
      emailVerified: new Date(),
      isVerified: true,
      bio: 'Another test user for E2E tests.',
    },
  });
  console.log(`  ✓ Third user: ${thirdUser.email} (${thirdUser.id})`);

  // 6. Add reviews to first listing
  if (createdListings.length > 0) {
    const targetListing = createdListings[0];
    const existingReview = await prisma.review.findFirst({
      where: { authorId: reviewer.id, listingId: targetListing.id },
    });

    if (!existingReview) {
      await prisma.review.create({
        data: {
          authorId: reviewer.id,
          listingId: targetListing.id,
          rating: 5,
          comment: 'Great place! Clean, well-maintained, and the host was very responsive.',
        },
      });
      console.log(`  ✓ Review added to: ${targetListing.title}`);
    } else {
      console.log(`  ⏭ Review exists for: ${targetListing.title}`);
    }
  }

  // 7. Create bookings (PENDING and ACCEPTED) on a listing NOT owned by auth user
  // Use thirdUser's perspective: they book a listing owned by E2E test user
  if (createdListings.length >= 2) {
    const bookingListing = createdListings[1]; // SOMA Shared
    const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

    // PENDING booking from reviewer
    const existingPending = await prisma.booking.findFirst({
      where: { tenantId: reviewer.id, listingId: bookingListing.id, status: 'PENDING' },
    });
    if (!existingPending) {
      await prisma.booking.create({
        data: {
          listingId: bookingListing.id,
          tenantId: reviewer.id,
          startDate,
          endDate,
          totalPrice: bookingListing.price * 3,
          status: 'PENDING',
        },
      });
      console.log(`  ✓ PENDING booking on: ${bookingListing.title}`);
    } else {
      console.log(`  ⏭ PENDING booking exists`);
    }

    // ACCEPTED booking from thirdUser on a different listing
    const acceptedListing = createdListings[2]; // Cozy Sunset Studio
    const startDate2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const endDate2 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const existingAccepted = await prisma.booking.findFirst({
      where: { tenantId: thirdUser.id, listingId: acceptedListing.id, status: 'ACCEPTED' },
    });
    if (!existingAccepted) {
      await prisma.booking.create({
        data: {
          listingId: acceptedListing.id,
          tenantId: thirdUser.id,
          startDate: startDate2,
          endDate: endDate2,
          totalPrice: acceptedListing.price * 3,
          status: 'ACCEPTED',
        },
      });
      console.log(`  ✓ ACCEPTED booking on: ${acceptedListing.title}`);
    } else {
      console.log(`  ⏭ ACCEPTED booking exists`);
    }
  }

  // 8. Create conversation with messages between user and reviewer
  if (createdListings.length > 0) {
    const convoListing = createdListings[0];
    let conversation = await prisma.conversation.findFirst({
      where: {
        listingId: convoListing.id,
        participants: { some: { id: reviewer.id } },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          listingId: convoListing.id,
          participants: { connect: [{ id: user.id }, { id: reviewer.id }] },
        },
      });

      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation.id,
            senderId: reviewer.id,
            content: 'Hi! Is this room still available?',
            read: true,
          },
          {
            conversationId: conversation.id,
            senderId: user.id,
            content: 'Yes, it is! Would you like to schedule a viewing?',
            read: true,
          },
          {
            conversationId: conversation.id,
            senderId: reviewer.id,
            content: 'That would be great! When works for you?',
            read: false,
          },
        ],
      });
      console.log(`  ✓ Conversation + messages for: ${convoListing.title}`);
    } else {
      console.log(`  ⏭ Conversation exists for: ${convoListing.title}`);
    }
  }

  // 9. Create an OPEN report
  if (createdListings.length >= 4) {
    const reportedListing = createdListings[3]; // Hayes Valley
    const existingReport = await prisma.report.findFirst({
      where: { reporterId: thirdUser.id, listingId: reportedListing.id },
    });
    if (!existingReport) {
      await prisma.report.create({
        data: {
          listingId: reportedListing.id,
          reporterId: thirdUser.id,
          reason: 'Misleading information',
          details: 'The listing photos do not match the actual property.',
          status: 'OPEN',
        },
      });
      console.log(`  ✓ OPEN report on: ${reportedListing.title}`);
    } else {
      console.log(`  ⏭ Report exists`);
    }
  }

  // 10. Create a PENDING VerificationRequest
  const existingVerification = await prisma.verificationRequest.findFirst({
    where: { userId: thirdUser.id, status: 'PENDING' },
  });
  if (!existingVerification) {
    await prisma.verificationRequest.create({
      data: {
        userId: thirdUser.id,
        documentType: 'driver_license',
        documentUrl: 'https://example.com/fake-doc.jpg',
        selfieUrl: 'https://example.com/fake-selfie.jpg',
        status: 'PENDING',
      },
    });
    console.log(`  ✓ PENDING verification request for: ${thirdUser.email}`);
  } else {
    console.log(`  ⏭ Verification request exists`);
  }

  // 11. Create AuditLog entries
  const existingAudit = await prisma.auditLog.findFirst({
    where: { adminId: admin.id },
  });
  if (!existingAudit) {
    await prisma.auditLog.createMany({
      data: [
        {
          adminId: admin.id,
          action: 'LISTING_APPROVED',
          targetType: 'Listing',
          targetId: createdListings[0]?.id || 'unknown',
          details: { reason: 'Meets all guidelines' },
        },
        {
          adminId: admin.id,
          action: 'USER_VERIFIED',
          targetType: 'User',
          targetId: reviewer.id,
          details: { documentType: 'passport' },
        },
        {
          adminId: admin.id,
          action: 'REPORT_RESOLVED',
          targetType: 'Report',
          targetId: 'seeded-report',
          details: { resolution: 'No action needed' },
        },
      ],
    });
    console.log(`  ✓ AuditLog entries created`);
  } else {
    console.log(`  ⏭ AuditLog entries exist`);
  }

  console.log('✅ E2E seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ E2E seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
