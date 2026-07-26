import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ListSettingsModal from "./ListSettingsModal";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
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
    vi.spyOn(global, "fetch").mockImplementation(async (_input, _init) => {
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
      />
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
      if (
        typeof input === "string" &&
        input.includes("/api/lists/") &&
        init?.method === "PUT"
      ) {
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
      />
    );

    const nameInput = screen.getByLabelText(/List Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Updated");
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(await screen.findByText(/My List|Updated/i)).toBeInTheDocument();
    expect(onListUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated" })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("deletes list via confirmation flow", async () => {
    const user = userEvent.setup();
    const onListDelete = vi.fn();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (
        typeof input === "string" &&
        input.includes("/api/lists/") &&
        init?.method === "DELETE"
      ) {
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
      />
    );

    await user.click(screen.getByRole("button", { name: /Delete List/i }));
    // Confirm view shows "Delete" button
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(onListDelete).toHaveBeenCalled();
  });

  it("toggles archive status", async () => {
    const user = userEvent.setup();
    const onListUpdate = vi.fn();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (
        typeof input === "string" &&
        input.includes("/api/lists/") &&
        init?.method === "PUT"
      ) {
        const body = JSON.parse(init?.body as string);
        return {
          ok: true,
          json: async () => ({ ...baseList, isArchived: body.isArchived }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    renderWithClient(
      <ListSettingsModal
        isOpen
        onClose={() => {}}
        list={baseList}
        isOwner
        onListUpdate={onListUpdate}
        onListDelete={() => {}}
      />
    );

    // Initial state: Not archived, so button says "Archive List"
    const archiveBtn = screen.getByRole("button", { name: /Archive List/i });
    await user.click(archiveBtn);

    expect(onListUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isArchived: true })
    );
  });

  // UI-01: the toggle writes the new state locally before the request, and used
  // to leave it there when the request failed - so the button offered to
  // "Unarchive List" for a list that was still active.
  it("rolls the archive toggle back when the request fails", async () => {
    const user = userEvent.setup();
    const onListUpdate = vi.fn();

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (
        typeof input === "string" &&
        input.includes("/api/lists/") &&
        init?.method === "PUT"
      ) {
        return {
          ok: false,
          json: async () => ({ error: "List is locked" }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    renderWithClient(
      <ListSettingsModal
        isOpen
        onClose={() => {}}
        list={baseList}
        isOwner
        onListUpdate={onListUpdate}
        onListDelete={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /Archive List/i }));

    expect(await screen.findByText(/List is locked/i)).toBeInTheDocument();
    expect(onListUpdate).not.toHaveBeenCalled();
    // Still offering to archive, because the list is still active.
    expect(
      screen.getByRole("button", { name: /Archive List/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Unarchive List/i })
    ).toBeNull();
  });

  it("keeps the sync toggle usable after a failed archive attempt", async () => {
    const user = userEvent.setup();
    const syncedList = { ...baseList, syncWatchStatus: true };

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (
        typeof input === "string" &&
        input.includes("/api/lists/") &&
        init?.method === "PUT"
      ) {
        return { ok: false, json: async () => ({ error: "nope" }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    renderWithClient(
      <ListSettingsModal
        isOpen
        onClose={() => {}}
        list={syncedList}
        isOwner
        onListUpdate={() => {}}
        onListDelete={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /Archive List/i }));
    await screen.findByText(/nope/i);

    // Archiving would have turned syncing off; the rollback restores it.
    expect(
      screen.getByRole("switch", {
        name: /Sync watch status & TV schedules with collaborators/i,
      })
    ).toBeEnabled();
  });

  it("reports a failed save instead of rejecting unhandled", async () => {
    const user = userEvent.setup();
    // Rejections from a click handler surface on the Node process, not as a
    // window "unhandledrejection" event, under jsdom.
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (
        typeof input === "string" &&
        input.includes("/api/lists/") &&
        init?.method === "PUT"
      ) {
        return {
          ok: false,
          json: async () => ({ error: "Save failed" }),
        } as any;
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
        onListDelete={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(await screen.findByText(/Save failed/i)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", onRejection);

    expect(rejections).toEqual([]);
  });

  it("disables sync toggle when list is archived", async () => {
    const archivedList = { ...baseList, isArchived: true };
    renderWithClient(
      <ListSettingsModal
        isOpen
        onClose={() => {}}
        list={archivedList}
        isOwner
        onListUpdate={() => {}}
        onListDelete={() => {}}
      />
    );

    const syncSwitch = screen.getByRole("switch", {
      name: /Sync watch status & TV schedules with collaborators/i,
    });

    expect(syncSwitch).toBeDisabled();
  });

  it("creates a list in create mode and calls onListCreate", async () => {
    const user = userEvent.setup();
    const onListCreate = vi.fn();

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
      <ListSettingsModal
        isOpen
        onClose={() => {}}
        mode="create"
        isOwner
        onListCreate={onListCreate}
      />
    );

    // Fill name
    await user.type(screen.getByLabelText(/List Name/i), "Created Name");
    await user.click(screen.getByRole("button", { name: /^Create$/i }));

    expect(onListCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "l-created", name: "Created Name" })
    );
  });
});
