import { Audio } from 'expo-av';
import { AmbientMappings, RoomCategory } from '../types';
import { loadAmbientMappings } from '../storage/ambientStorage';
import { loadSettings } from '../storage/settingsStorage';
import { getCustomSoundUri } from '../storage/customSoundsStorage';

// Singleton que reproduce un loop de música de fondo según la categoría
// de sala actual. Reglas operativas (resumen, detalle en CLAUDE.md
// "Sistema de Ambientación"):
//   - Una sola `Audio.Sound` cargada a la vez. Crossfade lineal de 1.5 s
//     al cambiar de categoría (30 ticks de 50 ms vía setVolumeAsync).
//   - `setCategory` está debounced 500 ms para que cruzar varios tipos
//     en pocos segundos no genere fade-fade-fade.
//   - Categorías sin wavs asignados → silencio (fade-out sin fade-in).
//   - Random new pick cada vez que se entra en la categoría (no round-
//     robin, no resume): la simpleza supera la elegancia aquí.
//   - Las refs son `custom:{uuid}.{ext}`; si la file no está en disco se
//     intenta la siguiente; si todas faltan, silencio + warn.
//   - Kill-switch global: el caller comprueba `silentModeEnabled` y/o
//     `ambientEnabled` ANTES de invocar setCategory. El service confía
//     en que se le invoca sólo cuando debe sonar.

const CROSSFADE_MS = 1500;
const CROSSFADE_TICKS = 30;
const TICK_MS = CROSSFADE_MS / CROSSFADE_TICKS;
const DEBOUNCE_MS = 500;

// Loose Audio.Sound type — expo-av's typings don't always track param
// changes between versions, so we type the local handle as the live
// instance returned by createAsync. Using `Audio.Sound` directly works.
type ASound = Audio.Sound;

