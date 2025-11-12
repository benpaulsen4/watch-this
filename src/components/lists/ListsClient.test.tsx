import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ListsClient, { type ListResponse } from "./ListsClient";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

const initialList: ListResponse = {
  id: "l1",
  name: "Favorites",
  description: null as any,
  listType: "mixed" as any,
  isPublic: true,
  syncWatchStatus: false,
  ownerId: "u1",
  createdAt: "2024-01-01" as any,
  updatedAt: "2024-01-01" as any,
  itemCount: 1,
  collaborators: 0,
  posterPaths: ["/x.jpg"],
};

describe("ListsClient", () => {
  it("shows create form when clicking header button", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListsClient initialLists={[initialList]} />);

    await user.click(screen.getByRole("button", { name: /Create List/i }));
    expect(screen.getByText(/Create New List/i)).toBeInTheDocument();
  });

  it("disables Create List button when name is empty", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListsClient initialLists={[initialList]} />);

    await user.click(screen.getByRole("button", { name: /Create List/i }));
    // There are two 'Create List' buttons (header and form); pick the form's button
    const createButtons = screen.getAllByRole("button", {
      name: /^Create List$/i,
    });
    const formCreateBtn = createButtons[createButtons.length - 1];
    expect(formCreateBtn).toBeDisabled();
  });

  it("creates a new list and adds it to the grid", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListsClient initialLists={[]} />);

    // Open form
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

    const createButtons = screen.getAllByRole("button", {
      name: /^Create List$/i,
    });
    const formCreateBtn = createButtons[createButtons.length - 1];
    await user.click(formCreateBtn);

    // New list should appear
    expect(await screen.findByText("My New List")).toBeInTheDocument();
  });

  it("renders empty state when no lists", () => {
    renderWithClient(<ListsClient initialLists={[]} />);
    expect(screen.getByText(/No lists yet/i)).toBeInTheDocument();
  });
});
