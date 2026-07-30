import { customAlphabet } from "nanoid";

// Excludes ambiguous characters 0/O/1/I per the Data Model Notes.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const generate = customAlphabet(ALPHABET, 5);

export function generateOrderCode(): string {
  return generate();
}
