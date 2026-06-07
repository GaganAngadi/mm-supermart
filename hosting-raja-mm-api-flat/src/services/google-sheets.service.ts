import { google } from "googleapis";

export type SheetRow = Record<string, string | number | boolean | null>;

function extractSheetId(urlOrId: string) {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? urlOrId;
}

export class GoogleSheetsService {
  private sheets = google.sheets("v4");

  private auth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!email || !key) {
      throw new Error("Google Sheets credentials are not configured");
    }
    return new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
  }

  async readRows(sheetUrl: string, range = "Sheet1!A1:Z1000"): Promise<SheetRow[]> {
    const response = await this.sheets.spreadsheets.values.get({
      auth: this.auth(),
      spreadsheetId: extractSheetId(sheetUrl),
      range
    });
    const values = response.data.values ?? [];
    const [headers = [], ...rows] = values;
    return rows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [String(header), row[index] ?? null]))
    );
  }

  async appendRows(sheetUrl: string, range: string, rows: Array<Array<string | number | boolean | null>>) {
    return this.sheets.spreadsheets.values.append({
      auth: this.auth(),
      spreadsheetId: extractSheetId(sheetUrl),
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows }
    });
  }
}

export const googleSheetsService = new GoogleSheetsService();
