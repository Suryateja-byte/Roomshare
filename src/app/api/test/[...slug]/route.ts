import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Legacy booking test route retired in Phase 09" },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Legacy booking test route retired in Phase 09" },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Legacy booking test route retired in Phase 09" },
    { status: 410 }
  );
}
