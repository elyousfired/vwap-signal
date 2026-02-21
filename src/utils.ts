
/**
 * Parses a string with shorthand suffixes (k, m, b) into a number.
 * Examples: "1.5k" -> 1500, "2m" -> 2000000
 * Case insensitive.
 */
export const parseNumberShorthand = (value: string): number | null => {
    if (!value) return null;
    const clean = value.toLowerCase().replace(/,/g, '').trim();
    const match = clean.match(/^([0-9.]+)([kmb])?$/);

    if (!match) return null;

    const num = parseFloat(match[1]);
    if (isNaN(num)) return null;

    const suffix = match[2];
    const multiplier = suffix === 'k' ? 1000 :
        suffix === 'm' ? 1000000 :
            suffix === 'b' ? 1000000000 : 1;

    return num * multiplier;
};
