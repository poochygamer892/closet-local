import * as FileSystem from 'expo-file-system';

function getRoot() {
  const directory = FileSystem.documentDirectory;
  if (!directory) {
    throw new Error(
      'El almacenamiento local del teléfono no está disponible. Reinstala la app y vuelve a intentarlo.',
    );
  }
  return `${directory}closet/`;
}

export async function initStorage() {
  const root = getRoot();
  for (const path of [
    root,
    `${root}originals/`,
    `${root}processed/`,
    `${root}exports/`,
  ]) {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
    }
  }
}

export async function persistOriginal(uri: string, userId: number) {
  const directory = `${getRoot()}originals/${userId}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const target = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export async function processedPath(userId: number) {
  const directory = `${getRoot()}processed/${userId}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
}

export async function exportPath() {
  const directory = `${getRoot()}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return `${directory}look-${Date.now()}.png`;
}
