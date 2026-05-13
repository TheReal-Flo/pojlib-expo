import * as React from 'react';

import { PojlibExpoViewProps } from './PojlibExpo.types';

export default function PojlibExpoView(props: PojlibExpoViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
