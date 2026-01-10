import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { beforeEach,describe, expect, it, vi } from "vitest";

import { useUser } from "../providers/AuthProvider";
import ListHeader from "./ListHeader";

// Mock hooks
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("../providers/AuthProvider", () => ({
  useUser: vi.fn(),
}));

// Mock modals
vi.mock("./CollaborationModal", () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="collab-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock("./ListSettingsModal", () => ({
  default: ({ isOpen, onClose, onListUpdate, onListDelete }: any) =>
    isOpen ? (
      <div data-testid="settings-modal">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onListUpdate({ name: "Updated Name" })}>
          Update
        </button>
        <button onClick={onListDelete}>Delete</button>
      </div>
    ) : null,
}));

describe("ListHeader", () => {
  const mockRouter = { push: vi.fn(), refresh: vi.fn() };
  const mockUser = { id: "user-1", username: "me" };

  const initialList = {
    id: "list-1",
    name: "My List",
    description: "Desc",
    listType: "mixed",
    isPublic: true,
    syncWatchStatus: true,
    ownerId: "user-1",
    ownerUsername: "me",
    ownerProfilePictureUrl: null,
    createdAt: "2023-01-01",
    updatedAt: "2023-01-01",
    itemCount: 5,
    collaborators: 2,
    posterPaths: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
    (useUser as any).mockReturnValue(mockUser);
  });

  it("renders list details correctly", () => {
    render(<ListHeader initialList={initialList as any} />);

    expect(screen.getByText("My List")).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Sync")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // collaborators
    expect(screen.getByText("5")).toBeInTheDocument(); // items
  });

  it("opens collaboration modal on share click", async () => {
    const user = userEvent.setup();
    render(<ListHeader initialList={initialList as any} />);

    const shareBtn = screen.getByRole("button", { name: /share/i });
    await user.click(shareBtn);

    expect(screen.getByTestId("collab-modal")).toBeInTheDocument();
  });

  it("opens settings modal on settings click", async () => {
    const user = userEvent.setup();
    render(<ListHeader initialList={initialList as any} />);

    const settingsBtn = screen.getByRole("button", { name: /settings/i });
    await user.click(settingsBtn);

    expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
  });

  it("navigates to search on add content click", async () => {
    const user = userEvent.setup();
    render(<ListHeader initialList={initialList as any} />);

    const addBtn = screen.getByRole("button", { name: /add content/i });
    await user.click(addBtn);

    expect(mockRouter.push).toHaveBeenCalledWith("/search");
  });

  it("renders archived badge when list is archived", () => {
    const archivedList = { ...initialList, isArchived: true };
    render(<ListHeader initialList={archivedList as any} />);

    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("handles list updates from settings modal", async () => {
    const user = userEvent.setup();
    render(<ListHeader initialList={initialList as any} />);

    // Open settings
    await user.click(screen.getByRole("button", { name: /settings/i }));

    // Trigger update
    await user.click(screen.getByRole("button", { name: /update/i }));

    expect(mockRouter.refresh).toHaveBeenCalled();
    // Name should update in UI (state change)
    expect(screen.getByText("Updated Name")).toBeInTheDocument();
  });

  it("handles list delete from settings modal", async () => {
    const user = userEvent.setup();
    render(<ListHeader initialList={initialList as any} />);

    // Open settings
    await user.click(screen.getByRole("button", { name: /settings/i }));

    // Trigger delete
    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(mockRouter.push).toHaveBeenCalledWith("/lists");
  });
});
