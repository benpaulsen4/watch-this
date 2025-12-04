import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CastTab } from "./CastTab";

vi.mock("next/image", () => ({
  default: (props: any) => {
    const { src, alt, ...rest } = props;
    return <img src={typeof src === "string" ? src : ""} alt={alt} {...rest} />;
  },
}));

function setupQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderWithQuery(ui: React.ReactElement, client?: QueryClient) {
  const queryClient = client ?? setupQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("CastTab", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/tmdb/credits")) {
        return { ok: true, json: async () => ({ cast: [] }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as any;
    vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading initially and then renders cast heading", async () => {
    const client = setupQueryClient();
    const user = userEvent.setup();

    // Delay credits response to observe loading state
    fetchMock.mockImplementationOnce(async () => {
      return new Promise<Response>((resolve) =>
        setTimeout(
          () =>
            resolve({ ok: true, json: async () => ({ cast: [] }) } as Response),
          10,
        ),
      );
    });

    renderWithQuery(<CastTab contentType="tv" contentId={123} />, client);
    expect(screen.getByText(/Loading cast/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/No cast information/i)).toBeInTheDocument(),
    );
  });

  it("renders cast entries with names and characters", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        cast: [
          {
            id: 1,
            name: "Alice Actor",
            character: "Hero",
            profile_path: "/a.jpg",
          },
          {
            id: 2,
            name: "Bob Player",
            character: "Villain",
            profile_path: null,
          },
        ],
      }),
    } as Response);

    renderWithQuery(<CastTab contentType="movie" contentId={55} />);

    await waitFor(() => {
      expect(screen.getByText("Cast")).toBeInTheDocument();
    });
    expect(screen.getByText("Alice Actor")).toBeInTheDocument();
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Bob Player")).toBeInTheDocument();
    expect(screen.getByText("Villain")).toBeInTheDocument();

    // One image element should exist (only for Alice)
    const images = screen.getAllByRole("img");
    expect(images.length).toBe(1);
    expect(images[0]).toHaveAttribute("alt", "Alice Actor");
  });

  it("paginates cast grid and updates page indicator", async () => {
    const total = 20;
    const cast = Array.from({ length: total }).map((_, i) => ({
      id: i + 1,
      name: `Person ${i + 1}`,
      character: `Role ${i + 1}`,
      profile_path: i % 2 === 0 ? `/p${i + 1}.jpg` : null,
    }));

    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cast }),
    } as Response);

    renderWithQuery(<CastTab contentType="tv" contentId={777} />);

    // First page shows 12 items
    await waitFor(() => {
      expect(screen.getByText("Cast")).toBeInTheDocument();
    });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 12 of 20 cast/)).toBeInTheDocument();

    const user = userEvent.setup();
    const next = screen.getByRole("button", { name: /Next/i });
    await user.click(next);

    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 13 to 20 of 20 cast/)).toBeInTheDocument();
    // Person 13 should be visible, Person 1 should not be in view anymore
    expect(screen.getByText("Person 13")).toBeInTheDocument();
    expect(screen.queryByText("Person 1")).not.toBeInTheDocument();
  });
});
