import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect,it, vi } from "vitest";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

describe("Card", () => {
  it("renders card with header, content, and footer", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  // UI-03: a Card with an onClick used to render as a bare div, so every card
  // interaction in the app (open content, open list) was mouse-only.
  describe("with a click handler", () => {
    it("exposes itself as a button in the tab order", () => {
      render(<Card onClick={() => {}}>Clickable</Card>);

      const card = screen.getByRole("button", { name: "Clickable" });
      expect(card).toHaveAttribute("tabindex", "0");
    });

    it("activates on Enter", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Card onClick={onClick}>Clickable</Card>);

      await user.tab();
      expect(screen.getByRole("button")).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("activates on Space", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Card onClick={onClick}>Clickable</Card>);

      screen.getByRole("button").focus();
      await user.keyboard(" ");
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("ignores other keys and still runs a caller's own key handler", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const onKeyDown = vi.fn();
      render(
        <Card onClick={onClick} onKeyDown={onKeyDown}>
          Clickable
        </Card>,
      );

      screen.getByRole("button").focus();
      await user.keyboard("{ArrowDown}");

      expect(onKeyDown).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  it("stays out of the tab order when it is decorative", () => {
    render(<Card>Just a panel</Card>);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Just a panel")).not.toHaveAttribute("tabindex");
  });
});
