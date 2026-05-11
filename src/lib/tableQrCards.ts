import { toDataURL } from 'qrcode'
import type {
  FloorLevelSetting,
  FloorTableSetting,
  OnlineOrderingSettings,
  OnlineTableQrTheme,
} from '../types/pos'

export const tableQrThemeOptions: Array<{ value: OnlineTableQrTheme; label: string; color: string }> = [
  { value: 'black', label: '經典黑色', color: '#202124' },
  { value: 'green', label: '蘋果綠色', color: '#5f9f45' },
  { value: 'orange', label: '夕陽橘色', color: '#d8752d' },
  { value: 'yellow', label: '檸檬黃色', color: '#d7ab25' },
  { value: 'purple', label: '薰衣草紫色', color: '#7b5fb2' },
]

export interface TableQrCardSource {
  table: FloorTableSetting
  floor: FloorLevelSetting | null
}

export const tableQrUrl = (table: FloorTableSetting, floor: FloorLevelSetting | null): string => {
  const params = new URLSearchParams({
    view: 'order',
    source: 'qr',
    mode: 'dine-in',
    table: table.label,
  })

  if (floor?.label) {
    params.set('floor', floor.label)
  }

  return `https://order.scriptcoffee.com.tw/?${params.toString()}`
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const tableQrInstructions = (settings: OnlineOrderingSettings): string[] =>
  settings.dineInCheckout.mode === 'prepaid'
    ? ['掃描桌卡', '選擇餐點', '線上付款', '送出訂單']
    : ['掃描桌卡', '選擇餐點', '送出訂單', '離店前結帳']

const tableQrThemeColor = (theme: OnlineTableQrTheme): string =>
  tableQrThemeOptions.find((option) => option.value === theme)?.color ?? '#202124'

const buildCardHtml = async (
  source: TableQrCardSource,
  settings: OnlineOrderingSettings,
): Promise<string> => {
  const url = tableQrUrl(source.table, source.floor)
  const qrImage = await toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  })
  const themeColor = tableQrThemeColor(settings.tableQrCode.theme)
  const logoDataUrl = settings.tableQrCode.logoDataUrl.trim()
  const logoText = settings.tableQrCode.logoText.trim() || 'Script Coffee'
  const instructionText = tableQrInstructions(settings).join(' > ')
  const floorLabel = source.floor?.label ? `${source.floor.label} ` : ''

  return `
    <article class="table-card" style="--accent: ${themeColor}">
      <header>
        ${
          logoDataUrl
            ? `<img class="logo" src="${escapeHtml(logoDataUrl)}" alt="${escapeHtml(logoText)}" />`
            : `<strong class="logo-text">${escapeHtml(logoText)}</strong>`
        }
        <span>內用掃碼點餐</span>
      </header>
      <p class="steps">${escapeHtml(instructionText)}</p>
      <div class="qr-frame">
        <img src="${qrImage}" alt="${escapeHtml(`${source.table.label} QR Code`)}" />
      </div>
      <h2>${escapeHtml(`${floorLabel}${source.table.label}`)}</h2>
      <p class="hint">固定放置桌面重複使用</p>
    </article>
  `
}

export const buildTableQrCardsHtml = async (
  sources: TableQrCardSource[],
  settings: OnlineOrderingSettings,
): Promise<string> => {
  const cards = await Promise.all(sources.map((source) => buildCardHtml(source, settings)))
  const title = sources.length === 1
    ? `${sources[0]?.table.label ?? '桌位'} QR Code`
    : '桌位 QR Code'

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #202124;
      font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Segoe UI", sans-serif;
      background: #f4f1ea;
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10mm;
      padding: 12mm;
    }
    .table-card {
      min-height: 122mm;
      display: grid;
      align-content: start;
      justify-items: center;
      gap: 7mm;
      padding: 10mm 8mm;
      overflow: hidden;
      border: 1px solid #d8d5cd;
      background:
        linear-gradient(135deg, var(--accent) 0 28%, transparent 28%),
        linear-gradient(315deg, color-mix(in srgb, var(--accent) 24%, white) 0 38%, transparent 38%),
        #ffffff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    header {
      width: 100%;
      display: grid;
      justify-items: center;
      gap: 2mm;
      color: #202124;
      text-align: center;
      font-size: 13pt;
      font-weight: 900;
    }
    .logo {
      width: 18mm;
      height: 18mm;
      object-fit: contain;
      border-radius: 5mm;
      background: #fff;
    }
    .logo-text {
      min-height: 18mm;
      display: grid;
      place-items: center;
      font-size: 15pt;
    }
    .steps, .hint {
      margin: 0;
      color: #5f666d;
      text-align: center;
      font-size: 10pt;
      font-weight: 800;
    }
    .qr-frame {
      display: grid;
      place-items: center;
      width: 62mm;
      height: 62mm;
      padding: 4mm;
      background: #fff;
      box-shadow: 0 8px 26px rgba(32, 33, 36, 0.16);
    }
    .qr-frame img {
      width: 100%;
      height: 100%;
    }
    h2 {
      margin: 0;
      color: #202124;
      font-size: 24pt;
      letter-spacing: 0;
    }
    @media print {
      body { background: #fff; }
      .sheet { padding: 0; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    ${cards.join('\n')}
  </main>
</body>
</html>`
}

export const downloadTableQrCardsHtml = async (
  sources: TableQrCardSource[],
  settings: OnlineOrderingSettings,
): Promise<void> => {
  const html = await buildTableQrCardsHtml(sources, settings)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const suffix = sources.length === 1 ? sources[0]?.table.label ?? 'table' : 'all'
  link.href = url
  link.download = `script-coffee-table-qr-${suffix}.html`
  link.click()
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0)
}
