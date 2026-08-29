import type { MovementType } from '../types'

export type ComposerType = MovementType | 'transfer' | 'roman'

const options: Array<{ value: ComposerType; title: string; description: string; className?: string }> = [
  { value: 'expense', title: 'Spesa', description: 'Registra un acquisto unico o multiplo per te, la famiglia o un altro utente.' },
  { value: 'income', title: 'Entrata', description: 'Registra un’entrata personale o della famiglia.', className: 'movement-type__income' },
  { value: 'transfer', title: 'Giro fondi', description: 'Sposta fondi da un conto a un altro.', className: 'movement-type__transfer' },
  { value: 'roman', title: 'Paga alla romana', description: 'Dividi in parti uguali una spesa occasionale tra più persone.', className: 'movement-type__roman' },
]

export function MovementTypeSelector({ value, onChange, includeTransfer = true }: {
  value: ComposerType
  onChange: (value: ComposerType) => void
  includeTransfer?: boolean
}) {
  const visibleOptions = includeTransfer ? options : options.filter((option) => option.value === 'expense' || option.value === 'income')
  return <div className="movement-type" aria-label="Tipo di movimento">
    {visibleOptions.map((option) => <button
      key={option.value}
      type="button"
      aria-label={option.title}
      className={`${option.className ?? ''} ${value === option.value ? 'active' : ''}`.trim()}
      onClick={() => onChange(option.value)}
    ><strong>{option.title}</strong><small>{option.description}</small></button>)}
  </div>
}
