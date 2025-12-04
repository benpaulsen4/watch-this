import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import QRCode from "./QRCode";
import QRCodeLib from "qrcode";
type ToDataURL = (text: string, opts?: any) => Promise<string>;
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn<ToDataURL>() } }));

describe("QRCode component", () => {
  beforeEach(() => {
    (QRCodeLib as any).toDataURL.mockReset();
  });

  it("renders img with alt, size and className", async () => {
    (QRCodeLib as any).toDataURL.mockResolvedValueOnce(
      "data:image/png;base64,abc"
    );
    render(
      <QRCode value="https://example.com" size={200} className="rounded" />
    );

    const img = await screen.findByAltText(/qr code/i);
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("width", "200");
    expect(img).toHaveAttribute("height", "200");
    expect(img).toHaveClass("rounded");
  });

  it("calls qrcode.toDataURL with expected options and sets src on success", async () => {
    (QRCodeLib as any).toDataURL.mockResolvedValueOnce(
      "data:image/png;base64,xyz"
    );
    render(<QRCode value="payload" size={180} />);

    await waitFor(() => {
      expect(QRCodeLib.toDataURL).toHaveBeenCalledWith("payload", {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 180,
        color: { dark: "#101828", light: "#f3f4f6" },
      });
    });

    const img = screen.getByAltText(/qr code/i) as HTMLImageElement;
    expect(img.src).toContain("data:image/png;base64,xyz");
  });

  it("clears src when generation fails", async () => {
    (QRCodeLib as any).toDataURL.mockRejectedValueOnce(new Error("fail"));
    render(<QRCode value="bad" size={150} />);
    const img = await screen.findByAltText(/qr code/i);
    await waitFor(() => {
      expect(img).not.toHaveAttribute("src");
    });
  });

  it("updates when value or size changes", async () => {
    (QRCodeLib as any).toDataURL
      .mockResolvedValueOnce("data:image/png;base64,first")
      .mockResolvedValueOnce("data:image/png;base64,second");

    const { rerender } = render(<QRCode value="one" size={100} />);
    await waitFor(() => {
      expect(QRCodeLib.toDataURL).toHaveBeenCalledTimes(1);
    });

    rerender(<QRCode value="two" size={220} />);

    await waitFor(() => {
      expect(QRCodeLib.toDataURL).toHaveBeenCalledTimes(2);
      expect(QRCodeLib.toDataURL).toHaveBeenLastCalledWith(
        "two",
        expect.objectContaining({ width: 220 })
      );
    });

    const img = screen.getByAltText(/qr code/i) as HTMLImageElement;
    expect(img).toHaveAttribute("width", "220");
    expect(img).toHaveAttribute("height", "220");
    expect(img.src).toContain("data:image/png;base64,second");
  });
});
