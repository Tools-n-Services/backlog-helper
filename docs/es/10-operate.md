# Desplegar, configurar, actualizar

**Idiomas:** [English](../en/10-operate.md) · [Español](../es/10-operate.md) · [Русский](../10-operate.md)

Tres secciones para tres tareas distintas. Se leen en momentos distintos y normalmente
por personas distintas: se despliega una vez, se configura durante semanas, se actualiza
durante años.

---

## Desplegar

La versión corta. Paso a paso, con comprobaciones y análisis de fallos —
[12-install.md](12-install.md).

Un servidor con Docker y un dominio apuntado a él por un registro A. Después:

```
cp .env.example .env
docker compose up -d
```

Tres líneas de `.env` son obligatorias; sin ellas compose se niega a arrancar y dice cuál
falta:

| Variable | Qué es |
|---|---|
| `PORTAL_DOMAIN` | El dominio del portal. Caddy emite el certificado para él |
| `POSTGRES_PASSWORD` | La contraseña de la base dentro de compose. La base no se expone |
| `INSTALL_TOKEN` | Una cadena larga y aleatoria. Sin ella el asistente no existe |

Luego abre `https://tu-dominio/install/enter?token=<INSTALL_TOKEN>` y pasa el asistente:
comprobación del entorno, nombre y dominio, conjunto de tableros y tipos, carta de
prueba, propietario.

El asistente se cierra para siempre después, y el propietario queda dentro de inmediato,
sin carta. Es deliberado: un canal de correo mal configurado dejaría cerrado un portal
recién instalado, porque no hay quien entre y los ajustes solo se arreglan desde dentro.

### Qué sube

Postgres con volumen, la aplicación, el worker y Caddy. Las migraciones las aplica la
aplicación al arrancar: no hace falta un comando aparte.

### Qué conviene saber antes de producción

**Sin el worker el correo no sale.** Encola las cartas en silencio, y «el portal no envía
correo» es el error más caro de una primera instalación, porque parece un problema del
canal. En compose el worker arranca solo; si despliegas de otra forma, arráncalo aparte.

**`STORAGE_PROVIDER=file` sirve para una sola instancia.** Los adjuntos viven en un
volumen que una segunda copia de la aplicación no ve. Para varias, S3 (`S3_ENDPOINT`,
`S3_BUCKET`, claves).

**El correo se configura con variables de entorno, no en el portal.** El asistente lo
comprueba —envía una carta de prueba y espera confirmación—, pero fijar el canal solo
puede quien fija el entorno. Claves en la base significarían que un volcado de la base es
una fuga de todas las claves a la vez.

### Un segundo producto en el mismo servidor

Una copia del directorio con su propio `.env` y su propio nombre de proyecto:

```
docker compose -p segundo-portal up -d
```

Su base, su dominio, la misma imagen. No comparten nada: todo lo que los diferencia vive
en sus bases.

---

## Configurar

La configuración está repartida en tres capas. Esto es lo principal que hay que entender
del portal: la capa decide qué la cambia y cuándo.

| Capa | Qué vive ahí | Cómo cambia |
|---|---|---|
| **Administración** | nombre, marca, dominio, idioma, secciones, límites, plazos de espera, color de marca, tableros y categorías, estados, tipos de solicitud y los campos de sus formularios | en el portal en marcha, al instante |
| **Entorno (`.env`)** | dirección de la base, canal de correo y sus claves, almacenamiento, traductor, token de instalación | reiniciando el contenedor |
| **Código (`config/*.ts`)** | tipos de campo, el sentido de los campos de sistema, la fórmula de prioridad, la paleta, las reglas de adjuntos | reconstruyendo la imagen |
| **Nunca** | el `slug` de un tablero, la `key` de un estado o un tipo una vez creados | — rompe enlaces e historial |

Dónde está cada cosa en la administración:

- **Ajustes** — producto, secciones, límites, plazos, apariencia.
- **Tableros** — composición, nombres en dos idiomas, visibilidad, orden.
- **Estados** — composición, color de la paleta, forma del marcador, papel en el roadmap.
- **Formularios** — los campos de cada tipo de solicitud: composición, etiquetas,
  obligatoriedad, opciones.

### Dónde está la frontera entre administración y código

**El tipo de campo es código; el conjunto de campos, datos.** El asistente y la
administración combinan tipos ya hechos (texto, área de texto, selección, casilla,
enlace, entorno, adjuntos), nombran los campos y los marcan obligatorios. Un tipo
*nuevo* —por ejemplo, una geolocalización— se añade en código.

Aparte están los **campos de sistema**: tienen lógica más allá del formulario.
`severity` fija el plazo de primera respuesta y el orden de la cola de triaje;
`environment` alimenta el diagnóstico que nunca es público. Se pueden renombrar,
reordenar y quitar del formulario, pero no convertir en otra cosa: la priorización
empezaría a contar lo que no es y nada lo avisaría.

Todo lo demás que se cree en el editor es un campo libre. Se muestra en la solicitud y va
en las cartas, pero no entra en la lógica. Ese es el precio de poder crearlos.

---

## Actualizar

La versión de una instalación es la etiqueta de la imagen.

```
docker compose pull
docker compose up -d
```

La aplicación aplica las migraciones al arrancar. El orden conviene respetarlo al pie de
la letra: **primero la copia de seguridad, después la actualización.** Las migraciones
aquí están escritas a mano y a veces cambian datos; volver atrás se hace restaurando, no
con una migración inversa.

Qué sobrevive a una actualización sin intervención:

- **Los ajustes.** Una clave que tu base todavía no tiene llega del preset de la nueva
  versión, sin migración de datos y sin valores vacíos en pantalla.
- **Las secciones de ajustes escritas a medias.** Un indicador añadido en una versión
  nueva se activa por defecto en vez de quedar apagado en silencio.
- **Los catálogos.** Tableros, estados y tipos se editaron en tu administración y la
  actualización no los toca: un preset son valores para una instalación nueva, no un
  estado al que se fuerza una existente.

### Si mantienes un fork

El fork ya no es obligatorio: todo lo que diferencia a los productos se mudó a la base.
Hace falta solo cuando cambia el código: tipos de campo, la fórmula de prioridad, la
paleta.

Entonces el upstream se añade como segundo remoto y tus cambios se quedan en `config/` y
`theme/`. La versión desde la que se construye un fork se fija con una etiqueta: sin eso,
cinco productos se convierten en cinco productos distintos en un año.

### Qué hace la CI

En cada pull request: tipos, linter, pruebas unitarias y escenarios contra un portal ya
construido, todo sobre un Postgres real. En una etiqueta `v*`: construir la imagen y
publicarla en el registro del repositorio.

Sin esto, un arreglo en la plantilla no llega a ninguna instalación, y ese es el
desenlace más caro de todos.
