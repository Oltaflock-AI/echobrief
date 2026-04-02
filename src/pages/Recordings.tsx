export default function Recordings() {
  return (
    <div style={{ 
      padding: '40px', 
      color: '#fff',
      background: '#0F0E0C',
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>✓ RECORDINGS PAGE LOADS!</h1>
      <p>If you see this, DashboardLayout was the problem.</p>
      <p style={{ marginTop: '20px', fontSize: '14px', color: '#78716C' }}>
        Stats: 0 meetings, 0m recorded, 0 summaries
      </p>
      <p style={{ marginTop: '20px', color: '#F97316' }}>
        Empty state: No meetings yet
      </p>
    </div>
  );
}
