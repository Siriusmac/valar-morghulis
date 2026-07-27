import { Check, Plus, Search } from 'lucide-react'
import { useId, useState } from 'react'

interface LookupOption {
  id: string
  name: string
}

interface Props {
  label: string
  value: string
  options: LookupOption[]
  placeholder: string
  onChange: (value: string) => void
  error?: string
}

export function CreatableLookup({ label, value, options, placeholder, onChange, error }: Props) {
  const inputId = useId()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const normalized = value.trim().toLocaleLowerCase('it-IT')
  const matches = normalized
    ? options.filter((item) => item.name.toLocaleLowerCase('it-IT').includes(normalized))
    : options
  const exactMatch = options.some((item) => item.name.toLocaleLowerCase('it-IT') === normalized)

  return <div className="lookup-field">
    <label htmlFor={inputId}>{label}</label>
    <span className="lookup-field__control">
      <Search aria-hidden="true" />
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      />
    </span>
    {open ? <span className="lookup-field__menu" id={listId} role="listbox">
      {matches.map((item) => <button
        type="button"
        role="option"
        aria-selected={item.name.toLocaleLowerCase('it-IT') === normalized}
        key={item.id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onChange(item.name)
          setOpen(false)
        }}
      >
        <span>{item.name}</span>
        {item.name.toLocaleLowerCase('it-IT') === normalized ? <Check /> : null}
      </button>)}
      {normalized && !exactMatch ? <button
        type="button"
        className="lookup-field__create"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(false)}
      >
        <Plus /><span>Crea “{value.trim()}”</span>
      </button> : null}
      {!matches.length && !normalized ? <small>Nessun elemento disponibile.</small> : null}
    </span> : null}
    {error ? <small className="field-error">{error}</small> : null}
  </div>
}
