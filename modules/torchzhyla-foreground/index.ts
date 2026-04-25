import { requireNativeModule, EventSubscription } from 'expo-modules-core';

export type WalkStepEvent = {
  index: number;
  total: number;
  command: string;
};

export type WalkDoneEvent = {
  total: number;
};

type TorchZhylaForegroundEvents = {
  onWalkStep: (e: WalkStepEvent) => void;
  onWalkDone: (e: WalkDoneEvent) => void;
};

interface TorchZhylaForegroundModule {
  start(title: string, message: string): Promise<boolean>;
  stop(): Promise<boolean>;
  notify(id: number, title: string, body: string): Promise<boolean>;
  startWalk(commands: string[], stepDelayMs: number): Promise<boolean>;
  cancelWalk(): Promise<boolean>;
  addListener<E extends keyof TorchZhylaForegroundEvents>(
    eventName: E,
    listener: TorchZhylaForegroundEvents[E]
  ): EventSubscription;
}

const nativeModule = requireNativeModule<TorchZhylaForegroundModule>('TorchZhylaForeground');

export function addWalkStepListener(listener: (e: WalkStepEvent) => void): EventSubscription {
  return nativeModule.addListener('onWalkStep', listener);
}

export function addWalkDoneListener(listener: (e: WalkDoneEvent) => void): EventSubscription {
  return nativeModule.addListener('onWalkDone', listener);
}

export default nativeModule;
