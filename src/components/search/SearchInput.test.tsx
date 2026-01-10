import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  it("renders with placeholder and no clear button initially", () => {
    render(<SearchInput />);
    expect(
      screen.getByPlaceholderText(/Search movies and TV shows/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("debounces onSearch and shows clear button when typing", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup({ delay: 0 });
    render(<SearchInput onSearch={onSearch} debounceMs={10} />);
    const input = screen.getByPlaceholderText(/Search movies and TV shows/i);
    await user.type(input, "Star");
    await new Promise((r) => setTimeout(r, 15));
    expect(onSearch).toHaveBeenCalledWith("Star");
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("clears input and calls onClear and onSearch with empty string", async () => {
    const onSearch = vi.fn();
    const onClear = vi.fn();
    const user = userEvent.setup({ delay: 0 });
    render(<SearchInput onSearch={onSearch} onClear={onClear} />);
    const input = screen.getByPlaceholderText(/Search movies and TV shows/i);
    await user.type(input, "ABC");
    await new Promise((r) => setTimeout(r, 15));
    const clear = screen.getByRole("button");
    await user.click(clear);
    expect(onClear).toHaveBeenCalled();
    expect(onSearch).toHaveBeenLastCalledWith("");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows loading indicator when loading is true", () => {
    render(<SearchInput loading />);
    expect(
      document.querySelector(
        ".animate-spin.rounded-full.border-2.border-gray-600.border-t-red-500",
      ),
    ).toBeTruthy();
  });

  it("uses defaultValue for initial state and cleans up timers on unmount", async () => {
    const { unmount } = render(<SearchInput defaultValue="Init" />);
    const input = screen.getByPlaceholderText(/Search movies and TV shows/i);
    expect((input as HTMLInputElement).value).toBe("Init");
    unmount();
  });
});
