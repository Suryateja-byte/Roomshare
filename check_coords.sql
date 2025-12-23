-- Check listings and their coordinates
SELECT 
  l.id, 
  l.title, 
  loc.address, 
  loc.city, 
  ST_X(loc.coords::geometry) as lng, 
  ST_Y(loc.coords::geometry) as lat
FROM "Listing" l
JOIN "Location" loc ON l.id = loc."listingId"
ORDER BY l."createdAt" DESC;
