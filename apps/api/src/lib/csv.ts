// A small CSV reader (RFC 4180 plus what real exports do): quoted fields may hold the
// delimiter, quotes ("" is one quote) and line breaks, lines end in LF, CRLF or CR,
// and the file may start with a UTF-8 byte order mark. Rows come back as arrays, never
// objects, because exports repeat column names (several "Comment" columns).

export class CsvError extends Error {}

export type CsvOptions = {
	delimiter?: string;
	/** Stop with a CsvError after this many rows, so a huge file can't use all memory. */
	maxRows?: number;
	maxColumns?: number;
};

export function parseCsv(text: string, options: CsvOptions = {}): string[][] {
	const { delimiter = ",", maxRows = Number.POSITIVE_INFINITY } = options;
	const maxColumns = options.maxColumns ?? Number.POSITIVE_INFINITY;

	let input = text;
	if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	// A quoted field was opened, so an empty value still counts as a field.
	let fieldStarted = false;

	const endField = () => {
		row.push(field);
		if (row.length > maxColumns) {
			throw new CsvError(`The file has more than ${maxColumns} columns.`);
		}
		field = "";
		fieldStarted = false;
	};
	const endRow = () => {
		endField();
		// A line with nothing on it is not a row.
		if (!(row.length === 1 && row[0] === "")) {
			rows.push(row);
			if (rows.length > maxRows) {
				throw new CsvError(`The file has more than ${maxRows} rows.`);
			}
		}
		row = [];
	};

	for (let i = 0; i < input.length; i++) {
		const char = input[i] as string;

		if (inQuotes) {
			if (char === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"' && field === "" && !fieldStarted) {
			inQuotes = true;
			fieldStarted = true;
		} else if (char === delimiter) {
			endField();
		} else if (char === "\n") {
			endRow();
		} else if (char === "\r") {
			if (input[i + 1] === "\n") i++;
			endRow();
		} else {
			field += char;
		}
	}

	if (inQuotes) {
		throw new CsvError("A quoted field is never closed. Is the file cut off?");
	}
	// The last line may have no line break.
	if (field !== "" || fieldStarted || row.length > 0) endRow();

	return rows;
}

/** Picks the delimiter from the header line: a comma unless semicolons clearly dominate. */
export function sniffDelimiter(text: string): string {
	const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const end = text.search(/[\r\n]/);
	const header = text.slice(start, end === -1 ? undefined : end);
	const commas = header.split(",").length;
	const semicolons = header.split(";").length;
	return semicolons > commas ? ";" : ",";
}
