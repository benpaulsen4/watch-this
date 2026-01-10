import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import { ListItemWrapper } from "./ListItemWrapper";

// Mock useRouter
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

// Mock ContentCard to avoid complex rendering and verify props
vi.mock("@/components/content/ContentCard", () => ({
  ContentCard: (props: any) => (
    <div data-testid="content-card">
      <button onClick={props.onRemoveFromList} data-testid="remove-btn">
        Remove
      </button>
    </div>
  ),
}));

describe("ListItemWrapper", () => {
  it("renders ContentCard with passed props", () => {
    const refresh = vi.fn();
    (useRouter as any).mockReturnValue({ refresh });

    const props: any = {
      content: { id: 1, title: "Test Movie" },
      currentListId: "list-1",
      otherProp: "value",
    };

    render(<ListItemWrapper {...props} />);

    expect(screen.getByTestId("content-card")).toBeInTheDocument();
  });

  it("calls router.refresh() and original onRemoveFromList when removed", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    (useRouter as any).mockReturnValue({ refresh });
    const onRemoveFromList = vi.fn();

    const props: any = {
      content: { id: 1, title: "Test Movie" },
      onRemoveFromList,
    };

    render(<ListItemWrapper {...props} />);

    const removeBtn = screen.getByTestId("remove-btn");
    await user.click(removeBtn);

    expect(refresh).toHaveBeenCalled();
    expect(onRemoveFromList).toHaveBeenCalled();
  });

  it("handles missing onRemoveFromList prop safely", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    (useRouter as any).mockReturnValue({ refresh });

    const props: any = {
      content: { id: 1, title: "Test Movie" },
      // no onRemoveFromList
    };

    render(<ListItemWrapper {...props} />);

    const removeBtn = screen.getByTestId("remove-btn");
    await user.click(removeBtn);

    expect(refresh).toHaveBeenCalled();
  });
});
