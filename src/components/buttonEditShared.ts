import { LayoutButton } from '../storage/layoutStorage';

// Estado editable común a los dos modales de edición de botón
// (`ButtonEditModal` para completo/TalkBack, `BlindButtonEditModal` para
// blind+self-voicing). El blind modal usa solo un subset (label, kind,
// commands[0]) y deja color/textColor/addText con sus valores por defecto
// o los preservados del botón original.

export interface ButtonFormState {
  label: string;
  commands: string[];
  color: string;
  textColor: string;
  addText: boolean;
  kind: 'command' | 'floating';
}

export const DEFAULT_COLOR = '#662222';
export const DEFAULT_TEXT_COLOR = '#ffffff';

export function loadButtonFormState(
  button: LayoutButton | null,
  maxCommands: number,
): ButtonFormState {
  if (!button) {
    return {
      label: '',
      commands: Array(maxCommands).fill(''),
      color: DEFAULT_COLOR,
      textColor: DEFAULT_TEXT_COLOR,
      addText: false,
      kind: 'command',
    };
  }
  const allCmds = [button.command, ...(button.alternativeCommands ?? [])];
  while (allCmds.length < maxCommands) allCmds.push('');
  return {
    label: button.label,
    commands: allCmds.slice(0, maxCommands),
    color: button.color,
    textColor: button.textColor ?? DEFAULT_TEXT_COLOR,
    addText: button.addText ?? false,
    kind: button.kind ?? 'command',
  };
}

export function buildLayoutButton(
  state: ButtonFormState,
  meta: { col: number; row: number; button: LayoutButton | null },
): LayoutButton {
  const nonEmptyCommands = state.commands.filter((cmd) => cmd.trim() !== '');
  return {
    id: meta.button?.id || `btn_${Date.now()}`,
    col: meta.col,
    row: meta.row,
    label: state.label || '—',
    command: nonEmptyCommands[0] || '',
    color: state.color,
    textColor: state.textColor,
    // Floating buttons never inject text into the input or carry alternatives.
    addText: state.kind === 'floating' ? false : state.addText,
    alternativeCommands:
      state.kind === 'floating' || nonEmptyCommands.length <= 1
        ? undefined
        : nonEmptyCommands.slice(1),
    kind: state.kind,
    // Preserve fixed and locked flags from original button.
    fixed: meta.button?.fixed,
    locked: meta.button?.locked,
  };
}
