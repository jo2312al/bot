const fs = require("fs");
const path = require("path");
const {
  spawnSync
} = require("child_process");

const ROOT =
  path.join(__dirname, "..");

const SKIP_DIRS =
  new Set([
    ".git",
    "auth",
    "node_modules"
  ]);

function collectJsFiles(directory) {
  return fs.readdirSync(directory, {
    withFileTypes: true
  })
    .flatMap(entry => {
      if (
        entry.isDirectory()
        &&
        SKIP_DIRS.has(entry.name)
      ) {
        return [];
      }

      const fullPath =
        path.join(
          directory,
          entry.name
        );

      if (entry.isDirectory()) {
        return collectJsFiles(fullPath);
      }

      return entry.isFile()
        &&
        entry.name.endsWith(".js")
        ? [fullPath]
        : [];
    });
}

const files =
  collectJsFiles(ROOT);

for (const file of files) {
  const result =
    spawnSync(
      process.execPath,
      [
        "--check",
        file
      ],
      {
        stdio: "inherit"
      }
    );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);
