# Manual de uso

**Idiomas:** [English](../en/11-manual.md) · [Español](../es/11-manual.md) · [Русский](../11-manual.md)

Al portal lo miran tres personas distintas y necesitan cosas distintas. Un visitante
quiere que le escuchen. El equipo, ordenar el flujo sin perder lo importante. El
administrador, que el portal parezca y funcione como su producto.

Las secciones se leen por separado: no son continuación una de otra.

---

## Para el visitante

### Enviar una solicitud

Cada tablero tiene el botón «Nueva solicitud». Después vienen dos pasos.

**Primero, el tipo.** El tipo decide las preguntas del formulario: a un error se le piden
los pasos para reproducirlo y con qué frecuencia ocurre; a una idea, el problema que
resuelve. Después solo el equipo puede cambiarlo, así que conviene acertar de entrada.

**Segundo, el formulario.** Mientras escribes el título, el portal busca solicitudes
parecidas y las muestra justo debajo del campo. Si la tuya ya existe, **vota la que
existe**: un voto sobre una solicitud existente pesa más que otra solicitud sobre lo
mismo. Así funciona la priorización y así encuentra las cosas el equipo.

Una captura, un vídeo o un log se adjuntan arrastrándolos. Los archivos van al
almacenamiento de inmediato, antes de enviar, para que un archivo grande no te haga
esperar tras pulsar «Enviar». Los adjuntos de los errores solo los ven tú y el equipo:
en una captura suele haber nombres ajenos y números de contrato.

La primera solicitud de una cuenta nueva pasa por revisión y aparece en el listado
después. Las siguientes se publican al momento.

### Qué pasa después

La solicitud recibe un número como `RTM-4821`: es el que se cita en soporte. El equipo
recorre la cola y toma una decisión: aceptarla, pedir detalles, fusionarla con otra
parecida o rechazarla con un motivo. **El motivo siempre llega por correo**: aquí no hay
silencio por respuesta.

Después la solicitud vive por estados: Nueva, Planificada, En curso, Hecha. Un cambio de
estado es una carta. Las etapas internas de trabajo del equipo no envían nada: si no,
una sola tarea activa daría cinco cartas por semana.

Si al equipo le faltó información, la solicitud pasa a «Falta información». Responde con
un comentario y volverá al trabajo. Sin respuesta se cierra a los pocos días, y de eso
también llega una carta.

### Votos, comentarios, suscripción

Un voto es «yo también lo necesito» en una idea y «a mí también me pasa» en un error. Una
persona, un voto; pulsarlo de nuevo lo retira.

Al votar o comentar te suscribes a las novedades. Puedes darte de baja desde el enlace de
cualquier carta, sin entrar. Qué cartas llegan se ajusta en el perfil.

### Entrar

No hay contraseña. Escribes tu correo, recibes una carta con un enlace y lo sigues. El
enlace dura 15 minutos y funciona una vez.

Leer el portal, buscar y mirar el roadmap funciona sin entrar. Votar y escribir, no: la
solicitud va firmada con tu nombre, y el equipo debe saber a quién volver con una
pregunta.

### Dos idiomas

El conmutador RU/EN está en la cabecera. La elección se recuerda.

Si una solicitud está escrita en otro idioma, verás una traducción con la marca
«Traducido del ruso» y un botón «mostrar el original». La marca es obligatoria: antes de
responder a las palabras de alguien conviene saber de quién son, del autor o de una
máquina. El original está siempre a un clic.

---

## Para el equipo

### Moderación

`/admin/moderation`: solicitudes de cuentas nuevas. Aprobar o rechazar con un motivo.
Tras la primera aprobación la persona queda como de confianza y publica directamente.

### La cola de triaje

`/admin/triage` es la pantalla principal del equipo. La cola está ordenada para que
arriba esté lo que arde: un plazo de primera respuesta vencido, un error bloqueante,
muchas personas afectadas.

La cola se recorre con el teclado, sin tocar el ratón:

| Teclas | Qué hacen |
|---|---|
| `↑ ↓` o `j k` | moverse por la cola |
| `Enter` | abrir la solicitud |
| `1` … `7` | decisión sobre la solicitud |
| `m` | fusionar con otra |
| `/` | buscar, `Esc` para salir |
| `?` | ayuda de teclado |

**La decisión siempre lleva un motivo**, y ese motivo va al autor por correo. No es una
formalidad: el portal existe por la respuesta, no por el archivo.

