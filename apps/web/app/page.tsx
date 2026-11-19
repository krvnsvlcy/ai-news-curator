import { type Article, curate } from "@curator/core";

// Placeholder data until the worker persists articles somewhere the web app can read.
const sample: Article[] = [
  {
    id: "1",
    sourceId: "example",
    title: "Open source LLM agent sets new benchmark",
    url: "https://example.com/1",
    publishedAt: "2026-11-19T09:00:00Z",
  },
  {
    id: "2",
    sourceId: "example",
    title: "Faster inference for small models",
    url: "https://example.com/2",
    summary: "A look at quantization and AI accelerators.",
    publishedAt: "2026-11-18T12:00:00Z",
  },
];

export default function Home() {
  const items = curate(sample);
  return (
    <main>
      <h1>AI News Curator</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((a) => (
          <li key={a.id} style={{ marginBottom: "1rem" }}>
            <a href={a.url}>{a.title}</a>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              {a.sourceId} · score {a.score.toFixed(2)} · {a.tags.join(", ")}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
