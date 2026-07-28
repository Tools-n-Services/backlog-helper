/*
 * Копирование команды клонирования. Без внешних зависимостей.
 *
 * Скрипт общий для всех языковых версий, поэтому тексты сообщений живут не здесь,
 * а на кнопке: data-copied и data-copy-failed.
 */
document.getElementById('copy-btn').addEventListener('click', async (event) => {
  const button = event.currentTarget
  const status = document.getElementById('copy-status')
  try {
    await navigator.clipboard.writeText(button.dataset.copy)
    status.textContent = button.dataset.copied
  } catch {
    status.textContent = button.dataset.copyFailed
  }
  window.setTimeout(() => {
    status.textContent = ''
  }, 2500)
})
