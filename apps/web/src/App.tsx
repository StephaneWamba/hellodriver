// Phase 0 stub — full booking UX built in Phase 4
export default function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        background: '#0F172A',
        color: '#F8FAFC',
        fontFamily: 'system-ui, sans-serif',
        gap: 16,
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>Hello Driver</h1>
      <p style={{ color: '#94A3B8', fontSize: 16 }}>Libreville, Gabon</p>
      <div
        style={{
          marginTop: 32,
          padding: '8px 16px',
          borderRadius: 9999,
          background: '#1E293B',
          color: '#64748B',
          fontSize: 12,
        }}
      >
        Phase 0 — App launches in Phase 4
      </div>
    </div>
  );
}
