"use client";

import { Bell, CloudUpload, DatabaseBackup, Globe, Lock, Palette, ReceiptText, RefreshCw, ShieldCheck, Trash2, Upload, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { createLocalBackup, createYearEndArchive, deleteLocalBackup, getRecoveryStatus, listLocalBackups, restoreLocalBackup, uploadBackupToDrive, verifyLocalBackup } from "@/lib/electron-pos";

type BackupRow = {
  name: string;
  path: string;
  size: number;
  sizeLabel: string;
  modifiedAt: string;
  status: string;
};

type BrandingSettings = {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  gstin: string;
  footer: string;
};

export function SettingsModule() {
  const [credentialMessage, setCredentialMessage] = useState("Use this to change your login User ID or password.");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [invoiceMessage, setInvoiceMessage] = useState("GST number and receipt message will stay saved after you press Save.");
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [backupMessage, setBackupMessage] = useState("Desktop backups are stored in C:\\MMSuperMart\\Backups when Windows allows it.");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [recoveryStatus, setRecoveryStatus] = useState<Record<string, unknown> | null>(null);
  const [credentials, setCredentials] = useState({
    userId: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [invoiceSettings, setInvoiceSettings] = useState({
    brandName: "M&M SuperMart",
    primaryColor: "#047857",
    secondaryColor: "#ffffff",
    accentColor: "#f97316",
    logoUrl: "/mm-logo.jpg",
    gstin: "29AABCMMSUP1Z5",
    footer: "Thank you for shopping with M&M SuperMart"
  });
  useEffect(() => {
    void refreshBackupHistory();
    void loadInvoiceSettings();
  }, []);

  async function loadInvoiceSettings() {
    try {
      const settings = await apiRequest<BrandingSettings>("/settings/branding");
      setInvoiceSettings(settings);
      setInvoiceMessage("Saved invoice settings loaded.");
    } catch (error) {
      setInvoiceMessage(error instanceof Error ? error.message : "Could not load invoice settings.");
    }
  }

  async function saveInvoiceSettings() {
    setSavingInvoice(true);
    setInvoiceMessage("Saving invoice settings...");
    try {
      const result = await apiRequest<{ data: BrandingSettings; message: string }>("/settings/branding", {
        method: "PUT",
        body: JSON.stringify(invoiceSettings)
      });
      setInvoiceSettings(result.data);
      setInvoiceMessage("Invoice settings saved. GST No and message will stay until you change and save again.");
    } catch (error) {
      setInvoiceMessage(error instanceof Error ? error.message : "Could not save invoice settings.");
    } finally {
      setSavingInvoice(false);
    }
  }

  function previewInvoice() {
    const previewWindow = window.open("", "mm-supermart-invoice-preview", "width=420,height=720");
    if (!previewWindow) return;

    previewWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>M&M SuperMart Invoice Preview</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            * { box-sizing: border-box; }
            body { color: #111; font-family: Arial, sans-serif; font-size: 12px; margin: 0; width: 72mm; }
            h1 { font-size: 18px; margin: 0; text-align: center; }
            .logo { display: block; height: 46px; margin: 0 auto 6px; object-fit: contain; width: 70px; }
            .sub, .meta, .totals { border-bottom: 1px dashed #111; margin-bottom: 8px; padding-bottom: 8px; text-align: center; }
            .meta, .totals { text-align: left; }
            .line { display: flex; justify-content: space-between; gap: 8px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border-bottom: 1px solid #ddd; padding: 5px 0; text-align: right; vertical-align: top; }
            th:first-child, td:first-child { text-align: left; width: 38%; }
            .grand { font-size: 16px; font-weight: 700; }
            .saved, .footer { font-weight: 700; margin-top: 10px; text-align: center; }
          </style>
        </head>
        <body>
          <img class="logo" src="/mm-logo.jpg" alt="M&M SuperMart" />
          <h1>M&M SuperMart</h1>
          <div class="sub">GST Invoice<br/>GSTIN: ${invoiceSettings.gstin || "-"}</div>
          <div class="meta">
            <div class="line"><span>Bill No</span><strong>INV-20260528-0001</strong></div>
            <div class="line"><span>Date</span><span>${new Date().toLocaleString("en-IN")}</span></div>
            <div class="line"><span>Customer ID</span><span>CUST-0001</span></div>
            <div class="line"><span>Payment</span><span>Cash</span></div>
          </div>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>MRP</th><th>Sale</th><th>Total</th></tr></thead>
            <tbody>
              <tr><td>Rice 1kg</td><td>2</td><td>60</td><td>55</td><td>110</td></tr>
              <tr><td>Milk</td><td>3</td><td>30</td><td>28</td><td>84</td></tr>
            </tbody>
          </table>
          <div class="totals">
            <div class="line"><span>Subtotal</span><span>INR 194</span></div>
            <div class="line"><span>GST</span><span>INR 10</span></div>
            <div class="line"><span>Savings</span><span>INR 16</span></div>
            <div class="line grand"><span>Total</span><span>INR 204</span></div>
          </div>
          <div class="saved">You Saved INR 16 Today</div>
          <div class="footer">${invoiceSettings.footer || "Thank you"}</div>
        </body>
      </html>
    `);
    previewWindow.document.close();
  }

  async function updateCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (credentials.newPassword && credentials.newPassword !== credentials.confirmPassword) {
      setCredentialMessage("New password and confirm password do not match.");
      return;
    }
    if (!credentials.userId && !credentials.newPassword) {
      setCredentialMessage("Enter a new User ID or new password.");
      return;
    }

    setSavingCredentials(true);
    setCredentialMessage("Updating login credentials...");
    try {
      const result = await apiRequest<{ user: { email: string } }>("/auth/me/credentials", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: credentials.currentPassword,
          userId: credentials.userId || undefined,
          newPassword: credentials.newPassword || undefined
        })
      });
      localStorage.setItem("user-email", result.user.email);
      setCredentials({ userId: "", currentPassword: "", newPassword: "", confirmPassword: "" });
      setCredentialMessage("Login credentials updated successfully. Use the new User ID/password from next login.");
    } catch (error) {
      setCredentialMessage(error instanceof Error ? error.message : "Could not update login credentials.");
    } finally {
      setSavingCredentials(false);
    }
  }

  async function createBackupNow() {
    setBackupBusy(true);
    setBackupMessage("Creating local SQLite backup...");
    try {
      const result = await createLocalBackup();
      setBackupMessage(`Backup created: ${String(result.path ?? "database saved")}. Drive: ${String((result.googleDrive as { ok?: boolean; message?: string } | undefined)?.ok ? "uploaded" : (result.googleDrive as { message?: string } | undefined)?.message ?? "not configured")}`);
      await refreshBackupHistory();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Backup could not be created.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function refreshBackupHistory() {
    const [rows, status] = await Promise.all([
      listLocalBackups().catch(() => []),
      getRecoveryStatus().catch(() => null)
    ]);
    setBackups(rows);
    setRecoveryStatus(status);
  }

  async function verifyBackup(path: string) {
    setBackupBusy(true);
    try {
      const result = await verifyLocalBackup(path);
      setBackupMessage(result.ok ? `Verified ${String(result.name ?? path)}. Checksum: ${String(result.checksum ?? "").slice(0, 12)}...` : `Backup invalid: ${String(result.message ?? "validation failed")}`);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Backup verification failed.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function uploadBackup(path: string) {
    setBackupBusy(true);
    try {
      const result = await uploadBackupToDrive(path);
      setBackupMessage(result.ok ? "Backup uploaded to Google Drive." : `Drive upload not completed: ${String(result.message ?? "not configured")}`);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Drive upload failed.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function deleteBackup(path: string) {
    setBackupBusy(true);
    try {
      await deleteLocalBackup(path);
      setBackupMessage("Backup deleted.");
      await refreshBackupHistory();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Could not delete backup.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup(path: string) {
    setBackupBusy(true);
    try {
      const result = await restoreLocalBackup(path);
      setBackupMessage(result.ok ? "Backup restored. Restart the application before billing again." : `Restore failed: ${String(result.message ?? "invalid backup")}`);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function createArchiveNow() {
    setBackupBusy(true);
    try {
      const result = await createYearEndArchive();
      setBackupMessage(result.ok ? `Year-end archive created: ${String(result.path ?? "")}` : "Year-end archive could not be created.");
      await refreshBackupHistory();
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Year-end archive failed.");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">White-label Settings</h1><p className="text-muted-foreground">Customize branding, invoice templates, login credentials, backups, notifications, and domains.</p></div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="size-5 text-primary" /> Change Login Credentials</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={updateCredentials}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="settings-user-id">New User ID</label>
                <Input id="settings-user-id" icon={UserRound} type="email" placeholder="new-user@example.com" value={credentials.userId} onChange={(event) => setCredentials({ ...credentials, userId: event.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="settings-current-password">Current Password</label>
                <Input id="settings-current-password" icon={Lock} type="password" placeholder="Enter current password" value={credentials.currentPassword} onChange={(event) => setCredentials({ ...credentials, currentPassword: event.target.value })} required />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="settings-new-password">New Password</label>
                  <Input id="settings-new-password" icon={Lock} type="password" placeholder="New password" value={credentials.newPassword} onChange={(event) => setCredentials({ ...credentials, newPassword: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="settings-confirm-password">Confirm Password</label>
                  <Input id="settings-confirm-password" icon={Lock} type="password" placeholder="Confirm password" value={credentials.confirmPassword} onChange={(event) => setCredentials({ ...credentials, confirmPassword: event.target.value })} />
                </div>
              </div>
              <Button disabled={savingCredentials}>{savingCredentials ? "Updating" : "Update Login"}</Button>
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{credentialMessage}</p>
            </form>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Palette className="size-5 text-primary" /> Branding System</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-4 rounded-md border bg-white p-3"><img src="/mm-logo.jpg" alt="M&M SuperMart logo" className="h-16 w-24 object-contain" /><div><p className="text-sm font-medium text-foreground">Active Logo</p><p className="text-xs text-muted-foreground">M & M Logo.jpg</p></div></div><Input placeholder="Brand name" defaultValue="M&M SuperMart" /><div className="grid grid-cols-3 gap-2"><Input defaultValue="#047857" /><Input defaultValue="#ffffff" /><Input defaultValue="#f97316" /></div><Button><Upload className="size-4" /> Upload Logo</Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-accent" /> Invoice Customization</CardTitle></CardHeader><CardContent className="space-y-3"><Input placeholder="GSTIN" value={invoiceSettings.gstin} onChange={(event) => setInvoiceSettings({ ...invoiceSettings, gstin: event.target.value })} /><Input placeholder="Receipt footer / bill message" value={invoiceSettings.footer} onChange={(event) => setInvoiceSettings({ ...invoiceSettings, footer: event.target.value })} /><div className="flex flex-wrap gap-2"><Button onClick={saveInvoiceSettings} disabled={savingInvoice}>{savingInvoice ? "Saving" : "Save Invoice Settings"}</Button><Button variant="outline" onClick={previewInvoice}>Preview Invoice</Button></div><p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{invoiceMessage}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="size-5 text-primary" /> Notifications</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Low stock alerts</label><label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Expiry alerts</label><label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Salary and shift reminders</label></CardContent></Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="size-5 text-accent" /> Backup & Restore</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Custom domain" defaultValue="erp.mmsupermart.com" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={createBackupNow} disabled={backupBusy}><DatabaseBackup className="size-4" /> {backupBusy ? "Working" : "Create Backup Now"}</Button>
              <Button variant="outline" onClick={createArchiveNow} disabled={backupBusy}><DatabaseBackup className="size-4" /> Year End Archive</Button>
              <Button variant="outline" onClick={refreshBackupHistory} disabled={backupBusy}><RefreshCw className="size-4" /> Refresh History</Button>
            </div>
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{backupMessage}</p>
            {recoveryStatus ? <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">Latest local backup: {String((recoveryStatus.latestLocalBackup as { name?: string } | null)?.name ?? "none")} · Drive configured: {String(recoveryStatus.googleDriveConfigured ?? false)}</div> : null}
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="p-2">Date</th><th className="p-2">Size</th><th className="p-2">Status</th><th className="p-2 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr className="border-t" key={backup.path}>
                      <td className="p-2"><div className="font-medium">{backup.name}</div><div className="text-xs text-muted-foreground">{new Date(backup.modifiedAt).toLocaleString("en-IN")}</div></td>
                      <td className="p-2">{backup.sizeLabel}</td>
                      <td className="p-2">{backup.status}</td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="outline" title="Verify backup" onClick={() => verifyBackup(backup.path)}><ShieldCheck className="size-4" /></Button>
                          <Button size="icon" variant="outline" title="Upload to Google Drive" onClick={() => uploadBackup(backup.path)}><CloudUpload className="size-4" /></Button>
                          <Button size="icon" variant="outline" title="Restore backup" onClick={() => restoreBackup(backup.path)}><DatabaseBackup className="size-4" /></Button>
                          <Button size="icon" variant="ghost" title="Delete backup" onClick={() => deleteBackup(backup.path)}><Trash2 className="size-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!backups.length ? <tr><td className="p-4 text-center text-muted-foreground" colSpan={4}>No local backups found yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
