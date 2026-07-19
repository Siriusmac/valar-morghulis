export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Valar Morghulis">
      <span className="brand__mark" aria-hidden="true"><i>V</i><i>M</i></span>
      {compact ? null : <span className="brand__name">Valar<br />Morghulis</span>}
    </div>
  )
}
