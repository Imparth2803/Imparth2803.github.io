/* Recreates the binary test files in this folder (the text ones are
   written by hand). Run: node e2e/fixtures/make-fixtures.js */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const dir = __dirname;

// Spreadsheet with two sheets; IDs and PINs stored as text, one number cell.
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  book,
  XLSX.utils.aoa_to_sheet([
    ["Employee ID", "First Name", "Last Name", "PIN"],
    ["007", "Parth", "Tawde", "400001"],
    ["012", "Rahul", "Sharma", "411001"],
    ["123", "Amit", "", "400601"]
  ]),
  "Staff"
);
XLSX.utils.book_append_sheet(
  book,
  XLSX.utils.aoa_to_sheet([["Name"], ["Sneha"], ["Priya"], [123456789012]]),
  "Visitors"
);
XLSX.writeFile(book, path.join(dir, "staff.xlsx"));

// "Café, Zoë" etc. saved in the old Windows-1252 encoding (not UTF-8).
const latin = "Café\nZoë\nJosé\nCafé\n";
fs.writeFileSync(
  path.join(dir, "legacy-windows-1252.txt"),
  Buffer.from(Array.from(latin, ch => ch.charCodeAt(0)))
);

// A file with an .xlsx name that isn't a spreadsheet.
fs.writeFileSync(
  path.join(dir, "corrupted.xlsx"),
  Buffer.from("PK\u0003\u0004 this archive is cut short")
);
// Binary bytes saved as .csv (e.g. a renamed image).
fs.writeFileSync(
  path.join(dir, "corrupted.csv"),
  Buffer.from(Array.from({length: 512}, (_, i) => i % 7))
);

// Real Excel date cells (numbers with a date format), shown US-style.
const dates = XLSX.utils.aoa_to_sheet([
  ["Joined", "Left"],
  [46333, 46337],
  [46023, 46055]
]);
for (const ref of ["A2", "B2", "A3", "B3"]) dates[ref].z = "m/d/yy";
const dateBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(dateBook, dates, "Staff dates");
XLSX.writeFile(dateBook, path.join(dir, "dates.xlsx"));

// Semicolon-separated CSV in Windows-1252 (as saved by older European Excel).
fs.writeFileSync(
  path.join(dir, "semicolon-windows-1252.csv"),
  Buffer.from(
    Array.from(
      "Name;City;Account\nRenée;Zürich;9876543210123456789\nJosé;Málaga;0042\n",
      ch => ch.charCodeAt(0)
    )
  )
);
