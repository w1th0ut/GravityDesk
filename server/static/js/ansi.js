/**
 * Pure ANSI SGR Color Parser and HTML Sanitizer
 */

export function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function ansiToHtml(str) {
  let html = "";
  let currentColorClass = "";
  let isBold = false;
  const regex = /\x1B\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(str)) !== null) {
    const textBefore = str.slice(lastIndex, match.index);
    if (textBefore) {
      const escaped = escapeHtml(textBefore);
      const classes = [currentColorClass, isBold ? "t-bold" : ""].filter(Boolean).join(" ");
      html += classes ? `<span class="${classes}">${escaped}</span>` : escaped;
    }

    const codes = (match[1] || "0").split(";").map(c => parseInt(c, 10));
    for (const code of codes) {
      if (code === 0) {
        currentColorClass = "";
        isBold = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code >= 30 && code <= 37) {
        currentColorClass = `c-${code}`;
      } else if (code >= 90 && code <= 97) {
        currentColorClass = `c-${code}`;
      }
    }
    lastIndex = regex.lastIndex;
  }

  const remaining = str.slice(lastIndex);
  if (remaining) {
    const escaped = escapeHtml(remaining);
    const classes = [currentColorClass, isBold ? "t-bold" : ""].filter(Boolean).join(" ");
    html += classes ? `<span class="${classes}">${escaped}</span>` : escaped;
  }

  return html;
}
