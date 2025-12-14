import fetch from "node-fetch";

const ENGINE_URL = process.env.UAPF_ENGINE_URL || "http://localhost:3001";

async function callTool(path, options = {}) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} failed: ${res.status} ${body}`);
  }

  return res.json();
}

async function main() {
  console.log("Describe:");
  const describe = await callTool("/_/meta");
  console.log(JSON.stringify(describe, null, 2));

  console.log("\nPackages:");
  const packages = await callTool("/uapf/packages");
  console.log(JSON.stringify(packages, null, 2));

  if (!Array.isArray(packages) || packages.length === 0) {
    console.log("No packages available to fetch artifact or validate.");
    return;
  }

  const firstPackage = packages[0].packageId;
  console.log(`\nFetching manifest for ${firstPackage}`);
  const manifest = await callTool(`/uapf/packages/${encodeURIComponent(firstPackage)}/artifacts/manifest`);
  console.log(JSON.stringify(manifest, null, 2));

  console.log("\nValidate:");
  const validation = await callTool("/uapf/validate", {
    method: "POST",
    body: JSON.stringify({ packageId: firstPackage }),
  });
  console.log(JSON.stringify(validation, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
