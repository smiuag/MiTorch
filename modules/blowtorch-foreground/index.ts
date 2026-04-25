import { requireNativeModule, EventSubscription } from 'expo-modules-core';

export type WalkStepEvent = {
  index: number;
  total: number;
  command: string;
};

export type WalkDoneEvent = {
  total: number;
};

type BlowTorchForegroundEvents = {
  onWalkStep: (e: WalkStepEvent) => void;
  onWalkDone: (e: WalkDoneEvent) => void;
};

interface BlowTorchForegroundModule {
  start(title: string, message: string): Promise<boolean>;
  stop(): Promise<boolean>;
  notify(id: number, title: string, body: string): Promise<boolean>;
  startWalk(commands: string[], stepDelayMs: number): Promise<boolean>;
  cancelWalk(): Promise<boolean>;
  addListener<E extends keyof BlowTorchForegroundEvents>(
    eventName: E,
    listener: BlowTorchForegroundEvents[E]
  ): EventSubscription;
}

const nativeModule = requireNativeModule<BlowTorchForegroundModule>('BlowTorchForeground');

export function addWalkStepListener(listener: (e: WalkStepEvent) => void): EventSubscription {
  return nativeModule.addListener('onWalkStep', listener);
}

export function addWalkDoneListener(listener: (e: WalkDoneEvent) => void): EventSubscription {
  return nativeModule.addListener('onWalkDone', listener);
}

export default nativeModule;
