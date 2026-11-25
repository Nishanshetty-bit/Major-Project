import { useEffect, useMemo, useState } from 'react'
import { api, inr } from '../lib/api.js'
import { useApi } from '../hooks/index.js'
import { useApp } from '../state/AppContext.jsx'
import { Button, Card, Chip, Loading, Modal } from '../components/ui.jsx'
import { Icon } from './Icon.jsx'

const price = (value) => value == null ? '—' : `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function StockTable({ stocks, selectedSymbol, onSelect, busy }) {
  if (!stocks.length) return <p className="muted center" style={{ padding: 22 }}>No stocks found. Try a company name or NSE symbol.</p>
  return <div style={{ overflowX: 'auto' }}>
    <table className="t" style={{ minWidth: 480 }}>
      <thead><tr><th>Company</th><th>NSE symbol</th><th /></tr></thead>
      <tbody>{stocks.map((stock) => <tr key={stock.symbol}>
        <td><b>{stock.companyName}</b></td>
        <td className="num">{stock.symbol}</td>
        <td style={{ textAlign: 'right' }}><Button className="sm" onClick={() => onSelect(stock)} disabled={busy && selectedSymbol === stock.symbol}>{busy && selectedSymbol === stock.symbol ? 'Loading…' : selectedSymbol === stock.symbol ? 'Selected' : 'View quote'}</Button></td>
      </tr>)}</tbody>
    </table>
  </div>
}

export default function StockSearch({ open, onClose }) {
  const { setPanel, setAIStock } = useApp()
  const { data: directory, error: directoryError, loading: directoryLoading, reload } = useApi('/market/stocks', { cached: false, enabled: open })
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [stockExplanation, setStockExplanation] = useState('')
  const [stockAIError, setStockAIError] = useState('')
  const [stockAIBusy, setStockAIBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const stocks = useMemo(() => {
    const source = search?.status === 'ok' ? search.results : directory?.symbols || []
    const unique = new Map()
    for (const stock of source) if (!unique.has(stock.symbol)) unique.set(stock.symbol, stock)
    return [...unique.values()]
  }, [directory, search])

  useEffect(() => {
    if (!selected) return undefined
    let active = true
    setQuote(null)
    setQuoteError('')
    setQuoteBusy(true)
    api(`/market/quote?symbol=${encodeURIComponent(selected.symbol)}&exchange=NSE`)
      .then((result) => { if (active) setQuote(result) })
      .catch((error) => { if (active) setQuoteError(error.message) })
      .finally(() => { if (active) setQuoteBusy(false) })
    return () => { active = false }
  }, [selected?.symbol, refreshKey])

  useEffect(() => {
    if (!selected || quote?.status !== 'ok' || quote.symbol !== selected.symbol) return undefined
    let active = true
    setStockExplanation('')
    setStockAIError('')
    setStockAIBusy(true)
    api('/ai/chat', {
      method: 'POST',
      body: {
        message: 'Explain in beginner-friendly language how this stock is performing based only on the latest available quote. Explain the price change and what the quote cannot tell us. Do not recommend buying or selling.',
        stock: { symbol: selected.symbol, companyName: selected.companyName, quote },
      },
    })
      .then((result) => { if (active) setStockExplanation(result.answer) })
      .catch((error) => { if (active) setStockAIError(error.message) })
      .finally(() => { if (active) setStockAIBusy(false) })
    return () => { active = false }
  }, [selected?.symbol, selected?.companyName, quote])

  const runSearch = async (event) => {
    event.preventDefault()
    const term = query.trim()
    if (!term) {
      setSearch(null)
      setSearchError('')
      return
    }
    setSearchBusy(true)
    setSearchError('')
    try {
      const result = await api(`/market/search?q=${encodeURIComponent(term)}`)
      if (result.status !== 'ok') {
        setSearch(null)
        setSearchError(result.message || 'Stock search is unavailable.')
      } else {
        setSearch(result)
      }
    } catch (error) {
      setSearch(null)
      setSearchError(error.message)
    } finally {
      setSearchBusy(false)
    }
  }

  const clearSearch = () => {
    setQuery('')
    setSearch(null)
    setSearchError('')
  }
  const change = quote?.change
  const changePercent = quote?.changePercent

  return <>
    <Modal open={open && !selected} onClose={onClose}>
      <div className="col stock-modal-content">
        <div className="row between">
          <div><div className="eyebrow">NSE · External quote provider</div><h2>Search stocks</h2><p className="muted small">Find a company or NSE symbol to view its latest available quote.</p></div>
          <Button className="icon" variant="ghost" onClick={onClose} aria-label="Close stock search"><span aria-hidden="true">×</span></Button>
        </div>
        <form className="row wrap" onSubmit={runSearch}>
          <label htmlFor="stock-search" className="sr-only">Search Indian stocks</label>
          <input id="stock-search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a company or NSE symbol (e.g. Infosys)" style={{ flex: '1 1 280px' }} />
          <Button type="submit" disabled={searchBusy}>{searchBusy ? 'Searching…' : 'Search stocks'}</Button>
          {(search || query) && <Button type="button" variant="ghost" onClick={clearSearch}>Clear</Button>}
        </form>

        {searchError && <p className="small down" role="alert">{searchError}</p>}
        <div className="row between wrap">
          <div><h3>{search ? 'Search results' : 'Popular stocks'}</h3><p className="tiny muted">{search ? `${stocks.length} result${stocks.length === 1 ? '' : 's'} · ${search.provider}` : 'Select a stock to request its latest available provider quote.'}</p></div>
          {!search && <Button className="sm" variant="ghost" onClick={reload} disabled={directoryLoading}>{directoryLoading ? 'Refreshing…' : 'Refresh list'}</Button>}
        </div>
        {directoryLoading && !directory && <Loading rows={3} h={50} />}
        {directoryError && <p className="small down" role="alert">Could not load stocks: {directoryError.message}</p>}
        {directory?.status === 'unavailable' && <Card className="pad-sm flat small" role="status"><b>Stock directory unavailable.</b> {directory.message}</Card>}
        {directory?.status === 'ok' && !directory.symbols.length && <p className="small muted">The provider did not return any symbols.</p>}
        {(search || directory?.status === 'ok') && <StockTable stocks={stocks} selectedSymbol={selected?.symbol} onSelect={(stock) => { setSelected(stock); onClose() }} busy={quoteBusy} />}
      </div>
    </Modal>

    <Modal open={Boolean(selected)} onClose={() => setSelected(null)}>
      {selected && <div className="col stock-modal-content">
        <div className="row between">
          <div><div className="eyebrow">{selected.symbol} · NSE provider quote</div><h2>{selected.companyName}</h2><p className="muted small">Quote source: {quote?.provider || '0xramm/Indian-Stock-Market-API (Yahoo Finance upstream)'}. Provider prices may be delayed.</p></div>
          <Button className="icon" variant="ghost" onClick={() => setSelected(null)} aria-label="Close stock details"><span aria-hidden="true">×</span></Button>
        </div>
        <div className="row between wrap">
          <div><Chip tone="blue">{selected.symbol} · NSE</Chip>{quote?.status === 'ok' && <Chip tone={quote.dataStatus === 'stale' ? 'orange' : 'green'}>{quote.dataStatus === 'cached' ? 'Cached' : quote.dataStatus === 'stale' ? 'Stale' : 'Fetched'}</Chip>}</div>
          <Button onClick={() => setRefreshKey((key) => key + 1)} disabled={quoteBusy}>{quoteBusy ? 'Loading quote…' : 'Refresh quote'}</Button>
        </div>
        {quoteBusy && <Loading rows={1} h={70} />}
        {quoteError && <p className="small down" role="alert">Quote request failed: {quoteError}</p>}
        {quote?.status === 'unavailable' && <Card className="pad-sm flat small" role="status"><b>Quote unavailable.</b> {quote.message}</Card>}
        {selected && quote?.symbol === selected.symbol && quote?.status === 'ok' && <Card className="pad-sm flat col stock-ai-summary">
          <div className="row between wrap"><b>AI beginner explanation</b>{stockAIBusy && <span className="tiny muted">Preparing explanation…</span>}</div>
          {stockExplanation && <p className="small muted">{stockExplanation}</p>}
          {stockAIError && <p className="small down" role="alert">AI explanation unavailable: {stockAIError}</p>}
          <Button className="sm" size="sm" onClick={() => {
            setAIStock({ symbol: selected.symbol, companyName: selected.companyName, quote, explanation: stockExplanation })
            setSelected(null)
            setPanel('ai')
          }}><Icon name="message" size={15} /> Chat about this stock</Button>
        </Card>}
        {quote?.status === 'ok' && <div className="col">
          <div className="row between wrap">
            <div><div className="tiny muted">Latest provider price · {quote.currency || 'INR'}</div><b className="num" style={{ fontSize: 34 }}>{price(quote.lastPrice)}</b></div>
            <div className={change !== null && change < 0 ? 'down' : 'up'}><b className="num">{change == null ? 'Change unavailable' : `${change > 0 ? '+' : ''}${price(change)}`}</b><div>{changePercent == null ? '—' : `${changePercent > 0 ? '+' : ''}${Number(changePercent).toFixed(2)}%`}</div></div>
          </div>
          <div className="grid g3">{[['Previous close', price(quote.previousClose)], ['Open', price(quote.open)], ['Day range', `${price(quote.dayLow)} – ${price(quote.dayHigh)}`], ['52-week range', `${price(quote.yearLow)} – ${price(quote.yearHigh)}`], ['Volume', quote.volume == null ? '—' : Number(quote.volume).toLocaleString('en-IN')], ['Market cap', inr(quote.marketCap)]].map(([label, value]) => <Card key={label} className="pad flat"><div className="tiny muted">{label}</div><b>{value}</b></Card>)}</div>
          <p className="tiny muted">Fetched {quote.fetchedAt ? new Date(quote.fetchedAt).toLocaleString() : 'time unavailable'} · market timestamp: {quote.marketTimestamp ?? 'not supplied'} · {quote.freshnessNote}</p>
        </div>}
      </div>}
    </Modal>
  </>
}
