import { NativeModule, requireNativeModule } from 'expo';

import { PojlibExpoModuleEvents } from './PojlibExpo.types';

declare class PojlibExpoModule extends NativeModule<PojlibExpoModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<PojlibExpoModule>('PojlibExpo');
