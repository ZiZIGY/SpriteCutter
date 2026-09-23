import { ref } from 'vue';
import { defineStore } from 'pinia';

export type DialogName = 'names' | 'animations' | 'export';

export const useUiStore = defineStore('ui', () => {
  const dialog = ref<DialogName | null>(null);
  /** Text in the names dialog; survives closing so a paste is not lost. */
  const namesText = ref('');
  /** Text arrived before the image; open the dialog once sprites exist. */
  const namesPending = ref(false);
  const toast = ref<{ text: string; color: string; seq: number } | null>(null);

  function open(name: DialogName) {
    dialog.value = name;
  }

  function openNames(text?: string) {
    if (text !== undefined) namesText.value = text;
    dialog.value = 'names';
  }

  /** An empty colour keeps the snackbar's default look. */
  function notify(text: string, color = '') {
    toast.value = { text, color, seq: (toast.value?.seq ?? 0) + 1 };
  }

  return { dialog, namesText, namesPending, toast, open, openNames, notify };
});