**Fusionar duplicados** traslada votos y suscriptores a la solicitud principal, y el
duplicado se convierte en un puntero hacia ella: los enlaces antiguos siguen
funcionando. La operación es casi irreversible, por eso requiere permisos de
administrador.

**«Falta información»** pone en marcha un reloj: a los pocos días le llega un recordatorio
al autor y unos días después la solicitud se cierra. Los plazos se fijan en los ajustes.

### El backlog

`/admin/backlog`: unidades de trabajo. Una solicitud y una unidad de trabajo son cosas
distintas unidas de muchos a muchos: una tarea puede alimentarse de varias solicitudes de
tableros distintos, mientras que la deuda técnica no tiene ninguna y compite por la
prioridad en igualdad de condiciones.

El alcance y el dinero **se calculan, no se escriben**: el portal reúne a quienes votaron
y a los autores de las solicitudes vinculadas, deduplica personas y las pondera por
segmento. De lo contrario la priorización sobrevalora sistemáticamente aquello de lo que
habla más alto un grupo pequeño.

Un **insight** es una cita de un usuario recogida fuera del portal: una llamada, un
ticket, un chat. Se une a una solicitud o a una unidad de trabajo y también cuenta para
el alcance.

Una unidad de trabajo tiene su etapa interna. Algunas etapas están ligadas a estados
públicos: pasar a ellas mueve el estado de todas las solicitudes vinculadas y envía las
cartas. El resto son internas y el usuario no las ve.

### Publicaciones

`/admin/releases`: la entrada se compone en el portal — borrador, lista de cambios por
tipo, solicitudes vinculadas.

**Publicar es irreversible.** Cierra las solicitudes vinculadas, las marca como hechas y
envía cartas a todos los que votaron. Por eso en la pantalla se ve no solo el texto, sino
cuántas cartas saldrán. Después de publicar la composición no se edita: las cartas ya se
enviaron.

---

## Para el administrador

Todo se configura en el portal, sin acceso al servidor. Los detalles están en
[10-operate.md](10-operate.md); en corto:

| Sección | Qué hay |
|---|---|
| `/admin/settings` | Nombre, marca, dominio, idioma, secciones, límites, plazos, color de marca |
| `/admin/boards` | Tableros: composición, nombres en dos idiomas, visibilidad, orden |
| `/admin/statuses` | Estados: color de la paleta, forma del marcador, papel en el roadmap |
| `/admin/types` | Formularios: conjunto de campos, etiquetas, obligatoriedad, opciones |
| `/admin/people` | Personas, roles, bloqueos |

### Roles

**Usuario** lee, vota y escribe. **Moderador** añade la cola de moderación y las
decisiones de triaje. **Administrador** añade la fusión de duplicados, la publicación de
versiones, los bloqueos y los ajustes. **Propietario** añade el reparto de roles: un
administrador capaz de nombrarse propietario haría que el rol de propietario careciera de
sentido.

### Qué no se puede cambiar

La dirección de un tablero y la clave de un estado, una vez creados. Están en los
enlaces, en los marcadores ajenos y en el historial de transiciones de cada solicitud.
Los nombres, en cambio, se cambian libremente.

Un estado o un tablero con solicitudes no se borra: solo se oculta. El historial no debe
quedar con un agujero.

---

## Si algo va mal

**El correo no llega.** Lo primero: comprobar si el worker está en marcha. Sin él las
cartas se encolan y no salen a ninguna parte. Parece un problema del canal de correo
cuando la causa es un proceso detenido. Lo segundo: el canal en sí — `MAIL_PROVIDER` y
las claves se fijan con variables de entorno.

**La búsqueda no encuentra con erratas.** Faltan las extensiones `pg_trgm` y `unaccent`.
El asistente de instalación las comprueba en su primer paso.

**Los adjuntos desaparecieron tras reiniciar.** `STORAGE_PROVIDER=file` guarda los
archivos en el volumen de un contenedor. Con varias copias de la aplicación hace falta S3.

**La traducción no funciona.** Está apagada por defecto. Se enciende con
`TRANSLATE_PROVIDER=claude` y una `ANTHROPIC_API_KEY`; sin clave las solicitudes esperan
en la cola y se traducen cuando aparezca, sin gastar intentos.

**Las solicitudes se rechazan con «límite».** Se alcanzó el límite por hora o por día.
Los valores están en los ajustes del portal.
