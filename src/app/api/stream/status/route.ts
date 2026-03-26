import { NextResponse } from "next/server";
import { getStreamState } from "@/lib/stream-manager";

export async function GET() {
  try {
    const state = getStreamState();
    return NextResponse.json({
      success: true,
      state,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
