import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Cleanup is now handled by backend directly, just proxy the request
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    
    console.log(`[cleanup] Calling backend cleanup for job ${id}`);
    const backendCleanupRes = await fetch(`${backendUrl}/api/clip/${id}/cleanup`, {
      method: 'DELETE'
    });
    
    if (!backendCleanupRes.ok) {
      console.warn(`[cleanup] Backend cleanup failed for ${id}:`, await backendCleanupRes.text());
      return NextResponse.json({ error: 'Backend cleanup failed' }, { status: 500 });
    }
    
    console.log(`[cleanup] Backend cleanup successful for ${id}`);
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('[cleanup] Route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 