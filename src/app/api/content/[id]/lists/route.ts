import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/api-middleware';
import { db } from '@/lib/db';
import { lists, listItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function handler(request: AuthenticatedRequest) {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const id = url.pathname.split('/').slice(-2, -1)[0]; // Get the [id] part from /api/content/[id]/lists

    const contentId = parseInt(id);
    if (isNaN(contentId)) {
      return NextResponse.json({ error: 'Invalid content ID' }, { status: 400 });
    }

    // Find all lists owned by the user that contain this content
    const userListsWithContent = await db
      .select({
        listId: lists.id,
      })
      .from(lists)
      .innerJoin(listItems, eq(lists.id, listItems.listId))
      .where(
        and(
          eq(lists.ownerId, userId),
          eq(listItems.tmdbId, contentId)
        )
      );

    const listIds = userListsWithContent.map(item => item.listId);

    return NextResponse.json({ listIds });
  } catch (error) {
    console.error('Error fetching lists with content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);