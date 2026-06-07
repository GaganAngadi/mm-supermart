const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

exports.default = async function stampElectronIcon(context) {
  if (context.electronPlatformName !== "win32") return;

  const root = resolve(__dirname, "..");
  const rcedit = join(root, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
  const icon = join(root, "build", "icon.ico");
  const exe = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);

  if (!existsSync(rcedit) || !existsSync(icon) || !existsSync(exe)) return;

  execFileSync(rcedit, [exe, "--set-icon", icon], { stdio: "inherit" });
};
