/** Brightspace titles end in " - Due" or " - Availability Ends"; drop that for display. */
export const cleanTitle = (t: string) => t.replace(/\s*[-–]\s*(due|closes?|availability ends)\s*$/i, "");
