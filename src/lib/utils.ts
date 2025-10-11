import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format vote average as percentage
export function formatVoteAverage(
  voteAverage: number | null | undefined,
): string {
  if (
    voteAverage === null ||
    voteAverage === undefined ||
    isNaN(voteAverage) ||
    voteAverage === 0
  ) {
    return "N/A";
  }
  return `${Math.round(voteAverage * 10)}%`;
}
