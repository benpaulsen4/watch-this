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
});
