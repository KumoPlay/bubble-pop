import '@fontsource-variable/nunito';
import './ui/styles.css';
import { App, type Loaded } from './app';
import { content } from './content';
import { newSave } from './core/progress/state';
import { noteTap } from './platform/haptics';
import { startOfflineSupport } from './platform/pwa';
import { loadGame } from './platform/storage';
import { loadPictures } from './render/pictures';
import { wakeAudio } from './sound/synth';

// The KumoPlay colours from palette.json, for the CSS.
for (const [name, value] of Object.entries(content.palette)) {
  document.documentElement.style.setProperty(`--${name}`, value);
}

// Sound and vibration may only start after the first tap (a browser rule, and what we want).
// Touch-down makes the audio; lifting the finger is what browsers count as the tap that allows it.
for (const name of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
  document.addEventListener(name, wakeAudio, { capture: true, passive: true });
}
for (const name of ['pointerup', 'touchend', 'keydown']) {
  document.addEventListener(name, noteTap, { capture: true, passive: true });
}

async function start(): Promise<void> {
  const stage = document.getElementById('stage');
  const bar = document.getElementById('bar');
  if (!(stage instanceof HTMLCanvasElement) || !bar) return;
  const pictures = loadPictures();
  const result = await loadGame().catch(() => ({ status: 'new' as const }));
  const loaded: Loaded =
    result.status === 'loaded'
      ? { state: result.state, rev: result.rev, canSave: true }
      : // Nothing saved yet, or every copy unreadable: start fresh. A save from a newer version is never overwritten.
        { state: newSave(), rev: 0, canSave: !(result.status === 'unreadable' && result.reason === 'too-new') };
  const app = new App(stage, bar, loaded);
  app.start();
  if (import.meta.env.DEV) (window as unknown as { bubblePop: unknown }).bubblePop = app.devTools();
  void pictures.then(() => app.redrawAll());
  startOfflineSupport(() => app.saveNow());
}

void start();
