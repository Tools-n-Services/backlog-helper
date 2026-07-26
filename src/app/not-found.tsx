import {
  PrimaryAction,
  SecondaryAction,
  StateScreen,
} from '@/ui/layout/state-screen'

export default function NotFound() {
  return (
    <StateScreen
      code="404"
      title="Такой страницы нет"
      actions={
        <>
          <PrimaryAction href="/">На главную</PrimaryAction>
          <SecondaryAction href="/product">Смотреть обращения</SecondaryAction>
        </>
      }
    >
      <p>
        Обращение могли удалить, или в ссылке опечатка. Если вы перешли из
        письма — найдите обращение поиском по названию.
      </p>
    </StateScreen>
  )
}
