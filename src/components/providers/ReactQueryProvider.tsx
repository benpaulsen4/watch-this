"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The installed app resumes rather than reloads, so without this a
            // friend's activity stays hidden until the next navigation. The age
            // check keeps quick app switches from refetching everything.
            refetchOnWindowFocus: (query) =>
              Date.now() - query.state.dataUpdatedAt > 60_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
