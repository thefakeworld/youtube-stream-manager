import { NextRequest, NextResponse } from "next/server";
import { startStream, getStreamState } from "@/lib/stream-manager";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rtmpUrl, videos, loopCount, startIndex } = body;

    if (!rtmpUrl) {
      return NextResponse.json(
        { success: false, error: "RTMP URL is required" },
        { status: 400 }
      );
    }

    if (!videos || videos.length === 0) {
      return NextResponse.json(
        { success: false, error: "No videos provided" },
        { status: 400 }
      );
    }

    const result = await startStream(
      rtmpUrl, 
      videos, 
      loopCount || 10,
      startIndex || 0
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Stream started",
        state: getStreamState(),
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
