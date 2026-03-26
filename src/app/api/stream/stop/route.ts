import { NextResponse } from "next/server";
import { stopStream, getStreamState } from "@/lib/stream-manager";

export async function POST() {
  try {
    stopStream();
    return NextResponse.json({
      success: true,
      message: "Stream stopped",
      state: getStreamState(),
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
