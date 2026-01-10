import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect,test, vi } from "vitest";

import { StreamingPreferences } from "./StreamingPreferences";

// Mock next/image to avoid Next.js specific behaviors in tests
vi.mock("next/image", () => ({
  default: (props: any) => {
    // Render a plain img for compatibility
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock Dropdown to a simple <select> to make interaction deterministic
vi.mock("@/components/ui/Dropdown", () => ({
  default: ({
    label,
    placeholder,
    options,
    selectedKey,
    onSelectionChange,
    isDisabled,
  }: any) => {
    const ariaLabel = label || placeholder || "Select";
    const value = selectedKey ?? "";
    return (
      <div>
        {label && (
          <label htmlFor="dropdown-select" className="block">
            {label}
          </label>
        )}
        <select
          id="dropdown-select"
          aria-label={ariaLabel}
          value={String(value)}
          onChange={(e) => onSelectionChange?.(e.target.value)}
          disabled={!!isDisabled}
        >
          <option value="" disabled>
            {placeholder || "Select"}
          </option>
          {options.map((opt: any) => (
            <option key={String(opt.key)} value={String(opt.key)}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  },
}));

// We’ll control the return of useStreamingPreferences per-test
let mockStreamingPreferencesReturn: any = {
  streamingPreferences: null,
  streamingLoading: false,
  refreshStreamingPreferences: vi.fn(),
};

vi.mock("@/components/providers/AuthProvider", () => ({
  useStreamingPreferences: () => mockStreamingPreferencesReturn,
}));

// Helper to create a QueryClient we can spy on
function createTestQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 0,
      },
    },
  });
  return client;
}

// Minimal region fixtures
const regionsFixture = {
  results: [
    { iso_3166_1: "US", english_name: "United States" },
    { iso_3166_1: "GB", english_name: "United Kingdom" },
  ],
};

// Utility to install a fetch mock that responds based on URL
function installFetchMock({ providers }: { providers: any[] }) {
  return vi
    .spyOn(global, "fetch")
    .mockImplementation(async (input: any, init?: any) => {
      const url =
        typeof input === "string" ? input : input?.url || String(input);

      if (url.includes("/api/watch/regions")) {
        return {
          ok: true,
          json: async () => regionsFixture,
        } as any;
      }

      if (url.includes("/api/watch/providers")) {
        return {
          ok: true,
          json: async () => ({ results: providers }),
        } as any;
      }

      if (
        url.includes("/api/profile/streaming") &&
        (init?.method === "POST" || init?.method === "post")
      ) {
        return {
          ok: true,
          json: async () => ({}),
        } as any;
      }

      // Default 404-like stub
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      } as any;
    });
}

function renderWithProviders(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <StreamingPreferences />
    </QueryClientProvider>,
  );
}

describe("StreamingPreferences", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockStreamingPreferencesReturn = {
      streamingPreferences: null,
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };
  });

  test("shows prompt when no country is selected", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: null,
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    const fetchMock = installFetchMock({ providers: [] });
    const qc = createTestQueryClient();

    renderWithProviders(qc);

    // Prompt message
    expect(
      await screen.findByText(
        /Please select a country to view available streaming providers/i,
      ),
    ).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  test("loads regions and providers after selecting a country", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: null, providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    const providers = [
      { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" },
      {
        provider_id: 9,
        provider_name: "Amazon Prime",
        logo_path: "/prime.png",
      },
    ];
    const fetchMock = installFetchMock({ providers });
    const qc = createTestQueryClient();

    renderWithProviders(qc);

    // Regions dropdown appears with options
    const regionSelect = await screen.findByLabelText(/Country\/Region/i);
    expect(regionSelect).toBeInTheDocument();
    // Wait until regions have loaded and dropdown is enabled
    await waitFor(() => expect(regionSelect).not.toBeDisabled());
    await screen.findByText(/United States \(US\)/i);

    // Select US to trigger providers query
    await userEvent.selectOptions(regionSelect, "US");

    // Providers grid shows up
    await screen.findByText(/Providers/i);

    // Search input should appear when providers exist
    expect(
      screen.getByPlaceholderText(/Search providers/i),
    ).toBeInTheDocument();

    // Provider buttons present
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Amazon Prime")).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  test("toggle provider selection updates selected count", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: null, providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    const providers = [
      { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" },
      {
        provider_id: 9,
        provider_name: "Amazon Prime",
        logo_path: "/prime.png",
      },
    ];
    const fetchMock = installFetchMock({ providers });
    const qc = createTestQueryClient();
    renderWithProviders(qc);

    const regionSelect = await screen.findByLabelText(/Country\/Region/i);
    await waitFor(() => expect(regionSelect).not.toBeDisabled());
    await screen.findByText(/United States \(US\)/i);
    await userEvent.selectOptions(regionSelect, "US");

    await screen.findByText(/Providers/i);
    // Initially 0 selected
    expect(screen.getByText(/0 selected/i)).toBeInTheDocument();

    // Toggle Netflix
    await userEvent.click(screen.getByText("Netflix"));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();

    // Toggle Amazon Prime
    await userEvent.click(screen.getByText("Amazon Prime"));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

    // Toggle Netflix again (deselect)
    await userEvent.click(screen.getByText("Netflix"));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  test("save preferences POSTs payload, refreshes auth, and invalidates queries", async () => {
    const refreshSpy = vi.fn();
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: null, providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: refreshSpy,
    };

    const providers = [
      { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" },
      {
        provider_id: 9,
        provider_name: "Amazon Prime",
        logo_path: "/prime.png",
      },
    ];
    const fetchSpy = installFetchMock({ providers });
    const qc = createTestQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderWithProviders(qc);

    const regionSelect = await screen.findByLabelText(/Country\/Region/i);
    await waitFor(() => expect(regionSelect).not.toBeDisabled());
    await screen.findByText(/United States \(US\)/i);
    await userEvent.selectOptions(regionSelect, "US");

    await screen.findByText(/Providers/i);
    // Select both providers
    await userEvent.click(screen.getByText("Netflix"));
    await userEvent.click(screen.getByText("Amazon Prime"));

    // Click save
    await userEvent.click(
      screen.getByRole("button", { name: /Save Preferences/i }),
    );

    // Ensure POST was called with correct payload
    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/api/profile/streaming") &&
          init?.method === "POST",
      );
      expect(postCall).toBeTruthy();
      const [, init] = postCall!;
      const body = JSON.parse(String((init as any).body));
      expect(body.country).toBe("US");
      expect(body.region).toBe("US");
      expect(body.providers).toEqual(
        expect.arrayContaining([
          {
            providerId: 8,
            providerName: "Netflix",
            logoPath: "/netflix.png",
          },
          {
            providerId: 9,
            providerName: "Amazon Prime",
            logoPath: "/prime.png",
          },
        ]),
      );
    });

    // refreshStreamingPreferences called
    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    // Invalidate queries on success
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["watch", "providers", "US"],
      });
    });

    fetchSpy.mockRestore();
  });

  test("save shows error when no country selected", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: null, providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    const fetchMock = installFetchMock({ providers: [] });
    const qc = createTestQueryClient();
    renderWithProviders(qc);

    await userEvent.click(
      screen.getByRole("button", { name: /Save Preferences/i }),
    );

    // Error message should be shown
    expect(
      await screen.findByText(/Please select a country before saving/i),
    ).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  test("shows no providers available message for selected region with empty data", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: "us", providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    const fetchMock = installFetchMock({ providers: [] });
    const qc = createTestQueryClient();
    renderWithProviders(qc);

    // Region is preselected from preferences (US)
    expect(
      await screen.findByText(/No providers available for US/i),
    ).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  test("search filtering shows not found state when no match", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: "us", providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    const providers = [
      { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" },
      { provider_id: 9, provider_name: "Hulu", logo_path: "/hulu.png" },
    ];
    const fetchMock = installFetchMock({ providers });
    const qc = createTestQueryClient();
    renderWithProviders(qc);

    // Search for non-existent term
    const search = await screen.findByPlaceholderText(/Search providers/i);
    await userEvent.type(search, "zzz");

    expect(
      await screen.findByText(/No providers found matching "zzz"\./i),
    ).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  test("pagination displays correct ranges and navigates pages", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: "us", providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    // Create 25 providers
    const providers = Array.from({ length: 25 }, (_, i) => ({
      provider_id: i + 1,
      provider_name: `Provider ${i + 1}`,
      logo_path: null,
    }));

    const fetchMock = installFetchMock({ providers });
    const qc = createTestQueryClient();
    renderWithProviders(qc);

    // Page 1 of 2 and range 1..20
    expect(await screen.findByText(/Page 1 of 2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Showing 1 to 20 of 25 providers/i),
    ).toBeInTheDocument();

    // Go to next page
    const nextBtn = screen.getByRole("button", { name: /Next/i });
    await userEvent.click(nextBtn);

    expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Showing 21 to 25 of 25 providers/i),
    ).toBeInTheDocument();

    // Prev goes back
    const prevBtn = screen.getByRole("button", { name: /Previous/i });
    await userEvent.click(prevBtn);
    expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  test("search resets to first page while pagination remains visible", async () => {
    mockStreamingPreferencesReturn = {
      streamingPreferences: { country: "us", providers: [] },
      streamingLoading: false,
      refreshStreamingPreferences: vi.fn(),
    };

    const providers = Array.from({ length: 25 }, (_, i) => ({
      provider_id: i + 1,
      provider_name: `Provider ${i + 1}`,
      logo_path: null,
    }));
    const fetchMock = installFetchMock({ providers });
    const qc = createTestQueryClient();
    renderWithProviders(qc);

    // Go to page 2
    const nextBtn = await screen.findByRole("button", { name: /Next/i });
    await userEvent.click(nextBtn);
    expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();

    // Change search term
    const search = screen.getByPlaceholderText(/Search providers/i);
    // Use a term that matches many providers so totalPages stays > 1
    await userEvent.type(search, "Provider ");

    // Resets to page 1
    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });
});
