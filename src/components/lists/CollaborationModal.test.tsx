import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CollaborationModal from "./CollaborationModal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PermissionLevel } from "@/lib/db/schema";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const listId = "l1";

describe("CollaborationModal", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.endsWith(`/api/lists/${listId}/collaborators`) && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({ collaborators: [] }),
        } as any;
      }
      if (url.endsWith(`/api/lists/${listId}/collaborators`) && init?.method === "POST") {
        return { ok: true, json: async () => ({ message: "Collaborator added" }) } as any;
      }
      if (url.includes(`/api/lists/${listId}/collaborators/`) && init?.method === "DELETE") {
        return { ok: true, json: async () => ({ message: "Collaborator removed" }) } as any;
      }
      if (url.includes(`/api/lists/${listId}/collaborators/`) && init?.method === "PUT") {
        return { ok: true, json: async () => ({ message: "Permission updated" }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows owner-only message when not the owner", () => {
    renderWithClient(
      <CollaborationModal
        isOpen
        onClose={() => {}}
        listId={listId}
        listName="List"
        isOwner={false}
        ownerUsername="owner"
        ownerProfilePictureUrl={null}
      />,
    );
    expect(
      screen.getByText(/Only the list owner can manage collaborators/i),
    ).toBeInTheDocument();
  });

  it("adds collaborator and shows success", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <CollaborationModal
        isOpen
        onClose={() => {}}
        listId={listId}
        listName="List"
        isOwner
        ownerUsername="owner"
        ownerProfilePictureUrl={null}
      />,
    );

    const usernameInput = screen.getByPlaceholderText(/Enter username/i);
    await user.type(usernameInput, "bob");
    await user.click(screen.getByRole("button", { name: /^Add$/i }));

    expect(await screen.findByText(/Collaborator added/i)).toBeInTheDocument();
    expect(usernameInput).toHaveValue("");
  });

  it("removes a collaborator after confirmation", async () => {
    const user = userEvent.setup();
    // Return one collaborator on GET
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.endsWith(`/api/lists/${listId}/collaborators`) && (!init || init.method === "GET")) {
        return {
          ok: true,
          json: async () => ({
            collaborators: [
              {
                id: "c1",
                userId: "u2",
                username: "charlie",
                profilePictureUrl: null,
                permissionLevel: PermissionLevel.COLLABORATOR,
                createdAt: "2024-01-01",
              },
            ],
          }),
        } as any;
      }
      if (url.includes(`/api/lists/${listId}/collaborators/`) && init?.method === "DELETE") {
        return { ok: true, json: async () => ({ message: "Collaborator removed" }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithClient(
      <CollaborationModal
        isOpen
        onClose={() => {}}
        listId={listId}
        listName="List"
        isOwner
        ownerUsername="owner"
        ownerProfilePictureUrl={null}
      />,
    );

    // Click the single remove collaborator button
    const removeBtn = await screen.findByRole("button", { name: /Remove collaborator/i });
    await user.click(removeBtn);
    expect(await screen.findByText(/Collaborator removed/i)).toBeInTheDocument();
  });
  // Permission update flow is covered at the UI component level in Dropdown tests.
});