"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight,Save, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import type { StreamingPreferences as StreamingPreferencesType } from "@/lib/profile/streaming/types";
import { getImageUrl } from "@/lib/tmdb/client";

import { useStreamingPreferences } from "../providers/AuthProvider";
import { LoadingSpinner } from "../ui/LoadingSpinner";

interface Region {
  iso_3166_1: string;
  english_name: string;
}

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

type SavedProvider = StreamingPreferencesType["providers"][number];

export function StreamingPreferences() {
  const [country, setCountry] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PROVIDERS_PER_PAGE = 20;

  // Use streaming preferences from context
  const { streamingPreferences, refreshStreamingPreferences } =
    useStreamingPreferences();

  // React Query: regions
  const regionsQuery = useQuery<Region[]>({
    queryKey: ["watch", "regions"],
    queryFn: async () => {
      const regionsRes = await fetch("/api/watch/regions");
      const regionsData = await regionsRes.json();
      return (regionsData?.results || []) as Region[];
    },
  });

  // React Query: providers for a region
  const providersQuery = useQuery<Provider[]>({
    queryKey: ["watch", "providers", region],
    enabled: !!region,
    queryFn: async () => {
      const res = await fetch(`/api/watch/providers?region=${region}`);
      const data = await res.json();
      return (data?.results || []) as Provider[];
    },
  });

  const queryClient = useQueryClient();

  // Filter and paginate providers
  const filteredProviders = useMemo(() => {
    const providers = providersQuery.data || [];
    if (!providers.length) return [];
    return providers.filter((provider) =>
      provider.provider_name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [providersQuery.data, searchTerm]);

  const totalPages = Math.ceil(filteredProviders.length / PROVIDERS_PER_PAGE);
  const paginatedProviders = useMemo(() => {
    const startIndex = (currentPage - 1) * PROVIDERS_PER_PAGE;
    return filteredProviders.slice(startIndex, startIndex + PROVIDERS_PER_PAGE);
  }, [filteredProviders, currentPage]);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Initialize state from context preferences; no fetch here
  useEffect(() => {
    try {
      const userCountry: string | null = streamingPreferences?.country || null;
      const savedProviders: SavedProvider[] =
        streamingPreferences?.providers || [];

      if (userCountry) {
        const initialRegion = userCountry.toUpperCase();
        setCountry(userCountry);
        setRegion(initialRegion);

        const initialSelected: Record<number, boolean> = {};
        savedProviders
          .filter((p) => p.region === initialRegion)
          .forEach((p) => {
            initialSelected[p.id] = true;
          });
        setSelected(initialSelected);
      } else {
        setCountry("");
        setRegion("");
        setSelected({});
      }
    } catch (e) {
      console.error(e);
      setError("Failed to initialize streaming preferences");
    }
  }, [streamingPreferences]);

  const handleCountryChange = async (code: string) => {
    setCountry(code);
    const regionCode = code.toUpperCase();
    setRegion(regionCode);
    setSelected({});
    setCurrentPage(1);
    setSearchTerm("");
  };

  const toggleProvider = (id: number) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  const savePreferences = useMutation({
    mutationFn: async () => {
      if (!country) {
        throw new Error("Please select a country before saving");
      }
      const providers = providersQuery.data || [];
      const payload = {
        country: country.toUpperCase(),
        region: region.toUpperCase(),
        providers: providers
          .filter((p) => selected[p.provider_id])
          .map((p) => ({
            providerId: p.provider_id,
            providerName: p.provider_name,
            logoPath: p.logo_path,
          })),
      };

      const res = await fetch("/api/profile/streaming", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error || "Failed to save preferences");
      }
    },
    onSuccess: async () => {
      // Sync auth context (server data)
      await refreshStreamingPreferences();
      // Optionally invalidate any streaming-related queries
      queryClient.invalidateQueries({
        queryKey: ["watch", "providers", region],
      });
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to save");
    },
  });

  const handleSave = async () => {
    setError("");
    try {
      await savePreferences.mutateAsync();
    } catch {
      // Error state is handled in onError; swallow to avoid unhandled rejection
    }
  };

  return (
    <div className="space-y-6">
      {/* Country selector */}
      <div>
        <Dropdown
          label="Country/Region"
          placeholder="Select a country..."
          selectedKey={country || undefined}
          onSelectionChange={(key) => handleCountryChange(String(key || ""))}
          isDisabled={regionsQuery.isLoading}
          options={(regionsQuery.data || []).map((r) => ({
            key: r.iso_3166_1,
            label: `${r.english_name} (${r.iso_3166_1})`,
          }))}
        />
      </div>

      {/* Providers grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-100">Providers</h3>
          <span className="text-sm text-gray-400">
            {selectedCount} selected
          </span>
        </div>

        {/* Search input */}
        {country && (providersQuery.data || []).length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search providers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {providersQuery.isLoading ? (
          <LoadingSpinner text="Loading Providers..."></LoadingSpinner>
        ) : !country ? (
          <div className="text-gray-400 text-center py-8">
            Please select a country to view available streaming providers.
          </div>
        ) : (providersQuery.data || []).length === 0 ? (
          <div className="text-gray-400">
            No providers available for {region}
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            No providers found matching &quot;{searchTerm}&quot;.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {paginatedProviders.map((p) => {
                const isSelected = !!selected[p.provider_id];
                const logoUrl = p.logo_path
                  ? getImageUrl(p.logo_path, "w92")
                  : null;
                return (
                  <button
                    key={p.provider_id}
                    type="button"
                    onClick={() => toggleProvider(p.provider_id)}
                    className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
                      isSelected
                        ? "border-red-500/50 bg-red-500/10"
                        : "border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    {logoUrl ? (
                      <Image
                        src={logoUrl}
                        alt={p.provider_name}
                        width={32}
                        height={32}
                        className="rounded"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-800 rounded" />
                    )}
                    <span
                      className={`text-sm ${
                        isSelected ? "text-red-400" : "text-gray-200"
                      }`}
                    >
                      {p.provider_name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-400">
                  Showing {(currentPage - 1) * PROVIDERS_PER_PAGE + 1} to{" "}
                  {Math.min(
                    currentPage * PROVIDERS_PER_PAGE,
                    filteredProviders.length,
                  )}{" "}
                  of {filteredProviders.length} providers
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-gray-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={savePreferences.isPending}>
          <Save className="w-5 h-5 mr-2"></Save> Save Preferences
        </Button>
      </div>
    </div>
  );
}
