import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CrewComparisonToggle } from "./CrewComparisonToggle";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CrewComparisonToggle", () => {
  it("renders the current value and its description", () => {
    renderWithClient(
      <CrewComparisonToggle
        user={{ shareStatsWithCollaborators: true }}
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("switch", { name: /include me in crew comparisons/i }),
    ).toBeChecked();
    expect(
      screen.getByText(/turning this off removes you from theirs/i),
    ).toBeInTheDocument();
  });

  it("renders an off value as unchecked", () => {
    renderWithClient(
      <CrewComparisonToggle
        user={{ shareStatsWithCollaborators: false }}
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("switch", { name: /include me in crew comparisons/i }),
    ).not.toBeChecked();
  });

  it("PUTs the new value on toggle and calls onUpdate", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const onUpdate = vi.fn();

    renderWithClient(
      <CrewComparisonToggle
        user={{ shareStatsWithCollaborators: true }}
        onUpdate={onUpdate}
      />,
    );

    await user.click(
      screen.getByRole("switch", { name: /include me in crew comparisons/i }),
    );

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareStatsWithCollaborators: false }),
    });
    expect(
      screen.getByRole("switch", { name: /include me in crew comparisons/i }),
    ).not.toBeChecked();
  });

  it("reverts the switch and says so plainly when the PUT fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Save failed" }),
      }),
    );
    const onUpdate = vi.fn();

    renderWithClient(
      <CrewComparisonToggle
        user={{ shareStatsWithCollaborators: true }}
        onUpdate={onUpdate}
      />,
    );

    const toggle = screen.getByRole("switch", {
      name: /include me in crew comparisons/i,
    });
    await user.click(toggle);

    await waitFor(() =>
      expect(screen.getByText(/could not save/i)).toBeInTheDocument(),
    );
    expect(toggle).toBeChecked();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
