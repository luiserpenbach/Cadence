// Spreadsheet-style version increment: A → B, … Z → AA, AZ → BA.
export function nextVersion(version: string): string {
  if (!/^[A-Z]+$/.test(version)) return `${version}.1`;
  const chars = version.split("");
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === "Z") {
      chars[i] = "A";
      i--;
    } else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join("");
    }
  }
  return `A${chars.join("")}`;
}
