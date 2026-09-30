import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownToLine, ArrowUpRight, ArrowUpToLine, Coins, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import './styles.css'
import './theme.css'

const API = 'https://molecule-dev.muaverse.build/polyrouter/get_fapi_quotes'
const initialHoldings = [
  { id: 1, symbol: 'BTC', quantity: 0.42 },
  { id: 2, symbol: 'ETH', quantity: 3.8 },
  { id: 3, symbol: 'SOL', quantity: 24 },
]

const money = (value, currency) => new Intl.NumberFormat('en-SG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0)
const quoteFor = (symbol) => {
  const s = symbol.toUpperCase().replace(/\s/g, '')
  // A bare stablecoin is an asset symbol, not a complete market pair.
  // USDC should therefore resolve to the USDCUSDT market.
  if (s === 'USDC') return 'USDCUSDT'
  if (s === 'USDT') return 'USDT'
  if (s.endsWith('USDT') || s.endsWith('USDC') || s.endsWith('USD')) return s
  return `${s}USDT`
}

function App() {
  const [holdings, setHoldings] = useState(() => JSON.parse(localStorage.getItem('blockfolio-holdings') || 'null') || initialHoldings)
  const [prices, setPrices] = useState({})
  const [fx, setFx] = useState(1.28)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [displayCurrency, setDisplayCurrency] = useState('USD')
  const [sortBy, setSortBy] = useState('value')
  const [sortDirection, setSortDirection] = useState('desc')
  const importInputRef = useRef(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ symbol: '', quantity: '' })

  const fetchQuotes = async () => {
    if (!holdings.length) return
    setLoading(true); setError('')
    const symbols = [...new Set([...holdings.map(h => quoteFor(h.symbol)), 'USDSGD'])].join(',')
    try {
      const response = await fetch(`${API}?symbols=${encodeURIComponent(symbols)}`)
      if (!response.ok) throw new Error('Quote service is unavailable')
      const result = await response.json()
      if (result.status !== 0) throw new Error(result.msg || 'Unable to fetch quotes')
      const next = Object.fromEntries((result.data || []).map(q => [q.symbol, Number(q.price)]))
      setPrices(next)
      if (next.USDSGD) setFx(next.USDSGD)
      setLastUpdated(new Date())
    } catch (e) { setError(e.message || 'Unable to refresh prices') }
    finally { setLoading(false) }
  }

  useEffect(() => { localStorage.setItem('blockfolio-holdings', JSON.stringify(holdings)); fetchQuotes() }, [])
  useEffect(() => { localStorage.setItem('blockfolio-holdings', JSON.stringify(holdings)) }, [holdings])

  const rows = useMemo(() => holdings.map(h => ({ ...h, quote: quoteFor(h.symbol), price: prices[quoteFor(h.symbol)] || (h.symbol.toUpperCase() === 'USDT' ? 1 : 0), value: (prices[quoteFor(h.symbol)] || (h.symbol.toUpperCase() === 'USDT' ? 1 : 0)) * Number(h.quantity) })).sort((a, b) => {
    const comparison = sortBy === 'asset' ? a.symbol.localeCompare(b.symbol) : a.value - b.value
    return sortDirection === 'desc' ? -comparison : comparison
  }), [holdings, prices, sortBy, sortDirection])
  const toggleSort = (column) => {
    if (sortBy === column) setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    else { setSortBy(column); setSortDirection(column === 'value' ? 'desc' : 'asc') }
  }
  const exportPortfolio = () => {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), holdings }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'blockfolio-holdings.json'; link.click(); URL.revokeObjectURL(url)
  }
  const importPortfolio = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        const imported = Array.isArray(parsed) ? parsed : parsed.holdings
        if (!Array.isArray(imported) || imported.some(h => !h.symbol || !Number.isFinite(Number(h.quantity)) || Number(h.quantity) <= 0)) throw new Error()
        setHoldings(imported.map((h, index) => ({ id: h.id || Date.now() + index, symbol: String(h.symbol).toUpperCase().trim(), quantity: Number(h.quantity) })))
        setError('')
      } catch { setError('That file is not a valid Blockfolio JSON export') }
      event.target.value = ''
    }
    reader.readAsText(file)
  }
  const totalUsd = rows.reduce((sum, row) => sum + row.value, 0)
  const addHolding = (event) => {
    event.preventDefault()
    if (!form.symbol || !form.quantity || Number(form.quantity) <= 0) return
    const symbol = form.symbol.toUpperCase().trim()
    const quantity = Number(form.quantity)
    const existing = holdings.find(h => h.symbol.toUpperCase() === symbol)
    setHoldings(existing
      ? holdings.map(h => h.id === existing.id ? { ...h, quantity: Number(h.quantity) + quantity } : h)
      : [...holdings, { id: Date.now(), symbol, quantity }])
    setForm({ symbol: '', quantity: '' }); setModal(false)
  }

  return <div className="app-shell">
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">PERSONAL PORTFOLIO</p></div><div className="header-actions"><button className="icon-button" onClick={exportPortfolio} title="Export holdings as JSON"><ArrowDownToLine size={18}/></button><button className="icon-button" onClick={() => importInputRef.current?.click()} title="Import holdings from JSON"><ArrowUpToLine size={18}/></button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importPortfolio}/><button className="icon-button" onClick={fetchQuotes} title="Refresh quotes"><RefreshCw size={18} className={loading ? 'spin' : ''}/></button></div></header>
      <section className="hero-grid">
        <div className="total-card clickable" role="button" tabIndex="0" title="Click to switch currency" onClick={() => setDisplayCurrency(displayCurrency === 'USD' ? 'SGD' : 'USD')} onKeyDown={e => e.key === 'Enter' && setDisplayCurrency(displayCurrency === 'USD' ? 'SGD' : 'USD')}><div className="card-label">TOTAL PORTFOLIO VALUE · {displayCurrency} <span className="live-dot"></span></div><div className="total-value">{money(displayCurrency === 'USD' ? totalUsd : totalUsd * fx, displayCurrency)}</div><div className="total-secondary">{money(displayCurrency === 'USD' ? totalUsd * fx : totalUsd, displayCurrency === 'USD' ? 'SGD' : 'USD')} <span className="fx-note">Click to switch · 1 USD = {fx.toFixed(3)} SGD</span></div><div className="sparkline"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div>
        <div className="metric-card"><div className="card-label">ASSETS HELD</div><div className="metric-value">{holdings.length}</div><div className="metric-caption">Tracked positions</div><div className="metric-icon"><Coins size={19}/></div></div>
        <div className="metric-card"><div className="card-label">LAST REFRESHED</div><div className="metric-value refresh-time">{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div><div className="metric-caption">Automatic live quotes</div><div className="metric-icon"><RefreshCw size={19}/></div></div>
      </section>
      {error && <div className="error-banner">{error}. Check your connection and try refreshing.</div>}
      <section className="section-heading"><div><p className="eyebrow">YOUR ASSETS</p><h2>Holdings</h2></div><button className="primary-button" onClick={() => setModal(true)}><Plus size={18}/> Add asset</button></section>
      <section className="table-card"><div className="table-head"><button className="sort-button" onClick={() => toggleSort('asset')}>ASSET {sortBy === 'asset' && <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>}</button><span>QUANTITY</span><span>PRICE (USD / SGD)</span><button className="sort-button" onClick={() => toggleSort('value')}>VALUE (USD) {sortBy === 'value' && <span>{sortDirection === 'desc' ? '↓' : '↑'}</span>}</button><span></span></div>{rows.length ? rows.map(row => <div className="holding-row" key={row.id}><div className="asset-cell"><div className={`coin-icon coin-${row.symbol.slice(0, 3).toLowerCase()}`}>{row.symbol.slice(0, 1)}</div><div><strong>{row.symbol}</strong><small>{row.quote}</small></div></div><div className="quantity">{Number(row.quantity).toLocaleString('en-US', { maximumFractionDigits: 8 })}</div><div className="price">{row.price ? <><span>{money(row.price, 'USD')}</span><small>{money(row.price * fx, 'SGD')}</small></> : <span className="pending">Unavailable</span>}</div><div className="value"><strong>{row.value ? money(row.value, 'USD') : '—'}</strong><small>{row.value ? money(row.value * fx, 'SGD') : '—'}</small></div><button className="delete-button" onClick={() => setHoldings(holdings.filter(h => h.id !== row.id))}><Trash2 size={17}/></button></div>) : <div className="empty-state"><Coins size={30}/><p>Your portfolio is empty</p><button className="text-button" onClick={() => setModal(true)}>Add your first asset <ArrowUpRight size={15}/></button></div>}<div className="table-foot"><span><span className="live-dot"></span> Prices are updated from the market</span><span>USD / SGD rate: {fx.toFixed(3)}</span></div></section>
      <footer>Prices provided by the live market quote service <ArrowUpRight size={13}/></footer>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(false)}><form className="modal" onSubmit={addHolding}><button type="button" className="close" onClick={() => setModal(false)}><X size={18}/></button><p className="eyebrow">NEW POSITION</p><h2>Add an asset</h2><p className="modal-subtitle">Enter a symbol and the quantity you currently hold.</p><label>SYMBOL<input autoFocus placeholder="e.g. BTC" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })}/></label><label>QUANTITY<input type="number" min="0" step="any" placeholder="e.g. 0.25" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}/></label><button className="primary-button full" type="submit"><Plus size={18}/> Add to portfolio</button></form></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
