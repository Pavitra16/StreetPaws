/**
 * Breed suggestions.
 *
 * These are hints, not rules. The field stays a plain text input and anything
 * can still be typed — a fixed list would eventually reject a breed nobody
 * thought of, and refusing a reporter's answer because it is not on our list is
 * the wrong trade when the reporter is standing next to an injured animal.
 *
 * What the list is actually for: without it the same dog gets recorded as
 * "Indie", "Indian Pariah", "mixed" and "desi" by four different people, and a
 * search for any one of those misses the other three. Offering the words is
 * enough to make most people use the same ones.
 *
 * Indian Pariah is first because on Indian streets it is the overwhelming
 * majority, and the top of a suggestion list is the answer most people take.
 */
export const BREED_SUGGESTIONS = [
  'Indian Pariah (indie)',
  'Indie mix',
  'Puppy — too young to tell',
  'Labrador / Lab mix',
  'German Shepherd',
  'Golden Retriever',
  'Beagle',
  'Pomeranian / Spitz',
  'Pug',
  'Shih Tzu',
  'Dachshund',
  'Rottweiler',
  'Doberman',
  'Husky',
  'Rajapalayam / Mudhol / other Indian breed',
  'Other pedigree',
];

/** Shared id so one <datalist> can serve several inputs on a page. */
export const BREED_LIST_ID = 'breed-suggestions';

export function BreedDatalist() {
  return (
    <datalist id={BREED_LIST_ID}>
      {BREED_SUGGESTIONS.map((b) => (
        <option key={b} value={b} />
      ))}
    </datalist>
  );
}
