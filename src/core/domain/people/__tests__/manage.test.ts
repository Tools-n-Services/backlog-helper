/**
 * Роли и блокировка (FR-204, FR-232).
 *
 * Проверяются не действия, а запреты: каждый из них закрывает конкретный
 * способ остаться без управления порталом — и ни один нельзя увидеть,
 * просто открыв экран.
 */

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { prisma } from '@/core/db'
import { banPerson, setAccessRole, unbanPerson } from '@/core/domain/people/manage'
import type { AccessRole, Principal } from '@/core/permissions'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.appUser.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const EMAIL_PREFIX = 'people-test-'

async function person(tag: string, accessRole: AccessRole = 'user') {
  const email = `${EMAIL_PREFIX}${tag}@example.com`
  return prisma.appUser.upsert({
    where: { email },
    update: { accessRole, bannedAt: null, banReason: null },
    create: { email, name: `Проверка ${tag}`, role: 'тест', accessRole },
  })
}

function principal(id: string, accessRole: AccessRole): Principal & { id: string } {
  return { id, accessRole, signedIn: true, banned: false }
}

suite('роли и блокировка', () => {
  beforeAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  afterAll(async () => {
    await prisma.appUser.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
  })

  it('администратор не может выдать роль: это уровень владельца', async () => {
    const admin = await person('admin-1', 'admin')
    const target = await person('target-1')

    const result = await setAccessRole(principal(admin.id, 'admin'), target.id, 'moderator')
    assert.deepEqual(result, { ok: false, reason: 'forbidden' })
  })

  it('владелец не может выдать роль выше своей', async () => {
    const owner = await person('owner-1', 'owner')
    const target = await person('target-2')

    /* Выдать владельца владелец может — а вот администратор, дойди он сюда,
       не должен был бы. Проверяем границу сверху отдельным случаем ниже. */
    assert.deepEqual(
      await setAccessRole(principal(owner.id, 'owner'), target.id, 'owner'),
      { ok: true },
    )
    assert.deepEqual(
      await setAccessRole(principal(owner.id, 'admin'), target.id, 'owner'),
      { ok: false, reason: 'forbidden' },
    )
  })

  it('роль себе не меняют: так закрывают себе доступ', async () => {
    const owner = await person('owner-2', 'owner')

    const result = await setAccessRole(principal(owner.id, 'owner'), owner.id, 'user')
    assert.deepEqual(result, { ok: false, reason: 'self' })
  })

  it('последнего владельца разжаловать нельзя, предпоследнего — можно', async () => {
    /* Правило считает владельцев по всей базе, поэтому состояние задаём
       явно, а не полагаемся на то, сколько их осталось от других тестов. */
    const before = await prisma.appUser.findMany({
      where: { accessRole: 'owner' },
      select: { id: true },
    })
    await prisma.appUser.updateMany({
      where: { accessRole: 'owner' },
      data: { accessRole: 'admin' },
    })

    const first = await person('owner-a', 'owner')
    const second = await person('owner-b', 'owner')
    const acting = principal(first.id, 'owner')

    /* Владельцев двое — одного снять можно. */
    assert.deepEqual(await setAccessRole(acting, second.id, 'admin'), { ok: true })

    /* Остался один — и он неприкосновенен, иначе управлять порталом
       станет некому и вернуть права будет некем. */
    const other = principal(second.id, 'owner')
    assert.deepEqual(await setAccessRole(other, first.id, 'admin'), {
      ok: false,
      reason: 'last-owner',
    })

    await prisma.appUser.updateMany({
      where: { id: { in: before.map((o) => o.id) } },
      data: { accessRole: 'owner' },
    })
  })

  it('назначение роли делает человека командой и снимает модерацию', async () => {
    const owner = await person('owner-4', 'owner')
    const target = await person('target-3')

    await setAccessRole(principal(owner.id, 'owner'), target.id, 'moderator')

    const stored = await prisma.appUser.findUniqueOrThrow({ where: { id: target.id } })
    assert.equal(stored.accessRole, 'moderator')
    assert.equal(stored.isTeam, true, 'сотрудник без пометки выглядит посторонним')
    assert.equal(stored.trusted, true, 'кому доверили роль, того не держат в модерации')
  })

  it('блокировка требует причины', async () => {
    const admin = await person('admin-2', 'admin')
    const target = await person('target-4')

    assert.deepEqual(await banPerson(principal(admin.id, 'admin'), target.id, '  '), {
      ok: false,
      reason: 'reason-required',
    })
  })

  it('блокировка прекращает открытые сессии', async () => {
    const admin = await person('admin-3', 'admin')
    const target = await person('target-5')
    await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: `people-test-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })

    const result = await banPerson(
      principal(admin.id, 'admin'),
      target.id,
      'Одинаковые обращения пачками',
    )
    assert.deepEqual(result, { ok: true })

    const sessions = await prisma.session.count({ where: { userId: target.id } })
    assert.equal(sessions, 0, 'блокировка, действующая до истечения cookie, — не блокировка')

    const stored = await prisma.appUser.findUniqueOrThrow({ where: { id: target.id } })
    assert.ok(stored.bannedAt)
    assert.equal(stored.banReason, 'Одинаковые обращения пачками')
  })

  it('равного по роли заблокировать нельзя', async () => {
    const one = await person('admin-4', 'admin')
    const two = await person('admin-5', 'admin')

    const result = await banPerson(principal(one.id, 'admin'), two.id, 'Причина есть')
    assert.deepEqual(result, { ok: false, reason: 'forbidden' })
  })

  it('модератор блокировать не может', async () => {
    const moderator = await person('moderator-1', 'moderator')
    const target = await person('target-6')

    const result = await banPerson(
      principal(moderator.id, 'moderator'),
      target.id,
      'Причина есть',
    )
    assert.deepEqual(result, { ok: false, reason: 'forbidden' })
  })

  it('блокировка снимается', async () => {
    const admin = await person('admin-6', 'admin')
    const target = await person('target-7')

    await banPerson(principal(admin.id, 'admin'), target.id, 'Временно')
    assert.deepEqual(await unbanPerson(principal(admin.id, 'admin'), target.id), { ok: true })

    const stored = await prisma.appUser.findUniqueOrThrow({ where: { id: target.id } })
    assert.equal(stored.bannedAt, null)
    assert.equal(stored.banReason, null)
  })
})
