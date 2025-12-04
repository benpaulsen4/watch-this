"use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/tmdb/client";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { Button } from "../ui/Button";
import { ChevronLeft, ChevronRight, User } from "lucide-react";

interface CastTabProps {
  contentType: "movie" | "tv";
  contentId: number;
}

export function CastTab({ contentType, contentId }: CastTabProps) {
  const [page, setPage] = useState<number>(1);
  const PER_PAGE = 12;

  const castQuery = useQuery<{
    cast: {
      id: number;
      name: string;
      character: string | null;
      profile_path: string | null;
    }[];
  }>({
    queryKey: ["tmdb", "credits", contentType, contentId],
    queryFn: async () => {
      const res = await fetch(
        `/api/tmdb/credits?type=${contentType}&id=${contentId}`,
      );
      return res.json();
    },
  });

  const castList = castQuery.data?.cast || [];
  const totalPages = Math.ceil(castList.length / PER_PAGE) || 1;
  const pageItems = castList.slice(
    (page - 1) * PER_PAGE,
    (page - 1) * PER_PAGE + PER_PAGE,
  );

  return castQuery.isLoading ? (
    <div className="flex items-center justify-center p-8">
      <LoadingSpinner size="lg" text="Loading cast..." />
    </div>
  ) : castList.length === 0 ? (
    <div className="text-gray-400 text-sm">No cast information available.</div>
  ) : (
    <>
      <h3 className="text-lg font-semibold text-gray-100 mb-4">Cast</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {pageItems.map((c) => {
          const faceUrl = getImageUrl(c.profile_path, "w154");
          return (
            <div
              key={c.id}
              className="flex flex-col items-center gap-2 p-3 rounded-md border border-gray-700"
            >
              {faceUrl ? (
                <Image
                  src={faceUrl}
                  alt={c.name}
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center">
                  <User className="w-10 h-10 text-gray-500" />
                </div>
              )}
              <div className="text-sm text-gray-200 text-center">{c.name}</div>
              {c.character && (
                <div className="text-xs text-gray-400 text-center">
                  {c.character}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-400">
            Showing {(page - 1) * PER_PAGE + 1} to{" "}
            {Math.min(page * PER_PAGE, castList.length)} of {castList.length}{" "}
            cast
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:block">Previous</span>
            </Button>
            <span className="text-sm text-gray-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="flex items-center gap-1"
            >
              <span className="hidden sm:block">Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
