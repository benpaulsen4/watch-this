import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListFilters } from "./ListFilters";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

// Mock StatusSegmentedSelector
vi.mock("@/components/content/StatusSegmentedSelector", () => ({
  StatusSegmentedSelector: ({
    value,
    onValueChange,
    multiple,
    includeNone,
  }: any) => (
    <div data-testid="status-selector">
      <span data-testid="status-value">{JSON.stringify(value)}</span>
      <button
        onClick={() => onValueChange(["watching"])}
        data-testid="status-change-btn"
      >
        Change Status
      </button>
      <button onClick={() => onValueChange([])} data-testid="status-clear-btn">
        Clear Status
      </button>
    </div>
  ),
}));

describe("ListFilters", () => {
  const mockRouter = { push: vi.fn() };
  const mockPathname = "/lists/1";

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
    (usePathname as any).mockReturnValue(mockPathname);
  });

  it("renders with initial state from URL params", () => {
    const searchParams = new URLSearchParams();
    searchParams.set("sortOrder", "descending");
    searchParams.append("watchStatus", "planning");
    (useSearchParams as any).mockReturnValue(searchParams);

    render(<ListFilters listType="mixed" />);

    expect(screen.getByTestId("status-value")).toHaveTextContent(
      '["planning"]'
    );
    expect(screen.getByText("Newest first")).toBeInTheDocument();
  });

  it("updates sort order when button is clicked", async () => {
    const user = userEvent.setup();
    const searchParams = new URLSearchParams();
    searchParams.set("sortOrder", "descending");
    (useSearchParams as any).mockReturnValue(searchParams);

    render(<ListFilters listType="mixed" />);

    const sortBtn = screen.getByRole("button", { name: /newest first/i });
    await user.click(sortBtn);

    // Should switch to ascending
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.stringContaining("sortOrder=ascending")
    );
  });

  it("updates status filter when selector changes", async () => {
    const user = userEvent.setup();
    const searchParams = new URLSearchParams();
    (useSearchParams as any).mockReturnValue(searchParams);

    render(<ListFilters listType="mixed" />);

    const changeBtn = screen.getByTestId("status-change-btn");
    await user.click(changeBtn);

    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.stringContaining("watchStatus=watching")
    );
  });

  it("removes status param when cleared", async () => {
    const user = userEvent.setup();
    const searchParams = new URLSearchParams();
    searchParams.set("watchStatus", "planning");
    (useSearchParams as any).mockReturnValue(searchParams);

    render(<ListFilters listType="mixed" />);

    const clearBtn = screen.getByTestId("status-clear-btn");
    await user.click(clearBtn);

    // Should not contain watchStatus
    // Note: implementation details:
    // if (statuses.length === 0) { router.push(`${pathname}?${createQueryString({ watchStatus: null })}`); }
    // createQueryString with null value deletes the key.

    // We expect the URL NOT to have watchStatus
    const callArg = mockRouter.push.mock.calls[0][0];
    expect(callArg).not.toContain("watchStatus=");
  });
});
