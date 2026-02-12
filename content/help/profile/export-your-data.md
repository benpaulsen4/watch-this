---
title: "Export Your Data (JSON/CSV)"
description: Download your lists and tracking data as JSON or CSV for backup or migration.
order: 3
lastUpdated: 2026-02-07
---

You can export your WatchThis data to keep a personal backup, migrate to another account, or analyze your viewing habits. We support two formats: **JSON** (best for re-importing) and **CSV** (best for spreadsheets and analysis).

## What’s Included

Both export formats include the following data:

- **Lists**: All your custom lists (name, description, privacy settings).
- **List Items**: Movies and TV shows in your lists (including title and release date).
- **Watch Status**: Your tracking status for movies and shows (Planning, Watching, Completed, Dropped, Paused).
- **Episode Progress**: Which specific episodes you've marked as watched.
- **TV Schedules**: Your weekly TV show schedule configurations.

> **Note**: Account settings (username, profile picture, timezone), streaming preferences, and passkeys are **not** included in exports.

## Export as JSON

The JSON format is a single file containing all your data in a structured format. This is the **recommended format** if you plan to import your data back into WatchThis later.

1. Go to **Profile** (`/profile`).
2. Select the **Data** tab.
3. Under **Export Data**, click **Export as JSON**.
4. Your browser will download a file named `watch-this-export-YYYY-MM-DD.json`.

## Export as CSV (Zip)

The CSV export provides your data in a format suitable for spreadsheet applications like Excel or Google Sheets. The download is a `.zip` archive containing separate `.csv` files for each data type.

1. Go to **Profile** (`/profile`).
2. Select the **Data** tab.
3. Under **Export Data**, click **Export as ZIP (CSV files)**.
4. Your browser will download a file named `watch-this-export-YYYY-MM-DD.zip`.

### CSV Files Explained

When you unzip the download, you will find:

- `lists.csv`: Your list details.
- `list_items.csv`: Items within your lists.
- `content_status.csv`: Overall watch status for movies and shows.
- `episode_status.csv`: Detailed episode tracking.
- `tv_show_schedules.csv`: Weekly schedule settings.

## Troubleshooting

**My export download didn't start**
Check your browser's pop-up blocker settings. Also ensure you are still logged in—try refreshing the page.

**The CSV file looks messy in Excel**
CSV files use UTF-8 encoding. If characters look wrong, try importing the data into Excel using the "From Text/CSV" option instead of double-clicking the file.

## Related Articles

- [Import Your Data](/help/profile/import-your-data)
