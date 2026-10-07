import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface StatTileProps {
  value: string;
  label: string;
  /**
   * Optional: highlights the value in red, matching the mock's one negative
   * stat ("Shows dropped"). Everything else stays the neutral default.
   */
  tone?: "default" | "negative";
}

/** One big number over a quiet label. The recap's basic unit of stat. */
export function StatTile({ value, label, tone = "default" }: StatTileProps) {
  return (
    <Card>
      <div
        className={cn(
          "text-4xl font-bold tracking-tight tabular-nums",
          tone === "negative" ? "text-red-400" : "text-gray-50",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-gray-400">{label}</div>
    </Card>
  );
}
