export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="sKey">
      <img className="brand__mark" src={`${import.meta.env.BASE_URL}skey-logo.png`} alt="" aria-hidden="true" />
      {compact ? null : <span className="brand__name">sKey</span>}
    </div>
  )
}
