import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ListSelector } from "./ListSelector";

function setupQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithQuery(ui: React.ReactElement, client?: QueryClient) {
  const queryClient = client ?? setupQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ListSelector", () => {
  const contentId = 42;
  let lists: Array<any>;
  let listsWithContent: Record<string, string>;

  beforeEach(() => {
    lists = [
      {
        id: "list1",
        name: "Mixed List",
        description: "",
        listType: "mixed",
        isPublic: true,
        syncWatchStatus: false,
        collaborators: 0,
      },
      {
        id: "list2",
        name: "TV Shows",
        description: "",
        listType: "tv",
        isPublic: false,
        syncWatchStatus: true,
        collaborators: 2,
      },
    ];
    listsWithContent = { list2: "item-abc" };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url === "/api/lists" && method === "GET") {
        return { ok: true, json: async () => ({ lists }) } as Response;
      }
      if (url === `/api/content/${contentId}/lists` && method === "GET") {
        const arr = Object.entries(listsWithContent).map(([listId, itemId]) => ({ listId, itemId }));
        return { ok: true, json: async () => arr } as Response;
      }
      const addMatch = url.match(/\/api\/lists\/(.+)\/items$/);
      if (addMatch && method === "POST") {
        const listId = addMatch[1];
        listsWithContent[listId] = `item-${Date.now()}`;
        return { ok: true, json: async () => ({ id: listsWithContent[listId] }) } as Response;
      }
      const removeMatch = url.match(/\/api\/lists\/(.+)\/items\/(.+)$/);
      if (removeMatch && method === "DELETE") {
        const listId = removeMatch[1];
        delete listsWithContent[listId];
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as any;
    vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists compatible lists and supports add/remove", async () => {
    const user = userEvent.setup();

    renderWithQuery(
      <ListSelector
        contentType="tv"
        contentId={contentId}
        title="Test Show"
        posterPath={null}
        currentListId="list2"
      />,
    );

    // Shows both mixed and tv lists
    expect(await screen.findByText(/Mixed List/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /TV Shows/i })).toBeInTheDocument();

    // Current and Added badges
    expect(screen.getByText(/Current/i)).toBeInTheDocument();
    expect(screen.getByText(/Added/i)).toBeInTheDocument();

    // Add to Mixed List
    const addButtons = screen.getAllByRole("button", { name: /Add/i });
    expect(addButtons.length).toBeGreaterThan(0);
    await user.click(addButtons[0]);
    await waitFor(() => expect(screen.getAllByText(/Added/i).length).toBeGreaterThan(1));

    // Remove from TV Shows list
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    await user.click(removeButtons[0]);
    await waitFor(() => {
      // Only one 'Added' badge remains (the mixed list we added)
      expect(screen.getAllByText(/Added/i).length).toBe(1);
    });
  });
});