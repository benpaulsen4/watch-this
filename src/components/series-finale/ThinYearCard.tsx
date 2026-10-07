import { Card } from "@/components/ui/Card";

import { pluralise } from "./format";

interface ThinYearCardProps {
  label: string;
  episodes: number;
  titles: number;
}

/**
 * Shown instead of the story when a period holds too little to characterise.
 *
 * The spec's rule is fewer than 10 episodes and fewer than 5 titles. Offering
 * a fourteen-card journey through nine episodes reads as mockery, so this says
 * plainly what is there and what would change it. Styled consistently with the
 * recap's other cards (1e), though it does not appear in the mock itself.
 */
export function ThinYearCard({ label, episodes, titles }: ThinYearCardProps) {
  return (
    <Card className="p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-50">
        Not much of a {label}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-gray-400">
        {pluralise(episodes, "episode")} and {pluralise(titles, "title")} is
        not enough to reconstruct a year from. Keep ticking things off and
        next year will have more to say.
      </p>
    </Card>
  );
}
