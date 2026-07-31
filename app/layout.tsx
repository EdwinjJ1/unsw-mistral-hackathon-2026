import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './globals.css';
import '@/components/ui/primitives.css';
import '@/components/panel/panels.css';
import '@/components/graph/graph.css';
import './narrative.css';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { GraphProvider } from '@/lib/useGraph';
import { ShortcutLayer, TopBar } from '@/components/shell/Shell';

export const metadata: Metadata = {
  title: 'Athena — second brain for a project',
  description: 'A living project graph that finds hidden signals across teams.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<div className="app-loading">ATHENA · CONNECTING GRAPH</div>}>
          <GraphProvider>
            <TopBar />
            <ShortcutLayer />
            {children}
          </GraphProvider>
        </Suspense>
      </body>
    </html>
  );
}
