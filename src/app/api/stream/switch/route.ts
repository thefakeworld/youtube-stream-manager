import { NextRequest, NextResponse } from "next/server";
import { switchVideo, getStreamState } from "@/lib/stream-manager";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoIndex } = body;

    if (typeof videoIndex !== 'number' || videoIndex < 0) {
      return NextResponse.json(
        { success: false, error: "Valid video index is required" },
        { status: 400 }
      );
    }

    const result = await switchVideo(videoIndex);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `已切换到视频 ${videoIndex + 1}`,
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
