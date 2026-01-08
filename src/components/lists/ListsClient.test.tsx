import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ListsClient from "./ListsClient";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ListListsResponse } from "@/lib/lists/types";
// Mock Next.js router to avoid app router invariant
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/image to a plain img for test environment
vi.mock("next/image", () => ({
  default: (props: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const initialList: ListListsResponse = {
  id: "l1",
  name: "Favorites",
  description: null as any,
  listType: "mixed" as any,
  isPublic: true,
  isArchived: false,
  syncWatchStatus: false,
  ownerId: "u1",
  createdAt: "2024-01-01" as any,
  updatedAt: "2024-01-01" as any,
  itemCount: 1,
  collaborators: 0,
  posterPaths: ["/x.jpg"],
};

describe("ListsClient", () => {
  it("shows create modal when clicking header button", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListsClient initialLists={[initialList]} />);

    await user.click(screen.getByRole("button", { name: /Create List/i }));
    expect(screen.getByText(/Create New List/i)).toBeInTheDocument();
  });

  it("shows validation error when creating with empty name", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListsClient initialLists={[initialList]} />);

    await user.click(screen.getByRole("button", { name: /Create List/i }));
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(screen.getByText(/List name is required/i)).toBeInTheDocument();
  });

  it("creates a new list and adds it to the grid", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListsClient initialLists={[]} />);

    // Open modal
    await user.click(screen.getByRole("button", { name: /Create List/i }));

    // Fill fields
    await user.type(screen.getByLabelText(/List Name/i), "My New List");
    await user.type(screen.getByLabelText(/Description/i), "Desc");

    // Select type
    // Find the dropdown trigger via aria-haspopup=listbox
    const typeTrigger = screen
      .getAllByRole("button")
      .find((el) => el.getAttribute("aria-haspopup") === "listbox")!;
    await user.click(typeTrigger);
    await user.click(screen.getByRole("option", { name: /Movies Only/i }));

    // Toggle public
    const publicSwitch = screen.getByRole("switch", {
      name: /Make this list public/i,
    });
    await user.click(publicSwitch);

    // Mock successful creation
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (
        typeof input === "string" &&
        input.includes("/api/lists") &&
        init?.method === "POST"
      ) {
        return {
          ok: true,
          json: async () => ({
            list: {
              id: "l2",
              name: "My New List",
              description: "Desc",
              listType: "movies",
              isPublic: true,
              syncWatchStatus: false,
              ownerId: "u1",
              ownerUsername: "alice",
              ownerProfilePictureUrl: null,
              createdAt: "2024-01-02",
              updatedAt: "2024-01-02",
              itemCount: 0,
              collaborators: 0,
              posterPaths: [],
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    await user.click(screen.getByRole("button", { name: /^Create$/i }));

    // New list should appear
    expect(await screen.findByText("My New List")).toBeInTheDocument();
  });

  it("renders empty state when no lists", () => {
    renderWithClient(<ListsClient initialLists={[]} />);
    expect(screen.getByText(/No lists yet/i)).toBeInTheDocument();
  });
});
