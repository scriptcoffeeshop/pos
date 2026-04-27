import { createApp } from 'vue'
import './style.css'

const renderBootError = (error: unknown): void => {
  const root = document.querySelector<HTMLDivElement>('#app')
  if (!root) {
    return
  }

  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const stack = error instanceof Error && error.stack ? error.stack : ''

  root.replaceChildren()
  root.className = 'boot-error-shell'

  const panel = document.createElement('section')
  panel.className = 'boot-error-panel'

  const eyebrow = document.createElement('p')
  eyebrow.className = 'boot-error-eyebrow'
  eyebrow.textContent = 'Script Coffee POS'

  const heading = document.createElement('h1')
  heading.textContent = '應用程式啟動失敗'

  const body = document.createElement('p')
  body.textContent = message || '未知錯誤'

  panel.append(eyebrow, heading, body)

  if (stack) {
    const detail = document.createElement('pre')
    detail.textContent = stack
    panel.append(detail)
  }

  root.append(panel)
}

globalThis.addEventListener('error', (event) => {
  renderBootError(event.error ?? event.message)
})

globalThis.addEventListener('unhandledrejection', (event) => {
  renderBootError(event.reason)
})

void import('./App.vue')
  .then(({ default: App }) => {
    createApp(App).mount('#app')
  })
  .catch((error: unknown) => {
    renderBootError(error)
  })
