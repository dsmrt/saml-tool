// Simple XML pretty-printer for display purposes
export function formatXML(xml: string): string {
  let formatted = "";
  let indent = 0;
  const tab = "  ";

  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) indent--; // Closing tag
    formatted += tab.repeat(Math.max(indent, 0)) + "<" + node + ">\n";
    if (node.match(/^<?\w[^>]*[^\/]$/)) indent++; // Opening tag
  });

  return formatted.substring(1, formatted.length - 2);
}
