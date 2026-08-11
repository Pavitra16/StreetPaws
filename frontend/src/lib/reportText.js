/**
 * The description to show for a report, in one place.
 *
 * The report form explicitly tells people they can skip typing because we will
 * write it from the photo. That promise has to hold everywhere a report is
 * rendered — detail page, search list and match results — or reports made by
 * someone in a hurry appear blank exactly where a rescuer is scanning.
 */
/**
 * The breed to display.
 *
 * What the reporter typed wins over the model's read of the photo. They were
 * standing in front of the animal; the model is inferring from one image and can
 * be confidently wrong. Only fall back to the AI when the reporter said nothing.
 */
export function reportBreed(report) {
  const typed = report?.breedGuess?.trim();
  if (typed) return { text: typed, fromAi: false };

  const ai = report?.aiAnalysis?.breed?.trim();
  if (ai && !/^unknown$/i.test(ai) && report?.aiAnalysis?.isDog !== false) {
    return { text: ai, fromAi: true };
  }

  return { text: null, fromAi: false };
}

export function reportText(report) {
  if (report?.description?.trim()) {
    return { text: report.description, generated: false };
  }

  // A "no dog visible" write-up is not a description of a dog; don't pass it off
  // as one in a list where the caveat panel isn't visible.
  const ai = report?.aiAnalysis;
  if (ai?.isDog !== false && ai?.generatedDescription?.trim()) {
    return { text: ai.generatedDescription, generated: true };
  }

  if (ai?.isDog === false) {
    return { text: 'Photo needs review — no dog could be identified.', generated: false, flagged: true };
  }

  return { text: 'No description yet.', generated: false, empty: true };
}
