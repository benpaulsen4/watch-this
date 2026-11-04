import type { MetadataRoute } from "next";

// Chrome on Android mints a WebAPK for this site with or without a manifest, but
// without one the site never declares a display mode and the installed app shows
// Chrome's title bar. `display: "standalone"` is the documented way to avoid it.
//
// Icons live in public/ so their sizes are spelled out in the path rather than
// hidden behind the numbered names Next requires for src/app/icon*.png.
const SHORTCUT_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
];

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "WatchThis",
    short_name: "WatchThis",
    description:
      "Track and discover movies and TV shows with friends. Create lists, share recommendations, and never miss what to watch next.",
    // "/" is the marketing page even for a signed-in user, and the dashboard
    // already sends signed-out users to /auth.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#030712",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Activity", url: "/activity", icons: SHORTCUT_ICONS },
      { name: "Lists", url: "/lists", icons: SHORTCUT_ICONS },
      { name: "Discover", url: "/search", icons: SHORTCUT_ICONS },
    ],
  };
}
