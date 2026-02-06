import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'RoomShare - Find Your Perfect Roommate';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#18181b',
          backgroundImage:
            'radial-gradient(circle at 25% 25%, rgba(212, 101, 74, 0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(123, 158, 135, 0.1) 0%, transparent 50%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              backgroundColor: '#D4654A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '28px',
              fontWeight: 700,
            }}
          >
            R
          </div>
          <span
            style={{
              fontSize: '48px',
              fontWeight: 700,
              color: 'white',
              letterSpacing: '-0.02em',
            }}
          >
            RoomShare
          </span>
        </div>
        <div
          style={{
            fontSize: '28px',
            color: '#a1a1aa',
            textAlign: 'center',
            maxWidth: '600px',
            lineHeight: 1.4,
          }}
        >
          Find your perfect roommate. Verified profiles, instant matching,
          flexible leases.
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
