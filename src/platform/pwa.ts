import { registerSW } from 'virtual:pwa-register';

/**
 * The service worker keeps a copy of the toy on the device, so it opens without
 * internet after the first visit. A new version downloads quietly and is
 * switched on the next time the toy is hidden (after saving), so it never
 * changes under the player's fingers and never shows an "Update" button.
 */
export function startOfflineSupport(beforeUpdate: () => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  let ready = false;
  const update = registerSW({
    onNeedRefresh() {
      ready = true;
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ready) {
      ready = false;
      beforeUpdate();
      void update(true);
    }
  });
}
