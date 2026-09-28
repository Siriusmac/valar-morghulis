import { BarChart3, Bookmark, Check, ChevronDown, ChevronUp, Edit3, Search, Trash2, X } from 'lucide-react'
import { useDeferredValue, useId, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { MovementList } from '../components/MovementList'
import { formatMoney, formatMonthYear, makeId, todayISO } from '../lib/format'
import { visibleMovements } from '../lib/calculations'
import { monthlyExpenseReport, searchMovements, searchReportMovementAmount } from '../lib/searchReports'
import type { AppData, Movement, SearchReport, SearchReportFilters, User } from '../types'

interface Props {
  data: AppData
  user: User
  onSaveReport: (report: SearchReport) => void
  onDeleteReport: (reportId: string) => void
  onEditMovement: (movement: Movement) => void
  onDeleteMovement: (movementId: string) => void
}

interface CounterpartyOption {
  id: string
  name: string
  type: 'beneficiary' | 'sender'
}

function initialDateRange(data: AppData, user: User) {
  const dates = visibleMovements(data, user.id)
    .map((movement) => movement.date)
    .toSorted()
  const today = todayISO()
  return { dateFrom: dates[0] ?? `${today.slice(0, 7)}-01`, dateTo: dates.at(-1) ?? today }
}

function blankFilters(data: AppData, user: User): SearchReportFilters {
  return { query: '', ...initialDateRange(data, user), movementType: 'all' }
}

export function SearchReportsPage({ data, user, onSaveReport, onDeleteReport, onEditMovement, onDeleteMovement }: Props) {
  const [filters, setFilters] = useState<SearchReportFilters>(() => blankFilters(data, user))
  const [searchedFilters, setSearchedFilters] = useState<SearchReportFilters>()
  const [reportFilters, setReportFilters] = useState<SearchReportFilters>()
  const [reportExpanded, setReportExpanded] = useState(false)
  const [reportName, setReportName] = useState('')
  const [editingId, setEditingId] = useState<string>()
  const [excludedMovementIds, setExcludedMovementIds] = useState<string[]>([])
  const [movementToDelete, setMovementToDelete] = useState<Movement>()
  const deferredFilters = useDeferredValue(searchedFilters)
  const deferredReportFilters = useDeferredValue(reportFilters)
  const results = useMemo(() => deferredFilters ? searchMovements(data, user.id, deferredFilters) : [], [data, user.id, deferredFilters])
  const reportMatches = useMemo(() => deferredReportFilters ? searchMovements(data, user.id, deferredReportFilters) : [], [data, user.id, deferredReportFilters])
  const reportResults = useMemo(() => reportMatches.filter((movement) => !excludedMovementIds.includes(movement.id)), [reportMatches, excludedMovementIds])
  const monthly = useMemo(() => deferredReportFilters ? monthlyExpenseReport(data, reportResults, deferredReportFilters) : [], [data, reportResults, deferredReportFilters])
  const movementTotal = deferredReportFilters ? reportResults.reduce((sum, movement) => sum + searchReportMovementAmount(movement, deferredReportFilters), 0) : 0
  const chartTotal = monthly.reduce((sum, item) => sum + item.total, 0)
  const maxMonthly = Math.max(...monthly.map((item) => item.total), 0)
  const savedReports = data.searchReports
    .filter((report) => report.ownerId === user.id)
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const categories = data.categories
    .filter((category) => filters.movementType === 'all' || category.movementType === filters.movementType)
    .toSorted((left, right) => left.name.localeCompare(right.name, 'it-IT'))
  const tags = data.tags.toSorted((left, right) => left.name.localeCompare(right.name, 'it-IT'))
  const counterparties: CounterpartyOption[] = [
    ...data.beneficiaries.filter((item) => !item.id.startsWith('beneficiary-user-')).map((item) => ({ id: item.id, name: item.name, type: 'beneficiary' as const })),
    ...data.senders.map((item) => ({ id: item.id, name: item.name, type: 'sender' as const })),
  ]

  const updateFilters = (patch: Partial<SearchReportFilters>) => setFilters((current) => ({ ...current, ...patch }))
  const reset = () => {
    setFilters(blankFilters(data, user))
    setSearchedFilters(undefined)
    setReportFilters(undefined)
    setReportExpanded(false)
    setReportName('')
    setEditingId(undefined)
    setExcludedMovementIds([])
  }
  const startReport = () => {
    if (!searchedFilters) return
    setReportFilters(searchedFilters)
    setReportExpanded(true)
    setEditingId(undefined)
    setExcludedMovementIds([])
    setReportName(searchedFilters.query.trim() ? `Report · ${searchedFilters.query.trim()}` : 'Nuovo report')
  }
  const editReport = (report: SearchReport) => {
    setFilters(report.filters)
    setSearchedFilters(undefined)
    setReportFilters(report.filters)
    setReportName(report.name)
    setEditingId(report.id)
    setExcludedMovementIds(report.excludedMovementIds ?? [])
    setReportExpanded(true)
  }
  const saveReport = () => {
    const name = reportName.trim()
    if (!name || !reportFilters || reportFilters.dateFrom > reportFilters.dateTo) return
    const previous = editingId ? data.searchReports.find((report) => report.id === editingId) : undefined
    const now = new Date().toISOString()
    onSaveReport({
      id: previous?.id ?? makeId('search-report'),
      ownerId: user.id,
      name,
      filters: reportFilters,
      excludedMovementIds,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    })
    setEditingId(undefined)
    setReportFilters(undefined)
    setReportExpanded(false)
    setReportName('')
    setExcludedMovementIds([])
  }
  const search = () => {
    if (filters.dateFrom > filters.dateTo) return
    setSearchedFilters({ ...filters })
    if (reportFilters) {
      setReportExpanded(false)
    } else {
      setExcludedMovementIds([])
      setReportName('')
    }
  }
  const deleteReport = (report: SearchReport) => {
    if (!confirm(`Eliminare il report “${report.name}”? I movimenti nello storico non verranno cancellati.`)) return
    onDeleteReport(report.id)
    if (editingId === report.id) reset()
  }
  const removeMovementFromReport = () => {
    if (!movementToDelete) return
    const nextExcludedIds = [...new Set([...excludedMovementIds, movementToDelete.id])]
    setExcludedMovementIds(nextExcludedIds)
    if (editingId) {
      const previous = data.searchReports.find((report) => report.id === editingId)
      if (previous) onSaveReport({
        ...previous,
        name: reportName.trim() || previous.name,
        filters: reportFilters ?? previous.filters,
        excludedMovementIds: nextExcludedIds,
        updatedAt: new Date().toISOString(),
      })
    }
    setMovementToDelete(undefined)
  }
  const deleteMovementCompletely = () => {
    if (!movementToDelete) return
    onDeleteMovement(movementToDelete.id)
    setMovementToDelete(undefined)
  }

  return <div className="page search-reports-page">
    <div className="page-heading"><div><h1>Ricerca e report</h1><p>Trova i movimenti nello storico e salva un report mensile delle spese.</p></div></div>

    <form className="search-report-filters" aria-labelledby="search-report-filters-title" onSubmit={(event) => { event.preventDefault(); search() }}>
      <div className="section-title-row"><div><h2 id="search-report-filters-title">Cerca nello storico</h2><p>La parola viene cercata nella descrizione e nei commenti.</p></div><button type="button" className="text-button" onClick={reset}><X />Azzera filtri</button></div>
      <div className="search-report-filter-grid">
        <label className="search-report-query"><span>Parola da cercare</span><span className="search-field"><Search /><input value={filters.query} onChange={(event) => updateFilters({ query: event.target.value })} placeholder="Es. vacanza, bolletta, scuola" /></span></label>
        <label><span>Dal</span><input type="date" value={filters.dateFrom} onChange={(event) => updateFilters({ dateFrom: event.target.value })} /></label>
        <label><span>Al</span><input type="date" value={filters.dateTo} min={filters.dateFrom} onChange={(event) => updateFilters({ dateTo: event.target.value })} /></label>
        <label><span>Tipo</span><select value={filters.movementType} onChange={(event) => { const movementType = event.target.value as SearchReportFilters['movementType']; const selectedCategory = data.categories.find((category) => category.id === filters.categoryId); const incompatibleCounterparty = movementType !== 'all' && filters.counterpartyType && filters.counterpartyType !== (movementType === 'expense' ? 'beneficiary' : 'sender'); updateFilters({ movementType, categoryId: selectedCategory && movementType !== 'all' && selectedCategory.movementType !== movementType ? undefined : filters.categoryId, counterpartyId: incompatibleCounterparty ? undefined : filters.counterpartyId, counterpartyType: incompatibleCounterparty ? undefined : filters.counterpartyType }) }}><option value="all">Spese ed entrate</option><option value="expense">Spese</option><option value="income">Entrate</option></select></label>
        <CounterpartyLookup key={`${filters.counterpartyType ?? ''}:${filters.counterpartyId ?? ''}`} options={counterparties} value={filters.counterpartyId ? { id: filters.counterpartyId, type: filters.counterpartyType! } : undefined} onChange={(option) => updateFilters({ counterpartyId: option?.id, counterpartyType: option?.type })} />
        <label><span>Categoria</span><select value={filters.categoryId ?? ''} onChange={(event) => updateFilters({ categoryId: event.target.value || undefined })}><option value="">Tutte le categorie</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label><span>Tag</span><select value={filters.tagId ?? ''} onChange={(event) => updateFilters({ tagId: event.target.value || undefined })}><option value="">Tutti i tag</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
      </div>
      {filters.dateFrom > filters.dateTo ? <p className="field-error" role="alert">La data iniziale deve precedere la data finale.</p> : null}
      <div className="search-report-filter-actions"><button type="submit" className="button button--primary" disabled={filters.dateFrom > filters.dateTo}><Search />Cerca</button></div>
    </form>

    {deferredReportFilters ? <section className={`search-report-preview${reportExpanded ? '' : ' search-report-preview--collapsed'}`} aria-labelledby="search-report-preview-title">
      <div className="section-title-row"><div><h2 id="search-report-preview-title">{reportExpanded ? editingId ? 'Modifica report' : 'Nuovo report' : reportName || 'Report'}</h2><p>{reportExpanded ? <>Spesa mensile relativa ai movimenti filtrati · totale grafico {formatMoney(chartTotal)}</> : <>{reportResults.length} {reportResults.length === 1 ? 'movimento' : 'movimenti'} · totale {formatMoney(movementTotal)}</>}</p></div><button type="button" className="button button--secondary search-report-toggle" onClick={() => setReportExpanded((current) => !current)}>{reportExpanded ? <><ChevronUp />Riduci report</> : <><ChevronDown />Espandi report</>}</button></div>
      {reportExpanded ? <>
        <MonthlyExpenseColumns monthly={monthly} max={maxMonthly} />
        <div className="search-report-movements">
          <div className="movement-detail-summary"><span>Totale movimenti elencati <strong>{formatMoney(movementTotal)}</strong></span><span><strong>{reportResults.length}</strong> {reportResults.length === 1 ? 'movimento' : 'movimenti'}</span></div>
          <MovementList data={data} movements={reportResults} user={user} compact onEdit={onEditMovement} onRequestDelete={setMovementToDelete} movementAmount={(movement) => searchReportMovementAmount(movement, deferredReportFilters)} />
        </div>
        <div className="search-report-save"><label><span>Nome del report</span><input value={reportName} onChange={(event) => setReportName(event.target.value)} placeholder="Es. Spese casa 2026" /></label><button type="button" className="button button--primary" onClick={saveReport} disabled={!reportName.trim()}><Bookmark />{editingId ? 'Salva modifiche' : 'Salva report'}</button></div>
      </> : null}
    </section> : null}

    {deferredFilters && !reportExpanded ? <section className="search-report-results">
      <div className="section-title-row"><div><h2>Risultati</h2><p>{results.length} {results.length === 1 ? 'movimento trovato' : 'movimenti trovati'}</p></div><button type="button" className="button button--primary" onClick={startReport}><BarChart3 />Crea report</button></div>
      <MovementList data={data} movements={results} user={user} />
    </section> : null}

    <section className="saved-search-reports">
      <div className="section-title-row"><div><h2>Report salvati</h2><p>{savedReports.length ? 'Riapri un report per aggiornare nome o filtri.' : 'Non hai ancora salvato report.'}</p></div></div>
      {savedReports.length ? <div className="saved-search-report-grid">{savedReports.map((report) => <article key={report.id}><span><Bookmark /></span><div><h3>{report.name}</h3><p>{formatMonthYear(report.filters.dateFrom.slice(0, 7))} – {formatMonthYear(report.filters.dateTo.slice(0, 7))}</p></div><div className="saved-search-report-actions"><button type="button" className="button button--secondary" onClick={() => editReport(report)}><Edit3 />Modifica</button><button type="button" className="button button--ghost button--danger" onClick={() => deleteReport(report)}><Trash2 />Elimina</button></div></article>)}</div> : null}
    </section>
    {movementToDelete ? <Modal title={`Elimina “${movementToDelete.description}”`} onClose={() => setMovementToDelete(undefined)} compactChoice>
      <div className="search-report-delete-choice">
        <p>Scegli se rimuovere il movimento soltanto da questo report o cancellarlo completamente dallo storico.</p>
        <button type="button" className="member-removal-choice" onClick={removeMovementFromReport}><strong>Elimina solo dal report</strong><small>Il movimento resta nello storico e continua a essere incluso nei saldi.</small></button>
        <button type="button" className="member-removal-choice member-removal-choice--danger" onClick={deleteMovementCompletely}><strong>Elimina completamente</strong><small>Il movimento viene cancellato dallo storico e i saldi vengono aggiornati.</small></button>
        <button type="button" className="button button--ghost" onClick={() => setMovementToDelete(undefined)}>Annulla</button>
      </div>
    </Modal> : null}
  </div>
}

function CounterpartyLookup({ options, value, onChange }: { options: CounterpartyOption[]; value?: Pick<CounterpartyOption, 'id' | 'type'>; onChange: (option?: CounterpartyOption) => void }) {
  const inputId = useId()
  const listId = useId()
  const selected = options.find((option) => option.id === value?.id && option.type === value.type)
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const normalized = query.toLocaleLowerCase('it-IT').trim()
  const matches = options.filter((option) => !normalized || option.name.toLocaleLowerCase('it-IT').includes(normalized))
    .toSorted((left, right) => left.name.localeCompare(right.name, 'it-IT'))
  const optionCount = matches.length + 1
  const resolvedActiveIndex = activeIndex < optionCount ? activeIndex : optionCount - 1
  const selectOption = (option?: CounterpartyOption) => {
    setQuery(option?.name ?? '')
    onChange(option)
    setOpen(false)
    setActiveIndex(-1)
  }
  return <div className="lookup-field search-report-counterparty"><label htmlFor={inputId}>Beneficiario o mittente</label><span className="lookup-field__control"><Search /><input id={inputId} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && resolvedActiveIndex >= 0 ? resolvedActiveIndex === 0 ? `${listId}-all` : `${listId}-${matches[resolvedActiveIndex - 1].type}-${matches[resolvedActiveIndex - 1].id}` : undefined} value={query} placeholder="Scrivi per scegliere" autoComplete="off" onFocus={() => { setOpen(true); setActiveIndex(0) }} onBlur={() => { setOpen(false); setActiveIndex(-1) }} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(1); onChange(undefined) }} onKeyDown={(event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true); setActiveIndex((current) => event.key === 'ArrowDown' ? (current + 1 + optionCount) % optionCount : (current - 1 + optionCount) % optionCount)
    } else if (event.key === 'Enter') {
      const typed = event.currentTarget.value.toLocaleLowerCase('it-IT').trim()
      const liveMatches = options.filter((option) => !typed || option.name.toLocaleLowerCase('it-IT').includes(typed))
        .toSorted((left, right) => left.name.localeCompare(right.name, 'it-IT'))
      if (typed && liveMatches.length) {
        event.preventDefault(); selectOption(liveMatches[Math.max(0, resolvedActiveIndex - 1)] ?? liveMatches[0])
      } else if (open && resolvedActiveIndex >= 0) {
        event.preventDefault(); selectOption(resolvedActiveIndex === 0 ? undefined : matches[resolvedActiveIndex - 1])
      }
    } else if (event.key === 'Escape') {
      event.preventDefault(); setOpen(false); setActiveIndex(-1)
    }
  }} /></span>{open ? <span className="lookup-field__menu" id={listId} role="listbox"><button type="button" id={`${listId}-all`} role="option" aria-selected={!selected} onMouseDown={(event) => event.preventDefault()} onClick={() => selectOption()}><span>Tutti</span>{!selected ? <Check /> : null}</button>{matches.map((option) => <button type="button" id={`${listId}-${option.type}-${option.id}`} role="option" aria-selected={selected?.id === option.id && selected.type === option.type} key={`${option.type}-${option.id}`} onMouseDown={(event) => event.preventDefault()} onClick={() => selectOption(option)}><span>{option.name}<small>{option.type === 'beneficiary' ? 'Beneficiario' : 'Mittente'}</small></span>{selected?.id === option.id && selected.type === option.type ? <Check /> : null}</button>)}{!matches.length ? <small>Nessuna corrispondenza.</small> : null}</span> : null}</div>
}

function MonthlyExpenseColumns({ monthly, max }: { monthly: Array<{ month: string; total: number }>; max: number }) {
  return <div className="search-report-chart" role="img" aria-label={`Grafico della spesa mensile. ${monthly.map((item) => `${formatMonthYear(item.month)}: ${formatMoney(item.total)}`).join('; ')}`}>
    {monthly.length ? monthly.map((item) => <div className="search-report-chart__column" key={item.month}><strong>{formatMoney(item.total)}</strong><span><i style={{ height: max ? `${Math.max(item.total > 0 ? 5 : 0, (item.total / max) * 100)}%` : '0%' }} title={`${formatMonthYear(item.month)}: ${formatMoney(item.total)}`} /></span><small>{formatMonthYear(item.month)}</small></div>) : <p className="empty-state">Seleziona un intervallo di date valido.</p>}
  </div>
}
