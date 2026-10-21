/** Hide only the old, generated preamble; preserve user-written imports/code. */
export function robotCodeForEditor(code: string): string {
  return code.replace(/^(?:\uFEFF)?from[ \t]+robot[ \t]+import[ \t]+\*[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/, '');
}
