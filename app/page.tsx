'use client';

import { Drawer } from '@/components/panel/Panels';
import { Legend, NeuronGraph } from '@/components/graph/NeuronGraph';

export default function Home() {
  return (
    <main className="home-stage">
      <NeuronGraph />
      <Legend />
      <Drawer />
    </main>
  );
}