class AmbientPlayer {
  private mappings: AmbientMappings | null = null;
  private currentCategory: RoomCategory | null = null;
  private currentSound: ASound | null = null;
  private currentRef: string | null = null;
  private targetVolume: number = 0.4;
  private enabled: boolean = true;
  private initialized: boolean = false;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private crossfadeTimer: ReturnType<typeof setInterval> | null = null;
  // Token incrementing on every category change. Async loads (`loadAndPlay`)
  // check it before swapping in their result — if the user switched
  // category mid-load, the stale load aborts itself.
  private requestToken: number = 0;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      // interruptionModeAndroid=2 (DuckOthers) + staysActiveInBackground=true
      // — coherente con SoundContext. expo-av no pide focus exclusivo,
      // react-native-sound puede coexistir cuando un trigger con pan se
      // solapa con el loop del ambient. shouldDuckAndroid=true permite
      // que apps externas atenúen el ambient en vez de cortarlo. El
      // staysActiveInBackground=true es necesario para que el load del
      // wav de ambient no falle con AudioFocusNotAcquiredException
      // cuando se ejecuta tras un cambio de sala mientras la activity
      // no está visible. La pausa real del ambient en background la
      // hace el AppState handler de TerminalScreen, no este flag.
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeAndroid: 2,
        shouldDuckAndroid: true,
      });
    } catch (e) {
      console.warn(`[AMBIENT] setAudioModeAsync failed: ${e}`);
    }
    await this.reloadMappings();
    const settings = await loadSettings();
    this.targetVolume = settings.ambientVolume;
    this.enabled = settings.ambientEnabled;
  }

  async reloadMappings(): Promise<void> {
    this.mappings = await loadAmbientMappings();
  }

  setAmbientVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.targetVolume = clamped;
    // Si suena algo ahora mismo, ajusta el volumen. Si está en pleno
    // crossfade, dejamos que el crossfade termine — el siguiente ajuste
    // (o el final del fade-in) ya usará el nuevo target.
    if (this.currentSound && this.crossfadeTimer === null) {
      this.currentSound.setVolumeAsync(clamped).catch(() => {});
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.fadeOutAndUnload();
    } else if (this.currentCategory) {
      // Reanuda con la categoría que estaba activa cuando se desactivó.
      this.scheduleCategoryChange(this.currentCategory, /*forceReload*/ true);
    }
  }

  // Punto de entrada principal: el caller (subscriber de MapService) llama
  // a esto cada vez que cambia la sala actual. Se debouncea para que
  // movimientos rápidos no generen ráfagas de crossfades.
  setCategory(category: RoomCategory | null): void {
    if (!this.enabled) return;
    if (category === null) {
      // Sala perdida (desconexión de telnet, mapa fuera). Para el ambient.
      this.scheduleStop();
      return;
    }
    this.scheduleCategoryChange(category, /*forceReload*/ false);
  }

  stop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.requestToken++; // invalida cualquier load en curso
    this.fadeOutAndUnload();
    this.currentCategory = null;
  }

  dispose(): void {
    this.stop();
    if (this.crossfadeTimer) clearInterval(this.crossfadeTimer);
    this.crossfadeTimer = null;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private scheduleCategoryChange(category: RoomCategory, forceReload: boolean): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      // No-op si la categoría no cambió Y forceReload es false.
      if (!forceReload && this.currentCategory === category) return;
      this.changeToCategory(category);
    }, DEBOUNCE_MS);
  }

  private scheduleStop(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.fadeOutAndUnload();
      this.currentCategory = null;
    }, DEBOUNCE_MS);
  }

  private async changeToCategory(category: RoomCategory): Promise<void> {
    this.currentCategory = category;
    const token = ++this.requestToken;

    if (!this.mappings) await this.reloadMappings();
    const refs = this.mappings?.[category]?.sounds ?? [];
    if (refs.length === 0) {
      // Sin wavs: fade-out del actual sin nuevo.
      this.fadeOutAndUnload();
      return;
    }

    // Pick random + fallback si la file no existe en disco. Trying in
    // shuffled order means a single missing wav doesn't bias the next
    // picks; the user just gets a different one.
    const shuffled = [...refs].sort(() => Math.random() - 0.5);
    let nextSound: ASound | null = null;
    let usedRef: string | null = null;
    for (const ref of shuffled) {
      // Si nos sustituyeron de categoría mientras buscábamos, abortamos.
      if (token !== this.requestToken) return;
      const uri = this.resolveRef(ref);
      if (!uri) {
        console.warn(`[AMBIENT] missing wav for category="${category}" ref="${ref}"`);
        continue;
      }
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { volume: 0, isLooping: true, shouldPlay: true },
        );
        // De nuevo chequeamos el token: el await de createAsync puede
        // tardar; si el usuario cruzó otra categoría, descartamos.
        if (token !== this.requestToken) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        nextSound = sound;
        usedRef = ref;
        break;
      } catch (e) {
        console.warn(`[AMBIENT] createAsync failed for "${ref}": ${e}`);
      }
    }

    if (!nextSound) {
      console.warn(`[AMBIENT] all wavs missing for category="${category}", silencing`);
      this.fadeOutAndUnload();
      return;
    }

    this.crossfadeTo(nextSound, usedRef);
  }

  private resolveRef(ref: string): string | null {
    const CUSTOM = 'custom:';
    if (!ref.startsWith(CUSTOM)) {
      console.warn(`[AMBIENT] unsupported ref kind: "${ref}" (only "custom:..." accepted)`);
      return null;
    }
    const filename = ref.slice(CUSTOM.length);
    return getCustomSoundUri(filename);
  }

  private crossfadeTo(nextSound: ASound, nextRef: string | null): void {
    // Cancela un crossfade previo si hubiera uno corriendo.
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    const oldSound = this.currentSound;
    const target = this.targetVolume;
    let tick = 0;

    this.currentSound = nextSound;
    this.currentRef = nextRef;

    this.crossfadeTimer = setInterval(() => {
      tick++;
      const t = tick / CROSSFADE_TICKS;
      const newVol = target * t;
      const oldVol = target * (1 - t);
      nextSound.setVolumeAsync(newVol).catch(() => {});
      if (oldSound) oldSound.setVolumeAsync(oldVol).catch(() => {});
      if (tick >= CROSSFADE_TICKS) {
        if (this.crossfadeTimer) clearInterval(this.crossfadeTimer);
        this.crossfadeTimer = null;
        nextSound.setVolumeAsync(target).catch(() => {});
        if (oldSound) {
          oldSound.stopAsync().catch(() => {});
          oldSound.unloadAsync().catch(() => {});
        }
      }
    }, TICK_MS);
  }

  private fadeOutAndUnload(): void {
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    const sound = this.currentSound;
    this.currentSound = null;
    this.currentRef = null;
    if (!sound) return;

    // Fade-out manual a 1 s. Más corto que el crossfade entre tipos
    // porque al detener no esperamos un nuevo arranque que justifique
    // el solape.
    const target = this.targetVolume;
    const ticks = 20;
    const tickMs = 50;
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      const vol = target * (1 - tick / ticks);
      sound.setVolumeAsync(Math.max(0, vol)).catch(() => {});
      if (tick >= ticks) {
        clearInterval(timer);
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
      }
    }, tickMs);
  }
}

export const ambientPlayer = new AmbientPlayer();
