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
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Parking'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'Spacious SOMA Shared',
    description: 'Shared room in modern SOMA loft. Great for young professionals.',
    price: 800,
    roomType: 'Shared Room',
    lat: 37.7785, lng: -122.3950,
    address: '500 Howard St', city: 'San Francisco', state: 'CA', zip: '94105',
    amenities: ['Wifi', 'AC', 'Gym', 'Kitchen'],
    houseRules: ['No Smoking', 'Guests allowed'],
    leaseDuration: 'Month-to-month',
  },
  {
    title: 'Cozy Sunset Studio',
    description: 'Entire studio in the Outer Sunset. Ocean views, near Golden Gate Park.',
    price: 2200,
    roomType: 'Entire Place',
    lat: 37.7535, lng: -122.4950,
    address: '1800 Irving St', city: 'San Francisco', state: 'CA', zip: '94122',
    amenities: ['Wifi', 'Furnished', 'Pool', 'Kitchen', 'Parking'],
    houseRules: ['No Smoking', 'Pets allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Hayes Valley Private Suite',
    description: 'Furnished private suite with en-suite bath. Close to restaurants and shops.',
    price: 1800,
    roomType: 'Private Room',
    lat: 37.7760, lng: -122.4240,
    address: '400 Hayes St', city: 'San Francisco', state: 'CA', zip: '94102',
    amenities: ['Wifi', 'Furnished', 'AC', 'Washer', 'Dryer'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'Richmond District Room',
    description: 'Quiet private room near Golden Gate Park. Ideal for students.',
    price: 1000,
    roomType: 'Private Room',
    lat: 37.7800, lng: -122.4700,
    address: '600 Clement St', city: 'San Francisco', state: 'CA', zip: '94118',
    amenities: ['Wifi', 'Kitchen', 'Furnished'],
    houseRules: ['Quiet Hours 10pm-8am', 'Guests allowed'],
    leaseDuration: 'Month-to-month',
  },
  // Additional listings to ensure >12 results for pagination testing
  {
    title: 'Marina District Flat',
    description: 'Bright flat near Chestnut St shops and Marina Green.',
    price: 1600,
    roomType: 'Private Room',
    lat: 37.8010, lng: -122.4370,
    address: '2100 Chestnut St', city: 'San Francisco', state: 'CA', zip: '94123',
    amenities: ['Wifi', 'Parking', 'AC', 'Furnished'],
    houseRules: ['No Smoking', 'Pets allowed'],
    leaseDuration: '3 months',
  },
  {
    title: 'Noe Valley Garden Room',
    description: 'Peaceful room with garden access in family-friendly Noe Valley.',
    price: 1400,
    roomType: 'Private Room',
    lat: 37.7502, lng: -122.4337,
    address: '1200 Church St', city: 'San Francisco', state: 'CA', zip: '94114',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Pool'],
    houseRules: ['Pets allowed', 'Guests allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Potrero Hill Studio',
    description: 'Modern studio with city views on Potrero Hill.',
    price: 1900,
    roomType: 'Entire Place',
    lat: 37.7615, lng: -122.4010,
    address: '800 18th St', city: 'San Francisco', state: 'CA', zip: '94107',
    amenities: ['Wifi', 'Gym', 'AC', 'Parking', 'Kitchen'],
    houseRules: ['No Smoking', 'Couples allowed'],
    leaseDuration: '6 months',
  },
  {
    title: 'Inner Sunset Shared',
    description: 'Shared room steps from UCSF and Golden Gate Park.',
    price: 750,
    roomType: 'Shared Room',
    lat: 37.7620, lng: -122.4600,
    address: '900 Irving St', city: 'San Francisco', state: 'CA', zip: '94122',
    amenities: ['Wifi', 'Kitchen'],
    houseRules: ['Quiet Hours 10pm-8am'],
    leaseDuration: 'Flexible',
  },
  {
    title: 'Dogpatch Loft',
    description: 'Industrial chic loft in up-and-coming Dogpatch neighborhood.',
    price: 2000,
    roomType: 'Entire Place',
    lat: 37.7590, lng: -122.3880,
    address: '700 3rd St', city: 'San Francisco', state: 'CA', zip: '94107',
    amenities: ['Wifi', 'Furnished', 'Pool', 'Gym', 'Parking', 'Kitchen'],
    houseRules: ['Pets allowed', 'Couples allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Pacific Heights Room',
    description: 'Elegant room in Pacific Heights with bay views.',
    price: 2100,
    roomType: 'Private Room',
    lat: 37.7930, lng: -122.4340,
    address: '2500 Fillmore St', city: 'San Francisco', state: 'CA', zip: '94115',
    amenities: ['Wifi', 'Furnished', 'AC', 'Washer', 'Dryer', 'Parking'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'Bernal Heights Cottage',
    description: 'Cozy cottage on Bernal Hill with panoramic views.',
    price: 1700,
    roomType: 'Entire Place',
    lat: 37.7450, lng: -122.4150,
    address: '300 Cortland Ave', city: 'San Francisco', state: 'CA', zip: '94110',
    amenities: ['Wifi', 'Furnished', 'Kitchen', 'Pool'],
    houseRules: ['Pets allowed', 'Guests allowed'],
    leaseDuration: 'Flexible',
  },
  {
    title: 'Castro Neighborhood Room',
    description: 'Charming room in the heart of the Castro District.',
    price: 1350,
    roomType: 'Private Room',
    lat: 37.7610, lng: -122.4350,
    address: '500 Castro St', city: 'San Francisco', state: 'CA', zip: '94114',
    amenities: ['Wifi', 'AC', 'Kitchen', 'Gym'],
    houseRules: ['Guests allowed', 'Couples allowed'],
    leaseDuration: '3 months',
  },
  {
    title: 'North Beach Shared Space',
    description: 'Shared space near Washington Square and Italian restaurants.',
    price: 900,
    roomType: 'Shared Room',
    lat: 37.8010, lng: -122.4100,
    address: '400 Columbus Ave', city: 'San Francisco', state: 'CA', zip: '94133',
    amenities: ['Wifi', 'Kitchen'],
    houseRules: ['Smoking allowed', 'Guests allowed'],
    leaseDuration: 'Month-to-month',
  },
  {
    title: 'Haight-Ashbury Suite',
    description: 'Colorful suite in historic Haight-Ashbury neighborhood.',
    price: 1550,
    roomType: 'Private Room',
    lat: 37.7700, lng: -122.4480,
    address: '1600 Haight St', city: 'San Francisco', state: 'CA', zip: '94117',
    amenities: ['Wifi', 'Furnished', 'Parking', 'Gym'],
    houseRules: ['Pets allowed', 'Smoking allowed'],
    leaseDuration: '6 months',
  },
  {
    title: 'Financial District Studio',
    description: 'Compact studio near Montgomery BART station.',
    price: 2300,
    roomType: 'Entire Place',
    lat: 37.7940, lng: -122.4010,
    address: '100 Montgomery St', city: 'San Francisco', state: 'CA', zip: '94104',
    amenities: ['Wifi', 'AC', 'Furnished', 'Kitchen', 'Parking'],
    houseRules: ['No Smoking', 'Couples allowed'],
    leaseDuration: '12 months',
  },
  {
    title: 'Japantown Shared Room',
    description: 'Shared room near Japan Center and Peace Plaza.',
    price: 850,
    roomType: 'Shared Room',
    lat: 37.7855, lng: -122.4300,
    address: '1700 Post St', city: 'San Francisco', state: 'CA', zip: '94115',
    amenities: ['Wifi', 'Kitchen'],
    houseRules: ['Quiet Hours 10pm-8am'],
    leaseDuration: 'Flexible',
  },
  {
    title: 'Russian Hill Room',
    description: 'Cozy room with Lombard Street views in Russian Hill.',
    price: 1650,
    roomType: 'Private Room',
    lat: 37.8020, lng: -122.4190,
    address: '1000 Lombard St', city: 'San Francisco', state: 'CA', zip: '94109',
    amenities: ['Wifi', 'Furnished', 'AC', 'Kitchen'],
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    leaseDuration: '6 months',
  },
  {
    title: 'SoMa Tech Room',
    description: 'Modern room near tech offices south of Market.',
    price: 1500,
    roomType: 'Private Room',
    lat: 37.7730, lng: -122.4050,
    address: '200 Brannan St', city: 'San Francisco', state: 'CA', zip: '94107',
    amenities: ['Wifi', 'Gym', 'Parking', 'Kitchen', 'AC'],
    houseRules: ['No Smoking', 'Guests allowed'],
    leaseDuration: '3 months',
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
        amenities: data.amenities || ['Wifi', 'Furnished', 'Kitchen'],
        houseRules: data.houseRules || ['No Smoking', 'Quiet Hours 10pm-8am'],
        householdLanguages: ['en'],
        leaseDuration: data.leaseDuration || null,
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

  // 3b. Create a listing owned by REVIEWER (so test user sees booking form, not owner view)
  const REVIEWER_LISTING = {
    title: 'Reviewer Nob Hill Apartment',
    description: 'Cozy apartment on Nob Hill. Great for visiting SF.',
    price: 1500,
    roomType: 'Entire Place',
    lat: 37.7920, lng: -122.4130,
    address: '1000 California St', city: 'San Francisco', state: 'CA', zip: '94108',
  };

  const existingReviewerListing = await prisma.listing.findFirst({
    where: { title: REVIEWER_LISTING.title, ownerId: reviewer.id },
  });

  let reviewerListing;
  if (existingReviewerListing) {
    reviewerListing = existingReviewerListing;
    console.log(`  ⏭ Reviewer listing exists: ${REVIEWER_LISTING.title}`);
  } else {
    reviewerListing = await prisma.listing.create({
      data: {
        ownerId: reviewer.id,
        title: REVIEWER_LISTING.title,
        description: REVIEWER_LISTING.description,
        price: REVIEWER_LISTING.price,
        roomType: REVIEWER_LISTING.roomType,
        amenities: ['WiFi', 'Furnished', 'Laundry'],
        houseRules: ['No Pets'],
        householdLanguages: ['en'],
        totalSlots: 1,
        availableSlots: 1,
        moveInDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        images: [
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600',
        ],
        location: {
          create: {
            address: REVIEWER_LISTING.address,
            city: REVIEWER_LISTING.city,
            state: REVIEWER_LISTING.state,
            zip: REVIEWER_LISTING.zip,
          },
        },
      },
    });
    const point = `POINT(${REVIEWER_LISTING.lng} ${REVIEWER_LISTING.lat})`;
    await prisma.$executeRaw`
      UPDATE "Location"
      SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
      WHERE "listingId" = ${reviewerListing.id}
    `;
    console.log(`  ✓ Reviewer listing: ${REVIEWER_LISTING.title} (${reviewerListing.id})`);
  }

  // 3c. Create a COMPLETED booking for test user on reviewer's listing (enables review writing)
  const existingCompletedBooking = await prisma.booking.findFirst({
    where: { tenantId: user.id, listingId: reviewerListing.id },
  });
  if (!existingCompletedBooking) {
    const pastStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.booking.create({
      data: {
        listingId: reviewerListing.id,
        tenantId: user.id,
        startDate: pastStart,
        endDate: pastEnd,
        totalPrice: REVIEWER_LISTING.price * 2,
        status: 'ACCEPTED',
      },
    });
    console.log(`  ✓ COMPLETED booking for test user on reviewer's listing`);
  } else {
    console.log(`  ⏭ Completed booking exists`);
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
      // Delete any existing response so J29 test can add one fresh
      await prisma.reviewResponse.deleteMany({
        where: { reviewId: existingReview.id },
      });
      console.log(`  ⏭ Review exists for: ${targetListing.title} (cleared responses)`);
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

  // 8b. Create conversation between user and thirdUser (for multi-user E2E tests)
  if (createdListings.length > 0) {
    const convoListing2 = createdListings[0];
    let conversation2 = await prisma.conversation.findFirst({
      where: {
        listingId: convoListing2.id,
        participants: { some: { id: thirdUser.id } },
      },
    });

    if (!conversation2) {
      conversation2 = await prisma.conversation.create({
        data: {
          listingId: convoListing2.id,
          participants: { connect: [{ id: user.id }, { id: thirdUser.id }] },
        },
      });

      await prisma.message.createMany({
        data: [
          {
            conversationId: conversation2.id,
            senderId: thirdUser.id,
            content: 'Hey, is the room still available?',
            read: true,
            createdAt: new Date(Date.now() - 120000),
          },
          {
            conversationId: conversation2.id,
            senderId: user.id,
            content: 'Yes! Want to schedule a viewing?',
            read: true,
            createdAt: new Date(Date.now() - 60000),
          },
        ],
      });
      console.log(`  ✓ Conversation 2 (user <-> thirdUser) for: ${convoListing2.title}`);
    } else {
      console.log(`  ⏭ Conversation 2 exists for: ${convoListing2.title}`);
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

  // 12. Backfill listing_search_docs (denormalized search table)
  // This table is created by migration 20260110000000_search_doc
  // The facets API queries it with no fallback, so it MUST be populated
  try {
    // Check if the table exists
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'listing_search_docs'
      ) AS "exists"
    `;
    if (tableExists[0]?.exists) {
      // Truncate and repopulate from Listing + Location + Review joins
      await prisma.$executeRawUnsafe(`DELETE FROM listing_search_docs`);

      await prisma.$executeRawUnsafe(`
        INSERT INTO listing_search_docs (
          id, owner_id, title, description, price, images,
          amenities, house_rules, household_languages, primary_home_language,
          lease_duration, room_type, move_in_date, total_slots, available_slots,
          view_count, status, listing_created_at,
          address, city, state, zip, location_geog, lat, lng,
          avg_rating, review_count, recommended_score,
          amenities_lower, house_rules_lower, household_languages_lower,
          gender_preference, household_gender,
          doc_created_at, doc_updated_at
        )
        SELECT
          l.id, l."ownerId", l.title, l.description, l.price, l.images,
          l.amenities, l."houseRules", l."household_languages", l."primary_home_language",
          l."leaseDuration", l."roomType", l."moveInDate", l."totalSlots", l."availableSlots",
          l."viewCount", l.status::text, l."createdAt",
          loc.address, loc.city, loc.state, loc.zip,
          loc.coords, ST_Y(loc.coords::geometry), ST_X(loc.coords::geometry),
          COALESCE(AVG(r.rating), 0)::float,
          COUNT(r.id)::int,
          (COALESCE(AVG(r.rating), 0) * 20 + l."viewCount" * 0.1 + COUNT(r.id) * 5),
          ARRAY(SELECT LOWER(unnest(l.amenities))),
          ARRAY(SELECT LOWER(unnest(l."houseRules"))),
          ARRAY(SELECT LOWER(unnest(l."household_languages"))),
          l."genderPreference", l."householdGender",
          NOW(), NOW()
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        LEFT JOIN "Review" r ON l.id = r."listingId"
        WHERE loc.coords IS NOT NULL
        GROUP BY l.id, loc.id
      `);

      // Count the inserted rows
      const countResult = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM listing_search_docs
      `;
      console.log(`  ✓ listing_search_docs backfilled: ${countResult[0].count} rows`);
    } else {
      console.log('  ⚠ listing_search_docs table does not exist — skipping backfill (run prisma migrate deploy first)');
    }
  } catch (err) {
    console.error('  ⚠ listing_search_docs backfill failed:', err.message);
    // Non-fatal: tests may still partially work without it
  }

  // 13. Create notification records for E2E tests
  const existingNotification = await prisma.notification.findFirst({
    where: { userId: user.id, type: 'BOOKING_ACCEPTED' },
  });
  if (!existingNotification) {
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          type: 'BOOKING_ACCEPTED',
          title: 'Booking Confirmed',
          message: 'Your booking request for Spacious SOMA Shared has been accepted!',
          link: '/bookings',
          read: false,
        },
        {
          userId: user.id,
          type: 'NEW_MESSAGE',
          title: 'New Message',
          message: 'E2E Reviewer sent you a message about Sunny Mission Room.',
          link: '/messages',
          read: false,
        },
        {
          userId: user.id,
          type: 'BOOKING_CANCELLED',
          title: 'Booking Cancelled',
          message: 'A booking for Hayes Valley Private Suite was cancelled.',
          link: null,
          read: true,
        },
        {
          userId: user.id,
          type: 'NEW_REVIEW',
          title: 'New Review',
          message: 'Someone left a review on your listing Sunny Mission Room.',
          link: `/listings/${createdListings[0]?.id || 'unknown'}`,
          read: true,
        },
        {
          userId: reviewer.id,
          type: 'BOOKING_REQUEST',
          title: 'New Booking Request',
          message: 'You have a new booking request for Reviewer Nob Hill Apartment.',
          link: '/bookings',
          read: false,
        },
      ],
    });
    console.log('  ✓ Notification records created');
  } else {
    console.log('  ⏭ Notification records exist');
  }

  // 14. Create BlockedUser for Settings E2E tests
  const existingBlock = await prisma.blockedUser.findFirst({
    where: { blockerId: user.id, blockedId: thirdUser.id },
  });
  if (!existingBlock) {
    await prisma.blockedUser.create({
      data: {
        blockerId: user.id,
        blockedId: thirdUser.id,
      },
    });
    console.log(`  ✓ BlockedUser: ${user.email} blocked ${thirdUser.email}`);
  } else {
    console.log(`  ⏭ BlockedUser exists`);
  }

  // 15. Create SavedSearch records for E2E tests
  const existingSavedSearch = await prisma.savedSearch.findFirst({
    where: { userId: user.id },
  });
  if (!existingSavedSearch) {
    await prisma.savedSearch.createMany({
      data: [
        {
          userId: user.id,
          name: 'SF Under $1500',
          query: 'San Francisco',
          filters: {
            minPrice: 500,
            maxPrice: 1500,
            roomType: 'private',
            location: 'San Francisco',
          },
          alertEnabled: true,
          alertFrequency: 'DAILY',
        },
        {
          userId: user.id,
          name: 'Mission District',
          query: 'Mission',
          filters: {
            location: 'Mission District',
            amenities: ['wifi', 'parking'],
          },
          alertEnabled: false,
          alertFrequency: 'WEEKLY',
        },
      ],
    });
    console.log('  ✓ SavedSearch records created');
  } else {
    console.log('  ⏭ SavedSearch records exist');
  }

  // 16. Create RecentlyViewed records for E2E tests
  const existingRecent = await prisma.recentlyViewed.findFirst({
    where: { userId: user.id },
  });
  if (!existingRecent && createdListings.length >= 3) {
    const now = new Date();
    await prisma.recentlyViewed.createMany({
      data: [
        {
          userId: user.id,
          listingId: createdListings[0].id,
          viewedAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 min ago
        },
        {
          userId: user.id,
          listingId: createdListings[1].id,
          viewedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2h ago
        },
        {
          userId: user.id,
          listingId: createdListings[2].id,
          viewedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1d ago
        },
      ],
    });
    console.log('  ✓ RecentlyViewed records created');
  } else {
    console.log(`  ⏭ RecentlyViewed ${existingRecent ? 'exists' : 'skipped (need 3+ listings)'}`);
  }

  console.log('✅ E2E seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ E2E seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
