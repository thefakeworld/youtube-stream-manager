import { NextRequest, NextResponse } from "next/server";
import { forceSwitchVideo, getStreamState } from "@/lib/stream-manager";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoIndex, videos, rtmpUrl, loopCount } = body;

    if (typeof videoIndex !== 'number' || videoIndex < 0) {
      return NextResponse.json(
        { success: false, error: "Valid video index is required" },
        { status: 400 }
      );
    }

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

    const result = await forceSwitchVideo(
      videoIndex,
      videos,
      rtmpUrl,
      loopCount || 10
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `已切换到视频: ${videos[videoIndex]?.title}`,
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
