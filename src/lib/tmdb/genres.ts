// TMDB Genre mappings for movies and TV shows
// Source: https://developers.themoviedb.org/3/genres/get-movie-list
// Source: https://developers.themoviedb.org/3/genres/get-tv-list

export const MOVIE_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western'
};

export const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  37: 'Western'
};

/**
 * Get genre name by ID for movies
 */
export function getMovieGenreName(genreId: number): string {
  return MOVIE_GENRES[genreId] || `Unknown Genre (${genreId})`;
}

/**
 * Get genre name by ID for TV shows
 */
export function getTVGenreName(genreId: number): string {
  return TV_GENRES[genreId] || `Unknown Genre (${genreId})`;
}

/**
 * Get genre name by ID for any content type
 */
export function getGenreName(genreId: number, contentType: 'movie' | 'tv'): string {
  if (contentType === 'movie') {
    return getMovieGenreName(genreId);
  } else {
    return getTVGenreName(genreId);
  }
}

/**
 * Get multiple genre names by IDs
 */
export function getGenreNames(genreIds: number[], contentType: 'movie' | 'tv'): string[] {
  return genreIds.map(id => getGenreName(id, contentType));
}