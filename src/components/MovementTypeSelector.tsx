import type { MovementType } from '../types'

export type ComposerType = MovementType | 'transfer'

export function MovementTypeSelector({ value, onChange, includeTransfer = true }: {
  value: ComposerType
  onChange: (value: ComposerType) => void
  includeTransfer?: boolean
}) {
  return <div className={`movement-type ${includeTransfer ? 'movement-type--three' : ''}`} aria-label="Tipo di movimento">
    <button type="button" className={value === 'expense' ? 'active' : ''} onClick={() => onChange('expense')}>Spesa</button>
    <button type="button" className={value === 'income' ? 'active movement-type__income' : 'movement-type__income'} onClick={() => onChange('income')}>Entrata</button>
    {includeTransfer ? <button type="button" className={value === 'transfer' ? 'active movement-type__transfer' : 'movement-type__transfer'} onClick={() => onChange('transfer')}>Giro fondi</button> : null}
  </div>
}
