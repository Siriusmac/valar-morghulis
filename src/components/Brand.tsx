export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Valar Morghulis">
      <img className="brand__mark" src={`${import.meta.env.BASE_URL}valar-logo.png`} alt="" aria-hidden="true" />
      {compact ? null : <span className="brand__name">Valar<br />Morghulis</span>}
    </div>
  )
}
