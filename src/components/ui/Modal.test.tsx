import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Modal from "@/components/ui/Modal";

describe("Modal", () => {
  it("renders when open and shows title, subtitle, and content", () => {
    render(
      <Modal isOpen onClose={() => {}} title="Hello" subtitle="World">
        <div>Content</div>
      </Modal>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("calls onClose when clicking close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Close me">
        Content
      </Modal>,
    );
    const buttons = screen.getAllByRole("button");
    // Click the visible close button (second one)
    await user.click(buttons[1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render when closed", () => {
    render(
      <Modal isOpen={false} onClose={() => {}}>
        Content
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
