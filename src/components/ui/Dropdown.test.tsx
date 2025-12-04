import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dropdown, { type DropdownOption } from "@/components/ui/Dropdown";
import { describe, it, expect, vi } from "vitest";

const options: DropdownOption[] = [
  { key: "a", label: "Apple" },
  { key: "b", label: "Banana" },
];

describe("Dropdown", () => {
  it("renders label and placeholder", () => {
    render(
      <Dropdown label="Fruit" options={options} placeholder="Select a fruit" />,
    );
    expect(screen.getByText("Fruit")).toBeInTheDocument();
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveTextContent("Select a fruit");
  });

  it("selects option and calls onSelectionChange", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <Dropdown
        options={options}
        placeholder="Select a fruit"
        onSelectionChange={onSelectionChange}
      />,
    );
    const trigger = screen.getByRole("button");
    await user.click(trigger);
    const option = screen.getByRole("option", { name: "Apple" });
    await user.click(option);
    expect(trigger).toHaveTextContent("Apple");
    expect(onSelectionChange).toHaveBeenCalled();
  });
});
