/**
 * Apply standard competition ranking (1, 1, 3, 4, 4, 6...) to a list of rows
 * already sorted by `total_points` descending. Rows with the same total share
 * a rank; the next rank skips by the size of the tied group.
 *
 * Mirrors the server-side ranking in routes/games.js so refresh after changes
 * shows numbers consistent with the leaderboard endpoint.
 *
 * @param {Array<{total_points: number}>} rows
 */
export function applyRanks(rows) {
  if (!Array.isArray(rows)) return [];
  let rank = 1;
  return rows.map((row, i) => {
    if (i > 0 && row.total_points !== rows[i - 1].total_points) rank = i + 1;
    return { ...row, rank };
  });
}
