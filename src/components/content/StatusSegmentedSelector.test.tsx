import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusSegmentedSelector } from "./StatusSegmentedSelector";

describe("StatusSegmentedSelector", () => {
  it("renders available statuses based on content type", () => {
    render(
      <StatusSegmentedSelector
        value={null}
        contentType="tv"
        onValueChange={() => {}}
      />
    );
    const radios = screen.getAllByRole("radio");
    // tv: planning, watching, paused, completed, dropped
    expect(radios.length).toBe(5);
    expect(
      screen.getByRole("radio", { name: "Planning status: Planning to watch" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "Watching status: Currently watching",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Paused status: Temporarily paused" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "Completed status: Finished watching",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Dropped status: Stopped watching" })
    ).toBeInTheDocument();
  });

  it("invokes onValueChange when selecting a status", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StatusSegmentedSelector
        value={"planning"}
        contentType="movie"
        onValueChange={onChange}
      />
    );
    const completed = screen.getByRole("radio", {
      name: "Completed status: Finished watching",
    });
    await user.click(completed);
    expect(onChange).toHaveBeenCalledWith("completed");
  });

  it("supports keyboard activation with Enter and Space", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StatusSegmentedSelector
        value={null}
        contentType="movie"
        onValueChange={onChange}
      />
    );
    const planning = screen.getByRole("radio", { name: /planning/i });
    planning.focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("planning");
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith("planning");
  });

  it("does not change when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StatusSegmentedSelector
        value={null}
        contentType="tv"
        onValueChange={onChange}
        disabled
      />
    );
    await user.click(
      screen.getByRole("radio", {
        name: "Watching status: Currently watching",
      })
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports multiple selection mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StatusSegmentedSelector
        value={["planning"]}
        multiple={true}
        onValueChange={onChange}
      />
    );

    // Check role is group instead of radiogroup
    expect(screen.getByRole("group")).toBeInTheDocument();

    // Check items are checkboxes
    const watching = screen.getByRole("checkbox", { name: /^watching/i });

    // Select new item
    await user.click(watching);
    expect(onChange).toHaveBeenCalledWith(["planning", "watching"]);

    // Deselect existing item
    const planning = screen.getByRole("checkbox", { name: /^planning/i });
    await user.click(planning);
    expect(onChange).toHaveBeenCalledWith([]); // since mock doesn't update prop, we expect what logic would produce from props
  });

  it("includes 'None' option when configured", () => {
    render(
      <StatusSegmentedSelector
        value={null}
        includeNone={true}
        onValueChange={() => {}}
      />
    );

    expect(
      screen.getByRole("radio", { name: "None status: No status" })
    ).toBeInTheDocument();
  });

  it("handles 'None' selection in multiple mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StatusSegmentedSelector
        value={["planning"]}
        multiple={true}
        includeNone={true}
        onValueChange={onChange}
      />
    );

    const noneOption = screen.getByRole("checkbox", { name: /none/i });
    await user.click(noneOption);

    expect(onChange).toHaveBeenCalledWith(["planning", "none"]);
  });
});
