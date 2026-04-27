/**
 * Points awarded for each placement in a tournament. The leaderboard sums
 * these across every event a player entered for the season.
 *
 * Tied placements (e.g. losers of the same bracket round) all share the
 * lower placement number, so they all earn the same points.
 *
 * Schedule: 1st=100, 2nd=80, 3rd=65, 4th=50, 5–6th=40, 7–8th=32, 9–12th=25,
 * 13–16th=18, 17–24th=12, 25–32nd=8, 33rd+=5.
 *
 * @param {number} placement 1-based finishing position
 * @returns {number} season points awarded
 */
function getPoints(placement) {
  if (placement === 1)  return 100;
  if (placement === 2)  return 80;
  if (placement === 3)  return 65;
  if (placement === 4)  return 50;
  if (placement <= 6)   return 40;
  if (placement <= 8)   return 32;
  if (placement <= 12)  return 25;
  if (placement <= 16)  return 18;
  if (placement <= 24)  return 12;
  if (placement <= 32)  return 8;
  return 5;
}

module.exports = { getPoints };
