/**
 * Справочники из базы (В1).
 *
 * Проверяется то, ради чего слой заведён: источник правды — база, а не сборка.
 * Отдельно — устойчивость к кривым данным: справочник правится в админке,
 * значит в нём рано или поздно окажется то, чего код не ждал, и портал
 * от этого падать не должен.
 */

import assert from 'node:assert/strict'
import { afterAll, describe, it } from 'vitest'

import { catalog, catalogReady, invalidateCatalog, loadCatalog } from '@/core/catalog'
import { prisma } from '@/core/db'

const dbAvailable = await (async () => {
  if (!process.env.DATABASE_URL) return false
  try {
    return (await prisma.status.count()) > 0
  } catch {
    return false
  }
})()

const suite = dbAvailable ? describe : describe.skip

const TEMP_KEY = 'catalog-test-stage'

suite('справочники', () => {
  afterAll(async () => {
    await prisma.status.deleteMany({ where: { key: TEMP_KEY } })
    invalidateCatalog()
  })

  it('до загрузки синхронное чтение падает с понятной причиной', () => {
    /* Пустой справочник вместо ошибки означал бы портал без статусов,
       который выглядит как портал со сломанными данными. */
    assert.equal(catalogReady(), false)
    assert.throws(() => catalog(), /loadCatalog/)
  })

  it('статусы, типы и доски читаются из базы', async () => {
    const loaded = await loadCatalog()

    assert.ok(loaded.statuses.length > 0)
    assert.ok(loaded.types.length > 0)
    assert.ok(loaded.boards.length > 0)

    const open = loaded.statusByKey.get('open')
    assert.ok(open, 'статус open обязан быть в наборе по умолчанию')
    assert.ok(open.shape, 'форма маркера — второй канал кодирования помимо цвета')
  })

  it('схема формы приезжает из jsonb, а не из файла', async () => {
    const bug = catalog().typeByKey.get('bug')
    assert.ok(bug)
    assert.ok(bug.formSchema.length > 0)
    assert.ok(
      bug.formSchema.some((f) => f.name === 'steps'),
      'у бага обязаны быть шаги воспроизведения',
    )
  })

  it('тип ссылается на статусы ключами, а не идентификаторами', async () => {
    const bug = catalog().typeByKey.get('bug')
    assert.ok(bug)
    /* Ключ переживает пересоздание строки, идентификатор — нет. */
    assert.ok(bug.allowedStatusKeys.includes('open'))
    assert.equal(bug.defaultStatusKey, 'open')
  })

  it('внутренний этап знает свой публичный статус', async () => {
    const stage = catalog().internalStatusByKey.get('in-progress')
    assert.ok(stage)
    assert.equal(stage.publicStatusKey, 'building')
  })

  it('новый статус в базе виден после сброса снимка', async () => {
    await prisma.status.create({
      data: { key: TEMP_KEY, name: 'Проверка', shape: 'dot', position: 99 },
    })

    /* Снимок ещё старый: справочник читается не на каждый запрос. */
    assert.equal(catalog().statusByKey.has(TEMP_KEY), false)

    /* Пометка устаревшим не обнуляет снимок: страница, которая уже рисуется,
       обязана дочитать справочник, а не упасть посреди рендера. */
    invalidateCatalog()
    assert.equal(catalogReady(), true)

    await loadCatalog()
    assert.equal(catalog().statusByKey.get(TEMP_KEY)?.name, 'Проверка')

    await prisma.status.update({ where: { key: TEMP_KEY }, data: { name: 'Проверка 2' } })
    invalidateCatalog()
    await loadCatalog()
    assert.equal(catalog().statusByKey.get(TEMP_KEY)?.name, 'Проверка 2')
  })

  it('кривая схема формы не роняет справочник', async () => {
    const saved = await prisma.postType.findUniqueOrThrow({
      where: { key: 'question' },
      select: { formSchema: true },
    })

    await prisma.postType.update({
      where: { key: 'question' },
      /* Так выглядит схема, которую сохранил редактор с ошибкой: строка
         вместо объекта, объект без вида поля. */
      data: { formSchema: ['мусор', { name: 'title' }, { name: 'ok', kind: 'text' }] },
    })
    invalidateCatalog()
    await loadCatalog()

    const type = catalog().typeByKey.get('question')
    assert.deepEqual(
      type?.formSchema.map((f) => f.name),
      ['ok'],
      'непригодные поля отбрасываются, остальная форма остаётся рабочей',
    )

    await prisma.postType.update({
      where: { key: 'question' },
      data: { formSchema: saved.formSchema ?? [] },
    })
    invalidateCatalog()
    await loadCatalog()
  })
})
