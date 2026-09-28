import { render, screen } from "@testing-library/react";
import { describe, expect,it } from "vitest";

import { PageHeader } from "@/components/ui/PageHeader";

describe("PageHeader", () => {
  it("renders title and subheader slot", () => {
    render(
      <PageHeader title="Dashboard" subheaderSlot={<span>Subheader</span>} />,
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Subheader")).toBeInTheDocument();
  });

  it("renders back link when href provided", () => {
    const { container } = render(
      <PageHeader title="Test" backLinkHref="/home" />,
    );
    const anchor = container.querySelector('a[href="/home"]');
    expect(anchor).toBeTruthy();
  });

  it("renders children on the right side", () => {
    render(
      <PageHeader title="Test">
        <button type="button">Action</button>
      </PageHeader>,
    );
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("names the back link when a label is given", () => {
    render(
      <PageHeader title="Test" backLinkHref="/home" backLinkLabel="Back home" />,
    );
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("keeps a long title on one line inside the bar, beside its actions", () => {
    render(
      <PageHeader title="Series Finale 2025" backLinkHref="/home">
        <button type="button">Action</button>
      </PageHeader>,
    );

    const title = screen.getByRole("heading", { name: "Series Finale 2025" });
    // Truncates rather than wrapping out of the fixed-height bar (F2).
    expect(title).toHaveClass("truncate");
    for (let el = title.parentElement; el && el.tagName !== "HEADER"; el = el.parentElement) {
      if (el.classList.contains("h-16")) break;
      expect(el).toHaveClass("min-w-0");
    }
    expect(screen.getByText("Action").parentElement).toHaveClass("flex-none");
  });
});
