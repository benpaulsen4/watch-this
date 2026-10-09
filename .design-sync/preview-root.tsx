// Preview root for design-sync cards (cfg.provider).
//
// Reproduces this app's real root from src/app/layout.tsx: <html class="dark">
// plus <body class="antialiased bg-gray-950 text-gray-100"> inside
// ReactQueryProvider > AuthProvider (ContentCard reads useAuth through its
// children; AuthProvider swallows its own fetch failure and yields user: null). Without it, cards render on white while the components
// are dark-themed (text-gray-100 on white is invisible), and anything calling
// useMutation throws for want of a QueryClient.
//
// Scaffolding only — it is not a design-system component and ships no card.
import * as React from "react";

import { AuthProvider } from "../src/components/providers/AuthProvider";
import { ReactQueryProvider } from "../src/components/providers/ReactQueryProvider";

export function WatchThisPreviewRoot({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <ReactQueryProvider>
      <AuthProvider>
        <div className="dark antialiased bg-gray-950 text-gray-100 min-h-screen p-6">
          {children}
        </div>
      </AuthProvider>
    </ReactQueryProvider>
  );
}
