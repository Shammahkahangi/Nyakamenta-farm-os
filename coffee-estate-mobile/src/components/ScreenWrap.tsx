import React from 'react';
import { TabShell } from './TabShell';

export function withTabShell(
  Screen: React.ComponentType,
  title: string,
  door: 'farm' | 'sacco' | 'lodge'
) {
  return function Wrapped() {
    return (
      <TabShell title={title} door={door}>
        <Screen />
      </TabShell>
    );
  };
}
