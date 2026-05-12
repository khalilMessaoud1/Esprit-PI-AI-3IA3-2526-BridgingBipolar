import { NextRequest, NextResponse } from "next/server";

const ML_URL = process.env.NEXT_PUBLIC_ML_URL || "http://127.0.0.1:5000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const upstream = await fetch(`${ML_URL}/sleep-activity/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" }
    });
  } catch (err) {
    return NextResponse.json(
      { detail: `ML proxy error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
