import { forwardRef } from "react";
import type { ListListsResponse } from "@/lib/lists/types";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { getImageUrl } from "@/lib/tmdb/client";
import {
  Globe,
  RefreshCw,
  Users,
  Lock,
  FileStack,
  Popcorn,
} from "lucide-react";
import { Badge } from "../ui/Badge";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface ListCardProps {
  list: ListListsResponse;
  onClick?: () => void;
}

export const ListCard = forwardRef<HTMLDivElement, ListCardProps>(
  ({ list, onClick }, ref) => {
    return (
      <Card onClick={onClick} ref={ref}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-gray-100 text-lg group-hover:text-white transition-colors">
              {list.name}
            </CardTitle>
            <Badge variant="genre">
              {list.listType === "mixed"
                ? "Mixed"
                : list.listType === "movies"
                  ? "Movies"
                  : "TV Shows"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {/* Image Collage */}
          <div
            className={cn(
              "flex items-center justify-center pb-4",
              list.posterPaths?.length === 2 && "gap-6",
              list.posterPaths?.length === 3 && "-space-x-14",
              list.posterPaths?.length === 4 && "-space-x-20",
            )}
          >
            {list.posterPaths?.map(
              (path) =>
                path && (
                  <Image
                    key={path}
                    src={getImageUrl(path, "w342")!}
                    alt={path}
                    width={200}
                    height={300}
                    className="h-54 w-36 object-cover rounded-lg drop-shadow-[-10px_0px_8px_rgba(0,0,0,0.4)]"
                  />
                ),
            )}
            {!list.posterPaths?.length && (
              <div className="flex flex-col gap-4 items-center justify-center h-54">
                <Popcorn className="h-8 w-8" />
                <h5>Nothing here</h5>
              </div>
            )}
          </div>

          {/* Meta Section */}
          <div className="flex justify-end items-center gap-2 text-sm text-gray-400">
            {list.isPublic ? (
              <>
                <Globe className="h-3 w-3" />
                <span className="hidden sm:block">Public</span>
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                <span className="hidden sm:block">Private</span>
              </>
            )}
            {list.syncWatchStatus && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  <span className="hidden sm:block">Sync</span>
                </div>
              </>
            )}
            {list.collaborators > 0 && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{list.collaborators}</span>
                  <span className="hidden sm:block">collaborators</span>
                </div>
              </>
            )}
            <span>•</span>
            <div className="flex items-center gap-1">
              <FileStack className="h-3 w-3" />
              <span>{list.itemCount}</span>
              <span className="hidden sm:block">items</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
);

ListCard.displayName = "ListCard";
