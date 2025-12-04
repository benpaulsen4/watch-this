import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ListDetailsClient from "./ListDetailsClient";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Capture router pushes
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Provide a stable user who owns the list
vi.mock("../providers/AuthProvider", () => ({
  useUser: () => ({ id: "owner-1", username: "owner" }),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const initialList = {
  id: "list-1",
  name: "Sci-Fi Classics",
  description: null,
  listType: "mixed",
  isPublic: false,
  syncWatchStatus: false,
  ownerId: "owner-1",
  ownerUsername: "owner",
  ownerProfilePictureUrl: null,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  items: [],
  collaborators: 0,
} as any;

describe("ListDetailsClient", () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      // Collaborators query returns none
      if (
        typeof input === "string" &&
        input.includes("/api/lists/") &&
        input.endsWith("/collaborators") &&
        (!init || init.method === "GET")
      ) {
        return { ok: true, json: async () => ({ collaborators: [] }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders header and private meta with zero items", () => {
    renderWithClient(<ListDetailsClient initialList={initialList} />);
    expect(screen.getByText("Sci-Fi Classics")).toBeInTheDocument();
    expect(screen.getByText(/Private/i)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // items count
  });

  it("navigates to search when clicking Add Content", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListDetailsClient initialList={initialList} />);
    await user.click(screen.getByRole("button", { name: /Add Content/i }));
    expect(pushMock).toHaveBeenCalledWith("/search");
  });

  it("opens collaboration and settings modals via buttons", async () => {
    const user = userEvent.setup();
    renderWithClient(<ListDetailsClient initialList={initialList} />);

    // Open Share (collaboration) modal
    await user.click(screen.getByRole("button", { name: /Share/i }));
    expect(
      await screen.findByText(/Manage Collaborators/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add Collaborator/i)).toBeInTheDocument();

    // Open Settings modal (text is inside a span)
    const settingsLabel = screen.getByText(/Settings/i);
    const settingsButton = settingsLabel.closest("button")!;
    await user.click(settingsButton);
    expect(await screen.findByText(/List Settings/i)).toBeInTheDocument();
  });
});
