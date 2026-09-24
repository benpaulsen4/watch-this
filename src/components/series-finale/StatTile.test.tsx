import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatTile } from "./StatTile";

describe("StatTile", () => {
  it("renders the value and label", () => {
    render(<StatTile value="1,208" label="Episodes watched" />);

    expect(screen.getByText("1,208")).toBeInTheDocument();
    expect(screen.getByText("Episodes watched")).toBeInTheDocument();
  });

  it("renders the value in the default tone by default", () => {
    render(<StatTile value="47" label="Titles completed" />);

    expect(screen.getByText("47")).not.toHaveClass("text-red-400");
  });

  it("highlights the value when tone is negative, matching the mock's 'Shows dropped' tile", () => {
    render(<StatTile value="6" label="Shows dropped" tone="negative" />);

    expect(screen.getByText("6")).toHaveClass("text-red-400");
  });
});
