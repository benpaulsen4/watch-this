"use client";

import { useState, useCallback, useMemo } from "react";
import { Filter, TrendingUp } from "lucide-react";
import type { TMDBMovie, TMDBTVShow, TMDBGenre } from "@/lib/tmdb/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { SearchInput } from "@/components/search/SearchInput";
import { Button } from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { PageHeader } from "../ui/PageHeader";
import { ContentCard } from "../content/ContentCard";
import { ContentCardSkeleton } from "../content/ContentCardSkeleton";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  TMDBContent,
  TMDBContentSearchResult,
} from "@/lib/content-status/types";

type ContentType = "all" | "movie" | "tv";
type SortBy =
  | "popularity.desc"
  | "vote_average.desc"
  | "release_date.desc"
  | "title.asc";

export interface SearchClientProps {
  genres: TMDBGenre[];
  children: React.ReactNode;
}

export function SearchClient({ genres, children }: SearchClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [contentType, setContentType] = useState<ContentType>("all");
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("popularity.desc");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const discoverQuery = useInfiniteQuery<TMDBContentSearchResult>({
    queryKey: [
      "tmdb",
      "discover",
      { contentType, sortBy, selectedGenre, selectedYear },
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const pageNum = typeof pageParam === "number" ? pageParam : 1;
      const params = new URLSearchParams({
        page: pageNum.toString(),
        sort_by: sortBy,
      });
      if (contentType !== "all") params.append("type", contentType);
      if (selectedGenre) params.append("with_genres", selectedGenre);
      if (selectedYear) params.append("year", selectedYear);
      const response = await fetch(`/api/tmdb/discover?${params}`);
      if (!response.ok) throw new Error("Failed to load discover content");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const currentPage = pages.length;
      return currentPage < (lastPage.totalPages || 1)
        ? currentPage + 1
        : undefined;
    },
  });

  const searchResultsQuery = useQuery<TMDBContentSearchResult>({
    queryKey: ["tmdb", "search", { q: searchQuery, contentType, selectedYear }],
    enabled: !!searchQuery.trim(),
    queryFn: async () => {
      const params = new URLSearchParams({ q: searchQuery, type: contentType });
      if (selectedYear && contentType !== "all")
        params.append("year", selectedYear);
      const response = await fetch(`/api/tmdb/search?${params}`);
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
  });

  const resetPage = () => setPage(1);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const loadMore = () => {
    if (!searchQuery && discoverQuery.hasNextPage) {
      const nextPage = page + 1;
      setPage(nextPage);
      discoverQuery.fetchNextPage();
    }
  };

  const clearFilters = () => {
    setSelectedGenre("");
    setSelectedYear("");
    setSortBy("popularity.desc");
    setContentType("all");
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 50 }, (_, i) => currentYear - i);

  const displayContent = useMemo(() => {
    if (searchQuery) {
      return searchResultsQuery.data?.results || [];
    }
    const pages = discoverQuery.data?.pages || [];
    return pages.flatMap((p) => p.results || []);
  }, [searchQuery, searchResultsQuery.data, discoverQuery.data]);

  const searchLoading = searchResultsQuery.isFetching;
  const contentLoading = discoverQuery.isLoading && displayContent.length === 0;

  return (
    <div className="min-h-screen bg-gray-950">
      <PageHeader title="Discover" backLinkHref="/dashboard">
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </PageHeader>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="mb-8">
          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="Search movies and TV shows..."
            loading={searchResultsQuery.isFetching}
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <Card variant="entertainment" className="mb-8">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Content Type
                  </label>
                  <Dropdown
                    placeholder="All"
                    selectedKey={contentType}
                    onSelectionChange={(key) => {
                      setContentType((key as ContentType) || "all");
                      resetPage();
                    }}
                    options={[
                      { key: "all", label: "All" },
                      { key: "movie", label: "Movies" },
                      { key: "tv", label: "TV Shows" },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Genre
                  </label>
                  <Dropdown
                    placeholder="All Genres"
                    selectedKey={selectedGenre}
                    onSelectionChange={(key) => {
                      setSelectedGenre(String(key ?? ""));
                      resetPage();
                    }}
                    isDisabled={!!searchQuery}
                    options={[
                      { key: "", label: "All Genres" },
                      ...genres.map((genre) => ({
                        key: String(genre.id),
                        label: genre.name,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Year
                  </label>
                  <Dropdown
                    placeholder="All Years"
                    selectedKey={selectedYear}
                    onSelectionChange={(key) => {
                      setSelectedYear(String(key ?? ""));
                      resetPage();
                    }}
                    isDisabled={!!searchQuery && contentType === "all"}
                    options={[
                      { key: "", label: "All Years" },
                      ...years.map((year) => ({
                        key: String(year),
                        label: String(year),
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sort By
                  </label>
                  <Dropdown
                    placeholder="Popularity"
                    selectedKey={sortBy}
                    onSelectionChange={(key) => {
                      setSortBy((key as SortBy) || "popularity.desc");
                      resetPage();
                    }}
                    isDisabled={!!searchQuery}
                    options={[
                      { key: "popularity.desc", label: "Popularity" },
                      { key: "vote_average.desc", label: "Rating" },
                      { key: "release_date.desc", label: "Release Date" },
                      { key: "title.asc", label: "Title" },
                    ]}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-100">
              {searchQuery
                ? `Search Results for "${searchQuery}"`
                : "Discover Content"}
            </h2>
          </div>

          {searchLoading || contentLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              {Array.from({ length: 20 }).map((_, i) => (
                <ContentCardSkeleton key={i} />
              ))}
            </div>
          ) : displayContent.length > 0 ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                {displayContent.map((item) => (
                  <ContentCard key={item.tmdbId} content={item} />
                ))}
              </div>

              {!searchQuery && discoverQuery.hasNextPage && (
                <div className="flex justify-center mt-8">
                  <Button
                    onClick={loadMore}
                    variant="outline"
                    loading={discoverQuery.isFetchingNextPage}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-400">
                {searchQuery
                  ? `No results found for "${searchQuery}"`
                  : "No content available"}
              </p>
            </div>
          )}
        </section>

        {/* Trending Sidebar */}
        {!searchQuery && children && (
          <section className="mt-12">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-red-400" />
              <h3 className="text-xl font-semibold text-gray-100">
                Trending Today
              </h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              {children}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
