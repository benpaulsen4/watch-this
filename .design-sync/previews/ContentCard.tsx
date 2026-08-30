import { ContentCard } from "watch-this";

const base = {
  backdropPath: null,
  posterPath: null,
  adult: false,
  popularity: 412.8,
  voteCount: 4821,
  statusUpdatedAt: null,
};

const dune = {
  ...base,
  tmdbId: 693134,
  contentType: "movie" as const,
  title: "Dune: Part Two",
  overview:
    "Paul Atreides unites with the Fremen to wage war against the House Harkonnen.",
  releaseDate: "2024-02-27",
  voteAverage: 8.2,
  genreIds: [878, 12],
  watchStatus: null,
};

const severance = {
  ...base,
  tmdbId: 95396,
  contentType: "tv" as const,
  title: "Severance",
  overview:
    "Mark leads a team whose memories have been surgically divided between work and home.",
  releaseDate: "2022-02-18",
  voteAverage: 8.4,
  genreIds: [18, 9648],
  watchStatus: "watching" as const,
};

export function Movie() {
  return (
    <div className="max-w-[220px]">
      <ContentCard content={dune} />
    </div>
  );
}

export function WithWatchStatus() {
  return (
    <div className="max-w-[220px]">
      <ContentCard content={severance} showWatchStatus />
    </div>
  );
}

export function Grid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <ContentCard content={dune} />
      <ContentCard content={severance} showWatchStatus />
      <ContentCard
        content={{
          ...base,
          tmdbId: 122226,
          contentType: "tv" as const,
          title: "The Bear",
          overview:
            "A fine-dining chef returns to Chicago to run his family's sandwich shop.",
          releaseDate: "2022-06-23",
          voteAverage: 8.1,
          genreIds: [35, 18],
          watchStatus: "completed" as const,
        }}
        showWatchStatus
      />
    </div>
  );
}
