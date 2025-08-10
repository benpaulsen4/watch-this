import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { lists, listItems } from "@/lib/db/schema";

// POST /api/profile/import - Import user's lists data from CSV or JSON
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const format = formData.get("format") as string;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!format || !["csv", "json"].includes(format)) {
      return NextResponse.json(
        { error: "Format parameter is required and must be 'csv' or 'json'" },
        { status: 400 }
      );
    }

    const fileContent = await file.text();
    let importedCount = 0;
    const errors: string[] = [];

    try {
      if (format === "json") {
        const data = JSON.parse(fileContent);

        if (!data.lists || !Array.isArray(data.lists)) {
          return NextResponse.json(
            { error: "Invalid JSON format: 'lists' array is required" },
            { status: 400 }
          );
        }

        // Process each list
        for (const listData of data.lists) {
          try {
            // Validate required fields
            if (!listData.name || typeof listData.name !== "string") {
              errors.push(
                `Skipped list: name is required and must be a string`
              );
              continue;
            }

            // Create the list
            const [newList] = await db
              .insert(lists)
              .values({
                ownerId: userId,
                name: listData.name,
                description: listData.description || null,
                listType: listData.type || "mixed",
                isPublic: listData.isPublic || false,
              })
              .returning();

            // Process list items if they exist
            if (listData.items && Array.isArray(listData.items)) {
              for (const itemData of listData.items) {
                try {
                  if (
                    !itemData.title ||
                    !itemData.tmdbId ||
                    !itemData.contentType
                  ) {
                    errors.push(
                      `Skipped item in list '${listData.name}': title, tmdbId, and contentType are required`
                    );
                    continue;
                  }

                  await db.insert(listItems).values({
                    listId: newList.id,
                    tmdbId: itemData.tmdbId,
                    contentType: itemData.contentType,
                    title: itemData.title,
                    posterPath: itemData.posterPath || null,
                    notes: itemData.notes || null,
                    sortOrder: itemData.sortOrder || 0,
                  });
                } catch (itemError) {
                  errors.push(
                    `Failed to import item '${itemData.title}' in list '${listData.name}': ${itemError}`
                  );
                }
              }
            }

            importedCount++;
          } catch (listError) {
            errors.push(
              `Failed to import list '${listData.name}': ${listError}`
            );
          }
        }
      } else if (format === "csv") {
        const lines = fileContent.split("\n").filter((line) => line.trim());

        if (lines.length < 2) {
          return NextResponse.json(
            {
              error:
                "CSV file must contain at least a header row and one data row",
            },
            { status: 400 }
          );
        }

        const headers = lines[0]
          .split(",")
          .map((h) => h.trim().replace(/^"|"$/g, ""));
        const expectedHeaders = [
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
        ];

        // Validate headers
        const missingHeaders = expectedHeaders.filter(
          (h) => !headers.includes(h)
        );
        if (missingHeaders.length > 0) {
          return NextResponse.json(
            {
              error: `Missing required CSV headers: ${missingHeaders.join(
                ", "
              )}`,
            },
            { status: 400 }
          );
        }

        const processedLists = new Map<string, string>(); // listName -> listId

        // Process each data row
        for (let i = 1; i < lines.length; i++) {
          try {
            const values = lines[i]
              .split(",")
              .map((v) => v.trim().replace(/^"|"$/g, ""));
            const row: Record<string, string> = {};

            headers.forEach((header, index) => {
              row[header] = values[index] || "";
            });

            const listName = row["List Name"];
            if (!listName) {
              errors.push(`Row ${i + 1}: List Name is required`);
              continue;
            }

            let listId = processedLists.get(listName);

            // Create list if it doesn't exist
            if (!listId) {
              const [newList] = await db
                .insert(lists)
                .values({
                  ownerId: userId,
                  name: listName,
                  description: row["List Description"] || null,
                  listType: row["List Type"] || "mixed",
                  isPublic: row["List Is Public"]?.toLowerCase() === "true",
                })
                .returning();

              listId = newList.id;
              processedLists.set(listName, listId);
              importedCount++;
            }

            // Add item if item data exists
            const itemTitle = row["Item Title"];
            const tmdbId = row["Item TMDB ID"];
            const contentType = row["Item Content Type"];

            if (itemTitle && tmdbId && contentType) {
              await db.insert(listItems).values({
                listId: listId,
                tmdbId: parseInt(tmdbId),
                contentType: contentType,
                title: itemTitle,
                posterPath: row["Item Poster Path"] || null,
                notes: row["Item Notes"] || null,
                sortOrder: parseInt(row["Item Sort Order"]) || 0,
              });
            }
          } catch (rowError) {
            errors.push(`Row ${i + 1}: ${rowError}`);
          }
        }
      }

      return NextResponse.json({
        success: true,
        imported_count: importedCount,
        errors: errors,
      });
    } catch (parseError) {
      return NextResponse.json(
        {
          error: `Failed to parse ${format.toUpperCase()} file: ${parseError}`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Import data error:", error);

    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
});
