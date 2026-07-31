# Instalación paso a paso

**Idiomas:** [English](../en/12-install.md) · [Español](../es/12-install.md) · [Русский](../12-install.md)

Para quien instala el portal por primera vez. La versión rápida son tres comandos en el
[README](../../README.md); esto es lo mismo con una comprobación después de cada paso y
con qué hacer cuando un paso falla.

Quince minutos, diez de ellos esperando al DNS.

---

## Paso 0. Qué preparar

**Un servidor.** Cualquier Linux con Docker. Mínimo 2 GB de memoria y 20 GB de disco:
el portal y el worker ocupan poco, el espacio se va en la base de datos y los adjuntos.
Los puertos 80 y 443 deben estar libres — los toma el proxy, y el certificado se emite
por el 80.

**Un dominio.** Un registro A que apunte al servidor. Comprueba que se ha propagado:

```bash
dig +short feedback.example.com
```

Hasta que eso devuelva la dirección del servidor no tiene sentido seguir: el certificado
no se emitirá.

**Un canal de correo.** Entrar al portal solo funciona por correo, así que el canal hace
falta desde el principio. Opciones: el SMTP de tu organización, Unisender Go o Resend.
Con Resend hay que verificar el dominio en su panel: hasta entonces las cartas solo
llegan a la dirección del titular de la cuenta.

**Docker.** Comprueba que está y que habla compose:

```bash
docker version && docker compose version
```

---

## Paso 1. Traer los archivos de despliegue

```bash
git clone https://github.com/Tools-n-Services/backlog-helper.git
cd backlog-helper
```

El código no hace falta para construir —la imagen viene del registro— sino por
`compose.yml`, el `Caddyfile` y `.env.example`. Copia solo esos si lo prefieres.

---

## Paso 2. Rellenar `.env`

```bash
cp .env.example .env
```

Tres líneas son obligatorias. Sin cualquiera de ellas compose se niega a arrancar y dice
cuál falta.

```
PORTAL_DOMAIN=feedback.example.com
POSTGRES_PASSWORD=<una cadena larga y aleatoria>
INSTALL_TOKEN=<una cadena larga y aleatoria>
```

Para generar ambas:

```bash
openssl rand -base64 24
```

El canal de correo va aquí también. Por ejemplo, con Resend:

```
MAIL_PROVIDER=resend
MAIL_FROM="Nombre del portal <feedback@example.com>"
RESEND_API_KEY=re_...
```

El resto puede quedarse como está: el almacenamiento es de archivos y la traducción está
apagada.

**`INSTALL_TOKEN` es la llave de un portal recién instalado.** Mientras la instalación no
termine, cualquiera con ese token puede nombrarse propietario. No lo mandes por chat ni
lo dejes en el historial de comandos.

---

## Paso 3. Arrancar

```bash
docker compose up -d
```

Suben cuatro contenedores: la base de datos, el portal, el worker y el proxy. El primer
arranque tarda un minuto o dos: se descarga la imagen, se inicializa la base y la
aplicación aplica las migraciones.

Comprueba que todo está arriba:

```bash
docker compose ps
```

La base y el portal deben decir `healthy`. Si el portal se queda en `starting` más de un
minuto, mira su registro:

```bash
docker compose logs app --tail 50
```

El certificado se emite en la primera petición al dominio. Si no ocurrió, la causa casi
siempre es el DNS o un puerto 80 ocupado — ver el final de esta guía.

---

## Paso 4. Pasar el asistente

Abre en el navegador:

```
https://feedback.example.com/install/enter?token=<INSTALL_TOKEN>
```

Cinco pasos.

**Comprobación del entorno.** Una lista con marcas: base de datos, migraciones,
extensiones de búsqueda, zona horaria, escritura en el almacenamiento. Una línea roja
dice la causa y qué hacer. Se puede seguir con errores, pero lo que está en la lista se
romperá más tarde — y nada te avisará.

**Producto.** Nombre, la marca de la cabecera, dominio, idioma por defecto. Todo eso se
edita luego en la administración.

**Por dónde empezar.** Un conjunto de tableros, tipos de solicitud y estados: completo,
solo errores o mínimo. La elección no compromete a nada: la composición se edita después.

**Correo.** Aquí el asistente envía una carta de prueba a la dirección del futuro
propietario. **Espérala y comprueba que llega.** Es el único momento en que probar el
correo sale barato: después de la instalación, entrar solo funciona a través de él.

