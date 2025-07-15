import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	// Authentication and premium checks removed - no auth required
	const body = await req.json();

	// Remove userId - no authentication required
	const backendPayload = {
		...body,
		url: body.url,
		// userId removed - no authentication required
	};

	// Validate required fields
	if (!backendPayload.url) {
		return NextResponse.json(
			{ error: "url field is required" },
			{ status: 400 }
		);
	}

	// Forward to backend – expect 202 w/ { id }
	const backendRes = await fetch(
		`${process.env.BACKEND_API_URL || "http://localhost:3001"}/api/clip`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(backendPayload),
		}
	);

	const json = await backendRes.json();
	return NextResponse.json(json, { status: backendRes.status });
}
