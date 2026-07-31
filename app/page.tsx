const endpoints = [
  ['GET', '/api/graph', 'Complete project graph'],
  ['GET', '/api/team/team.engineering', 'Team detail and cross-team dependencies'],
  ['GET', '/api/person/100000000000000002', 'One person’s actionable subgraph'],
  ['POST', '/api/delta', 'Atomic, idempotent graph updates'],
  ['POST', '/api/ingest', 'Document text converted to an applied Delta'],
] as const;

export default function Home() {
  return (
    <main>
      <p className="eyebrow">TRACK A · GRAPH CORE</p>
      <h1>Athena is ready to connect.</h1>
      <p className="lede">
        SQLite persistence, deterministic graph updates, traceable seed data,
        and stable APIs for the graph, web shell, Discord bot, Mistral layer,
        and Signals.
      </p>

      <section aria-labelledby="endpoints-heading">
        <h2 id="endpoints-heading">Available endpoints</h2>
        <div className="endpoint-list">
          {endpoints.map(([method, route, description]) => (
            <article key={`${method}-${route}`}>
              <code className={`method method-${method.toLowerCase()}`}>{method}</code>
              <code className="route">{route}</code>
              <span>{description}</span>
            </article>
          ))}
        </div>
      </section>

      <p className="handoff">
        This page is intentionally minimal and is ready for Track C to replace.
      </p>
    </main>
  );
}
