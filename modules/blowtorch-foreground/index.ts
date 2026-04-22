import { requireNativeModule } from 'expo-modules-core';

type BlowTorchForegroundModule = {
  start(title: string, message: string): Promise<boolean>;
  stop(): Promise<boolean>;
  notify(id: number, title: string, body: string): Promise<boolean>;
};

export default requireNativeModule<BlowTorchForegroundModule>('BlowTorchForeground');
