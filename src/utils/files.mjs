import { mkdir, writeFile, stat, readdir, unlink } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function writeFileAtomic(filePath, buf) {
  await ensureDir(dirname(filePath));
  // simples: grava direto (p/ Railway está ótimo)
  await writeFile(filePath, buf);
}

export async function removeOtherExtensions(folder, baseName, keepExt) {
  // apaga sobras do mesmo arquivo com outra extensão (ex: trocou png → jpg)
  try {
    await stat(folder);
  } catch {
    return;
  }
  const files = await readdir(folder);
  await Promise.all(
    files
      .filter(f => f.startsWith(baseName + '.') && extname(f) !== `.${keepExt}`)
      .map(f => unlink(`${folder}/${f}`).catch(() => {}))
  );
}
