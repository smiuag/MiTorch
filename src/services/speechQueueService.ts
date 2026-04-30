import { AccessibilityInfo } from 'react-native';
import { loadSettings } from '../storage/settingsStorage';

// JS-level queue for screen-reader announcements. Android's
// AccessibilityInfo.announceForAccessibility() is fire-and-forget — calling
// it twice in quick succession makes TalkBack abort the first message and
// start the second. There is no public API to know when TalkBack finished
// speaking, so we serialize calls ourselves with an estimated duration
// based on text length.
//
// The user can still interrupt naturally: tapping a button or moving focus
// makes TalkBack read the focused element (cutting whatever it was speaking).
// Our queue keeps firing on its own timer, so the next item arrives after
// the estimated duration of the previous one regardless.

const FLOOR_MS = 800;
const DEFAULT_CHAR_DURATION_MS = 20;

class SpeechQueueService {
  private queue: string[] = [];
  private speakingTimer: ReturnType<typeof setTimeout> | null = null;
  private charDurationMs = DEFAULT_CHAR_DURATION_MS;
  private screenReaderEnabled = false;
  private maxQueueSize = 10;

  constructor() {
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      this.screenReaderEnabled = enabled;
    });
    AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      this.screenReaderEnabled = enabled;
      if (!enabled) this.clear();
    });
    loadSettings()
      .then((s) => {
        if (typeof s.speechCharDurationMs === 'number') {
          this.charDurationMs = Math.max(1, s.speechCharDurationMs);
        }
      })
      .catch(() => {});
  }

  setCharDurationMs(ms: number): void {
    this.charDurationMs = Math.max(1, ms);
  }

  enqueue(text: string): void {
    const trimmed = text?.trim();
    if (!trimmed) return;
    if (!this.screenReaderEnabled) return;

    if (this.queue.length >= this.maxQueueSize) {
      // Drop oldest pending — stale messages are worse than silence.
      this.queue.shift();
    }
    this.queue.push(trimmed);

    if (!this.speakingTimer) {
      this.flushNext();
    }
  }

  clear(): void {
    this.queue.length = 0;
    if (this.speakingTimer) {
      clearTimeout(this.speakingTimer);
      this.speakingTimer = null;
    }
  }

  private flushNext = (): void => {
    const next = this.queue.shift();
    if (!next) {
      this.speakingTimer = null;
      return;
    }
    AccessibilityInfo.announceForAccessibility(next);
    const duration = Math.max(FLOOR_MS, next.length * this.charDurationMs);
    this.speakingTimer = setTimeout(this.flushNext, duration);
  };
}

export const speechQueue = new SpeechQueueService();
