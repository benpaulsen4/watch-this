"use client";

import { Link2 } from "lucide-react";
import { useMemo, useState } from "react";

export function CopyHeadingLinkClient({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const label = useMemo(() => {
    return copied ? "Copied" : "Copy link";
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Copy link:", url);
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className={[
        "ml-2 inline-flex items-center justify-center rounded border border-gray-800 bg-gray-900/40 px-2 py-1",
        "text-xs text-gray-300 hover:text-white hover:bg-gray-900/70",
        className ?? "",
      ].join(" ")}
    >
      <Link2 className="h-3.5 w-3.5" />
    </button>
  );
}
