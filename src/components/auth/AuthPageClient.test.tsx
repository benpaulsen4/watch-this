import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { registerPasskey } from "@/lib/auth/client";

import AuthPageClient from "./AuthPageClient";

vi.mock("@/lib/auth/client", () => ({
  authenticatePasskey: vi.fn(),
  isPasskeySupported: () => true,
  isPlatformAuthenticatorAvailable: async () => true,
  registerPasskey: vi.fn(),
}));

vi.mock("@/components/providers/AuthProvider", () => ({
  useAuth: () => ({ refreshSession: vi.fn() }),
}));

vi.mock("@/hooks/useProgressRouter", () => ({
  useProgressRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const mockedRegister = registerPasskey as unknown as ReturnType<typeof vi.fn>;

async function submitRegistration(username: string) {
  const user = userEvent.setup();
  render(<AuthPageClient />);
  await user.click(
    await screen.findByRole("button", { name: /create account/i }),
  );
  await user.type(screen.getByLabelText(/username/i), username);
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

// The general error box, as opposed to the message under the username field.
const errorBox = (text: string) =>
  screen.getByText(text).closest(".border-red-500\\/30");

describe("AuthPageClient registration errors", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("shows a taken username under the username field", async () => {
    mockedRegister.mockRejectedValue(
      new ApiError("usernameTaken", 409, "Username already exists"),
    );
    await submitRegistration("sam");

    expect(await screen.findByText("Username already exists")).toBeInTheDocument();
    expect(errorBox("Username already exists")).toBeNull();
  });

  it("shows a username validation issue under the field", async () => {
    mockedRegister.mockRejectedValue(
      new ApiError("validation", 400, "Username must be 3-50 characters", [
        { path: "username", message: "Username must be 3-50 characters" },
      ]),
    );
    await submitRegistration("ab");

    await waitFor(() =>
      expect(errorBox("Username must be 3-50 characters")).toBeNull(),
    );
  });

  it("shows other failures in the general error box", async () => {
    mockedRegister.mockRejectedValue(
      new ApiError("verificationFailed", 400, "Registration verification failed"),
    );
    await submitRegistration("sam");

    await screen.findByText("Registration verification failed");
    expect(errorBox("Registration verification failed")).not.toBeNull();
  });
});
