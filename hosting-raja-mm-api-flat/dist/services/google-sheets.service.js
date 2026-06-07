import { google } from "googleapis";
function extractSheetId(urlOrId) {
    const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match?.[1] ?? urlOrId;
}
export class GoogleSheetsService {
    sheets = google.sheets("v4");
    auth() {
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
    async readRows(sheetUrl, range = "Sheet1!A1:Z1000") {
        const response = await this.sheets.spreadsheets.values.get({
            auth: this.auth(),
            spreadsheetId: extractSheetId(sheetUrl),
            range
        });
        const values = response.data.values ?? [];
        const [headers = [], ...rows] = values;
        return rows.map((row) => Object.fromEntries(headers.map((header, index) => [String(header), row[index] ?? null])));
    }
    async appendRows(sheetUrl, range, rows) {
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
