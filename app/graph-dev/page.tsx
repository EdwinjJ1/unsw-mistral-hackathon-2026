'use client';

import NeuronGraph from '@/components/NeuronGraph';

export default function GraphDevPage() {
  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        margin: 0,
        background: '#070b14',
        overflow: 'hidden',
      }}
    >
      <NeuronGraph />
    </main>
  );
}
