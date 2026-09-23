import { useSpriteStore } from '@/stores/spriteStore';
import { useUiStore } from '@/stores/uiStore';

const TEXT_FILE = /\.(txt|json|md|markdown|csv|tsv|ya?ml|xml)$/i;

/**
 * One door for files and clipboard content, wherever they arrive (drop, paste,
 * file dialog): an image becomes the sheet, text becomes the names source.
 */
export function useFileIntake() {
  const store = useSpriteStore();
  const ui = useUiStore();

  function takeText(text: string) {
    if (store.imageSrc) {
      ui.openNames(text);
    } else {
      // No sprites yet to name: keep the text and open the dialog once the
      // sheet has been read.
      ui.namesText = text;
      ui.namesPending = true;
      ui.notify('Текст с именами сохранён — теперь загрузите картинку');
    }
  }

  async function takeFiles(files: Iterable<File>): Promise<boolean> {
    const list = [...files];
    const image = list.find((f) => f.type.startsWith('image/'));
    if (image) {
      await store.loadImage(image);
      if (store.error) ui.notify(store.error, 'error');
      return true;
    }
    const text = list.find(
      (f) =>
        f.type.startsWith('text/') ||
        f.type === 'application/json' ||
        TEXT_FILE.test(f.name)
    );
    if (text) {
      takeText(await text.text());
      return true;
    }
    return false;
  }

  return { takeFiles, takeText };
}
