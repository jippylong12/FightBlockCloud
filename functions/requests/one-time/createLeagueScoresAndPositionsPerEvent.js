/**
 * 2023/01/03
 * The need to have last week's leaderboard position and score is required. This will add two new maps to the scoresData
 * scoresPerWeek - map with date as key, value a map with user_id as key and the points for that week as value
 * positionPerWeek - maps with date as key, value a map with user_id as key and the leaderboard position as value
 */

// TODO: we don't need the total scores per week because we can calculate that if need be and we just need to show the points differential which will be the
// TODO: event from last week. I think eventId or the day tag is fine for a key. At least with date tag you can sort.