import QRCodeLib from "qrcode";
import { useEffect, useState } from "react";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export default function QRCode({ value, size = 180, className }: QRCodeProps) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let active = true;
    QRCodeLib.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size,
      color: { dark: "#101828", light: "#f3f4f6" },
    })
      .then((url: string) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc("");
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <img
      src={src || undefined}
      alt="QR Code"
      width={size}
      height={size}
      className={className}
    />
  );
}
