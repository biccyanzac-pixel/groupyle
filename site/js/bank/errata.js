// Fixes to categories that are already live. A category is never edited in place once its `added` day has passed,
// because past puzzles are rebuilt from it. Instead add an erratum here, with `from` after tomorrow (UTC):
//   { id: 'planets', from: '2027-01-05', remove: ['EARTH'] }       // stop showing a member; it stays a clash guard
//   { id: 'planets', from: '2027-01-05', also: ['CERES'] }         // another word that fits (a clash guard)
//   { id: 'planets', from: '2027-01-05', retire: true }            // never pick the category again
// npm test fails if an erratum changes a day already in test/golden.json up to tomorrow.
export default [];
