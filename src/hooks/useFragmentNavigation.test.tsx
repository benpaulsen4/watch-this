import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { act } from "react";
import { beforeEach, describe, expect,test } from "vitest";

import { useFragmentNavigation } from "./useFragmentNavigation";

type Tab = "profile" | "security" | "data" | "streaming";

function FragmentNavTest({
  defaultTab,
  validTabs,
}: {
  defaultTab: Tab;
  validTabs: Tab[];
}) {
  const { activeTab, setActiveTab } = useFragmentNavigation<Tab>({
    defaultTab,
    validTabs,
  });

  return (
    <div>
      <div data-testid="active">{activeTab}</div>
      <button data-testid="set-profile" onClick={() => setActiveTab("profile")}>
        Set Profile
      </button>
      <button data-testid="set-data" onClick={() => setActiveTab("data")}>
        Set Data
      </button>
    </div>
  );
}

describe("useFragmentNavigation", () => {
  const validTabs: Tab[] = ["profile", "security", "data", "streaming"];

  beforeEach(() => {
    // Reset URL to a clean state without a fragment
    window.history.replaceState({}, "", "/test");
  });

  test("initializes to defaultTab when no fragment is present", () => {
    render(<FragmentNavTest defaultTab="profile" validTabs={validTabs} />);

    expect(screen.getByTestId("active").textContent).toBe("profile");
    expect(window.location.hash).toBe("");
  });

  test("initializes from a valid fragment", () => {
    window.history.replaceState({}, "", "/test#security");

    render(<FragmentNavTest defaultTab="profile" validTabs={validTabs} />);

    expect(screen.getByTestId("active").textContent).toBe("security");
    expect(window.location.hash).toBe("#security");
  });

  test("falls back to defaultTab when fragment is invalid", () => {
    window.history.replaceState({}, "", "/test#invalid");

    render(<FragmentNavTest defaultTab="profile" validTabs={validTabs} />);

    expect(screen.getByTestId("active").textContent).toBe("profile");
    expect(window.location.hash).toBe("#invalid"); // URL stays as-is until we update via the hook
  });

  test("setActiveTab updates state and URL fragment", async () => {
    const user = userEvent.setup();
    render(<FragmentNavTest defaultTab="profile" validTabs={validTabs} />);

    await user.click(screen.getByTestId("set-data"));

    expect(screen.getByTestId("active").textContent).toBe("data");
    expect(window.location.hash).toBe("#data");
  });

  test("setActiveTab to default removes fragment from URL", async () => {
    const user = userEvent.setup();
    // Start with a non-default fragment
    window.history.replaceState({}, "", "/test#data");
    render(<FragmentNavTest defaultTab="profile" validTabs={validTabs} />);

    // Switch back to default
    await user.click(screen.getByTestId("set-profile"));

    expect(screen.getByTestId("active").textContent).toBe("profile");
    expect(window.location.hash).toBe("");
  });

  test("responds to popstate navigation and updates from fragment", () => {
    render(<FragmentNavTest defaultTab="profile" validTabs={validTabs} />);
    expect(screen.getByTestId("active").textContent).toBe("profile");

    act(() => {
      window.history.pushState({}, "", "/test#streaming");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByTestId("active").textContent).toBe("streaming");
    expect(window.location.hash).toBe("#streaming");
  });

  test("invalid fragment on popstate resets to default", () => {
    render(<FragmentNavTest defaultTab="profile" validTabs={validTabs} />);

    act(() => {
      window.history.pushState({}, "", "/test#not-a-tab");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByTestId("active").textContent).toBe("profile");
    // URL remains whatever navigation set; hook controls only state and replace on setActiveTab
    expect(window.location.hash).toBe("#not-a-tab");
  });
});
