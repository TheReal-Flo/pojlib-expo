import { registerWebModule, NativeModule } from 'expo';

import { PojlibExpoModuleEvents } from './PojlibExpo.types';

class PojlibExpoModule extends NativeModule<PojlibExpoModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(PojlibExpoModule, 'PojlibExpoModule');
