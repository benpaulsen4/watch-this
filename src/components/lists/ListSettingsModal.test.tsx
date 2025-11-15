import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ListSettingsModal from "./ListSettingsModal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseList = {
  id: "list-1",
  name: "My List",
  description: "Desc",
  listType: "mixed",
  isPublic: false,
  syncWatchStatus: false,
  ownerId: "owner-1",
  ownerUsername: "owner",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
} as any;

describe("ListSettingsModal", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      // Default noop success
      return { ok: true, json: async () => ({}) } as any;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates empty name and shows error", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <ListSettingsModal
        isOpen
        onClose={() => {}}
        list={baseList}
        isOwner
        onListUpdate={() => {}}
        onListDelete={() => {}}
      />,
    );

    const nameInput = screen.getByLabelText(/List Name/i);
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));
    expect(screen.getByText(/List name is required/i)).toBeInTheDocument();
  });

  it("saves changes and calls callbacks", async () => {
    const user = userEvent.setup();
    const onListUpdate = vi.fn();
    const onClose = vi.fn();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (typeof input === "string" && input.includes("/api/lists/") && init?.method === "PUT") {
        return {
          ok: true,
          json: async () => ({ ...baseList, name: "Updated" }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    renderWithClient(
      <ListSettingsModal
        isOpen
        onClose={onClose}
        list={baseList}
        isOwner
        onListUpdate={onListUpdate}
        onListDelete={() => {}}
      />,
    );

    const nameInput = screen.getByLabelText(/List Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Updated");
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(await screen.findByText(/My List|Updated/i)).toBeInTheDocument();
    expect(onListUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("deletes list via confirmation flow", async () => {
    const user = userEvent.setup();
    const onListDelete = vi.fn();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (typeof input === "string" && input.includes("/api/lists/") && init?.method === "DELETE") {
        return { ok: true, json: async () => ({}) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    renderWithClient(
      <ListSettingsModal
        isOpen
        onClose={() => {}}
        list={baseList}
        isOwner
        onListUpdate={() => {}}
        onListDelete={onListDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Delete List/i }));
    // Confirm view shows "Delete" button
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(onListDelete).toHaveBeenCalled();
  });

  it("creates a list in create mode and calls onListCreate", async () => {
    const user = userEvent.setup();
    const onListCreate = vi.fn();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (typeof input === "string" && input.includes("/api/lists") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            list: {
              id: "l-created",
              name: "Created Name",
              description: null,
              listType: "mixed",
              isPublic: false,
              syncWatchStatus: false,
              ownerId: "owner-1",
              createdAt: "2024-01-03",
              updatedAt: "2024-01-03",
              itemCount: 0,
              collaborators: 0,
            },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    renderWithClient(
      <ListSettingsModal isOpen onClose={() => {}} mode="create" isOwner onListCreate={onListCreate} />,
    );

    // Fill name
    await user.type(screen.getByLabelText(/List Name/i), "Created Name");
    await user.click(screen.getByRole("button", { name: /^Create$/i }));

    expect(onListCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "l-created", name: "Created Name" }),
    );
  });
});
