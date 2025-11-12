import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataExportImport } from "./DataExportImport";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("DataExportImport", () => {
  const originalFetch = global.fetch;
  const originalAlert = global.alert;
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  beforeEach(() => {
    vi.useRealTimers();
    global.fetch = vi.fn();
    global.alert = vi.fn();
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    // Prevent jsdom navigation error from anchor clicks during export
    HTMLAnchorElement.prototype.click = vi.fn();
    // We don't stub body.appendChild/removeChild; JSDOM handles these fine
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.alert = originalAlert as typeof global.alert;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("renders export and import sections", () => {
    renderWithProviders(<DataExportImport />);
    expect(
      screen.getByRole("heading", { name: /export data/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /import data/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/important notes/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /export as json/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /export as zip \(csv files\)/i })
    ).toBeInTheDocument();
  });

  it("exports as JSON and triggers download", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({
          data: '{"hello":"world"}',
          filename: "export.json",
          isZip: false,
        }),
      }
    );

    renderWithProviders(<DataExportImport />);

    fireEvent.click(screen.getByRole("button", { name: /export as json/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/profile/export?format=json"
      );
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("exports as ZIP (CSV files)", async () => {
    const zipData = btoa("zip-binary");
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({
          data: zipData,
          filename: "export.zip",
          isZip: true,
        }),
      }
    );

    renderWithProviders(<DataExportImport />);
    fireEvent.click(
      screen.getByRole("button", { name: /export as zip \(csv files\)/i })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/profile/export?format=csv"
      );
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("only accepts .json on import and shows file name", async () => {
    renderWithProviders(<DataExportImport />);

    const input = document.getElementById("import-file") as HTMLInputElement;

    // Invalid file type
    const badFile = new File(["oops"], "data.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(global.alert).toHaveBeenCalledWith(
      "Only JSON files are supported for import."
    );

    // Valid file
    const goodFile = new File(["{}"], "data.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [goodFile] } });

    expect(screen.getByText(/data\.json/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /import data/i })
    ).toBeInTheDocument();
  });

  it("imports successfully and shows results", async () => {
    renderWithProviders(<DataExportImport />);

    // Import path
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({
          success: true,
          imported: { lists: 2, contentStatus: 3, episodeStatus: 4 },
          errors: [],
        }),
      }
    );

    const input = document.getElementById("import-file") as HTMLInputElement;
    const goodFile = new File(["{}"], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [goodFile] } });

    fireEvent.click(screen.getByRole("button", { name: /import data/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/profile/import",
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.getByText(/import completed/i)).toBeInTheDocument();
      expect(screen.getByText(/2 list\(s\)/i)).toBeInTheDocument();
      expect(screen.getByText(/3 content status/i)).toBeInTheDocument();
      expect(screen.getByText(/4 episode watch/i)).toBeInTheDocument();
    });

    // Keep results visible; closing is a UI detail and tested elsewhere
  });

  it("shows error on failed import", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { ok: false, json: async () => ({ error: "Failed to import data" }) }
    );

    renderWithProviders(<DataExportImport />);

    const input = document.getElementById("import-file") as HTMLInputElement;
    const goodFile = new File(["{}"], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [goodFile] } });
    fireEvent.click(screen.getByRole("button", { name: /import data/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /import failed/i })
      ).toBeInTheDocument();
      expect(screen.getByText(/failed to import data/i)).toBeInTheDocument();
    });
  });
});
