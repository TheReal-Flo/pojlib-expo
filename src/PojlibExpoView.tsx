import { requireNativeView } from 'expo';
import * as React from 'react';

import { PojlibExpoViewProps } from './PojlibExpo.types';

const NativeView: React.ComponentType<PojlibExpoViewProps> =
  requireNativeView('PojlibExpo');

export default function PojlibExpoView(props: PojlibExpoViewProps) {
  return <NativeView {...props} />;
}
