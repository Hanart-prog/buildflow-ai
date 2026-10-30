const MAX_TOTAL = 14000;
const MAX_FILE = 3000;

const SKIPPED_FOLDERS = /^(node_modules|\.git|dist|build|out|\.next|coverage|vendor|target|venv|\.venv|__pycache__)$/;
// Dropped files go to the model, so anything that might hold a secret stays out.
const PRIVATE = /(^\.env|secret|credential|password|token|id_rsa|\.pem$|\.key$|\.p12$|\.pfx$|\.keystore$)/i;
const LOCKFILES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.lock)$/i;
const TEXT = /\.(md|txt|json|ya?ml|toml|html?|css|scss|tsx?|jsx?|vue|svelte|py|rb|go|rs|java|kt|swift|php|cs|sql|prisma|graphql)$/i;
const IMPORTANT = /(^|\/)(readme[^/]*|package\.json|pyproject\.toml|go\.mod|cargo\.toml|gemfile|requirements\.txt|schema\.[a-z]+)$/i;

type Dropped = { path: string; file: File };

const readableFile = (path: string) => {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  return (
    !parts.slice(0, -1).some((folder) => SKIPPED_FOLDERS.test(folder)) &&
    !PRIVATE.test(name) &&
    !LOCKFILES.test(name) &&
    (TEXT.test(name) || /^(readme|gemfile|dockerfile)/i.test(name))
  );
};

async function walk(entry: FileSystemEntry, path: string, found: Dropped[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    found.push({ path, file });
    return;
  }
  if (SKIPPED_FOLDERS.test(entry.name)) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns its results in batches.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return;
    await Promise.all(batch.map((child) => walk(child, `${path}/${child.name}`, found)));
  }
}

async function summarize(files: Dropped[]) {
  // Docs and manifests say the most, then the files nearest the top.
  const ranked = files
    .filter((f) => readableFile(f.path))
    .sort(
      (a, b) =>
        Number(IMPORTANT.test(b.path)) - Number(IMPORTANT.test(a.path)) ||
        a.path.split('/').length - b.path.split('/').length,
    );

  let source = `Files: ${ranked.map((f) => f.path).slice(0, 80).join(', ')}\n`;
  for (const { path, file } of ranked) {
    if (source.length >= MAX_TOTAL) break;
    const room = Math.min(MAX_FILE, MAX_TOTAL - source.length);
    source += `\n--- ${path}\n${(await file.text()).slice(0, room)}\n`;
  }
  return ranked.length > 0 ? source.slice(0, MAX_TOTAL) : null;
}

export async function readDrop(items: DataTransferItemList) {
  const entries = [...items].flatMap((item) => item.webkitGetAsEntry() ?? []);
  const found: Dropped[] = [];
  await Promise.all(entries.map((entry) => walk(entry, entry.name, found)));
  return { name: entries[0]?.name ?? 'Imported project', source: await summarize(found) };
}

export async function readPicked(list: FileList) {
  const files = [...list].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
  return { name: files[0]?.path.split('/')[0] ?? 'Imported project', source: await summarize(files) };
}
