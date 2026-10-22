// The whole category bank, in one list. See docs/bank.md for the format and the rules for changing it.
// Order doesn't matter (the generator sorts by id), but entries are frozen once their `added` day has passed.
import nature from './nature.js';
import everyday from './everyday.js';
import culture from './culture.js';
import wordplay from './wordplay.js';
import errata from './errata.js';

export const CATEGORIES = [...nature, ...everyday, ...culture, ...wordplay];
export const ERRATA = errata;
