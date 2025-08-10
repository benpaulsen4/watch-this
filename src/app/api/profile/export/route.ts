import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { lists, listItems } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

// GET /api/profile/export?format=csv|json - Export user's lists data
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    if (!format || !["csv", "json"].includes(format)) {
      return NextResponse.json(
        { error: "Format parameter is required and must be 'csv' or 'json'" },
        { status: 400 }
      );
    }

    // Get all user's lists with their items
    const userLists = await db
      .select({
        listId: lists.id,
        listName: lists.name,
        listDescription: lists.description,
        listType: lists.listType,
        isPublic: lists.isPublic,
        listCreatedAt: lists.createdAt,
        itemId: listItems.id,
        tmdbId: listItems.tmdbId,
        contentType: listItems.contentType,
        title: listItems.title,
        posterPath: listItems.posterPath,
        notes: listItems.notes,
        addedAt: listItems.addedAt,
        sortOrder: listItems.sortOrder,
      })
      .from(lists)
      .leftJoin(listItems, eq(lists.id, listItems.listId))
      .where(eq(lists.ownerId, userId))
      .orderBy(asc(lists.createdAt), asc(listItems.sortOrder));

    // Group data by lists
    const listsData = userLists.reduce((acc, row) => {
      const listId = row.listId;

      if (!acc[listId]) {
        acc[listId] = {
          id: row.listId,
          name: row.listName,
          description: row.listDescription,
          type: row.listType,
          isPublic: row.isPublic,
          createdAt: row.listCreatedAt,
          items: [],
        };
      }

      if (row.itemId) {
        acc[listId].items.push({
          id: row.itemId,
          tmdbId: row.tmdbId,
          contentType: row.contentType,
          title: row.title,
          posterPath: row.posterPath,
          notes: row.notes,
          addedAt: row.addedAt,
          sortOrder: row.sortOrder,
        });
      }

      return acc;
    }, {} as Record<string, { [key: string]: unknown; isPublic: boolean; createdAt: Date; items: { [key: string]: unknown; tmdbId: number | null; addedAt: Date | null; sortOrder: number | null }[] }>);

    const listsArray = Object.values(listsData);
    const timestamp = new Date().toISOString().split("T")[0];
    const username = request.user.username;

    if (format === "json") {
      const jsonData = {
        exportedAt: new Date().toISOString(),
        user: {
          username: request.user.username,
        },
        lists: listsArray,
      };

      return NextResponse.json({
        data: JSON.stringify(jsonData, null, 2),
        filename: `watchthis-${username}-${timestamp}.json`,
      });
    }

    if (format === "csv") {
      // Flatten data for CSV format
      const csvRows = [];
      csvRows.push([
        "List Name",
        "List Description",
        "List Type",
        "List Is Public",
        "List Created At",
        "Item Title",
        "Item TMDB ID",
        "Item Content Type",
        "Item Poster Path",
        "Item Notes",
        "Item Added At",
        "Item Sort Order",
      ]);

      for (const list of listsArray) {
        if (list.items.length === 0) {
          // Add list without items
          csvRows.push([
            list.name,
            list.description || "",
            list.type,
            list.isPublic.toString(),
            list.createdAt.toISOString(),
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ]);
        } else {
          // Add list with each item
          for (const item of list.items) {
            csvRows.push([
              list.name,
              list.description || "",
              list.type,
              list.isPublic.toString(),
              list.createdAt.toISOString(),
              item.title,
              item.tmdbId?.toString() || "",
              item.contentType,
              item.posterPath || "",
              item.notes || "",
              item.addedAt?.toISOString() || "",
              item.sortOrder?.toString() || "",
            ]);
          }
        }
      }

      // Convert to CSV string
      const csvContent = csvRows
        .map((row) =>
          row
            .map((field) =>
              // Escape quotes and wrap in quotes if contains comma, quote, or newline
              typeof field === "string" &&
              (field.includes(",") ||
                field.includes('"') ||
                field.includes("\n"))
                ? `"${field.replace(/"/g, '""')}"`
                : field
            )
            .join(",")
        )
        .join("\n");

      return NextResponse.json({
        data: csvContent,
        filename: `watchthis-${username}-${timestamp}.csv`,
      });
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  } catch (error) {
    console.error("Export data error:", error);

    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
});
