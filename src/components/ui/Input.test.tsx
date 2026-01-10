import { fireEvent,render, screen } from "@testing-library/react";
import { describe, expect,it } from "vitest";

import { Input, Textarea } from "@/components/ui/Input";

describe("Input", () => {
  it("renders label and associates with input id", () => {
    render(<Input id="username" label="Username" />);
    const label = screen.getByText("Username");
    const input = screen.getByLabelText("Username");
    expect(label).toHaveAttribute("for", "username");
    expect(input).toHaveAttribute("id", "username");
  });

  it("shows error text", () => {
    render(<Input id="email" label="Email" error="Required" />);
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("shows helper text when no error", () => {
    render(
      <Input
        id="email"
        label="Email"
        helperText="We will not share your email"
      />,
    );
    expect(
      screen.getByText("We will not share your email"),
    ).toBeInTheDocument();
  });

  it("updates value on change", () => {
    render(<Input id="name" label="Name" />);
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alice" } });
    expect(input.value).toBe("Alice");
  });
});

describe("Textarea", () => {
  it("renders label and default rows", () => {
    render(<Textarea id="bio" label="Bio" />);
    const textarea = screen.getByLabelText("Bio") as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute("rows", "3");
  });

  it("shows error and helper text", () => {
    render(<Textarea id="desc" label="Desc" error="Too short" />);
    expect(screen.getByText("Too short")).toBeInTheDocument();

    render(<Textarea id="desc2" label="Desc" helperText="Optional" />);
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });
});
