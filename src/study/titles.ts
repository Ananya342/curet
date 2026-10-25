/** Brightspace titles end in " - Due" or " - Availability Ends"; drop that for display. */
export const cleanTitle = (t: string) => t.replace(/\s*[-–]\s*(due|closes?|availability ends)\s*$/i, "");

/**
 * Brightspace puts the course in the event's location, like "-CSE 351.01 Introduction to Data Science - Fall 2026".
 * Returns "CSE 351 Introduction to Data Science", or "" when the location isn't a course.
 */
export const courseOf = (location: string) =>
  location
    .replace(/^[\s\-–]+/, "")
    .replace(/\s*[-–]\s*(fall|spring|summer|winter)\s+\d{4}\s*$/i, "")
    .replace(/\s*\/\s*[A-Z]{2,5}\s*\d+[\w.]*/g, "")
    .replace(/(\b[A-Z]{2,5}\s*\d{2,4})\.\w+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** Just the course code, "CSE 351", for the small places (reminder bubbles, briefings) where the full name won't fit. */
export const courseCode = (location: string) => /\b[A-Z]{2,5}\s?\d{2,4}\b/.exec(courseOf(location))?.[0] ?? "";
