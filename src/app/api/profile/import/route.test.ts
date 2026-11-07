// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-1", username: "benjamin" };
vi.mock("@/lib/auth/webauthn", () => ({
  getCurrentUser: vi.fn(async (token?: string) =>
    token === "valid" ? mockUser : null,
  ),
}));

const importUserData = vi.fn();
vi.mock("@/lib/profile/data/service", () => ({
  importUserData: (...args: unknown[]) => importUserData(...args),
}));

const { POST } = await import("./route");

function upload(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new NextRequest("http://localhost/api/profile/import", {
    method: "POST",
    headers: { cookie: "session=valid" },
    body: form,
  });
}

const json = (content: string) =>
  new File([content], "export.json", { type: "application/json" });

describe("POST /api/profile/import", () => {
  beforeEach(() => {
    importUserData.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("imports the file for the signed-in user", async () => {
    importUserData.mockResolvedValue({ imported: 1 });

    const response = await POST(upload({ file: json("{}"), format: "json" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 1 });
    expect(importUserData).toHaveBeenCalledWith("user-1", "{}");
  });

  it.each([
    [{ format: "json" }, "file", "File is required"],
    [{ file: json("{}"), format: "csv" }, "format", "Only JSON format is supported for imports"],
  ])("rejects %j as a validation error", async (fields, path, message) => {
    const response = await POST(upload(fields));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: message,
      code: "validation",
      issues: [{ path, message }],
    });
  });

  it("answers tooLarge for a file over 1 MB", async () => {
    const response = await POST(
      upload({ file: json("x".repeat(1024 * 1024 + 1)), format: "json" }),
    );

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("tooLarge");
    expect(importUserData).not.toHaveBeenCalled();
  });

  it.each([
    ["parseError", 400, "invalidFile"],
    ["tooLarge", 413, "tooLarge"],
  ])("maps %s to %i %s", async (result, status, code) => {
    importUserData.mockResolvedValue(result);

    const response = await POST(upload({ file: json("{}"), format: "json" }));

    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  it("answers internal when the import throws", async () => {
    importUserData.mockRejectedValue(new Error("db down"));

    const response = await POST(upload({ file: json("{}"), format: "json" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to import data",
      code: "internal",
    });
  });
});
