import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

interface YouTubeSearchResult {
  title: string;
  videoId: string;
  thumbnail: string;
  duration: string;
  viewCount: string;
  channelTitle: string;
  description: string;
  url: string;
}

// POST /api/videos/fetch-youtube - Search YouTube for popular videos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, maxResults = 10 } = body;

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Search query is required" },
        { status: 400 }
      );
    }

    const zai = await ZAI.create();

    // Use web search to find YouTube videos
    const searchQuery = `${query} site:youtube.com`;
    const searchResult = await zai.functions.invoke("web_search", {
      query: searchQuery,
      num: Math.min(maxResults, 20),
    });

    const videos: YouTubeSearchResult[] = [];

    // Parse search results to extract video information
    if (Array.isArray(searchResult)) {
      for (const item of searchResult) {
        const url = item.url || "";
        
        // Extract video ID from YouTube URL
        let videoId = "";
        if (url.includes("youtube.com/watch")) {
          const match = url.match(/[?&]v=([^&]+)/);
          if (match) videoId = match[1];
        } else if (url.includes("youtu.be/")) {
          const match = url.match(/youtu\.be\/([^?&]+)/);
          if (match) videoId = match[1];
        } else if (url.includes("youtube.com/shorts/")) {
          const match = url.match(/shorts\/([^?&]+)/);
          if (match) videoId = match[1];
        }

        if (videoId) {
          videos.push({
            title: item.name || "Unknown Title",
            videoId,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            duration: "Unknown",
            viewCount: "Unknown",
            channelTitle: item.host_name || "Unknown Channel",
            description: item.snippet || "",
            url,
          });
        }
      }
    }

    // If no videos found via search, try alternative approach
    if (videos.length === 0) {
      // Use AI to generate video suggestions based on query
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a YouTube video search assistant. Given a search query, suggest relevant popular YouTube videos. Return results in JSON format as an array of objects with: title, videoId (11 character YouTube ID), channelTitle, duration (format like '10:30'), viewCount (format like '1.2M views'), description (brief summary). Return only valid JSON, no markdown.",
          },
          {
            role: "user",
            content: `Suggest ${maxResults} popular YouTube videos for: "${query}". Return only a JSON array.`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content || "[]";
      
      try {
        const aiVideos = JSON.parse(content);
        if (Array.isArray(aiVideos)) {
          for (const video of aiVideos.slice(0, maxResults)) {
            if (video.videoId) {
              videos.push({
                title: video.title || "Unknown Title",
                videoId: video.videoId,
                thumbnail: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
                duration: video.duration || "Unknown",
                viewCount: video.viewCount || "Unknown",
                channelTitle: video.channelTitle || "Unknown Channel",
                description: video.description || "",
                url: `https://www.youtube.com/watch?v=${video.videoId}`,
              });
            }
          }
        }
      } catch {
        console.error("Failed to parse AI response");
      }
    }

    return NextResponse.json({
      success: true,
      data: videos,
      query,
      total: videos.length,
    });
  } catch (error) {
    console.error("Error fetching YouTube videos:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch YouTube videos" },
      { status: 500 }
    );
  }
}
