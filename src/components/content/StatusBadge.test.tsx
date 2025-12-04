import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  StatusBadge,
  getAvailableStatuses,
  getStatusConfig,
  isValidStatusForContentType,
} from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders label and title for each valid status", () => {
    const statuses = [
      "planning",
      "watching",
      "paused",
      "completed",
      "dropped",
    ] as const;
    statuses.forEach((status) => {
      render(<StatusBadge status={status} />);
      const label = getStatusConfig(status)?.label ?? status;
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("shows outline variant and warns for unknown status", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<StatusBadge status={"unknown" as any} />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith("Unknown status: unknown");
    warnSpy.mockRestore();
  });

  it("warns for invalid movie status and still renders", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<StatusBadge status={"watching"} contentType={"movie"} />);
    expect(screen.getByText("Watching")).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith("Invalid movie status: watching");
    warnSpy.mockRestore();
  });

  it("validates available statuses per content type", () => {
    expect(getAvailableStatuses("movie")).toEqual(["planning", "completed"]);
    expect(getAvailableStatuses("tv")).toEqual([
      "planning",
      "watching",
      "paused",
      "completed",
      "dropped",
    ]);
    expect(isValidStatusForContentType("completed", "movie")).toBe(true);
    expect(isValidStatusForContentType("watching", "movie")).toBe(false);
    expect(isValidStatusForContentType("watching", "tv")).toBe(true);
  });
});
