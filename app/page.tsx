export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Scan Youtube Videos</h1>
      <p>
        Download the Excel export: <a href="/api/export">/api/export</a> (optional <code>?handle=@channel</code>)
      </p>
      <p>
        Or run <code>npm run scan [output.xlsx] [@handle]</code>.
      </p>
    </main>
  );
}
