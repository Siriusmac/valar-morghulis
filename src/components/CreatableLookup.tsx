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
  const errorId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const normalized = value.trim().toLocaleLowerCase('it-IT')
  const matches = normalized
    ? options.filter((item) => item.name.toLocaleLowerCase('it-IT').includes(normalized))
    : options
  const exactMatch = options.some((item) => item.name.toLocaleLowerCase('it-IT') === normalized)
  const canCreate = Boolean(normalized && !exactMatch)
  const optionCount = matches.length + (canCreate ? 1 : 0)
  const resolvedActiveIndex = activeIndex < optionCount ? activeIndex : optionCount - 1
  const activeOptionId = resolvedActiveIndex < 0
    ? undefined
    : resolvedActiveIndex < matches.length ? `${listId}-option-${matches[resolvedActiveIndex].id}` : `${listId}-create`

  const selectActiveOption = () => {
    if (resolvedActiveIndex < 0) return
    if (resolvedActiveIndex < matches.length) onChange(matches[resolvedActiveIndex].name)
    setOpen(false)
    setActiveIndex(-1)
  }

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
        aria-activedescendant={open ? activeOptionId : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setOpen(true)
          setActiveIndex(optionCount ? 0 : -1)
        }}
        onBlur={() => { setOpen(false); setActiveIndex(-1) }}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActiveIndex(0)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActiveIndex((current) => {
              if (!optionCount) return -1
              const resolvedCurrent = current < optionCount ? current : optionCount - 1
              if (event.key === 'ArrowDown') return resolvedCurrent < 0 ? 0 : (resolvedCurrent + 1) % optionCount
              return resolvedCurrent < 0 ? optionCount - 1 : (resolvedCurrent - 1 + optionCount) % optionCount
            })
          } else if (event.key === 'Enter' && open && resolvedActiveIndex >= 0) {
            event.preventDefault()
            selectActiveOption()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            setActiveIndex(-1)
          }
        }}
      />
    </span>
    {open ? <span className="lookup-field__menu" id={listId} role="listbox">
      {matches.map((item) => <button
        type="button"
        id={`${listId}-option-${item.id}`}
        role="option"
        aria-selected={matches[resolvedActiveIndex]?.id === item.id}
        key={item.id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onChange(item.name)
          setOpen(false)
          setActiveIndex(-1)
        }}
      >
        <span>{item.name}</span>
        {item.name.toLocaleLowerCase('it-IT') === normalized ? <Check /> : null}
      </button>)}
      {canCreate ? <button
        type="button"
        id={`${listId}-create`}
        role="option"
        aria-selected={resolvedActiveIndex === matches.length}
        className="lookup-field__create"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setOpen(false); setActiveIndex(-1) }}
      >
        <Plus /><span>Crea “{value.trim()}”</span>
      </button> : null}
      {!matches.length && !normalized ? <small>Nessun elemento disponibile.</small> : null}
    </span> : null}
    {error ? <small className="field-error" id={errorId}>{error}</small> : null}
  </div>
}
