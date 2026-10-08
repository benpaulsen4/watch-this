import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TmdbAttribution } from "./TmdbAttribution";

describe("TmdbAttribution", () => {
  it("shows the TMDB logo", () => {
    render(<TmdbAttribution />);

    expect(screen.getByAltText("TMDB")).toHaveAttribute(
      "src",
      expect.stringContaining("tmdb.svg"),
    );
  });

  it("carries the required disclaimer", () => {
    render(<TmdbAttribution />);

    expect(
      screen.getByText(
        /This product uses the TMDB API but is not endorsed or certified by TMDB\./,
      ),
    ).toBeInTheDocument();
  });
});
