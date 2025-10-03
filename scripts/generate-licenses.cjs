#!/usr/bin/env node

const fs = require("fs");
const { execSync } = require("child_process");

console.log("Generating third-party licenses...");

const licenseData = JSON.parse(
  execSync("license-checker --production --json", { encoding: "utf8" }),
);

const output = {};

for (const [packageName, info] of Object.entries(licenseData)) {
  const entry = {
    name: packageName,
    licenses: info.licenses,
    repository: info.repository,
    publisher: info.publisher,
    email: info.email,
    url: info.url,
  };

  if (info.licenseFile) {
    try {
      const licenseText = fs.readFileSync(info.licenseFile, "utf8");
      entry.licenseText = licenseText;
    } catch (err) {
      console.warn(`Warning: Could not read license file for ${packageName}`);
      entry.licenseText = `License file not found. License type: ${info.licenses}`;
    }
  } else {
    entry.licenseText = `License: ${info.licenses} (full text not available)`;
  }

  output[packageName] = entry;
}

fs.writeFileSync("THIRD_PARTY_LICENSES.json", JSON.stringify(output, null, 2));
