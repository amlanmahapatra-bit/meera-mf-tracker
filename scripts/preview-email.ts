/** Builds the Saturday email from the latest stored report and saves it as docs/email-preview.html (open it in a browser). */
import { writeFileSync } from "node:fs";
import { buildEmail } from "../src/lib/email";
import { getLatestReport } from "../src/lib/queries";

async function main() {
  const loaded = await getLatestReport();
  if (!loaded) throw new Error("No report yet. Run: npm run pipeline -- weekly");
  const mail = buildEmail(loaded.report, { siteUrl: process.env.SITE_URL || "https://your-site.vercel.app" });
  writeFileSync("docs/email-preview.html", mail.html);
  writeFileSync("docs/email-preview.txt", `Subject: ${mail.subject}\n\n${mail.text}`);
  console.log("Subject:", mail.subject, "\nSaved docs/email-preview.html and docs/email-preview.txt");
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
