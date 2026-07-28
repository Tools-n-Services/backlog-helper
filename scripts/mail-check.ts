/**
 * Проверка почтового канала.
 *
 * Нужна из-за того, как неверная настройка почты проявляется: письмо ставится
 * в очередь, проход рассылки отчитывается «не доставлено, повторим», и так
 * по кругу — без единой строки о причине. Человек видит, что писем нет,
 * и не видит, почему. Этот прогон превращает тишину в конкретную ошибку
 * и делает единственное, что доказывает работоспособность канала:
 * отправляет настоящее письмо.
 *
 *   pnpm mail:check                     только настройки, без отправки
 *   pnpm mail:check you@example.com     настройки и пробное письмо
 */

import { existsSync } from 'node:fs'

import { portalOrigin } from '@/core/domain/post/notifications'
import {
  MAIL_DIR,
  mailProvider,
  readSmtpConfig,
  resetSmtpTransport,
  send,
  senderAddress,
} from '@/core/mail'

if (existsSync('.env')) process.loadEnvFile('.env')

const problems: string[] = []

function check(ok: boolean, message: string) {
  if (!ok) problems.push(message)
  console.log(`${ok ? '✓' : '✗'} ${message}`)
}

const KNOWN = ['smtp', 'resend', 'file', 'log']

function checkProvider() {
  const provider = mailProvider()
  console.log(`Канал: ${provider}`)
  console.log(`Отправитель: ${senderAddress()}\n`)
  check(KNOWN.includes(provider), `MAIL_PROVIDER — одно из ${KNOWN.join(', ')}`)

  if (provider === 'smtp') return checkSmtp()
  if (provider === 'resend') {
    check(Boolean(process.env.RESEND_API_KEY), 'RESEND_API_KEY задан')
    return
  }
  if (provider === 'file') {
    console.log(`  письма складываются в ${MAIL_DIR}, в реальные ящики не идут`)
  }
}

function checkSmtp() {
  const parsed = readSmtpConfig()
  check(parsed.ok, parsed.ok ? 'настройки SMTP разобраны' : parsed.error)
  if (!parsed.ok) return

  const { host, port, secure, user } = parsed.config
  console.log(
    `  ${host}:${port}, TLS ${secure ? 'сразу' : 'через STARTTLS'}` +
      `, вход ${user ? `как ${user}` : 'без аутентификации'}`,
  )

  /* Расхождение From и логина — самая частая причина отказа, и текст
     отказа про неё не говорит: сервер отвечает про политику отправителя. */
  const from = process.env.MAIL_FROM?.trim()
  if (from && user && !from.includes(user)) {
    console.log(
      `  внимание: MAIL_FROM (${from}) не содержит ${user} — ` +
        'сервер может отвергнуть письмо по политике отправителя',
    )
  }
}

async function main() {
  checkProvider()

  /* Адрес портала — часть письма, а не деталь развёртывания: по ссылке из
     письма человек и возвращается. Ссылка на несуществующий домен обесценивает
     доставку целиком, поэтому проверяется здесь же. */
  const origin = portalOrigin()
  check(
    Boolean(process.env.PORTAL_ORIGIN),
    `PORTAL_ORIGIN задан (сейчас ссылки в письмах ведут на ${origin})`,
  )

  const to = process.argv[2]
  if (!to) {
    console.log('\nПробное письмо не отправлялось: адрес не указан.')
    console.log('Отправить: pnpm mail:check you@example.com')
  } else {
    console.log(`\nОтправляю пробное письмо на ${to}…`)
    const result = await send({
      to,
      subject: 'Проверка почтового канала',
      text:
        'Это пробное письмо портала обратной связи.\n\n' +
        `Канал: ${mailProvider()}\nАдрес портала: ${origin}\n\n` +
        'Если письмо дошло — доставка настроена, и подписчики будут получать ' +
        'ответы команды и смены статусов.',
    })
    check(result.ok, result.ok ? 'письмо принято каналом' : result.error)
  }

  if (problems.length > 0) {
    console.error(`\nНе в порядке: ${problems.length}`)
    for (const problem of problems) console.error(`  ✗ ${problem}`)
    process.exitCode = 1
    return
  }

  console.log('\nКанал в порядке.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  /* Пул соединений SMTP держит процесс живым — закрываем явно. */
  .finally(resetSmtpTransport)