**Propietario.** Correo y nombre. Tras «Instalar el portal» entras de inmediato, sin
carta. Es deliberado: un canal de correo mal configurado dejaría cerrado un portal
recién instalado, porque no hay quien entre y los ajustes solo se arreglan desde dentro.

El asistente se cierra después, para siempre. Reabrirlo significa quitar la marca de
instalación en la base de datos — por la web no se puede.

---

## Paso 5. Comprobar que funciona

| Qué | Cómo |
|---|---|
| El portal responde | Abre `https://tu-dominio` — la portada con los tableros |
| Eres el propietario | La cabecera lleva a la administración y «Ajustes» está disponible |
| El worker está vivo | `docker compose logs worker --tail 20` — se ven los pases |
| El correo funciona | Sal y vuelve a entrar: el enlace debe llegar por correo |
| Copias de seguridad | Configúralas **hoy**, no después |

Lo último no es una formalidad. Las solicitudes de tus usuarios existen ahora en un solo
ejemplar, y una copia de la que nunca se ha restaurado no cuenta como copia.

```bash
docker compose exec -T db pg_dump -U backlog backlog | gzip > backup-$(date +%F).sql.gz
```

---

## Paso 6. Primeros ajustes

Todo lo demás ocurre en el portal, sin tocar el servidor:

- **Ajustes** — nombre, secciones, límites, plazos de espera, color.
- **Tableros** — composición y orden; la dirección de un tablero no cambia una vez creada.
- **Estados** — colores de la paleta, qué se muestra en el roadmap.
- **Formularios** — qué campos se piden en cada tipo de solicitud.
- **Personas** — roles: moderador, administrador, propietario.

Más en el [manual de uso](11-manual.md).

---

## Actualizar

```bash
docker compose exec -T db pg_dump -U backlog backlog | gzip > backup-$(date +%F).sql.gz
docker compose pull
docker compose up -d
```

En ese orden exacto: las migraciones a veces cambian datos, y volver atrás se hace
restaurando una copia, no con una migración inversa.

Para que actualizar sea un acto deliberado y no una consecuencia de reiniciar, fija la
etiqueta de la imagen:

```
IMAGE_TAG=v1.2.0
```

---

## Un segundo producto en el mismo servidor

Una copia del directorio con su propio `.env`: otro dominio, otra contraseña de base de
datos, otro token.

```bash
cp -r backlog-helper backlog-helper-second
cd backlog-helper-second && $EDITOR .env
docker compose -p segundo-portal up -d
```

La misma imagen, su base de datos, su dominio. No comparten nada: todo lo que los
diferencia vive en sus bases. Los puertos 80 y 443 los ocupa el primer proxy — el segundo
producto necesita o su propio servidor, o un proxy común con los dos dominios (entonces
quita `proxy` del segundo compose y añade el dominio al primer `Caddyfile`).

---

## Cuando algo va mal

**El certificado no se emitió, el navegador protesta.** Comprueba `dig +short dominio`:
el registro A debe apuntar al servidor. Luego `docker compose logs proxy`: Caddy dice la
causa con todas las letras. Una causa frecuente es el puerto 80 ocupado — por ahí pasa la
comprobación de propiedad.

**`/install` devuelve 404.** O bien `INSTALL_TOKEN` no está en `.env` —entonces el
asistente no existe en absoluto, y eso es protección, no un fallo—, o la instalación ya
terminó. Comprueba que abres `/install/enter?token=…` y no `/install`.

**El portal no arranca y el registro muestra errores de migración.** Lo más probable es
que la base se creara sin la configuración regional adecuada. Se fija al inicializar el
clúster y luego no cambia: hay que recrear la base. `docker compose down -v` borra
también los datos, así que hazlo solo en una instalación vacía.

**El correo no llega.** Lo primero, el worker: `docker compose ps` y
`docker compose logs worker`. Sin él las cartas se encolan y no salen a ninguna parte;
parece un problema del canal de correo. Si el worker está vivo, mira su registro: el
canal indica el motivo del rechazo.

**Los adjuntos desaparecen al reiniciar.** Comprueba que el volumen `uploads` está
montado (`docker compose config | grep uploads`). Con varias copias de la aplicación el
almacenamiento en archivos no sirve: hace falta S3.

**Olvidaste quién es el propietario y no hay quien entre.** Se puede nombrar directamente
en la base de datos:

```bash
docker compose exec -T db psql -U backlog backlog \
  -c "update app_user set access_role='owner', is_team=true where email='tu@example.com'"
```
